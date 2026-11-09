const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Economic overview routes', () => {
  let db;
  let agent;
  let otherAgent;
  let userId;
  let otherUserId;
  let eurAccount;
  let usdAccount;
  let date;
  let month;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    otherAgent = request.agent(app);
    const suffix = Date.now();
    await agent.post('/api/auth/register').send({ email: `overview-${suffix}@test.example`, password: '123456', nombre: 'Overview User' });
    await otherAgent.post('/api/auth/register').send({ email: `overview-other-${suffix}@test.example`, password: '123456', nombre: 'Other Overview User' });
    userId = db.findUserByName('Overview User').id;
    otherUserId = db.findUserByName('Other Overview User').id;
    ledger.ensureSetup(db, userId);
    ledger.ensureSetup(db, otherUserId);
    eurAccount = ledger.accountsForUser(db, userId).find(item => item.legacyPrimary);
    eurAccount = db.update('accounts', eurAccount.id, { currency: 'EUR' }, userId);
    usdAccount = db.create('accounts', {
      nombre: 'Overview USD', currency: 'USD', primary: false, legacyPrimary: false,
      activo: true, archivedAt: null, order: 1
    }, userId);
    date = ledger.localDateForUser(db, userId);
    month = date.slice(0, 7);
  });

  afterAll(() => cleanupTestDb());

  function transaction(fields = {}, ownerId = userId) {
    return db.create('transactions', {
      tipo: 'expense', monto: 0, amountMinor: 0, titulo: 'Overview movement',
      fecha: date, recurrente: false, accountId: eurAccount.id, currencyCode: 'EUR',
      ...fields
    }, ownerId);
  }

  function asset(name, ownerId = userId) {
    return db.create('assets', {
      name, type: 'immovable', acquisitionDate: '2020-01-01', status: 'active'
    }, ownerId);
  }

  it('GET /api/finance/overview defaults to the current month and separates currencies, transfers, refunds, and pending items', async () => {
    transaction({ tipo: 'income', monto: 100, amountMinor: 10000, titulo: 'EUR income' });
    const source = transaction({ monto: 40, amountMinor: 4000, titulo: 'EUR source expense' });
    transaction({ tipo: 'refund', monto: 10, amountMinor: 1000, titulo: 'Source refund', refundSourceId: source.id });
    transaction({ tipo: 'income', monto: 30, amountMinor: 3000, titulo: 'USD income', accountId: usdAccount.id, currencyCode: 'USD' });
    const pendingAsset = asset('Pending rental');
    db.create('obligations', {
      title: 'Pending utility', type: 'utility', assetId: null, currencyCode: 'EUR', estimatedAmount: 25,
      startDate: `${month}-01`, recurrenceFrequency: null, status: 'active', reminderLeadDays: 7
    }, userId);
    db.create('rentalContracts', {
      assetId: pendingAsset.id, status: 'active', startDate: `${month}-01`, endDate: null,
      periodicity: 'monthly', dueDay: 20, currencyCode: 'EUR', initialRentMinor: 40000
    }, userId);
    db.create('transfers', {
      fromAccountId: eurAccount.id, toAccountId: usdAccount.id, fromCurrency: 'EUR', toCurrency: 'USD',
      sentMinor: 2000, receivedMinor: 2200, feeMinor: 200, fecha: date, postedAt: date, status: 'posted'
    }, userId);
    transaction({ tipo: 'income', monto: 999, amountMinor: 99900, titulo: 'Foreign income' }, otherUserId);

    const transactionCount = db.findAll('transactions', userId).length;
    const transferCount = db.findAll('transfers', userId).length;
    const response = await agent.get('/api/finance/overview');
    const eur = response.body.currencies.find(item => item.currency === 'EUR');
    const usd = response.body.currencies.find(item => item.currency === 'USD');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ month, period: { from: `${month}-01` } });
    expect(response.body.currencies.map(item => item.currency)).toEqual(['EUR', 'USD']);
    expect(eur).toMatchObject({ income: 100, expenses: 42, refunds: 10, netExpenses: 32, savings: 68, transferOut: 20, transferIn: 0 });
    expect(usd).toMatchObject({ income: 30, expenses: 0, refunds: 0, netExpenses: 0, savings: 30, transferOut: 0, transferIn: 22 });
    expect(response.body.transfers).toHaveLength(1);
    expect(response.body.transfers[0]).toMatchObject({ sentAmount: 20, receivedAmount: 22, feeAmount: 2, feeAmountMinor: 200 });
    expect(response.body.movements.find(item => item.type === 'refund')).toMatchObject({ refundSourceId: source.id, refundSourceConcept: 'EUR source expense' });
    expect(response.body.movements.filter(item => item.transferId)).toEqual([
      expect.objectContaining({ type: 'expense', amount: 2, concept: 'Comisión de transferencia' })
    ]);
    expect(response.body.movements.some(item => item.concept === 'Foreign income')).toBe(false);
    expect(response.body.pending.obligations).toEqual([expect.objectContaining({ concept: 'Pending utility', amount: 25 })]);
    expect(response.body.pending.rents).toEqual([expect.objectContaining({ assetId: pendingAsset.id, currency: 'EUR' })]);
    expect(response.body.pending.currencies).toEqual([expect.objectContaining({ currency: 'EUR', obligations: 25 })]);
    expect(db.findAll('transactions', userId)).toHaveLength(transactionCount);
    expect(db.findAll('transfers', userId)).toHaveLength(transferCount);
  });

  it('GET /api/assets/:id/economics attributes direct, shared, and legacy movements once per currency and filters the requested period', async () => {
    const property = asset('Economics property');
    const peer = asset('Shared allocation peer');
    const sharedExpense = transaction({ monto: 50, amountMinor: 5000, titulo: 'Shared expense' });
    db.create('movementAllocations', { transactionId: sharedExpense.id, assetId: property.id, amountMinor: 1000, currencyCode: 'EUR' }, userId);
    db.create('movementAllocations', { transactionId: sharedExpense.id, assetId: peer.id, amountMinor: 2000, currencyCode: 'EUR' }, userId);
    const sharedRefund = transaction({ tipo: 'refund', monto: 10, amountMinor: 1000, titulo: 'Shared refund', refundSourceId: sharedExpense.id });
    const directExpense = transaction({ monto: 15, amountMinor: 1500, titulo: 'Direct expense' });
    db.create('movementAllocations', { transactionId: directExpense.id, assetId: property.id, amountMinor: 1500, currencyCode: 'EUR' }, userId);

    const obligation = db.create('obligations', {
      assetId: property.id, title: 'Legacy bill', type: 'utility', currencyCode: 'EUR', estimatedAmount: 12,
      startDate: date, recurrenceFrequency: null, status: 'active', reminderLeadDays: 0
    }, userId);
    const obligationExpense = transaction({ monto: 12, amountMinor: 1200, titulo: 'Obligation payment', obligationId: obligation.id });

    const contract = db.create('rentalContracts', {
      assetId: property.id, status: 'active', startDate: date, periodicity: 'monthly', dueDay: Number(date.slice(8, 10)),
      currencyCode: 'EUR', initialRentMinor: 7000, type: 'residential'
    }, userId);
    const occurrence = db.create('rentOccurrences', {
      contractId: contract.id, date, currencyCode: 'EUR', rentMinor: 7000, cancelled: false
    }, userId);
    const collection = db.create('rentCollections', { transactionId: 'legacy-rent-income', currencyCode: 'EUR' }, userId);
    db.create('rentCollectionAllocations', { collectionId: collection.id, occurrenceId: occurrence.id, amountMinor: 700 }, userId);
    const rentIncome = transaction({ id: 'legacy-rent-income', tipo: 'income', monto: 7, amountMinor: 700, titulo: 'Legacy rent collection', rentCollectionId: collection.id });

    const claim = db.create('recoverableExpenseClaims', {
      transactionId: 'legacy-claim-expense', assetId: property.id, recoverableMinor: 2000, contractId: contract.id, currencyCode: 'EUR'
    }, userId);
    const claimExpense = transaction({ id: 'legacy-claim-expense', monto: 40, amountMinor: 4000, titulo: 'Recoverable source expense', recoverableClaimId: claim.id });
    const recoveryIncome = transaction({
      id: 'legacy-recovery-income', tipo: 'income', monto: 5, amountMinor: 500, titulo: 'Recovery income', recoverableExpenseClaimId: claim.id
    });
    const usdExpense = transaction({ monto: 4, amountMinor: 400, titulo: 'USD asset expense', accountId: usdAccount.id, currencyCode: 'USD' });
    db.create('movementAllocations', { transactionId: usdExpense.id, assetId: property.id, amountMinor: 400, currencyCode: 'USD' }, userId);
    const excluded = transaction({ monto: 99, amountMinor: 9900, titulo: 'Outside period', fecha: '2020-01-15' });
    db.create('movementAllocations', { transactionId: excluded.id, assetId: property.id, amountMinor: 9900, currencyCode: 'EUR' }, userId);

    const transactionCount = db.findAll('transactions', userId).length;
    const response = await agent.get(`/api/assets/${property.id}/economics`).query({ period: 'custom', from: date, to: date });
    const eur = response.body.currencies.find(item => item.currency === 'EUR');
    const usd = response.body.currencies.find(item => item.currency === 'USD');
    const ids = response.body.movements.map(item => item.transactionId);

    expect(response.status).toBe(200);
    expect(response.body.period).toMatchObject({ mode: 'custom', from: date, to: date });
    expect(eur).toMatchObject({ income: 12, expenses: 57, refunds: 2, grossExpenses: 57, netResult: -43 });
    expect(usd).toMatchObject({ income: 0, expenses: 4, refunds: 0, netResult: -4 });
    expect(response.body.movements).toHaveLength(8);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(excluded.id);
    expect(response.body.movements).toEqual(expect.arrayContaining([
      expect.objectContaining({ transactionId: sharedExpense.id, amountMinor: 1000 }),
      expect.objectContaining({ transactionId: sharedRefund.id, amountMinor: 200, refundSourceId: sharedExpense.id }),
      expect.objectContaining({ transactionId: directExpense.id, amountMinor: 1500 }),
      expect.objectContaining({ transactionId: obligationExpense.id, amountMinor: 1200 }),
      expect.objectContaining({ transactionId: rentIncome.id, amountMinor: 700 }),
      expect.objectContaining({ transactionId: claimExpense.id, amountMinor: 2000 }),
      expect.objectContaining({ transactionId: recoveryIncome.id, amountMinor: 500 }),
      expect.objectContaining({ transactionId: usdExpense.id, currency: 'USD', amountMinor: 400 })
    ]));
    expect(db.findAll('transactions', userId)).toHaveLength(transactionCount);
  });

  it('GET economics endpoints enforce authentication, ownership, and valid periods', async () => {
    const foreignAsset = asset('Private asset', otherUserId);

    expect((await request(app).get('/api/finance/overview')).status).toBe(401);
    expect((await request(app).get(`/api/assets/${foreignAsset.id}/economics`)).status).toBe(401);
    const invalidMonth = await agent.get('/api/finance/overview').query({ month: '2026-13' });
    const foreignEconomics = await agent.get(`/api/assets/${foreignAsset.id}/economics`);
    const missingEconomics = await agent.get('/api/assets/not-an-asset/economics');
    const invalidPeriod = await agent.get(`/api/assets/${asset('Period validation').id}/economics`).query({
      period: 'custom', from: '2026-12-31', to: '2026-12-01'
    });

    expect(invalidMonth.status).toBe(400);
    expect(invalidMonth.body).toMatchObject({ error: 'El mes debe tener formato YYYY-MM' });
    expect(foreignEconomics.status).toBe(404);
    expect(foreignEconomics.body).toHaveProperty('error');
    expect(missingEconomics.status).toBe(404);
    expect(invalidPeriod.status).toBe(400);
    expect(invalidPeriod.body).toMatchObject({ error: 'El rango de fechas no es válido' });
  });
});
