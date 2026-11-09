const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Rental contract adjustment fields', () => {
  let db;
  let agent;
  let assetId;
  let tenantId;
  const lease = extra => agent.post('/api/rentals').send({
    assetId, type: 'residential', startDate: '2025-01-01', endDate: null, initialRent: 100, currencyCode: 'ARS',
    periodicity: 'monthly', dueDay: 1, depositAmount: 0, guarantee: '', includedExpenses: [], expenseResponsibility: {}, notes: '',
    tenantIds: [tenantId], status: 'active', ...extra
  });

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'adj@test.example', password: '123456', nombre: 'Adj User' });
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Flat' })).body.id;
    tenantId = (await agent.post('/api/owners').send({ name: 'Tenant', kind: 'person', roles: ['tenant'] })).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('reads null adjustment and rental kind when the fields are omitted', async () => {
    const res = await lease();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ adjustmentFrequencyMonths: null, adjustmentCriterion: null, contractKind: 'rental' });
  });

  it('persists adjustment fields and sets the asset condition on activation', async () => {
    const other = (await agent.post('/api/assets').send({ type: 'immovable', name: 'House' })).body.id;
    const res = await lease({ assetId: other, adjustmentFrequencyMonths: 6, adjustmentCriterion: ' IPC ', contractKind: 'usufruct' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ adjustmentFrequencyMonths: 6, adjustmentCriterion: 'IPC', contractKind: 'usufruct' });
    expect((await agent.get(`/api/assets/${other}`)).body).toMatchObject({ condition: 'usufruct', usageStatus: 'rented' });
    expect((await agent.get(`/api/assets/${assetId}`)).body.condition).toBe('rented');
    const updated = await agent.put(`/api/rentals/${res.body.id}`).send({ adjustmentFrequencyMonths: null });
    expect(updated.body.adjustmentFrequencyMonths).toBeNull();
  });

  it('rejects invalid adjustment values', async () => {
    for (const extra of [
      { adjustmentFrequencyMonths: 0 }, { adjustmentFrequencyMonths: 121 }, { adjustmentFrequencyMonths: 1.5 },
      { adjustmentFrequencyMonths: '6' }, { adjustmentCriterion: 'x'.repeat(121) }, { adjustmentCriterion: 5 }, { contractKind: 'lease' }
    ]) {
      expect((await lease(extra)).status).toBe(400);
    }
  });
});
