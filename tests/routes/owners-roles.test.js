const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Holder roles', () => {
  let agent;

  beforeAll(async () => {
    app.locals.db = setupTestDb();
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'roles@test.example', password: '123456', nombre: 'Roles User' });
  });

  afterAll(() => cleanupTestDb());

  it('accepts payment_responsible and other and dedupes roles', async () => {
    const response = await agent.post('/api/owners').send({ name: 'Payer', roles: ['payment_responsible', 'other', 'other'] });
    expect(response.status).toBe(201);
    expect(response.body.roles).toEqual(['payment_responsible', 'other']);
  });

  it('rejects unknown roles', async () => {
    const response = await agent.post('/api/owners').send({ name: 'Bad', roles: ['wizard'] });
    expect(response.status).toBe(400);
  });

  it('validates roleLabel length and stores it', async () => {
    expect((await agent.post('/api/owners').send({ name: 'Long', roles: ['other'], roleLabel: 'x'.repeat(81) })).status).toBe(400);
    const ok = await agent.post('/api/owners').send({ name: 'Labeled', roles: ['other'], roleLabel: ' Gestor ' });
    expect(ok.status).toBe(201);
    expect(ok.body.roleLabel).toBe('Gestor');
    expect((await agent.put(`/api/owners/${ok.body.id}`).send({ roleLabel: 5 })).status).toBe(400);
  });

  it('keeps legacy holders unchanged and other-only holders are not providers', async () => {
    const legacy = await agent.post('/api/owners').send({ name: 'Legacy', roles: ['owner', 'tenant'] });
    expect(legacy.body.roles).toEqual(['owner', 'tenant']);
    expect(legacy.body.roleLabel).toBeUndefined();
    const other = await agent.post('/api/owners').send({ name: 'Only other', roles: ['other'] });
    const response = await agent.post('/api/obligations').send({ title: 'x', type: 'other', currencyCode: 'EUR', estimatedAmount: 10, startDate: '2030-01-01', providerEntityId: other.body.id });
    expect(response.status).toBe(400);
  });
});
