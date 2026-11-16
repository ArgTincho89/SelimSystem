const request = require('supertest');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');

describe('Notes: title, PUT/DELETE, date range and rental aggregation', () => {
  let f;
  let declaration;
  let contractId;
  const create = body => f.agent.post('/api/notes').send(body);
  const logs = () => f.db.findAll('activityLogs', f.userId);

  beforeAll(async () => {
    f = await setupRentFixture('notes-crud');
    declaration = (await f.declare([f.modality('locacion', { ivaPercent: null })])).body;
    contractId = declaration.modalities[0].contractId;
  });
  afterAll(() => cleanupTestDb());

  it('creates notes on a declaration with an optional title up to 120 characters', async () => {
    const titled = await create({ targetType: 'declaration', targetId: declaration.id, date: '2026-11-01', title: '  Visita  ', content: 'Se revisó el inmueble' });
    expect(titled.status).toBe(201);
    expect(titled.body).toMatchObject({ targetType: 'declaration', targetId: declaration.id, title: 'Visita' });
    const plain = await create({ targetType: 'declaration', targetId: declaration.id, date: '2026-11-20', content: 'Sin título' });
    expect(plain.status).toBe(201);
    expect(plain.body.title).toBeUndefined();
    const long = await create({ targetType: 'declaration', targetId: declaration.id, title: 'x'.repeat(121), content: 'a' });
    expect(long.status).toBe(400);
    expect(long.body.error).toBe('El título debe tener hasta 120 caracteres');
    expect((await create({ targetType: 'declaration', targetId: 'missing', content: 'a' })).status).toBe(400);
  });

  it('filters by from/to, rejects invalid ranges and keeps notes sorted by date', async () => {
    const all = (await f.agent.get('/api/notes').query({ targetType: 'declaration', targetId: declaration.id })).body;
    expect(all.map(item => item.date)).toEqual(['2026-11-20', '2026-11-01']);
    const ranged = await f.agent.get('/api/notes').query({ targetType: 'declaration', targetId: declaration.id, from: '2026-11-15', to: '2026-11-30' });
    expect(ranged.body.map(item => item.date)).toEqual(['2026-11-20']);
    expect((await f.agent.get('/api/notes').query({ targetType: 'declaration', targetId: declaration.id, from: '2026-13-01' })).status).toBe(400);
    expect((await f.agent.get('/api/notes').query({ targetType: 'declaration', targetId: declaration.id, from: '2026-12-01', to: '2026-11-01' })).status).toBe(400);
  });

  it('includeRelated=1 adds the notes of the contracts and periods of the rental', async () => {
    const view = (await f.agent.get(`/api/rentals/declarations/${declaration.id}`)).body;
    const occurrenceId = view.modalities[0].occurrences[0].id;
    const onContract = (await create({ targetType: 'contract', targetId: contractId, content: 'contrato' })).body;
    const onPeriod = (await create({ targetType: 'rentOccurrence', targetId: occurrenceId, content: 'período' })).body;
    const onAsset = (await create({ targetType: 'asset', targetId: f.assetId, content: 'bien' })).body;
    const own = (await f.agent.get('/api/notes').query({ targetType: 'declaration', targetId: declaration.id })).body.map(item => item.id);
    expect(own).not.toContain(onContract.id);
    const related = (await f.agent.get('/api/notes').query({ targetType: 'declaration', targetId: declaration.id, includeRelated: '1' })).body.map(item => item.id);
    expect(related).toEqual(expect.arrayContaining([onContract.id, onPeriod.id]));
    expect(related).not.toContain(onAsset.id);
  });

  it('edits a note (partial update, same validation) and logs it', async () => {
    const note = (await create({ targetType: 'asset', targetId: f.assetId, date: '2026-01-01', content: 'original' })).body;
    const updated = await f.agent.put(`/api/notes/${note.id}`).send({ title: 'Nuevo', content: ' editado ', date: '2026-02-02' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ title: 'Nuevo', content: 'editado', date: '2026-02-02', targetId: f.assetId });
    expect((await f.agent.put(`/api/notes/${note.id}`).send({ content: '  ' })).status).toBe(400);
    expect((await f.agent.put(`/api/notes/${note.id}`).send({ content: 'a'.repeat(4001) })).status).toBe(400);
    expect((await f.agent.put(`/api/notes/${note.id}`).send({ date: 'nope' })).status).toBe(400);
    expect((await f.agent.put(`/api/notes/${note.id}`).send({ title: 'y'.repeat(121) })).status).toBe(400);
    const cleared = await f.agent.put(`/api/notes/${note.id}`).send({ title: '' });
    expect(cleared.body.title).toBe('');
    expect(logs().some(entry => entry.action === 'note.update' && entry.outcome === 'success')).toBe(true);
  });

  it('deletes a note and logs it; legacy notes without a title still list', async () => {
    const legacy = f.db.create('wealthNotes', { targetType: 'asset', targetId: f.assetId, date: '2020-01-01', content: 'vieja', author: 'x' }, f.userId);
    const listed = (await f.agent.get('/api/notes').query({ targetType: 'asset', targetId: f.assetId })).body.find(item => item.id === legacy.id);
    expect(listed.title).toBeUndefined();
    const response = await f.agent.delete(`/api/notes/${legacy.id}`);
    expect(response.status).toBe(200);
    expect(f.db.findById('wealthNotes', legacy.id, f.userId)).toBeFalsy();
    expect(logs().some(entry => entry.action === 'note.delete' && entry.outcome === 'success')).toBe(true);
  });

  it('answers 404 for unknown and foreign notes and 401 without a session', async () => {
    const note = (await create({ targetType: 'asset', targetId: f.assetId, content: 'privada' })).body;
    expect((await f.agent.put('/api/notes/missing').send({ content: 'a' })).status).toBe(404);
    expect((await f.other.put(`/api/notes/${note.id}`).send({ content: 'a' })).status).toBe(404);
    expect((await f.other.delete(`/api/notes/${note.id}`)).status).toBe(404);
    expect((await request(f.app).delete(`/api/notes/${note.id}`)).status).toBe(401);
    expect(f.db.findById('wealthNotes', note.id, f.userId)).toBeTruthy();
  });
});
