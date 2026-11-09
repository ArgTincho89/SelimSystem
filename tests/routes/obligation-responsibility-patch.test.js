const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('PATCH /api/obligations/:id/responsibility', () => {
  let db;
  let agent;
  let userId;
  let assetId;
  let bareAssetId;
  let today;

  const monthsAgo = count => {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() - count);
    return date.toISOString().slice(0, 10);
  };
  const create = (extra = {}) => agent.post('/api/obligations').send({
    title: 'Water', type: 'service', currencyCode: 'ARS', estimatedAmount: 100, startDate: monthsAgo(2), recurrenceFrequency: 'monthly', assetId, ...extra
  });
  const patch = (id, type) => agent.patch(`/api/obligations/${id}/responsibility`).send({ responsibilityType: type });

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'patch@test.example', password: '123456', nombre: 'Patch User' });
    userId = db.findUserByName('Patch User').id;
    today = ledger.localDateForUser(db, userId);
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Flat' })).body.id;
    bareAssetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Bare' })).body.id;
    const tenantId = (await agent.post('/api/owners').send({ name: 'Tenant', kind: 'person', roles: ['tenant'] })).body.id;
    await agent.post('/api/rentals').send({
      assetId, type: 'residential', startDate: '2025-01-01', endDate: null, initialRent: 100, currencyCode: 'ARS', periodicity: 'monthly',
      dueDay: 1, depositAmount: 0, guarantee: '', includedExpenses: [], expenseResponsibility: {}, notes: '', tenantIds: [tenantId], status: 'active'
    });
  });

  afterAll(() => cleanupTestDb());

  it('pins past and paid history and only moves future unpaid occurrences to the tenant', async () => {
    const created = await create();
    const before = (await agent.get(`/api/obligations/${created.body.id}`)).body.occurrences;
    const paid = before.find(item => item.date < today);
    db.create('transactions', { userId, tipo: 'expense', monto: 100, amountMinor: 10000, currencyCode: 'ARS', obligationOccurrenceId: paid.id, fecha: paid.date }, userId);

    const res = await patch(created.body.id, 'tenant');
    expect(res.status).toBe(200);
    expect(res.body.responsibilityType).toBe('tenant');
    expect(res.body.rentalContractId).toBeTruthy();
    const after = res.body.occurrences;
    expect(after.find(item => item.id === paid.id).status).toBe('paid');
    after.filter(item => item.date < today).forEach(item => expect(item.responsibilityType).toBe('owner'));
    const future = after.find(item => item.date >= today);
    expect(future.responsibilityType).toBeUndefined();
    expect(future.tenantDueAmount).toBe(100);
    expect(future.ownerDueAmount).toBe(0);

    const back = await patch(created.body.id, 'owner');
    expect(back.status).toBe(200);
    expect(back.body.occurrences.find(item => item.date >= today).ownerDueAmount).toBeUndefined();
  });

  it('rejects invalid values and tenants without an active contract', async () => {
    const created = await create();
    expect((await patch(created.body.id, 'shared')).status).toBe(400);
    expect((await patch(created.body.id, undefined)).status).toBe(400);
    const bare = await create({ assetId: bareAssetId });
    expect((await patch(bare.body.id, 'tenant')).status).toBe(400);
    const unlinked = await create({ assetId: undefined });
    expect((await patch(unlinked.body.id, 'tenant')).status).toBe(400);
    expect((await patch('missing', 'owner')).status).toBe(404);
    expect(db.findById('obligations', bare.body.id, userId).responsibilityType).toBe('owner');
  });
});
