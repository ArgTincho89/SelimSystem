const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Obligation responsibility', () => {
  let db;
  let agent;
  let today;
  let assetId;
  let otherAssetId;
  let contractId;
  let otherContractId;
  let payerId;
  let strangerId;
  const base = () => ({ title: 'Building fee', type: 'other', currencyCode: 'EUR', estimatedAmount: 100, startDate: today });
  const create = extra => agent.post('/api/obligations').send({ ...base(), ...extra });

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    const other = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'resp@test.example', password: '123456', nombre: 'Resp User' });
    await other.post('/api/auth/register').send({ email: 'resp2@test.example', password: '123456', nombre: 'Resp Other' });
    const userId = db.findUserByName('Resp User').id;
    today = ledger.localDateForUser(db, userId);
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Flat' })).body.id;
    otherAssetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Garage' })).body.id;
    const tenantId = (await agent.post('/api/owners').send({ name: 'Tenant', kind: 'person', roles: ['tenant'] })).body.id;
    payerId = (await agent.post('/api/owners').send({ name: 'Payer', kind: 'person', roles: ['payment_responsible'] })).body.id;
    strangerId = (await other.post('/api/owners').send({ name: 'Stranger', kind: 'person', roles: ['owner'] })).body.id;
    const lease = asset => agent.post('/api/rentals').send({
      assetId: asset, type: 'residential', startDate: '2025-01-01', endDate: '2025-12-31', initialRent: 100, currencyCode: 'EUR',
      periodicity: 'monthly', dueDay: 1, depositAmount: 0, guarantee: '', includedExpenses: [], expenseResponsibility: {}, notes: '', tenantIds: [tenantId], status: 'active'
    });
    contractId = (await lease(assetId)).body.id;
    otherContractId = (await lease(otherAssetId)).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('defaults new obligations to owner responsibility', async () => {
    const response = await create();
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ responsibilityType: 'owner', responsibilitySplit: null, responsibleThirdEntityId: null, rentalContractId: null });
  });

  it('persists tenant and none responsibility', async () => {
    expect((await create({ responsibilityType: 'tenant' })).body.responsibilityType).toBe('tenant');
    expect((await create({ responsibilityType: 'none' })).body.responsibilityType).toBe('none');
    expect((await create({ responsibilityType: 'bogus' })).status).toBe(400);
  });

  it('stores percentage and fixed splits and rejects invalid ones', async () => {
    const pct = await create({ responsibilityType: 'shared', responsibilitySplit: { type: 'percentage', ownerPercent: 60, tenantPercent: 40 } });
    expect(pct.status).toBe(201);
    expect(pct.body.responsibilitySplit).toEqual({ type: 'percentage', ownerPercent: 60, tenantPercent: 40 });
    const fixed = await create({ responsibilityType: 'shared', responsibilitySplit: { type: 'fixed', ownerFixedMinor: 6000, tenantFixedMinor: 4000 } });
    expect(fixed.body.responsibilitySplit).toEqual({ type: 'fixed', ownerFixedMinor: 6000, tenantFixedMinor: 4000 });
    const rule = await create({ responsibilityType: 'shared', responsibilitySplit: { type: 'other', ruleText: ' By usage ' } });
    expect(rule.body.responsibilitySplit).toEqual({ type: 'other', ruleText: 'By usage' });
    const bad = [
      { type: 'percentage', ownerPercent: 50, tenantPercent: 40 },
      { type: 'percentage', ownerPercent: 150, tenantPercent: -50 },
      { type: 'fixed', ownerFixedMinor: -1 },
      { type: 'fixed', ownerFixedMinor: 10.5 },
      { type: 'fixed' },
      { type: 'other', ruleText: '  ' },
      { type: 'weird' }
    ];
    for (const split of bad) expect((await create({ responsibilityType: 'shared', responsibilitySplit: split })).status).toBe(400);
  });

  it('requires a split for shared obligations and drops it for other types', async () => {
    expect((await create({ responsibilityType: 'shared' })).status).toBe(400);
    const owner = await create({ responsibilityType: 'owner', responsibilitySplit: { type: 'percentage', ownerPercent: 50, tenantPercent: 50 } });
    expect(owner.body.responsibilitySplit).toBeNull();
  });

  it('links a third party that is any legal owner of the user', async () => {
    const accepted = await create({ responsibilityType: 'third', responsibleThirdEntityId: payerId });
    expect(accepted.status).toBe(201);
    expect(accepted.body.responsibleThirdEntityId).toBe(payerId);
    expect((await create({ responsibilityType: 'third' })).status).toBe(400);
    expect((await create({ responsibilityType: 'third', responsibleThirdEntityId: strangerId })).status).toBe(400);
  });

  it('validates the rental contract belongs to the same asset', async () => {
    const ok = await create({ assetId, responsibilityType: 'tenant', rentalContractId: contractId });
    expect(ok.status).toBe(201);
    expect(ok.body.rentalContractId).toBe(contractId);
    expect((await create({ assetId, rentalContractId: otherContractId })).status).toBe(400);
    expect((await create({ rentalContractId: contractId })).status).toBe(400);
    expect((await create({ assetId, rentalContractId: 'missing' })).status).toBe(400);
  });

  it('updates responsibility without rewriting existing occurrences', async () => {
    const created = await create({ recurrenceFrequency: 'monthly' });
    const before = (await agent.get(`/api/obligations/${created.body.id}`)).body.occurrences.map(item => item.dueAmountMinor);
    const updated = await agent.put(`/api/obligations/${created.body.id}`).send({ responsibilityType: 'tenant' });
    expect(updated.status).toBe(200);
    expect(updated.body.responsibilityType).toBe('tenant');
    expect(updated.body.occurrences.map(item => item.dueAmountMinor)).toEqual(before);
    expect((await agent.put(`/api/obligations/${created.body.id}`).send({ responsibilityType: 'shared' })).status).toBe(400);
  });

  it('treats legacy obligations without responsibility as owner on update', async () => {
    const userId = db.findUserByName('Resp User').id;
    const legacy = db.create('obligations', { ...base(), status: 'active', reminderLeadDays: 7, paymentMethod: '', notes: '', recurrenceFrequency: null, endDate: null }, userId);
    const updated = await agent.put(`/api/obligations/${legacy.id}`).send({ title: 'Renamed' });
    expect(updated.status).toBe(200);
    expect(updated.body.responsibilityType).toBe('owner');
  });
});
