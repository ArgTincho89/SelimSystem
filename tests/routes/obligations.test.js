const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const ledger = require('../../src/services/account-ledger');
const { addDaysDateOnly } = require('../../src/utils/recurring');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

describe('Obligations', () => {
  let db;
  let agent;
  let otherAgent;
  let userId;
  let accountId;
  let categoryId;
  let providerId;
  let assetId;
  let today;

  async function createObligation(overrides = {}) {
    const response = await agent.post('/api/obligations').send({
      title: 'Internet service', type: 'utility', currencyCode: 'EUR', estimatedAmount: 100,
      startDate: today, recurrenceFrequency: null, reminderLeadDays: 7,
      accountId, categoryId, ...overrides
    });
    expect(response.status).toBe(201);
    return response.body;
  }

  async function occurrenceFor(obligationId, date) {
    const response = await agent.get(`/api/obligations/${obligationId}`);
    expect(response.status).toBe(200);
    return response.body.occurrences.find(item => item.date === date);
  }

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    app.locals.documentStorage = new DiskDocumentStorage(TEMP_DATA_DIR);
    agent = request.agent(app);
    otherAgent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'obligations@test.example', password: '123456', nombre: 'Obligations User' });
    await otherAgent.post('/api/auth/register').send({ email: 'obligations-other@test.example', password: '123456', nombre: 'Other User' });
    userId = db.findUserByName('Obligations User').id;
    today = ledger.localDateForUser(db, userId);
    await agent.get('/api/accounts/setup');
    accountId = (await agent.post('/api/accounts').send({ name: 'Obligations EUR account', currency: 'EUR' })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Household' })).body.id;
    providerId = (await agent.post('/api/owners').send({ name: 'Utility Provider', roles: ['provider'] })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Home' })).body.id;
    await otherAgent.get('/api/accounts/setup');
  });

  afterAll(() => cleanupTestDb());

  it('requires authentication and rejects cross-user obligation, asset, provider, account, and occurrence IDs', async () => {
    expect((await request(app).get('/api/obligations')).status).toBe(401);
    const obligation = await createObligation({ assetId, providerEntityId: providerId });
    expect((await otherAgent.get(`/api/obligations/${obligation.id}`)).status).toBe(404);
    expect((await otherAgent.get('/api/obligations').query({ assetId })).status).toBe(400);
    const foreignAccount = (await otherAgent.get('/api/accounts')).body.find(account => account.activo).id;
    expect((await agent.post('/api/obligations').send({ title: 'Bad link', type: 'other', currencyCode: 'EUR', estimatedAmount: 10, startDate: today, accountId: foreignAccount })).status).toBe(400);
    expect((await agent.post('/api/obligations').send({ title: 'Bad provider', type: 'other', currencyCode: 'EUR', estimatedAmount: 10, startDate: today, providerEntityId: 'foreign-id' })).status).toBe(400);
    expect((await otherAgent.post(`/api/obligations/${obligation.id}/occurrences/${obligation.occurrences[0].id}/confirm`).send({})).status).toBe(404);
  });

  it('generates stable, idempotent recurring occurrences and keeps forecasts out of financial totals', async () => {
    const obligation = await createObligation({ startDate: today, recurrenceFrequency: 'monthly', estimatedAmount: 25 });
    const firstRead = await agent.get(`/api/obligations/${obligation.id}`);
    const secondRead = await agent.get(`/api/obligations/${obligation.id}`);
    expect(firstRead.body.occurrences.map(item => item.id)).toEqual(secondRead.body.occurrences.map(item => item.id));
    expect(firstRead.body.occurrences.length).toBeGreaterThan(1);
    expect(db.findAll('transactions', userId)).toHaveLength(0);
    const totals = ledger.incomeByCurrency(db, userId, db.findAll('transactions', userId), today.slice(0, 7));
    expect(totals).toEqual({});
    expect(db.findAll('obligationOccurrences', userId).every(item => !item.transactionId)).toBe(true);
  });

  it('records partial payments exactly once, derives remaining balance, and protects linked movements', async () => {
    const obligation = await createObligation({ startDate: today, estimatedAmount: 100 });
    const occurrence = await occurrenceFor(obligation.id, today);
    const payment = { amount: 40, accountId, categoryId, idempotencyKey: 'payment-key-0001' };
    const first = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send(payment);
    expect(first.status).toBe(201);
    const retry = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send(payment);
    expect(retry.status).toBe(200);
    expect(retry.body.replayed).toBe(true);
    expect(retry.body.transaction.id).toBe(first.body.transaction.id);
    expect((await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send({ ...payment, amount: 45 })).status).toBe(409);
    const second = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send({ ...payment, amount: 40, idempotencyKey: 'payment-key-0002' });
    expect(second.status).toBe(201);
    const updated = await occurrenceFor(obligation.id, today);
    expect(updated.status).toBe('partial');
    expect(updated.totalPaid).toBe(80);
    expect(updated.remainingAmount).toBe(20);
    expect(db.findAll('transactions', userId).filter(tx => tx.obligationOccurrenceId === occurrence.id)).toHaveLength(2);
    expect((await agent.put(`/api/transactions/${first.body.transaction.id}`).send({ monto: 2 })).status).toBe(409);
    expect((await agent.delete(`/api/transactions/${first.body.transaction.id}`)).status).toBe(409);
  });

  it('validates active user-owned account, category, currency, and payment amount', async () => {
    const obligation = await createObligation({ startDate: today, estimatedAmount: 10 });
    const occurrence = await occurrenceFor(obligation.id, today);
    const path = `/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`;
    expect((await agent.post(path).send({ amount: 1, accountId: 'missing', categoryId, idempotencyKey: 'validation-01' })).status).toBe(400);
    expect((await agent.post(path).send({ amount: 1, accountId, categoryId: 'missing', idempotencyKey: 'validation-02' })).status).toBe(400);
    expect((await agent.post(path).send({ amount: 11, accountId, categoryId, idempotencyKey: 'validation-03' })).status).toBe(400);
    const archivedAccount = (await agent.post('/api/accounts').send({ name: 'Archived account', currency: 'EUR' })).body;
    await agent.post(`/api/accounts/${archivedAccount.id}/archive`);
    expect((await agent.post(path).send({ amount: 1, accountId: archivedAccount.id, categoryId, idempotencyKey: 'validation-04' })).status).toBe(400);
    const usdAccount = (await agent.post('/api/accounts').send({ name: 'Dollar account', currency: 'USD' })).body;
    expect((await agent.post(path).send({ amount: 1, accountId: usdAccount.id, categoryId, idempotencyKey: 'validation-05' })).status).toBe(400);
  });

  it('clears an unpersisted payment from cache when transaction persistence fails', async () => {
    const obligation = await createObligation({ startDate: today });
    const occurrence = await occurrenceFor(obligation.id, today);
    const originalWriteFile = db._writeFile;
    db._writeFile = function (filePath, data) {
      if (filePath.endsWith('transactions.json')) throw new Error('simulated transaction write failure');
      return originalWriteFile.call(this, filePath, data);
    };
    try {
      const failed = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send({
        amount: 10, accountId, categoryId, idempotencyKey: 'rollback-payment-01'
      });
      expect(failed.status).toBe(500);
    } finally {
      db._writeFile = originalWriteFile;
    }
    expect(db.findAll('transactions', userId).some(item => item.obligationOccurrenceId === occurrence.id)).toBe(false);
  });

  it('preserves paid history when a future series change is applied', async () => {
    const obligation = await createObligation({ startDate: today, recurrenceFrequency: 'monthly', estimatedAmount: 30 });
    const initial = (await agent.get(`/api/obligations/${obligation.id}`)).body.occurrences;
    const paidOccurrence = initial.find(item => item.date === today);
    const paid = await agent.post(`/api/obligations/${obligation.id}/occurrences/${paidOccurrence.id}/payments`).send({ amount: 30, accountId, categoryId, idempotencyKey: 'series-paid-0001' });
    expect(paid.status).toBe(201);
    const future = initial.find(item => item.date > today);
    expect(future).toBeTruthy();
    const changed = await agent.put(`/api/obligations/${obligation.id}/occurrences/${future.id}`).send({ scope: 'future', estimatedAmount: 55 });
    expect(changed.status).toBe(200);
    const monthlyDateNoLongerScheduled = initial.find(item => item.date > future.date);
    const cadenceChange = await agent.put(`/api/obligations/${obligation.id}`).send({
      effectiveFromDate: future.date, startDate: future.date, recurrenceFrequency: 'quarterly'
    });
    expect(cadenceChange.status).toBe(200);
    const refreshed = await agent.get(`/api/obligations/${obligation.id}`);
    const historical = refreshed.body.occurrences.find(item => item.id === paidOccurrence.id);
    const changedFuture = refreshed.body.occurrences.find(item => item.id === future.id);
    expect(historical.status).toBe('paid');
    expect(historical.totalPaid).toBe(30);
    expect(changedFuture.actualDueAmount).toBe(55);
    expect(refreshed.body.occurrences.find(item => item.id === monthlyDateNoLongerScheduled.id).status).toBe('cancelled');
    expect(refreshed.body.occurrences.some(item => item.date > monthlyDateNoLongerScheduled.date && item.actualDueAmount === 55)).toBe(true);
    expect(db.findById('transactions', paid.body.transaction.id, userId).monto).toBe(30);
    expect((await agent.put(`/api/obligations/${obligation.id}`).send({ title: 'Retroactive edit', effectiveFromDate: addDaysDateOnly(today, -1) })).status).toBe(409);
  });

  it('supports confirmation, cancellation, due reminders, and blocks cancellation after payment', async () => {
    const dueDate = addDaysDateOnly(today, 5);
    const obligation = await createObligation({ startDate: dueDate, reminderLeadDays: 7 });
    const occurrence = await occurrenceFor(obligation.id, dueDate);
    const confirmed = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/confirm`).send({});
    expect(confirmed.body.status).toBe('confirmed');
    expect((await agent.get('/api/obligations/alerts')).body.some(item => item.occurrenceId === occurrence.id)).toBe(true);
    const cancelled = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/cancel`).send({});
    expect(cancelled.body.status).toBe('cancelled');
    const customDate = addDaysDateOnly(today, 40);
    const customReminder = await createObligation({ startDate: customDate, reminderLeadDays: 45 });
    expect((await agent.get('/api/obligations/alerts')).body.some(item => item.obligationId === customReminder.id)).toBe(true);
    expect((await agent.post('/api/obligations').send({ title: 'Invalid reminder', type: 'other', currencyCode: 'EUR', estimatedAmount: 10, startDate: today, reminderLeadDays: 91 })).status).toBe(400);

    const paidObligation = await createObligation({ startDate: today });
    const paidOccurrence = await occurrenceFor(paidObligation.id, today);
    const paidTransaction = await agent.post(`/api/obligations/${paidObligation.id}/occurrences/${paidOccurrence.id}/payments`).send({ amount: 100, accountId, categoryId, idempotencyKey: 'cancel-paid-0001' });
    expect((await agent.post(`/api/obligations/${paidObligation.id}/occurrences/${paidOccurrence.id}/cancel`).send({})).status).toBe(409);
    expect((await agent.delete(`/api/obligations/${paidObligation.id}`)).status).toBe(200);
    expect((await occurrenceFor(paidObligation.id, today)).status).toBe('paid');
    expect(db.findById('transactions', paidTransaction.body.transaction.id, userId)).toBeTruthy();
  });

  it('associates private documents and dated notes with a user-owned obligation only', async () => {
    const obligation = await createObligation();
    const upload = await agent.post('/api/documents').field('obligationId', obligation.id)
      .attach('file', Buffer.from('Obligation statement\n'), { filename: 'statement.txt', contentType: 'text/plain' });
    expect(upload.status).toBe(201);
    expect((await agent.get('/api/documents').query({ obligationId: obligation.id })).body[0].id).toBe(upload.body.id);
    expect((await otherAgent.get(`/api/documents/${upload.body.id}/content`)).status).toBe(404);
    const note = await agent.post('/api/notes').send({ targetType: 'obligation', targetId: obligation.id, content: 'Renewal reminder' });
    expect(note.status).toBe(201);
    expect((await otherAgent.post('/api/notes').send({ targetType: 'obligation', targetId: obligation.id, content: 'No access' })).status).toBe(400);
  });
});
