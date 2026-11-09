const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

describe('Tenant obligation resolutions', () => {
  let db;
  let agent;
  let other;
  let userId;
  let today;
  let month;
  let accountId;
  let categoryId;
  let assetId;
  let tenantId;
  let secondTenantId;
  let plainOwnerId;
  let contractId;

  const shared = { responsibilityType: 'shared', responsibilitySplit: { type: 'percentage', ownerPercent: 50, tenantPercent: 50 } };

  async function createObligation(extra = {}) {
    const response = await agent.post('/api/obligations').send({
      title: 'Building fee', type: 'other', currencyCode: 'EUR', estimatedAmount: 1000, startDate: today,
      accountId, categoryId, assetId, ...extra
    });
    expect(response.status).toBe(201);
    return { obligation: response.body, occurrence: response.body.occurrences[0] };
  }

  const resolveUrl = (obligation, occurrence) => `/api/obligations/${obligation.id}/occurrences/${occurrence.id}/resolution`;
  const resolve = (obligation, occurrence, body = {}) => agent.post(resolveUrl(obligation, occurrence)).send({
    tenantEntityId: tenantId, period: month, amount: 1000, ...body
  });
  const view = async obligation => (await agent.get(`/api/obligations/${obligation.id}`)).body.occurrences[0];
  const pay = (obligation, occurrence, amount, key) => agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send({ amount, idempotencyKey: key });
  const upload = fields => {
    let req = agent.post('/api/documents');
    Object.entries(fields).forEach(([key, value]) => { req = req.field(key, value); });
    return req.attach('file', Buffer.from('receipt'), { filename: 'receipt.txt', contentType: 'text/plain' });
  };

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    app.locals.documentStorage = new DiskDocumentStorage(TEMP_DATA_DIR);
    agent = request.agent(app);
    other = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'resolution@test.example', password: '123456', nombre: 'Resolution User' });
    await other.post('/api/auth/register').send({ email: 'resolution2@test.example', password: '123456', nombre: 'Resolution Other' });
    userId = db.findUserByName('Resolution User').id;
    today = ledger.localDateForUser(db, userId);
    month = today.slice(0, 7);
    await agent.get('/api/accounts/setup');
    accountId = (await agent.post('/api/accounts').send({ name: 'EUR account', currency: 'EUR', initialBalance: 5000 })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Building' })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Flat' })).body.id;
    tenantId = (await agent.post('/api/owners').send({ name: 'Tenant', kind: 'person', roles: ['tenant'] })).body.id;
    secondTenantId = (await agent.post('/api/owners').send({ name: 'Other tenant', kind: 'person', roles: ['tenant'] })).body.id;
    plainOwnerId = (await agent.post('/api/owners').send({ name: 'Plain', kind: 'person', roles: ['owner'] })).body.id;
    contractId = (await agent.post('/api/rentals').send({
      assetId, type: 'residential', startDate: '2025-01-01', endDate: '2035-12-31', initialRent: 100, currencyCode: 'EUR',
      periodicity: 'monthly', dueDay: 1, depositAmount: 0, guarantee: '', includedExpenses: [], expenseResponsibility: {}, notes: '', tenantIds: [tenantId], status: 'active'
    })).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('requires authentication and hides other users data', async () => {
    const { obligation, occurrence } = await createObligation({ responsibilityType: 'tenant' });
    expect((await request(app).post(resolveUrl(obligation, occurrence)).send({})).status).toBe(401);
    expect((await request(app).get('/api/obligations/resolutions')).status).toBe(401);
    expect((await other.post(resolveUrl(obligation, occurrence)).send({ tenantEntityId: tenantId, period: month, amount: 1 })).status).toBe(404);
  });

  it('resolves a tenant occurrence and exposes it as resolved', async () => {
    const { obligation, occurrence } = await createObligation({ responsibilityType: 'tenant' });
    const response = await resolve(obligation, occurrence, { resolvedAt: today, notes: ' paid in cash ' });
    expect(response.status).toBe(201);
    expect(response.body.resolution).toMatchObject({
      occurrenceId: occurrence.id, obligationId: obligation.id, assetId, tenantEntityId: tenantId, period: month,
      portion: 'full', amountMinor: 100000, currencyCode: 'EUR', documentIds: [], resolvedAt: today, notes: 'paid in cash', status: 'active'
    });
    expect(response.body.occurrence.status).toBe('resolved');
    const reread = await view(obligation);
    expect(reread).toMatchObject({ status: 'resolved', remainingAmount: 0, tenantRemainingAmount: 0, ownerDueAmount: 0, tenantDueAmount: 1000 });
    expect(reread.resolution.id).toBe(response.body.resolution.id);
  });

  it('rejects ineligible responsibility types', async () => {
    for (const responsibilityType of ['owner', 'none']) {
      const { obligation, occurrence } = await createObligation({ responsibilityType });
      expect((await resolve(obligation, occurrence)).status).toBe(400);
    }
    const { obligation, occurrence } = await createObligation({ responsibilityType: 'third', responsibleThirdEntityId: plainOwnerId });
    expect((await resolve(obligation, occurrence)).status).toBe(400);
  });

  it('validates tenant, period, amount, currency and date', async () => {
    const { obligation, occurrence } = await createObligation({ responsibilityType: 'tenant' });
    expect((await resolve(obligation, occurrence, { tenantEntityId: plainOwnerId })).status).toBe(400);
    expect((await resolve(obligation, occurrence, { tenantEntityId: 'missing' })).status).toBe(400);
    expect((await resolve(obligation, occurrence, { period: '2030-13' })).status).toBe(400);
    expect((await resolve(obligation, occurrence, { period: undefined })).status).toBe(400);
    expect((await resolve(obligation, occurrence, { amount: 0 })).status).toBe(400);
    expect((await resolve(obligation, occurrence, { amount: -5 })).status).toBe(400);
    expect((await resolve(obligation, occurrence, { amount: '10' })).status).toBe(400);
    expect((await resolve(obligation, occurrence, { currencyCode: 'USD' })).status).toBe(400);
    expect((await resolve(obligation, occurrence, { resolvedAt: '2030-02-31' })).status).toBe(400);
    expect((await resolve(obligation, occurrence, { notes: 5 })).status).toBe(400);
    expect((await resolve(obligation, occurrence, { documentIds: 'x' })).status).toBe(400);
    expect((await resolve(obligation, occurrence, { documentIds: ['missing'] })).status).toBe(400);
    expect((await view(obligation)).status).not.toBe('resolved');
  });

  it('defaults resolvedAt to today and accepts an informational amount for tenant-only', async () => {
    const { obligation, occurrence } = await createObligation({ responsibilityType: 'tenant' });
    const response = await resolve(obligation, occurrence, { amount: 1500 });
    expect(response.status).toBe(201);
    expect(response.body.resolution).toMatchObject({ resolvedAt: today, amountMinor: 150000 });
  });

  it('requires the tenant to belong to the linked rental contract', async () => {
    const { obligation, occurrence } = await createObligation({ responsibilityType: 'tenant', rentalContractId: contractId });
    expect((await resolve(obligation, occurrence, { tenantEntityId: secondTenantId })).status).toBe(400);
    const ok = await resolve(obligation, occurrence);
    expect(ok.status).toBe(201);
    expect(ok.body.resolution.contractId).toBe(contractId);
  });

  it('rejects a duplicate active resolution with 409 and allows it again after voiding', async () => {
    const { obligation, occurrence } = await createObligation({ responsibilityType: 'tenant' });
    expect((await resolve(obligation, occurrence)).status).toBe(201);
    expect((await resolve(obligation, occurrence)).status).toBe(409);
    expect((await agent.delete(resolveUrl(obligation, occurrence))).status).toBe(200);
    expect((await resolve(obligation, occurrence)).status).toBe(201);
  });

  it('accepts receipts linked to the occurrence or tenant and rejects inconsistent ones', async () => {
    const { obligation, occurrence } = await createObligation({ responsibilityType: 'tenant' });
    const { obligation: otherObligation, occurrence: otherOccurrence } = await createObligation({ responsibilityType: 'tenant' });
    const byOccurrence = (await upload({ occurrenceId: occurrence.id })).body.id;
    const byTenant = (await upload({ tenantEntityId: tenantId })).body.id;
    const foreign = (await upload({ occurrenceId: otherOccurrence.id, tenantEntityId: secondTenantId })).body.id;
    expect((await resolve(obligation, occurrence, { documentIds: [foreign] })).status).toBe(400);
    const response = await resolve(obligation, occurrence, { documentIds: [byOccurrence, byTenant, byTenant] });
    expect(response.status).toBe(201);
    expect(response.body.resolution.documentIds).toEqual([byOccurrence, byTenant]);
    expect((await agent.get('/api/documents').query({ occurrenceId: occurrence.id })).body.map(item => item.id)).toContain(byOccurrence);
    expect(otherObligation.id).toBeDefined();
  });

  it('caps the shared resolution at the tenant portion', async () => {
    const { obligation, occurrence } = await createObligation(shared);
    expect((await resolve(obligation, occurrence, { amount: 500.01 })).status).toBe(400);
    expect((await resolve(obligation, occurrence, { amount: 500 })).status).toBe(201);
  });

  it('shared: tenant resolution alone leaves the owner portion pending, then owner payment closes it as paid', async () => {
    const { obligation, occurrence } = await createObligation(shared);
    await resolve(obligation, occurrence, { amount: 500 });
    expect(await view(obligation)).toMatchObject({ status: 'partial', remainingAmount: 500, tenantRemainingAmount: 0 });
    expect((await pay(obligation, occurrence, 501, 'shared-over-1')).status).toBe(400);
    const payment = await pay(obligation, occurrence, 500, 'shared-ok-1');
    expect(payment.status).toBe(201);
    expect(payment.body.occurrence).toMatchObject({ status: 'paid', totalPaid: 500, remainingAmount: 0, ownerDueAmount: 500, tenantDueAmount: 500 });
  });

  it('shared 50/50: owner payments and resolution are not double counted', async () => {
    const { obligation, occurrence } = await createObligation(shared);
    await pay(obligation, occurrence, 500, 'shared-split-1');
    expect(await view(obligation)).toMatchObject({ status: 'partial', totalPaid: 500, remainingAmount: 0, tenantRemainingAmount: 500 });
    await resolve(obligation, occurrence, { amount: 500 });
    expect(await view(obligation)).toMatchObject({ status: 'paid', totalPaid: 500, tenantRemainingAmount: 0 });
  });

  it('tenant-only occurrences reject owner payments', async () => {
    const { obligation, occurrence } = await createObligation({ responsibilityType: 'tenant' });
    const response = await pay(obligation, occurrence, 10, 'tenant-pay-1');
    expect(response.status).toBe(400);
  });

  it('voiding reopens the occurrence', async () => {
    const { obligation, occurrence } = await createObligation({ responsibilityType: 'tenant' });
    await resolve(obligation, occurrence);
    const voided = await agent.delete(resolveUrl(obligation, occurrence));
    expect(voided.status).toBe(200);
    expect(voided.body.resolution.status).toBe('voided');
    expect(voided.body.occurrence.status).toBe('expected');
    expect((await agent.delete(resolveUrl(obligation, occurrence))).status).toBe(404);
    expect((await agent.get('/api/obligations/resolutions').query({ occurrenceId: occurrence.id })).body).toEqual([]);
  });

  it('guards cancel and edit while a resolution is active', async () => {
    const { obligation, occurrence } = await createObligation({ responsibilityType: 'tenant' });
    await resolve(obligation, occurrence);
    expect((await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/cancel`)).status).toBe(409);
    expect((await agent.put(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}`).send({ notes: 'x' })).status).toBe(409);
    await agent.delete(resolveUrl(obligation, occurrence));
    expect((await agent.put(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}`).send({ notes: 'x' })).status).toBe(200);
    expect((await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/cancel`)).status).toBe(200);
    expect((await resolve(obligation, occurrence)).status).toBe(409);
  });

  it('keeps resolved occurrences when the obligation is cancelled or edited', async () => {
    const { obligation, occurrence } = await createObligation({ responsibilityType: 'tenant' });
    await resolve(obligation, occurrence);
    await agent.put(`/api/obligations/${obligation.id}`).send({ title: 'Renamed' });
    await agent.delete(`/api/obligations/${obligation.id}`);
    const stored = db.findById('obligationOccurrences', occurrence.id, userId);
    expect(stored.status).not.toBe('cancelled');
  });

  it('lists resolutions by occurrence, obligation, tenant, asset and period', async () => {
    const { obligation, occurrence } = await createObligation({ responsibilityType: 'tenant' });
    const created = (await resolve(obligation, occurrence)).body.resolution;
    for (const query of [{ occurrenceId: occurrence.id }, { obligationId: obligation.id }, { tenantEntityId: tenantId }, { assetId }, { period: month }]) {
      expect((await agent.get('/api/obligations/resolutions').query(query)).body.map(item => item.id)).toContain(created.id);
    }
    expect((await agent.get('/api/obligations/resolutions').query({ occurrenceId: 'nope' })).body).toEqual([]);
    expect((await agent.get('/api/obligations/resolutions').query({ period: 'bad' })).status).toBe(400);
    expect((await other.get('/api/obligations/resolutions').query({ occurrenceId: occurrence.id })).body).toEqual([]);
  });

  it('never creates transactions or changes balances, Home KPIs and asset economics', async () => {
    const { obligation, occurrence } = await createObligation({ responsibilityType: 'tenant' });
    const snapshot = async () => ({
      transactions: (await agent.get('/api/transactions')).body,
      accounts: (await agent.get('/api/accounts')).body,
      summary: (await agent.get('/api/summary').query({ month })).body,
      economics: (await agent.get(`/api/assets/${assetId}/economics`)).body,
      overview: (await agent.get('/api/finance/overview').query({ month })).body,
      storedTransactions: db.findAll('transactions', userId).length
    });
    const before = await snapshot();
    expect((await resolve(obligation, occurrence)).status).toBe(201);
    const after = await snapshot();
    expect(after).toEqual(before);
    await agent.delete(resolveUrl(obligation, occurrence));
    expect(await snapshot()).toEqual(before);
  });

  it('excludes tenant portions from owner pending totals and keeps the owner portion for shared', async () => {
    const tenantOnly = await createObligation({ responsibilityType: 'tenant', title: 'Tenant utility' });
    const sharedOne = await createObligation({ ...shared, title: 'Shared utility', estimatedAmount: 400 });
    const overview = (await agent.get('/api/finance/overview').query({ month })).body;
    const concepts = overview.pending.obligations.filter(item => item.currency === 'EUR');
    expect(concepts.find(item => item.concept === 'Tenant utility')).toBeUndefined();
    expect(concepts.find(item => item.concept === 'Shared utility')).toMatchObject({ amount: 200 });
    const economics = (await agent.get(`/api/assets/${assetId}/economics`)).body;
    const pending = JSON.stringify(economics.pending || {});
    expect(pending).not.toContain('Tenant utility');
    expect(tenantOnly.obligation.id).toBeDefined();
    expect(sharedOne.obligation.id).toBeDefined();
  });
});
