const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const ledger = require('../../src/services/account-ledger');
const { addDaysDateOnly } = require('../../src/utils/recurring');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

describe('Asset file overview', () => {
  let db;
  let agent;
  let other;
  let userId;
  let accountId;
  let usdAccountId;
  let categoryId;
  let assetId;
  let emptyAssetId;
  let tenantId;
  let today;

  const url = (query = '', id = assetId) => `/api/assets/${id}/file${query}`;
  const obligation = async extra => {
    const response = await agent.post('/api/obligations').send({
      title: 'Building fee', type: 'other', currencyCode: 'EUR', estimatedAmount: 100, startDate: today,
      accountId, categoryId, assetId, ...extra
    });
    expect(response.status).toBe(201);
    return { obligation: response.body, occurrence: response.body.occurrences[0] };
  };
  const expense = (account, amountMinor, fecha) => {
    const transaction = db.create('transactions', {
      userId, tipo: 'expense', monto: amountMinor / 100, amountMinor, accountId: account, categoryId, titulo: 'Repair', fecha, recurrente: false
    }, userId);
    db.create('movementAllocations', { transactionId: transaction.id, assetId, amountMinor, complete: true }, userId);
  };

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    app.locals.documentStorage = new DiskDocumentStorage(TEMP_DATA_DIR);
    agent = request.agent(app);
    other = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'file@test.example', password: '123456', nombre: 'File User' });
    await other.post('/api/auth/register').send({ email: 'file2@test.example', password: '123456', nombre: 'File Other' });
    userId = db.findUserByName('File User').id;
    today = ledger.localDateForUser(db, userId);
    await agent.get('/api/accounts/setup');
    accountId = (await agent.post('/api/accounts').send({ name: 'EUR', currency: 'EUR', initialBalance: 5000 })).body.id;
    usdAccountId = (await agent.post('/api/accounts').send({ name: 'USD', currency: 'USD', initialBalance: 5000 })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Maintenance' })).body.id;
    emptyAssetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Empty' })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Flat', notes: 'Corner flat' })).body.id;
    tenantId = (await agent.post('/api/owners').send({ name: 'Tenant', kind: 'person', roles: ['tenant'] })).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('requires authentication, rejects unknown/foreign assets and invalid horizons', async () => {
    expect((await request(app).get(url())).status).toBe(401);
    expect((await agent.get(url('', 'missing'))).status).toBe(404);
    expect((await other.get(url())).status).toBe(404);
    for (const value of ['0', '366', 'abc', '1.5']) expect((await agent.get(url(`?horizonDays=${value}`))).status).toBe(400);
    expect((await agent.get(url('?horizonDays=365'))).status).toBe(200);
  });

  it('returns empty sections for an asset without data', async () => {
    const response = await agent.get(url('', emptyAssetId));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      assetId: emptyAssetId, obligations: [], upcoming: [], pending: [], documents: [], notes: [],
      costLast12MonthsMinorByCurrency: {}, rentCollectedThisMonthMinorByCurrency: {}
    });
  });

  it('lists an insurance due in 20 days with its responsible party, outside the alert lead time', async () => {
    const { obligation: created } = await obligation({ title: 'Insurance', startDate: addDaysDateOnly(today, 20), reminderLeadDays: 3 });
    const body = (await agent.get(url())).body;
    const row = body.obligations.find(item => item.obligationId === created.id);
    expect(row).toMatchObject({ title: 'Insurance', responsibilityType: 'owner', status: 'active', nextDueDate: addDaysDateOnly(today, 20), resolutionStatus: 'none' });
    expect(body.upcoming).toEqual([expect.objectContaining({ type: 'obligation_due', date: addDaysDateOnly(today, 20), obligationId: created.id })]);
    expect((await agent.get(url('?horizonDays=10'))).body.upcoming).toEqual([]);
    expect(body.notes).toEqual([expect.objectContaining({ text: 'Corner flat', source: 'asset' })]);
  });

  it('shows a pending tenant receipt, excludes it once resolved, and marks who settled it', async () => {
    const past = addDaysDateOnly(today, -2);
    const { obligation: created, occurrence } = await obligation({ title: 'Tenant water', responsibilityType: 'tenant', startDate: past });
    let body = (await agent.get(url())).body;
    expect(body.pending).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'tenant_obligation_pending', dueDate: past })]));
    const resolved = await agent.post(`/api/obligations/${created.id}/occurrences/${occurrence.id}/resolution`)
      .send({ tenantEntityId: tenantId, period: past.slice(0, 7), amount: 100, notes: 'Receipt shown' });
    expect(resolved.status).toBe(201);
    body = (await agent.get(url())).body;
    expect(body.pending.find(item => item.title === 'Tenant water')).toBeUndefined();
    expect(body.obligations.find(item => item.obligationId === created.id)).toMatchObject({ settledBy: 'tenant', resolutionStatus: 'resolved' });
    expect(body.notes.map(item => item.text)).toContain('Tenant water: Receipt shown');
  });

  it('keeps the owner cost per currency free of resolution amounts and reports collected rent', async () => {
    const recent = addDaysDateOnly(today, -1);
    expense(accountId, 2500, recent);
    expense(usdAccountId, 700, recent);
    const body = (await agent.get(url())).body;
    // The tenant resolution above (100 EUR) is not a transaction, so it is not part of the cost.
    expect(body.costLast12MonthsMinorByCurrency).toEqual({ EUR: 2500, USD: 700 });
    const contract = await agent.post('/api/rentals').send({
      assetId, type: 'residential', startDate: `${today.slice(0, 7)}-01`, endDate: '2099-12-31', initialRent: 100, currencyCode: 'EUR',
      periodicity: 'monthly', dueDay: 1, depositAmount: 0, guarantee: '', includedExpenses: [], expenseResponsibility: {}, notes: '', tenantIds: [tenantId], status: 'active'
    });
    expect(contract.status).toBe(201);
    const occurrence = contract.body.occurrences.find(item => item.date.startsWith(today.slice(0, 7)));
    const collected = await agent.post('/api/rentals/collections').send({
      amount: 60, accountId, date: today, method: 'Bank transfer', idempotencyKey: 'asset-file-rent', allocations: [{ occurrenceId: occurrence.id, amount: 60 }]
    });
    expect(collected.status).toBe(201);
    const after = (await agent.get(url())).body;
    expect(after.rentCollectedThisMonthMinorByCurrency).toEqual({ EUR: 6000 });
    expect(after.currentContract).toMatchObject({ tenantNames: ['Tenant'] });
    expect(after.owners).toEqual([]);
  });

  it('includes documents linked to the asset and to its obligations without duplicates', async () => {
    const { occurrence } = await obligation({ title: 'Documented fee', startDate: addDaysDateOnly(today, 5) });
    const assetDoc = await agent.post('/api/documents').field('title', 'Deed').field('assetId', assetId)
      .attach('file', Buffer.from('deed'), { filename: 'deed.txt', contentType: 'text/plain' });
    const occurrenceDoc = await agent.post('/api/documents').field('title', 'Bill').field('occurrenceId', occurrence.id)
      .attach('file', Buffer.from('bill'), { filename: 'bill.txt', contentType: 'text/plain' });
    expect(assetDoc.status).toBe(201);
    expect(occurrenceDoc.status).toBe(201);
    const documents = (await agent.get(url())).body.documents;
    expect(documents.map(item => item.id)).toEqual(expect.arrayContaining([assetDoc.body.id, occurrenceDoc.body.id]));
    expect(new Set(documents.map(item => item.id)).size).toBe(documents.length);
    expect(documents.find(item => item.id === occurrenceDoc.body.id).targets).toMatchObject({ occurrenceId: occurrence.id });
  });

  it('reports third-party settlement and never mutates data', async () => {
    const third = (await agent.post('/api/owners').send({ name: 'Admin Co', kind: 'person', roles: ['payment_responsible'] })).body.id;
    const { obligation: created, occurrence } = await obligation({
      title: 'Third fee', responsibilityType: 'third', responsibleThirdEntityId: third, startDate: addDaysDateOnly(today, -1)
    });
    const paid = await agent.post(`/api/obligations/${created.id}/occurrences/${occurrence.id}/payments`).send({ amount: 100, idempotencyKey: 'asset-file-third' });
    expect(paid.status).toBe(201);
    const snapshot = ['obligationOccurrences', 'rentOccurrences', 'transactions', 'documents'].map(name => JSON.stringify(db.findAll(name, userId)));
    const body = (await agent.get(url())).body;
    expect(body.obligations.find(item => item.obligationId === created.id)).toMatchObject({ settledBy: 'third', responsibleParty: { type: 'third', name: 'Admin Co' } });
    expect(['obligationOccurrences', 'rentOccurrences', 'transactions', 'documents'].map(name => JSON.stringify(db.findAll(name, userId)))).toEqual(snapshot);
  });
});
