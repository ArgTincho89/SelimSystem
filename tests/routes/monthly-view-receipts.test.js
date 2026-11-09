const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

describe('Monthly view obligation receipts', () => {
  let db;
  let agent;
  let userId;
  let today;
  let month;
  let accountId;
  let categoryId;
  let assetId;
  let tenantId;

  const create = async extra => {
    const response = await agent.post('/api/obligations').send({
      title: 'Fee', type: 'other', currencyCode: 'ARS', estimatedAmount: 100, startDate: today, accountId, categoryId, assetId, ...extra
    });
    expect(response.status).toBe(201);
    return { obligation: response.body, occurrence: response.body.occurrences[0] };
  };
  const upload = fields => {
    let req = agent.post('/api/documents');
    Object.entries(fields).forEach(([key, value]) => { req = req.field(key, value); });
    return req.attach('file', Buffer.from('receipt'), { filename: 'receipt.txt', contentType: 'text/plain' });
  };
  const row = async occurrence => {
    const body = (await agent.get(`/api/assets/${assetId}/monthly-view?from=${month}&to=${month}`)).body;
    return body.months[0].obligations.find(item => item.occurrenceId === occurrence.id);
  };

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    app.locals.documentStorage = new DiskDocumentStorage(TEMP_DATA_DIR);
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'receipts@test.example', password: '123456', nombre: 'Receipts User' });
    userId = db.findUserByName('Receipts User').id;
    today = ledger.localDateForUser(db, userId);
    month = today.slice(0, 7);
    accountId = (await agent.post('/api/accounts').send({ nombre: 'Main', tipo: 'checking', currency: 'ARS', saldoInicial: 10000 })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Services' })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Flat' })).body.id;
    tenantId = (await agent.post('/api/owners').send({ name: 'Tenant', kind: 'person', roles: ['tenant'] })).body.id;
    await agent.post('/api/rentals').send({
      assetId, type: 'residential', startDate: '2025-01-01', endDate: '2035-12-31', initialRent: 100, currencyCode: 'ARS',
      periodicity: 'monthly', dueDay: 1, depositAmount: 0, guarantee: '', includedExpenses: [], expenseResponsibility: {}, notes: '', tenantIds: [tenantId], status: 'active'
    });
  });

  afterAll(() => cleanupTestDb());

  it('lists no receipts and no payments for an unpaid row', async () => {
    const { occurrence } = await create();
    expect(await row(occurrence)).toMatchObject({ documents: [], payments: [], resolvedAt: null });
  });

  it('lists the payment and its receipts, including several files', async () => {
    const { obligation, occurrence } = await create();
    const paid = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`)
      .send({ amount: 100, accountId, idempotencyKey: 'receipt-key-abcdef', paymentMethod: 'transfer' });
    expect(paid.status).toBe(201);
    const transactionId = paid.body.transaction.id;
    const first = await upload({ transactionId, occurrenceId: occurrence.id });
    const second = await upload({ transactionId });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const result = await row(occurrence);
    expect(result.payments).toEqual([{ transactionId, date: today, amountMinor: 10000, accountName: 'Main', paymentMethod: 'transfer' }]);
    expect(result.documents.map(doc => doc.id).sort()).toEqual([first.body.id, second.body.id].sort());
    expect(result.documents[0]).toMatchObject({ fileName: 'receipt.txt', mimeType: expect.stringContaining('text/plain') });
    expect(result.documentIds).toEqual([first.body.id]);
  });

  it('lists tenant resolution receipts with resolvedAt and no payments', async () => {
    const { obligation, occurrence } = await create({ responsibilityType: 'tenant' });
    const doc = await upload({ occurrenceId: occurrence.id });
    const resolved = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/resolution`)
      .send({ tenantEntityId: tenantId, period: month, amount: 100, documentIds: [doc.body.id], resolvedAt: today });
    expect(resolved.status).toBe(201);
    const result = await row(occurrence);
    expect(result).toMatchObject({ payments: [], resolvedAt: today });
    expect(result.documents.map(item => item.id)).toEqual([doc.body.id]);
  });

  it('shows the tenant alert text until the occurrence is resolved', async () => {
    const { obligation, occurrence } = await create({ responsibilityType: 'tenant', startDate: today });
    const before = (await agent.get('/api/alerts')).body;
    const text = JSON.stringify(before);
    expect(text).toContain(occurrence.id);
    await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/resolution`)
      .send({ tenantEntityId: tenantId, period: month, amount: 100 });
    expect(JSON.stringify((await agent.get('/api/alerts')).body)).not.toContain(occurrence.id);
  });
});
