const ledger = require('../../src/services/account-ledger');
const overview = require('../../src/services/economic-overview');
const { setupTestDb, cleanupTestDb, createTestUser } = require('../helpers/setup');

describe('economic overview service', () => {
  let db;
  let user;
  let eurAccount;
  let usdAccount;
  let month;
  let date;

  beforeEach(() => {
    db = setupTestDb();
    user = createTestUser(db);
    ledger.ensureSetup(db, user.id);
    const settings = ledger.getSettings(db, user.id);
    db.update('accountSettings', settings.id, { timezone: 'UTC', appCurrency: 'EUR' }, user.id);
    eurAccount = ledger.accountsForUser(db, user.id).find(item => item.legacyPrimary);
    eurAccount = db.update('accounts', eurAccount.id, { currency: 'EUR' }, user.id);
    usdAccount = db.create('accounts', {
      nombre: 'USD account', currency: 'USD', primary: false, legacyPrimary: false,
      activo: true, archivedAt: null, order: 1, createdAt: new Date().toISOString()
    }, user.id);
    month = ledger.localDateForUser(db, user.id).slice(0, 7);
    date = `${month}-10`;
  });

  afterEach(() => cleanupTestDb());

  function transaction(fields) {
    return db.create('transactions', {
      tipo: 'expense', monto: 0, amountMinor: 0, titulo: 'Movement',
      fecha: date, recurrente: false, accountId: eurAccount.id, currencyCode: 'EUR',
      ...fields
    }, user.id);
  }

  function asset(name) {
    return db.create('assets', { name, type: 'immovable', acquisitionDate: '2024-01-01', status: 'active' }, user.id);
  }

  it('defaults to the user current month and groups actuals and transfers by currency without FX totals', () => {
    transaction({ tipo: 'income', monto: 100, amountMinor: 10000, titulo: 'EUR income' });
    const sourceExpense = transaction({ tipo: 'expense', monto: 30, amountMinor: 3000, titulo: 'EUR expense' });
    transaction({ tipo: 'refund', monto: 5, amountMinor: 500, titulo: 'EUR refund', refundSourceId: sourceExpense.id });
    transaction({ tipo: 'income', monto: 200, amountMinor: 20000, accountId: usdAccount.id, currencyCode: 'USD', titulo: 'USD income' });
    db.create('transfers', {
      fromAccountId: eurAccount.id, toAccountId: usdAccount.id, fromCurrency: 'EUR', toCurrency: 'USD',
      sentMinor: 1000, receivedMinor: 1200, feeMinor: 100, fecha: date, postedAt: date, status: 'posted'
    }, user.id);

    const result = overview.globalOverview(db, user.id);
    const eur = result.currencies.find(item => item.currency === 'EUR');
    const usd = result.currencies.find(item => item.currency === 'USD');

    expect(result.month).toBe(month);
    expect(eur).toMatchObject({ income: 100, expenses: 31, refunds: 5, netExpenses: 26, savings: 74, transferOut: 10, transferIn: 0 });
    expect(usd).toMatchObject({ income: 200, expenses: 0, refunds: 0, netExpenses: 0, savings: 200, transferOut: 0, transferIn: 12 });
    expect(result.transfers).toHaveLength(1);
    expect(result.movements.filter(item => item.type === 'income')).toHaveLength(2);
    expect(result.movements.filter(item => item.transferId)).toHaveLength(1);
    expect(result.movements.find(item => item.type === 'refund')).toMatchObject({ refundSourceId: sourceExpense.id, refundSourceConcept: 'EUR expense' });
    expect(result.movements.find(item => item.type === 'expense')).toMatchObject({ accountId: eurAccount.id, accountName: eurAccount.nombre });
    expect(result.currencies.map(item => item.currency)).toEqual(['EUR', 'USD']);
  });

  it('keeps recurring forecasts, pending obligations and rent expectations out of actual totals', () => {
    transaction({ tipo: 'expense', monto: 80, amountMinor: 8000, titulo: 'Recurring forecast', recurrente: true, frecuencia: 'monthly' });
    const today = ledger.localDateForUser(db, user.id);
    const postedRecurring = transaction({
      tipo: 'expense', monto: 12, amountMinor: 1200, titulo: 'Posted recurring bill',
      recurrente: true, frecuencia: 'monthly', fecha: today
    });
    db.create('recurringOccurrences', { templateId: postedRecurring.id, date: today, status: 'posted', amountMinor: 1200 }, user.id);
    db.create('obligations', {
      title: 'Expected bill', type: 'utility', assetId: null, currencyCode: 'EUR', estimatedAmount: 25,
      startDate: date, recurrenceFrequency: null, status: 'active', reminderLeadDays: 7
    }, user.id);
    const rentalAsset = asset('Rental property');
    db.create('rentalContracts', {
      assetId: rentalAsset.id, status: 'active', startDate: `${month}-01`, endDate: null,
      periodicity: 'monthly', dueDay: 10, currencyCode: 'EUR', initialRentMinor: 40000
    }, user.id);

    const result = overview.globalOverview(db, user.id, month);

    expect(result.currencies.find(item => item.currency === 'EUR').expenses).toBe(12);
    expect(result.movements).toHaveLength(1);
    expect(result.movements[0]).toMatchObject({ concept: 'Posted recurring bill', status: 'posted' });
    expect(result.pending.obligations).toHaveLength(1);
    expect(result.pending.rents.length).toBeGreaterThan(0);
    expect(result.pending.currencies.find(item => item.currency === 'EUR')).toMatchObject({ obligations: 25 });
  });

  it('uses explicit shared allocations once, then attributes refunds proportionally to their source expense', () => {
    const firstAsset = asset('First asset');
    const secondAsset = asset('Second asset');
    const obligation = db.create('obligations', { assetId: firstAsset.id, title: 'Legacy obligation', status: 'active' }, user.id);
    const source = transaction({ tipo: 'expense', monto: 100, amountMinor: 10000, obligationId: obligation.id, obligationOccurrenceId: 'legacy-occurrence' });
    db.create('movementAllocations', { transactionId: source.id, assetId: firstAsset.id, amountMinor: 3000, currencyCode: 'EUR' }, user.id);
    db.create('movementAllocations', { transactionId: source.id, assetId: secondAsset.id, amountMinor: 5000, currencyCode: 'EUR' }, user.id);
    const refund = transaction({ tipo: 'refund', monto: 40, amountMinor: 4000, refundSourceId: source.id });

    expect(overview.movementAttributions(db, user.id, source)).toEqual([
      expect.objectContaining({ assetId: firstAsset.id, amountMinor: 3000, source: 'movementAllocation' }),
      expect.objectContaining({ assetId: secondAsset.id, amountMinor: 5000, source: 'movementAllocation' })
    ]);
    expect(overview.movementAttributions(db, user.id, refund)).toEqual([
      expect.objectContaining({ assetId: firstAsset.id, amountMinor: 1200, source: 'refundSource' }),
      expect.objectContaining({ assetId: secondAsset.id, amountMinor: 2000, source: 'refundSource' })
    ]);
    const global = overview.globalOverview(db, user.id, month);
    expect(global.movements.filter(item => item.transactionId === source.id)).toHaveLength(1);
    expect(global.movements.filter(item => item.transactionId === refund.id)).toHaveLength(1);
    const assetResult = overview.assetEconomics(db, user.id, firstAsset, { period: 'custom', from: date, to: date });
    expect(assetResult.currencies[0]).toMatchObject({ expenses: 30, refunds: 12, netResult: -18 });
    expect(assetResult.movements.find(item => item.transactionId === refund.id)).toMatchObject({
      date, concept: 'Movement', type: 'refund', status: 'posted', refundSourceId: source.id, refundSourceConcept: 'Movement'
    });
    expect(overview.movementAttributions(db, user.id, refund).reduce((sum, item) => sum + item.amountMinor, 0)).toBe(3200);
  });

  it('falls back to obligation, rent collection and recovery links only when generic allocations are absent', () => {
    const property = asset('Linked asset');
    const obligation = db.create('obligations', { assetId: property.id, title: 'Bill', status: 'active' }, user.id);
    const linkedExpense = transaction({ monto: 50, amountMinor: 5000, obligationId: obligation.id });
    expect(overview.allocationsForTransaction(db, user.id, linkedExpense)).toMatchObject([
      { assetId: property.id, amountMinor: 5000, source: 'obligation' }
    ]);

    const contract = db.create('rentalContracts', { assetId: property.id, status: 'active', currencyCode: 'EUR' }, user.id);
    const occurrence = db.create('rentOccurrences', { contractId: contract.id, date, currencyCode: 'EUR' }, user.id);
    const collection = db.create('rentCollections', { id: 'collection-1', transactionId: 'rent-income', currencyCode: 'EUR' }, user.id);
    db.create('rentCollectionAllocations', { collectionId: collection.id, occurrenceId: occurrence.id, amountMinor: 2500 }, user.id);
    const rentIncome = transaction({ tipo: 'income', id: 'rent-income', rentCollectionId: collection.id, monto: 100, amountMinor: 10000 });
    expect(overview.allocationsForTransaction(db, user.id, rentIncome)).toMatchObject([
      { assetId: property.id, amountMinor: 2500, source: 'rentCollection' }
    ]);

    const claim = db.create('recoverableExpenseClaims', {
      transactionId: 'claim-source', assetId: property.id, recoverableMinor: 1200, contractId: contract.id
    }, user.id);
    const claimExpense = transaction({ id: 'claim-source', amountMinor: 4000, recoverableClaimId: claim.id });
    expect(overview.allocationsForTransaction(db, user.id, claimExpense)).toMatchObject([
      { assetId: property.id, amountMinor: 1200, source: 'recoveryClaim' }
    ]);
    const recovery = transaction({ id: 'recovery-income', tipo: 'income', amountMinor: 500, recoverableExpenseClaimId: claim.id });
    expect(overview.allocationsForTransaction(db, user.id, recovery)).toMatchObject([
      { assetId: property.id, amountMinor: 500, source: 'recoveryClaim' }
    ]);

    const mismatched = transaction({ amountMinor: 1000, monto: 10 });
    db.create('movementAllocations', { transactionId: mismatched.id, assetId: property.id, amountMinor: 500, currencyCode: 'USD' }, user.id);
    expect(overview.allocationsForTransaction(db, user.id, mismatched)).toEqual([]);
  });

  it('supports month, year and custom asset periods and keeps currencies separate in evolution', () => {
    const property = asset('Period property');
    const usdTransaction = transaction({
      tipo: 'income', titulo: 'March USD income', fecha: '2024-03-12',
      accountId: usdAccount.id, currencyCode: 'USD', amountMinor: 2500, monto: 25
    });
    db.create('movementAllocations', { transactionId: usdTransaction.id, assetId: property.id, amountMinor: 2500 }, user.id);
    const eurTransaction = transaction({ tipo: 'expense', titulo: 'April EUR expense', fecha: '2024-04-12', amountMinor: 1000, monto: 10 });
    db.create('movementAllocations', { transactionId: eurTransaction.id, assetId: property.id, amountMinor: 1000 }, user.id);

    const march = overview.assetEconomics(db, user.id, property, { period: 'month', month: '2024-03' });
    const custom = overview.assetEconomics(db, user.id, property, { period: 'custom', from: '2024-03-01', to: '2024-04-30' });
    const year = overview.assetEconomics(db, user.id, property, { period: 'year', year: '2024' });
    db.create('rentalContracts', { assetId: property.id, status: 'active', startDate: '2024-02-01' }, user.id);

    expect(march.movements.map(item => item.transactionId)).toEqual([usdTransaction.id]);
    expect(custom.currencies.map(item => item.currency).sort()).toEqual(['EUR', 'USD']);
    expect(custom.evolution).toHaveLength(4);
    expect(year.period).toMatchObject({ from: '2024-01-01', to: '2024-12-31' });
    expect(overview.periodForAsset(db, user.id, property, { period: 'acquisition' }).from).toBe('2024-01-01');
    expect(overview.periodForAsset(db, user.id, property, { period: 'contract' }).from).toBe('2024-02-01');
  });
});
