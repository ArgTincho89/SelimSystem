const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Composite asset form: rental and obligation responsibilities', () => {
  let db;
  let agent;
  let userId;
  let owner;
  let tenant;
  let tenant2;

  const today = new Date().toISOString().slice(0, 10);
  const holders = () => [{ ownerId: owner.id, percentage: null }];
  const rental = (extra = {}) => ({ tenantId: tenant.id, startDate: '2025-03-15', endDate: null, amount: 1000, adjustmentFrequencyMonths: 6, adjustmentCriterion: 'IPC', ...extra });
  const form = (condition, rentalValue, extra = {}, asset = {}) => ({
    asset: { type: 'immovable', name: 'Flat', condition, ...asset }, owners: holders(), rental: rentalValue, ...extra
  });
  const contractsOf = assetId => db.findAll('rentalContracts', userId).filter(item => item.assetId === assetId);
  const create = async (rentalValue = rental(), condition = 'rented', asset = {}) => agent.post('/api/assets/form').send(form(condition, rentalValue, {}, asset));

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'formrent@test.example', password: '123456', nombre: 'Form Rent' });
    userId = db.findUserByName('Form Rent').id;
    owner = db.create('legalOwners', { name: 'Owner', kind: 'person', roles: ['owner'] }, userId);
    tenant = db.create('legalOwners', { name: 'Tenant', kind: 'person', roles: ['tenant'] }, userId);
    tenant2 = db.create('legalOwners', { name: 'Tenant2', kind: 'person', roles: ['tenant'] }, userId);
  });

  afterAll(() => cleanupTestDb());

  it('creates the contract with defaults and returns it in the response', async () => {
    const res = await create(rental(), 'rented', { propertyKind: 'galpon' });
    expect(res.status).toBe(201);
    expect(res.body.activeContract).toMatchObject({
      type: 'industrial', periodicity: 'monthly', dueDay: 15, status: 'active', currencyCode: 'ARS', initialRent: 1000, depositAmount: 0,
      includedExpenses: [], expenseResponsibility: {}, contractKind: 'rental', adjustmentFrequencyMonths: 6, adjustmentCriterion: 'IPC', locked: false
    });
    expect(res.body.activeContract.tenants[0].id).toBe(tenant.id);
    expect(res.body.usageStatus).toBe('rented');
    const got = await agent.get(`/api/assets/${res.body.id}`);
    expect(got.body.activeContract.id).toBe(res.body.activeContract.id);
  });

  it('defaults contract type by property kind and supports usufruct', async () => {
    const lot = await create(rental(), 'rented', { propertyKind: 'lote' });
    expect(lot.body.activeContract.type).toBe('other');
    const house = await create(rental(), 'usufruct', { propertyKind: 'casa' });
    expect(house.body.activeContract).toMatchObject({ type: 'residential', contractKind: 'usufruct' });
    expect(house.body.condition).toBe('usufruct');
  });

  it('rejects invalid rental data without writing', async () => {
    const assets = db.findAll('assets', userId).length;
    const contracts = db.findAll('rentalContracts', userId).length;
    for (const payload of [
      null, rental({ tenantId: '' }), rental({ tenantId: owner.id }), rental({ startDate: '2025-13-40' }), rental({ endDate: '2025-01-01' }),
      rental({ amount: 10.5 }), rental({ amount: 0 }), rental({ currencyCode: 'XXX' }), rental({ adjustmentFrequencyMonths: 0 })
    ]) {
      const res = await create(payload);
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    }
    expect(db.findAll('assets', userId)).toHaveLength(assets);
    expect(db.findAll('rentalContracts', userId)).toHaveLength(contracts);
  });

  it('keeps not_rented working with rental null and rejects rental on movables', async () => {
    const res = await create(null, 'not_rented');
    expect(res.status).toBe(201);
    expect(res.body.activeContract).toBeNull();
    const movable = await agent.post('/api/assets/form').send({ asset: { type: 'movable', name: 'Car' }, owners: holders(), rental: rental() });
    expect(movable.status).toBe(400);
  });

  it('updates the contract in place and keeps it when rental is omitted', async () => {
    const created = await create(rental({ amount: 500 }));
    const id = created.body.id;
    const contractId = created.body.activeContract.id;
    const res = await agent.put(`/api/assets/${id}/form`).send(form('rented', rental({ amount: 800, tenantId: tenant2.id, endDate: '2030-01-01' })));
    expect(res.status).toBe(200);
    expect(res.body.activeContract).toMatchObject({ id: contractId, initialRent: 800, endDate: '2030-01-01' });
    expect(res.body.activeContract.tenantIds).toEqual([tenant2.id]);
    expect(contractsOf(id)).toHaveLength(1);
    const kept = await agent.put(`/api/assets/${id}/form`).send(form('rented', null));
    expect(kept.status).toBe(200);
    expect(kept.body.activeContract.initialRent).toBe(800);
  });

  it('locks tenant, start, amount and currency once rent occurrences exist', async () => {
    const created = await create();
    const id = created.body.id;
    await agent.get(`/api/rentals/${created.body.activeContract.id}`);
    const locked = await agent.get(`/api/assets/${id}`);
    expect(locked.body.activeContract.locked).toBe(true);
    for (const change of [{ amount: 2000 }, { startDate: '2025-04-15' }, { tenantId: tenant2.id }, { currencyCode: 'USD' }]) {
      expect((await agent.put(`/api/assets/${id}/form`).send(form('rented', rental(change)))).status).toBe(409);
    }
    const allowed = await agent.put(`/api/assets/${id}/form`).send(form('rented', rental({ adjustmentCriterion: 'ICL', endDate: '2031-01-01' })));
    expect(allowed.status).toBe(200);
    expect(allowed.body.activeContract).toMatchObject({ adjustmentCriterion: 'ICL', endDate: '2031-01-01', initialRent: 1000 });
  });

  it('requires rental data when the condition is rented without a contract', async () => {
    const res = await create(null, 'rented');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/alquiler/i);
  });

  it('applies obligation responsibilities per item and rejects tenant without a contract', async () => {
    const created = await create();
    const id = created.body.id;
    const ob = db.create('obligations', {
      title: 'Gas', type: 'service', assetId: id, currencyCode: 'ARS', estimatedAmount: 10, startDate: today, responsibilityType: 'owner', status: 'active', reminderLeadDays: 7
    }, userId);
    const res = await agent.put(`/api/assets/${id}/form`).send(form('rented', rental(), { obligationResponsibilities: [{ obligationId: ob.id, responsibilityType: 'tenant' }] }));
    expect(res.status).toBe(200);
    expect(res.body.obligations).toEqual([expect.objectContaining({ id: ob.id, title: 'Gas', responsibilityType: 'tenant', providerName: null })]);
    const free = await create(null, 'not_rented');
    const other = db.create('obligations', { title: 'Tax', type: 'tax', assetId: free.body.id, currencyCode: 'ARS', estimatedAmount: 10, startDate: today, responsibilityType: 'owner', status: 'active' }, userId);
    const bad = await agent.put(`/api/assets/${free.body.id}/form`).send(form('not_rented', null, { obligationResponsibilities: [{ obligationId: other.id, responsibilityType: 'tenant' }] }));
    expect(bad.status).toBe(400);
    const foreign = await agent.put(`/api/assets/${free.body.id}/form`).send(form('not_rented', null, { obligationResponsibilities: [{ obligationId: ob.id, responsibilityType: 'owner' }] }));
    expect(foreign.status).toBe(400);
  });

  it('ends the contract on not_rented and reverts tenant obligations to the owner', async () => {
    const created = await create();
    const id = created.body.id;
    const ob = db.create('obligations', {
      title: 'Water', type: 'service', assetId: id, currencyCode: 'ARS', estimatedAmount: 10, startDate: today, responsibilityType: 'tenant', status: 'active', reminderLeadDays: 7
    }, userId);
    const res = await agent.put(`/api/assets/${id}/form`).send(form('not_rented', null));
    expect(res.status).toBe(200);
    expect(res.body.activeContract).toBeNull();
    expect(res.body.usageStatus).toBe('vacant');
    expect(contractsOf(id)[0].status).toBe('ended');
    expect(res.body.obligations[0]).toMatchObject({ id: ob.id, responsibilityType: 'owner' });
  });
});
