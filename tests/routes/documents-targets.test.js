const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

describe('Document link targets', () => {
  let db;
  let agent;
  let userId;
  let assetId;
  let otherAssetId;
  let obligationId;
  let occurrenceId;
  let otherObligationId;
  let contractId;
  let rentOccurrenceId;
  let transactionId;
  let tenantId;
  let plainOwnerId;

  const upload = (fields, name = 'receipt.txt') => {
    let req = agent.post('/api/documents');
    Object.entries(fields).forEach(([key, value]) => { req = req.field(key, value); });
    return req.attach('file', Buffer.from('receipt contents'), { filename: name, contentType: 'text/plain' });
  };

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    app.locals.documentStorage = new DiskDocumentStorage(TEMP_DATA_DIR);
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'doctarget@test.example', password: '123456', nombre: 'Doc Target' });
    userId = db.findUserByName('Doc Target').id;
    const today = ledger.localDateForUser(db, userId);
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Flat' })).body.id;
    otherAssetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Garage' })).body.id;
    tenantId = (await agent.post('/api/owners').send({ name: 'Tenant', kind: 'person', roles: ['tenant'] })).body.id;
    plainOwnerId = (await agent.post('/api/owners').send({ name: 'Plain', kind: 'person', roles: ['owner'] })).body.id;
    const obligation = await agent.post('/api/obligations').send({ title: 'Fee', type: 'other', currencyCode: 'EUR', estimatedAmount: 50, startDate: today, assetId });
    obligationId = obligation.body.id;
    occurrenceId = obligation.body.occurrences[0].id;
    otherObligationId = (await agent.post('/api/obligations').send({ title: 'Other', type: 'other', currencyCode: 'EUR', estimatedAmount: 10, startDate: today, assetId: otherAssetId })).body.id;
    const contract = await agent.post('/api/rentals').send({
      assetId, type: 'residential', startDate: '2030-01-01', endDate: '2030-12-31', initialRent: 100, currencyCode: 'EUR',
      periodicity: 'monthly', dueDay: 1, depositAmount: 0, guarantee: '', includedExpenses: [], expenseResponsibility: {}, notes: '', tenantIds: [tenantId], status: 'active'
    });
    contractId = contract.body.id;
    rentOccurrenceId = (await agent.get(`/api/rentals/${contractId}`).query({ to: '2030-01-01' })).body.occurrences[0].id;
    ledger.ensureSetup(db, userId);
    transactionId = db.create('transactions', { userId, tipo: 'expense', monto: 5, amountMinor: 500, currencyCode: 'EUR', titulo: 'T', fecha: today }, userId).id;
  });

  afterAll(() => cleanupTestDb());

  it('links to an occurrence and stores the derived obligation and asset', async () => {
    const response = await upload({ occurrenceId });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ occurrenceId, obligationId, assetId });
    const listed = await agent.get('/api/documents').query({ occurrenceId });
    expect(listed.body.map(item => item.id)).toEqual([response.body.id]);
    expect((await agent.get('/api/documents').query({ obligationId })).body.map(item => item.id)).toContain(response.body.id);
  });

  it('accepts consistent combined targets and rejects mismatches', async () => {
    expect((await upload({ occurrenceId, obligationId, assetId })).status).toBe(201);
    expect((await upload({ occurrenceId, assetId: otherAssetId })).status).toBe(400);
    expect((await upload({ occurrenceId, obligationId: otherObligationId })).status).toBe(400);
    expect((await upload({ occurrenceId: 'missing' })).status).toBe(400);
  });

  it('links to a rent period and derives contract and asset', async () => {
    const response = await upload({ rentOccurrenceId });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ rentOccurrenceId, contractId, assetId });
    expect((await agent.get('/api/documents').query({ rentOccurrenceId })).body).toHaveLength(1);
    expect((await upload({ rentOccurrenceId, assetId: otherAssetId })).status).toBe(400);
    expect((await upload({ rentOccurrenceId, contractId: 'nope' })).status).toBe(400);
  });

  it('links to a transaction and a tenant, validating them', async () => {
    const tx = await upload({ transactionId });
    expect(tx.status).toBe(201);
    expect((await agent.get('/api/documents').query({ transactionId })).body).toHaveLength(1);
    expect((await upload({ transactionId: 'missing' })).status).toBe(400);
    const tenant = await upload({ tenantEntityId: tenantId });
    expect(tenant.status).toBe(201);
    expect((await agent.get('/api/documents').query({ tenantEntityId: tenantId })).body.map(item => item.id)).toEqual([tenant.body.id]);
    expect((await upload({ tenantEntityId: plainOwnerId })).status).toBe(400);
  });

  it('combines occurrence and tenant targets for resolution receipts', async () => {
    const response = await upload({ occurrenceId, tenantEntityId: tenantId });
    expect(response.status).toBe(201);
    const filtered = await agent.get('/api/documents').query({ occurrenceId, tenantEntityId: tenantId });
    expect(filtered.body.map(item => item.id)).toEqual([response.body.id]);
  });

  it('requires at least one target and keeps legacy single targets working', async () => {
    expect((await upload({})).status).toBe(400);
    expect((await agent.get('/api/documents')).status).toBe(400);
    const legacy = await upload({ contractId });
    expect(legacy.status).toBe(201);
    expect(legacy.body).toMatchObject({ contractId, assetId, occurrenceId: null, tenantEntityId: null });
    expect((await agent.get('/api/documents').query({ contractId })).body.map(item => item.id)).toContain(legacy.body.id);
  });

  it('ignores dangling links without failing', async () => {
    const response = await upload({ transactionId });
    db.remove('transactions', transactionId, userId);
    expect((await agent.get('/api/documents').query({ transactionId: 'gone' })).body).toEqual([]);
    expect((await agent.get(`/api/documents/${response.body.id}`)).status).toBe(200);
  });
});
