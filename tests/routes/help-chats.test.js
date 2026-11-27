const request = require('supertest');
const app = require('../../src/app');
const { LIMITS } = require('../../src/routes/help-chats');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Help chats routes', () => {
  let db;
  let alice;
  let bob;

  const chat = (startedAt, overrides = {}) => ({
    startedAt,
    endedAt: startedAt,
    title: 'Registrar un gasto',
    messages: [
      { from: 'bot', text: '¿Sobre qué tema necesitás ayuda?\n1 · Transacciones', at: startedAt },
      { from: 'user', text: '1 · Transacciones', at: startedAt }
    ],
    ...overrides
  });

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    alice = request.agent(app);
    bob = request.agent(app);
    await alice.post('/api/auth/register').send({ email: 'help-alice@test.com', password: '123456', nombre: 'HelpAlice' });
    await bob.post('/api/auth/register').send({ email: 'help-bob@test.com', password: '123456', nombre: 'HelpBob' });
  });

  afterAll(() => cleanupTestDb());

  it('requires a session', async () => {
    expect((await request(app).get('/api/help-chats')).status).toBe(401);
    expect((await request(app).post('/api/help-chats').send(chat('2026-11-20T10:00:00.000Z'))).status).toBe(401);
  });

  it('saves chats and lists them newest first', async () => {
    const first = await alice.post('/api/help-chats').send(chat('2026-11-20T10:00:00.000Z', { title: 'Primera' }));
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ id: expect.any(String), title: 'Primera', startedAt: '2026-11-20T10:00:00.000Z' });
    await alice.post('/api/help-chats').send(chat('2026-11-22T10:00:00.000Z', { title: 'Tercera' }));
    await alice.post('/api/help-chats').send(chat('2026-11-21T10:00:00.000Z', { title: 'Segunda' }));
    const res = await alice.get('/api/help-chats');
    expect(res.status).toBe(200);
    expect(res.body.map(item => item.title)).toEqual(['Tercera', 'Segunda', 'Primera']);
    expect(res.body[0].messages).toEqual(chat('2026-11-22T10:00:00.000Z').messages);
  });

  it('keeps every account isolated', async () => {
    const res = await bob.get('/api/help-chats');
    expect(res.body).toEqual([]);
    const aliceChat = (await alice.get('/api/help-chats')).body[0];
    expect((await bob.delete(`/api/help-chats/${aliceChat.id}`)).status).toBe(404);
    expect((await alice.get('/api/help-chats')).body).toHaveLength(3);
  });

  it('strips unknown fields and defaults the title', async () => {
    const res = await bob.post('/api/help-chats').send(chat('2026-11-23T10:00:00.000Z', {
      title: '   ', userId: 'someone-else', messages: [{ from: 'user', text: '1', at: '2026-11-23T10:00:00.000Z', html: '<b>x</b>' }]
    }));
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Conversación');
    expect(res.body.messages).toEqual([{ from: 'user', text: '1', at: '2026-11-23T10:00:00.000Z' }]);
    expect(res.body.userId).not.toBe('someone-else');
  });

  it.each([
    ['no body fields', {}],
    ['invalid dates', chat('ayer')],
    ['end before start', chat('2026-11-20T10:00:00.000Z', { endedAt: '2026-11-19T10:00:00.000Z' })],
    ['non-string title', chat('2026-11-20T10:00:00.000Z', { title: 7 })],
    ['no messages', chat('2026-11-20T10:00:00.000Z', { messages: [] })],
    ['unknown sender', chat('2026-11-20T10:00:00.000Z', { messages: [{ from: 'admin', text: 'x', at: '2026-11-20T10:00:00.000Z' }] })],
    ['text too long', chat('2026-11-20T10:00:00.000Z', { messages: [{ from: 'user', text: 'x'.repeat(LIMITS.MAX_TEXT + 1), at: '2026-11-20T10:00:00.000Z' }] })],
    ['bad message time', chat('2026-11-20T10:00:00.000Z', { messages: [{ from: 'user', text: 'x', at: 'nunca' }] })],
    ['no user interaction', chat('2026-11-20T10:00:00.000Z', { messages: [{ from: 'bot', text: 'Hola', at: '2026-11-20T10:00:00.000Z' }] })],
    ['too many messages', chat('2026-11-20T10:00:00.000Z', { messages: Array.from({ length: LIMITS.MAX_MESSAGES + 1 }, () => ({ from: 'user', text: '1', at: '2026-11-20T10:00:00.000Z' })) })]
  ])('rejects %s', async (_, body) => {
    const res = await bob.post('/api/help-chats').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });

  it('accepts a transcript above the default 100 kB body limit', async () => {
    const messages = Array.from({ length: 60 }, (_, index) => ({ from: index % 2 ? 'user' : 'bot', text: 'x'.repeat(3000), at: '2026-11-24T10:00:00.000Z' }));
    const res = await bob.post('/api/help-chats').send(chat('2026-11-24T10:00:00.000Z', { messages }));
    expect(res.status).toBe(201);
  });

  it('deletes a chat of the same account', async () => {
    const [latest] = (await bob.get('/api/help-chats')).body;
    expect((await bob.delete(`/api/help-chats/${latest.id}`)).status).toBe(200);
    expect((await bob.get('/api/help-chats')).body.map(item => item.id)).not.toContain(latest.id);
  });

  it('keeps only the newest chats per account, dropping the oldest', async () => {
    const carol = request.agent(app);
    await carol.post('/api/auth/register').send({ email: 'help-carol@test.com', password: '123456', nombre: 'HelpCarol' });
    const carolId = (await carol.get('/api/auth/me')).body.id;
    const base = Date.parse('2026-01-01T00:00:00.000Z');
    const at = index => new Date(base + index * 60000).toISOString();
    // The account already holds MAX_CHATS chats: saving one more drops the oldest.
    db.replace('help_chats', carolId, Array.from({ length: LIMITS.MAX_CHATS }, (_, index) => ({ id: `seed-${index}`, userId: carolId, ...chat(at(index), { title: `Chat ${index}` }) })));
    const saved = await carol.post('/api/help-chats').send(chat(at(LIMITS.MAX_CHATS), { title: `Chat ${LIMITS.MAX_CHATS}` }));
    expect(saved.status).toBe(201);
    const res = await carol.get('/api/help-chats');
    expect(res.body).toHaveLength(LIMITS.MAX_CHATS);
    expect(res.body[0].title).toBe(`Chat ${LIMITS.MAX_CHATS}`);
    expect(res.body.map(item => item.title)).not.toContain('Chat 0');
  });

  it('does not write help chats to the activity log', async () => {
    const logs = (await alice.get('/api/activity-logs')).body;
    const entries = Array.isArray(logs) ? logs : (logs.items || logs.entries || []);
    expect(JSON.stringify(entries)).not.toMatch(/help-chats/);
    const userId = (await alice.get('/api/auth/me')).body.id;
    expect(db.findAll('activityLogs', userId).filter(entry => String(entry.route || '').includes('help-chats'))).toEqual([]);
  });
});
