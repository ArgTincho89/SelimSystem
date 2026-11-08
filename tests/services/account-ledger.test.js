const { setupTestDb, cleanupTestDb, createTestUser } = require('../helpers/setup');
const ledger = require('../../src/services/account-ledger');

describe('Account ledger service', () => {
  let db;
  let userId;

  beforeEach(() => {
    db = setupTestDb();
    userId = createTestUser(db).id;
  });

  afterEach(() => cleanupTestDb());

  it('uses exact minor-unit conversion and deterministic integer ratios', () => {
    expect(ledger.toMinorUnits(10.555, 'EUR')).toBe(1056);
    expect(ledger.toMinorUnits(1000000, 'ARS')).toBe(100000000);
    expect(ledger.toMinorUnits(5, 'JPY')).toBe(5);
    expect(ledger.mulDivRound(90000, 40000, 100000)).toBe(36000);
  });

  it('derives each user’s business date from their configured IANA timezone', () => {
    const setup = ledger.ensureSetup(db, userId);
    const instant = new Date('2024-03-10T07:30:00Z');
    db.update('accountSettings', setup.settings.id, { timezone: 'America/Los_Angeles' }, userId);
    expect(ledger.localDateForUser(db, userId, instant)).toBe('2024-03-09');
    db.update('accountSettings', setup.settings.id, { timezone: 'Pacific/Kiritimati' }, userId);
    expect(ledger.localDateForUser(db, userId, instant)).toBe('2024-03-10');
  });

  it('backs up legacy records before setup and leaves their original fields unchanged on repeat runs', () => {
    const legacy = db.create('transactions', {
      userId, tipo: 'income', monto: 2500.5, titulo: 'Salary', fecha: '2024-01-01', comments: 'unchanged'
    }, userId);
    const before = db.findById('transactions', legacy.id, userId);

    const first = ledger.ensureSetup(db, userId);
    const second = ledger.ensureSetup(db, userId);

    expect(first.backup.transactionCount).toBe(1);
    expect(second.backup.id).toBe(first.backup.id);
    expect(second.accounts.filter(account => account.primary && account.activo)).toHaveLength(1);
    expect(second.accounts[0].currency).toBe('EUR');
    expect(db.findById('transactions', legacy.id, userId)).toEqual(before);
    expect(first.backup.collections.transactions[0]).toEqual(before);
  });

  it('normalizes only explicitly allocated income and retains original amounts by currency', () => {
    const { accounts } = ledger.ensureSetup(db, userId);
    const eur = accounts.find(account => account.primary);
    const usd = db.create('accounts', { nombre: 'USD', currency: 'USD', primary: false, activo: true, openingBalanceMinor: null, reconciled: false }, userId);
    const income = db.create('transactions', { userId, tipo: 'income', monto: 1000, amountMinor: 100000, accountId: usd.id, currencyCode: 'USD', fecha: '2026-01-01', titulo: 'USD salary' }, userId);
    db.create('transactions', { userId, tipo: 'income', monto: 2500, amountMinor: 250000, accountId: eur.id, currencyCode: 'EUR', fecha: '2026-01-02', titulo: 'EUR salary' }, userId);

    const duplicateInRequest = ledger.createTransferRecord(db, userId, {
      fromAccountId: usd.id, toAccountId: eur.id, sentAmount: 1200, receivedAmount: 1080,
      fecha: '2026-02-01', allocations: [
        { sourceType: 'income', sourceId: income.id, amount: 600 },
        { sourceType: 'income', sourceId: income.id, amount: 600 }
      ]
    });
    expect(duplicateInRequest.error).toMatch(/disponible/i);

    const conversion = ledger.createTransferRecord(db, userId, {
      fromAccountId: usd.id, toAccountId: eur.id, sentAmount: 1000, receivedAmount: 900,
      fecha: '2026-03-01', allocations: [{ sourceType: 'income', sourceId: income.id, amount: 400 }]
    });
    expect(conversion.error).toBeUndefined();
    db.create('transfers', conversion.record, userId);

    const totals = ledger.incomeByCurrency(db, userId, db.findAll('transactions', userId), '2026-01');
    expect(totals.EUR.incomeMinor).toBe(286000);
    expect(totals.USD.originalIncomeMinor).toBe(100000);
    expect(totals.USD.normalizedIncomeMinor).toBe(-40000);
    expect(totals.USD.incomeMinor).toBe(60000);
  });

  it('supports traceable chained conversions and rejects reusing more than the remaining allocation', () => {
    const { accounts } = ledger.ensureSetup(db, userId);
    const eur = accounts.find(account => account.primary);
    const usd = db.create('accounts', { nombre: 'USD', currency: 'USD', activo: true, openingBalanceMinor: null, reconciled: false }, userId);
    const income = db.create('transactions', { userId, tipo: 'income', monto: 1000, amountMinor: 100000, accountId: usd.id, currencyCode: 'USD', fecha: '2025-03-01' }, userId);
    const first = ledger.createTransferRecord(db, userId, {
      fromAccountId: usd.id, toAccountId: eur.id, sentAmount: 1000, receivedAmount: 900,
      fecha: '2025-05-01', allocations: [{ sourceType: 'income', sourceId: income.id, amount: 1000 }]
    });
    const storedFirst = db.create('transfers', first.record, userId);
    const second = ledger.createTransferRecord(db, userId, {
      fromAccountId: eur.id, toAccountId: usd.id, sentAmount: 400, receivedAmount: 450,
      fecha: '2025-06-01', allocations: [{ sourceType: 'transfer', sourceId: storedFirst.id, amount: 400 }]
    });
    expect(second.error).toBeUndefined();
    db.create('transfers', second.record, userId);

    const overAllocated = ledger.createTransferRecord(db, userId, {
      fromAccountId: eur.id, toAccountId: usd.id, sentAmount: 501, receivedAmount: 501,
      fecha: '2025-07-01', allocations: [{ sourceType: 'transfer', sourceId: storedFirst.id, amount: 501 }]
    });
    expect(overAllocated.error).toMatch(/trazabilidad|disponible/i);
    const totals = ledger.incomeByCurrency(db, userId, db.findAll('transactions', userId), '2025-03');
    expect(totals.USD.incomeMinor).toBe(45000);
    expect(totals.EUR.incomeMinor).toBe(50000);
  });

  it('adds independently allocated USD and ARS conversions without summing unlike currencies', () => {
    const { accounts } = ledger.ensureSetup(db, userId);
    const eur = accounts.find(account => account.primary);
    const usd = db.create('accounts', { nombre: 'USD', currency: 'USD', activo: true }, userId);
    const ars = db.create('accounts', { nombre: 'ARS', currency: 'ARS', activo: true }, userId);
    const eurIncome = db.create('transactions', { userId, tipo: 'income', monto: 2500, amountMinor: 250000, accountId: eur.id, currencyCode: 'EUR', fecha: '2025-08-01' }, userId);
    const usdIncome = db.create('transactions', { userId, tipo: 'income', monto: 1000, amountMinor: 100000, accountId: usd.id, currencyCode: 'USD', fecha: '2025-08-02' }, userId);
    const arsIncome = db.create('transactions', { userId, tipo: 'income', monto: 400000, amountMinor: 40000000, accountId: ars.id, currencyCode: 'ARS', fecha: '2025-08-03' }, userId);
    const usdConversion = ledger.createTransferRecord(db, userId, {
      fromAccountId: usd.id, toAccountId: eur.id, sentAmount: 1000, receivedAmount: 900,
      fecha: '2025-09-01', allocations: [{ sourceType: 'income', sourceId: usdIncome.id, amount: 1000 }]
    });
    db.create('transfers', usdConversion.record, userId);
    const arsConversion = ledger.createTransferRecord(db, userId, {
      fromAccountId: ars.id, toAccountId: eur.id, sentAmount: 400000, receivedAmount: 300,
      fecha: '2025-09-02', allocations: [{ sourceType: 'income', sourceId: arsIncome.id, amount: 400000 }]
    });
    db.create('transfers', arsConversion.record, userId);

    const totals = ledger.incomeByCurrency(db, userId, db.findAll('transactions', userId), '2025-08');
    expect(totals.EUR.originalIncomeMinor).toBe(250000);
    expect(totals.EUR.incomeMinor).toBe(370000);
    expect(totals.USD.incomeMinor).toBe(0);
    expect(totals.ARS.incomeMinor).toBe(0);
    expect(db.findById('transactions', eurIncome.id, userId).monto).toBe(2500);
    expect(db.findById('transactions', usdIncome.id, userId).monto).toBe(1000);
    expect(db.findById('transactions', arsIncome.id, userId).monto).toBe(400000);
  });

  it('keeps future recurring expenses out of current balances and identifies scheduled transfer coverage', () => {
    const { accounts } = ledger.ensureSetup(db, userId);
    const account = accounts.find(item => item.primary);
    const today = ledger.localDateForUser(db, userId);
    const due = new Date(`${today}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 5);
    const dueDate = due.toISOString().slice(0, 10);
    db.update('accounts', account.id, { openingBalanceMinor: 0, openingDate: today, reconciled: true }, userId);
    const other = db.create('accounts', { nombre: 'Respaldo', currency: 'EUR', activo: true, openingBalanceMinor: null, reconciled: false }, userId);
    db.create('transactions', {
      userId, tipo: 'expense', monto: 250, amountMinor: 25000, accountId: account.id, currencyCode: 'EUR',
      fecha: dueDate, recurrente: true, frecuencia: 'monthly', titulo: 'Rent'
    }, userId);
    const planned = ledger.createTransferRecord(db, userId, {
      fromAccountId: other.id, toAccountId: account.id, sentAmount: 300, receivedAmount: 300,
      fecha: dueDate, status: 'scheduled'
    });
    db.create('transfers', planned.record, userId);

    expect(ledger.getAccountBalances(db, userId, today).find(item => item.id === account.id).balanceMinor).toBe(0);
    const forecast = ledger.forecastAccount(db, userId, account, today);
    expect(forecast.currentBalanceMinor).toBe(0);
    expect(forecast.alerts).toHaveLength(1);
    expect(forecast.alerts[0].status).toBe('covered');
    expect(forecast.alerts[0].plannedTransfer).toBe(true);
  });
});
