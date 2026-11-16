const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const { addDaysDateOnly } = require('../../src/utils/recurring');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Alerts by responsibility (owner / tenant)', () => {
  let db;
  let agent;
  let userId;
  let today;
  let accountId;
  let assetId;
  let categoryId;
  let tenantId;

  const day = offset => addDaysDateOnly(today, offset);
  const alerts = async (query = '') => {
    const response = await agent.get(`/api/alerts${query}`);
    expect(response.status).toBe(200);
    return response.body;
  };
  const createObligation = async (extra = {}) => {
    const response = await agent.post('/api/obligations').send({
      title: 'Electricidad', type: 'utility', currencyCode: 'EUR', estimatedAmount: 85, startDate: day(3), reminderLeadDays: 5, accountId, categoryId, assetId, ...extra
    });
    expect(response.status).toBe(201);
    return { obligation: response.body, occurrence: response.body.occurrences[0] };
  };
  const forObligation = (list, obligation) => list.filter(item => item.obligationId === obligation.id);

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'alerts-resp@test.example', password: '123456', nombre: 'Alerts Resp' });
    userId = db.findUserByName('Alerts Resp').id;
    today = ledger.localDateForUser(db, userId);
    await agent.get('/api/accounts/setup');
    accountId = (await agent.post('/api/accounts').send({ name: 'EUR account', currency: 'EUR', initialBalance: 5000 })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Home' })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Departamento Palermo' })).body.id;
    tenantId = (await agent.post('/api/owners').send({ name: 'Juan Pérez', kind: 'person', roles: ['tenant'] })).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('classifies owner obligations, tenant receipts, rent, expiry and adjustments', async () => {
    const owner = await createObligation({ title: 'Impuesto municipal', startDate: day(-3), reminderLeadDays: 0 });
    const tenant = await createObligation({ title: 'Expensas', responsibilityType: 'tenant', startDate: day(2) });
    const contract = (await agent.post('/api/rentals').send({
      assetId, type: 'residential', startDate: day(-90), endDate: day(20), initialRent: 900, currencyCode: 'EUR', periodicity: 'monthly',
      dueDay: Number(day(2).slice(8, 10)), depositAmount: 0, guarantee: '', includedExpenses: [], expenseResponsibility: {}, notes: '', tenantIds: [tenantId], status: 'active'
    })).body;
    db.create('rentalConditions', { contractId: contract.id, effectiveDate: day(7), method: 'manual', rentMinor: 95000, rentAmount: 950, periodicity: 'monthly' }, userId);
    const list = await alerts();
    expect(forObligation(list, owner.obligation).map(item => [item.type, item.responsibility])).toEqual([['obligation_overdue', 'owner']]);
    expect(forObligation(list, tenant.obligation).map(item => [item.type, item.responsibility])).toEqual([['tenant_obligation_pending', 'tenant']]);
    const rental = list.filter(item => item.contractId === contract.id);
    ['rent_due', 'contract_expiry', 'rent_adjustment_due'].forEach(type => {
      expect(rental.find(item => item.type === type)?.responsibility).toBe('tenant');
    });
    list.forEach(item => expect(['owner', 'tenant']).toContain(item.responsibility));
  });

  it('marks partial payments and installments as owner alerts and keeps every previous field', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Seguro', startDate: day(-2), reminderLeadDays: 3, estimatedAmount: 100 });
    expect((await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send({ amount: 40, idempotencyKey: 'resp-partial' })).status).toBe(201);
    const [partial] = forObligation(await alerts(), obligation);
    expect(partial).toMatchObject({ type: 'partial_payment', responsibility: 'owner', status: 'overdue', amount: 60, currencyCode: 'EUR', obligationId: obligation.id });
    ['id', 'type', 'date', 'title', 'message', 'status', 'assetId', 'assetName', 'occurrenceId', 'reminderLeadDays', 'daysUntil'].forEach(field => expect(partial).toHaveProperty(field));
  });

  it('document_pending follows the responsibility of its obligation (owner payments stay with the owner)', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Municipal', startDate: day(-1), reminderLeadDays: 3, estimatedAmount: 10 });
    expect((await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send({ amount: 10, idempotencyKey: 'resp-doc' })).status).toBe(201);
    const [owner] = forObligation(await alerts('?type=document_pending'), obligation);
    expect(owner).toMatchObject({ type: 'document_pending', responsibility: 'owner' });
    // A shared obligation whose owner part was paid also asks the owner for the receipt.
    const shared = await createObligation({ title: 'Compartida', startDate: day(-1), reminderLeadDays: 3, estimatedAmount: 100, responsibilityType: 'shared', responsibilitySplit: { type: 'percentage', ownerPercent: 50, tenantPercent: 50 } });
    expect((await agent.post(`/api/obligations/${shared.obligation.id}/occurrences/${shared.occurrence.id}/payments`).send({ amount: 50, idempotencyKey: 'resp-doc-shared' })).status).toBe(201);
    expect((await agent.post(`/api/obligations/${shared.obligation.id}/occurrences/${shared.occurrence.id}/resolution`).send({ tenantEntityId: tenantId, period: day(-1).slice(0, 7), amount: 50 })).status).toBe(201);
    const [sharedAlert] = forObligation(await alerts('?type=document_pending'), shared.obligation);
    expect(sharedAlert).toMatchObject({ type: 'document_pending', responsibility: 'owner' });
  });

  it('filters by responsibility and combines it with the other filters', async () => {
    const owners = await alerts('?responsibility=owner');
    const tenants = await alerts('?responsibility=tenant');
    expect(owners.length).toBeGreaterThan(0);
    expect(tenants.length).toBeGreaterThan(0);
    expect(owners.every(item => item.responsibility === 'owner')).toBe(true);
    expect(tenants.every(item => item.responsibility === 'tenant')).toBe(true);
    expect(owners.length + tenants.length).toBe((await alerts()).length);
    const combined = await alerts('?responsibility=owner&type=obligation_overdue');
    expect(combined.length).toBeGreaterThan(0);
    expect(combined.every(item => item.responsibility === 'owner' && item.type === 'obligation_overdue')).toBe(true);
    expect(await alerts('?responsibility=tenant&type=obligation_overdue')).toEqual([]);
    expect(await alerts('?responsibility=')).toHaveLength((await alerts()).length);
  });

  it('rejects an invalid responsibility with a Spanish message', async () => {
    const response = await agent.get('/api/alerts?responsibility=other');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('El responsable no es válido');
    expect((await agent.get('/api/alerts?responsibility=owner&responsibility=tenant')).status).toBe(400);
  });

  it('keeps excluding resolved tenant obligations, applies the limit and stays read-only', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Agua', responsibilityType: 'tenant', startDate: day(2) });
    expect(forObligation(await alerts('?responsibility=tenant'), obligation)).toHaveLength(1);
    const resolved = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/resolution`).send({ tenantEntityId: tenantId, period: day(2).slice(0, 7), amount: 85 });
    expect(resolved.status).toBe(201);
    expect(forObligation(await alerts('?responsibility=tenant'), obligation)).toHaveLength(0);
    expect(await alerts('?responsibility=owner&limit=1')).toHaveLength(1);
  });
});
