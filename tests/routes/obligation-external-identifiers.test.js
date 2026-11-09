const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Obligation external identifiers', () => {
  let db;
  let agent;
  let today;
  const base = () => ({ title: 'Electricity', type: 'utility', currencyCode: 'EUR', estimatedAmount: 50, startDate: today });

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'extid@test.example', password: '123456', nombre: 'ExtId User' });
    today = ledger.localDateForUser(db, db.findUserByName('ExtId User').id);
  });

  afterAll(() => cleanupTestDb());

  it('persists a typed identifier and returns null when omitted', async () => {
    const typed = await agent.post('/api/obligations').send({ ...base(), externalIdentifier: '  NIS-123 ', externalIdentifierType: 'meter' });
    expect(typed.status).toBe(201);
    expect(typed.body).toMatchObject({ externalIdentifier: 'NIS-123', externalIdentifierType: 'meter' });
    const plain = await agent.post('/api/obligations').send(base());
    expect(plain.body.externalIdentifier).toBeNull();
    expect(plain.body.externalIdentifierType).toBeNull();
  });

  it('treats whitespace as null and rejects invalid values', async () => {
    const blank = await agent.post('/api/obligations').send({ ...base(), externalIdentifier: '   ' });
    expect(blank.body.externalIdentifier).toBeNull();
    expect((await agent.post('/api/obligations').send({ ...base(), externalIdentifierType: 'bogus' })).status).toBe(400);
    expect((await agent.post('/api/obligations').send({ ...base(), externalIdentifier: 'x'.repeat(121) })).status).toBe(400);
    expect((await agent.post('/api/obligations').send({ ...base(), externalIdentifier: 42 })).status).toBe(400);
  });

  it('updates the identifier and filters the list by it', async () => {
    const created = await agent.post('/api/obligations').send({ ...base(), externalIdentifier: 'POL-9', externalIdentifierType: 'policy' });
    const updated = await agent.put(`/api/obligations/${created.body.id}`).send({ externalIdentifier: 'POL-10' });
    expect(updated.status).toBe(200);
    expect(updated.body.externalIdentifier).toBe('POL-10');
    expect(updated.body.externalIdentifierType).toBe('policy');
    const filtered = await agent.get('/api/obligations').query({ externalIdentifier: 'POL-10' });
    expect(filtered.body.map(item => item.id)).toEqual([created.body.id]);
    expect((await agent.get('/api/obligations').query({ externalIdentifier: 'nope' })).body).toEqual([]);
  });
});
