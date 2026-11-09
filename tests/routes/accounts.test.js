const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');
const ledger = require('../../src/services/account-ledger');

describe('Account configuration API', () => {
  let db;
  let agent;
  let userId;
  let emailCounter = 0;

  beforeEach(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    emailCounter += 1;
    const response = await agent.post('/api/auth/register').send({
      email: `account-${emailCounter}@example.com`, password: '123456', nombre: 'Account User'
    });
    userId = response.body.id;
  });

  afterEach(() => cleanupTestDb());

  it('creates a checksummed user-scoped backup before associating legacy records and is idempotent', async () => {
    const legacy = db.create('transactions', {
      userId, tipo: 'income', monto: 2500, titulo: 'Legacy salary', fecha: '2024-02-01', notes: 'raw record'
    }, userId);
    const original = db.findById('transactions', legacy.id, userId);

    const first = await agent.get('/api/accounts/setup');
    const repeated = await agent.get('/api/accounts/setup');

    expect(first.status).toBe(200);
    expect(first.body.migration).toMatchObject({ reversible: true, transactionCount: 1 });
    expect(first.body.accounts[0]).toMatchObject({ currency: 'ARS', primary: true, balanceStatus: 'needs_reconciliation' });
    expect(repeated.body.accounts).toHaveLength(1);
    expect(repeated.body.migration.checksum).toBe(first.body.migration.checksum);
    expect(db.findById('transactions', legacy.id, userId)).toEqual(original);
    expect(db.findById('migrationBackups', 'account-configuration-v1', userId).collections.transactions[0]).toEqual(original);
  });

  it('reverts only unused additive metadata while preserving legacy transaction records', async () => {
    const legacy = db.create('transactions', { userId, tipo: 'income', monto: 125, fecha: '2024-01-01', titulo: 'Legacy' }, userId);
    const original = db.findById('transactions', legacy.id, userId);
    await agent.get('/api/accounts/setup');

    const rollback = await agent.post('/api/accounts/migration/rollback').send({});
    expect(rollback.status).toBe(200);
    expect(db.findAll('accounts', userId)).toEqual([]);
    expect(db.findAll('accountSettings', userId)).toEqual([]);
    expect(db.findById('transactions', legacy.id, userId)).toEqual(original);

    const rolledBackBackup = db.findById('migrationBackups', 'account-configuration-v1', userId);
    expect(rolledBackBackup.state).toBe('rolled_back');
  });

  it('reapplies account setup separately from its retained backup', async () => {
    const legacy = db.create('transactions', { userId, tipo: 'income', monto: 125, fecha: '2024-01-01', titulo: 'Legacy' }, userId);
    const original = db.findById('transactions', legacy.id, userId);
    await agent.get('/api/accounts/setup');
    const rollback = await agent.post('/api/accounts/migration/rollback').send({});
    expect(rollback.status).toBe(200);

    const reapply = await agent.post('/api/accounts/migration/reapply').send({});

    expect(reapply.status).toBe(200);
    expect(reapply.body.accounts).toHaveLength(1);
    expect(db.findById('transactions', legacy.id, userId)).toEqual(original);
    expect(db.findById('migrationBackups', 'account-configuration-v1', userId).state).toBe('active');
  });

  it('returns one account card per account without inventing unreconciled balances', async () => {
    const setup = await agent.get('/api/accounts/setup');
    const accounts = [setup.body.accounts[0]];
    for (let index = 1; index < 5; index += 1) {
      const response = await agent.post('/api/accounts').send({ name: `Account ${index}`, currency: index % 2 ? 'USD' : 'ARS' });
      expect(response.status).toBe(201);
      accounts.push(response.body);
    }

    const response = await agent.get('/api/accounts');
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(5);
    expect(response.body.map(item => item.nombre)).toEqual(expect.arrayContaining(['Cuenta principal', 'Account 1', 'Account 2', 'Account 3', 'Account 4']));
    expect(response.body.every(item => item.balance === null && item.balanceStatus === 'needs_reconciliation')).toBe(true);
    expect(accounts).toHaveLength(5);
  });

  it('keeps monthly income separated by account currency and does not rewrite records when the primary currency changes', async () => {
    await agent.get('/api/accounts/setup');
    const eur = (await agent.post('/api/accounts').send({ name: 'EUR wallet', currency: 'EUR' })).body;
    const usdResponse = await agent.post('/api/accounts').send({ name: 'USD wallet', currency: 'USD' });
    const usd = usdResponse.body;
    const date = ledger.localDateForUser(db, userId);
    const month = date.slice(0, 7);
    const eurIncome = await agent.post('/api/transactions').send({ tipo: 'income', monto: 2500, titulo: 'Salary', fecha: date, accountId: eur.id });
    const usdIncome = await agent.post('/api/transactions').send({ tipo: 'income', monto: 1000, titulo: 'USD income', fecha: date, accountId: usd.id });
    const before = db.findById('transactions', eurIncome.body.id, userId);
    await agent.patch('/api/accounts/settings').send({ appCurrency: 'USD' });

    const response = await agent.get(`/api/summary?month=${month}`);
    const eurTotal = response.body.currencyTotals.find(item => item.currency === 'EUR');
    const usdTotal = response.body.currencyTotals.find(item => item.currency === 'USD');
    expect(eurTotal.income).toBe(2500);
    expect(usdTotal.income).toBe(1000);
    expect(response.body.activeCurrency).toBe('USD');
    expect(response.body.ingresos).toBe(1000);
    expect(db.findById('transactions', eurIncome.body.id, userId)).toEqual(before);
    expect(db.findById('transactions', usdIncome.body.id, userId).currencyCode).toBe('USD');
  });

  it('keeps goal currency stable when the primary currency preference changes', async () => {
    const setup = await agent.get('/api/accounts/setup');
    const month = ledger.localDateForUser(db, userId).slice(0, 7);
    const goal = await agent.post('/api/goals').send({ tipo: 'ahorro_mensual', modo: 'monto_fijo', montoFijo: 500, meses: [month] });
    await agent.patch('/api/accounts/settings').send({ appCurrency: 'USD' });

    const summary = await agent.get(`/api/summary?month=${month}`);
    const goals = await agent.get('/api/goals');

    expect(goal.body.currencyCode).toBe('ARS');
    expect(summary.body.activeCurrency).toBe('USD');
    expect(summary.body.metas).toEqual([]);
    expect(goals.body.find(item => item.id === goal.body.id).currencyCode).toBe('ARS');
  });

  it('defaults new accounts to ARS without changing the existing app currency', async () => {
    await agent.get('/api/accounts/setup');
    await agent.patch('/api/accounts/settings').send({ appCurrency: 'EUR' });
    const created = await agent.post('/api/accounts').send({ name: 'Default currency account' });

    expect(created.status).toBe(201);
    expect(created.body.currency).toBe('ARS');
    expect((await agent.get('/api/accounts/settings')).body.appCurrency).toBe('EUR');
  });

  it('accepts only selectable currencies and a user-owned owner role when creating accounts', async () => {
    await agent.get('/api/accounts/setup');
    const legacyAccount = db.findAll('accounts', userId)[0];
    const unsupportedCreate = await agent.post('/api/accounts').send({ name: 'Unsupported', currency: 'JPY' });
    const unsupportedUpdate = await agent.put(`/api/accounts/${legacyAccount.id}`).send({ currency: 'JPY' });
    const unsupportedSetting = await agent.patch('/api/accounts/settings').send({ appCurrency: 'JPY' });
    const owner = await agent.post('/api/owners').send({ name: 'Create owner', roles: ['owner'] });
    const tenant = await agent.post('/api/owners').send({ name: 'Create tenant', roles: ['tenant'] });
    const foreignAgent = request.agent(app);
    await foreignAgent.post('/api/auth/register').send({ email: `foreign-create-owner-${emailCounter}@example.com`, password: '123456', nombre: 'Foreign Create Owner' });
    const foreignOwner = await foreignAgent.post('/api/owners').send({ name: 'Foreign create owner', roles: ['owner'] });
    const validCreate = await agent.post('/api/accounts').send({ name: 'Owned EUR', currency: 'EUR', ownerId: owner.body.id });
    const tenantCreate = await agent.post('/api/accounts').send({ name: 'Tenant owned', currency: 'EUR', ownerId: tenant.body.id });
    const foreignCreate = await agent.post('/api/accounts').send({ name: 'Foreign owned', currency: 'EUR', ownerId: foreignOwner.body.id });

    expect(unsupportedCreate.status).toBe(400);
    expect(unsupportedUpdate.status).toBe(400);
    expect(unsupportedSetting.status).toBe(400);
    expect(validCreate.status).toBe(201);
    expect(validCreate.body.ownerId).toBe(owner.body.id);
    expect(tenantCreate.status).toBe(400);
    expect(foreignCreate.status).toBe(400);
  });

  it('assigns only a user-owned legal owner with the owner role to an account', async () => {
    await agent.get('/api/accounts/setup');
    const account = db.findAll('accounts', userId)[0];
    const owner = await agent.post('/api/owners').send({ name: 'Synthetic owner', roles: ['owner'] });
    const tenant = await agent.post('/api/owners').send({ name: 'Synthetic tenant', roles: ['tenant'] });
    const foreignAgent = request.agent(app);
    await foreignAgent.post('/api/auth/register').send({ email: `foreign-owner-${emailCounter}@example.com`, password: '123456', nombre: 'Foreign Owner User' });
    const foreignOwner = await foreignAgent.post('/api/owners').send({ name: 'Foreign synthetic owner', roles: ['owner'] });

    expect((await agent.put(`/api/accounts/${account.id}`).send({ ownerId: owner.body.id })).status).toBe(200);
    expect(db.findById('accounts', account.id, userId).ownerId).toBe(owner.body.id);
    expect((await agent.put(`/api/accounts/${account.id}`).send({ ownerId: tenant.body.id })).status).toBe(400);
    expect((await agent.put(`/api/accounts/${account.id}`).send({ ownerId: foreignOwner.body.id })).status).toBe(400);
    expect((await agent.put(`/api/accounts/${account.id}`).send({ ownerId: null })).body.ownerId).toBeNull();
  });

  it('retains holder-scoped A/B and VAT history across holder changes and separates currencies', async () => {
    await agent.get('/api/accounts/setup');
    const arsAccount = db.findAll('accounts', userId)[0];
    const firstOwner = (await agent.post('/api/owners').send({ name: 'Owner A', roles: ['owner'] })).body;
    const secondOwner = (await agent.post('/api/owners').send({ name: 'Owner B', roles: ['owner'] })).body;
    await agent.put(`/api/accounts/${arsAccount.id}`).send({ ownerId: firstOwner.id });
    const usdAccount = (await agent.post('/api/accounts').send({ name: 'USD holder account', currency: 'USD', ownerId: secondOwner.id })).body;
    const unassignedAccount = (await agent.post('/api/accounts').send({ name: 'Unassigned account', currency: 'ARS' })).body;
    const today = ledger.localDateForUser(db, userId);
    const mixed = await agent.post('/api/transactions').send({
      tipo: 'income', monto: 100, titulo: 'Synthetic mixed income', clasificacion: 'Mixto', montoA: 40, montoB: 60,
      ivaPorcentaje: 21, fecha: today, accountId: arsAccount.id
    });
    await agent.put(`/api/accounts/${arsAccount.id}`).send({ ownerId: secondOwner.id });
    await agent.post('/api/transactions').send({
      tipo: 'income', monto: 50, titulo: 'Synthetic owner B income', clasificacion: 'A', ivaPorcentaje: 10,
      fecha: today, accountId: arsAccount.id
    });
    await agent.post('/api/transactions').send({
      tipo: 'income', monto: 30, titulo: 'Synthetic USD B income', clasificacion: 'B', ivaPorcentaje: 21,
      fecha: today, accountId: usdAccount.id
    });
    await agent.post('/api/transactions').send({
      tipo: 'income', monto: 12, titulo: 'Synthetic unassigned income', clasificacion: 'B',
      fecha: today, accountId: unassignedAccount.id
    });

    const month = today.slice(0, 7);
    const summary = await agent.get(`/api/summary?month=${month}`);
    const trends = await agent.get(`/api/trends?from=${month}&to=${month}`);
    const firstOwnerGroup = summary.body.incomeBreakdownByHolder.find(item => item.ownerId === firstOwner.id && item.currency === 'ARS');
    const secondOwnerArs = summary.body.incomeBreakdownByHolder.find(item => item.ownerId === secondOwner.id && item.currency === 'ARS');
    const secondOwnerUsd = summary.body.incomeBreakdownByHolder.find(item => item.ownerId === secondOwner.id && item.currency === 'USD');
    const unassigned = summary.body.incomeBreakdownByHolder.find(item => item.ownerId === null && item.currency === 'ARS');
    const monthlyIva = trends.body.monthlyData[0].ivaByHolder;

    expect(mixed.body.incomeHolderId).toBe(firstOwner.id);
    expect(firstOwnerGroup).toMatchObject({ A: 40, B: 60, iva: 8.4 });
    expect(secondOwnerArs).toMatchObject({ A: 50, B: 0, iva: 5 });
    expect(secondOwnerUsd).toMatchObject({ currency: 'USD', A: 0, B: 30, iva: 0 });
    expect(unassigned).toMatchObject({ ownerName: 'Sin titular asignado', A: 0, B: 12 });
    expect(summary.body.currencyTotals.find(item => item.currency === 'ARS').income).toBe(162);
    expect(monthlyIva).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerId: firstOwner.id, currency: 'ARS', amount: 8.4 }),
      expect.objectContaining({ ownerId: secondOwner.id, currency: 'ARS', amount: 5 }),
      expect.objectContaining({ ownerId: secondOwner.id, currency: 'USD', amount: 0 })
    ]));
  });

  it('includes unassigned secondary-account expenses and refunds in global totals without FX', async () => {
    const setup = await agent.get('/api/accounts/setup');
    const account = (await agent.post('/api/accounts').send({ name: 'Unassigned USD test account', currency: 'USD' })).body;
    const category = await agent.post('/api/categories').send({ nombre: 'Synthetic expense category' });
    const today = ledger.localDateForUser(db, userId);
    await agent.post(`/api/accounts/${account.id}/reconcile`).send({ openingBalance: 200, openingDate: today, includedMovementIds: [] });
    await agent.post('/api/transactions').send({ tipo: 'income', monto: 100, titulo: 'Synthetic income', fecha: today, accountId: account.id });
    const expense = await agent.post('/api/transactions').send({
      tipo: 'expense', monto: 35, titulo: 'Synthetic posted expense', categoryId: category.body.id, fecha: today, accountId: account.id
    });
    await agent.post('/api/transactions').send({
      tipo: 'refund', monto: 5, titulo: 'Synthetic refund', categoryId: category.body.id, fecha: today,
      accountId: account.id, refundSourceId: expense.body.id
    });

    const balances = await agent.get('/api/accounts');
    const summary = await agent.get(`/api/summary?month=${today.slice(0, 7)}`);
    const overview = await agent.get(`/api/finance/overview?month=${today.slice(0, 7)}`);
    const usdSummary = summary.body.currencyTotals.find(item => item.currency === 'USD');
    const usdOverview = overview.body.currencies.find(item => item.currency === 'USD');

    expect(balances.body.find(item => item.id === account.id).balance).toBe(270);
    expect(usdSummary).toMatchObject({ income: 100, expenses: 35, refunds: 5, savings: 70 });
    expect(usdOverview).toMatchObject({ income: 100, expenses: 35, refunds: 5, netExpenses: 30, savings: 70 });
    expect(overview.body.movements).toEqual(expect.arrayContaining([
      expect.objectContaining({ transactionId: expense.body.id, type: 'expense', amount: 35, currency: 'USD' })
    ]));
    expect(overview.body.currencies.some(item => item.currency === setup.body.settings.appCurrency)).toBe(true);
  });

  it('preserves legacy account and movement currencies instead of rewriting them', async () => {
    const today = ledger.localDateForUser(db, userId);
    const account = db.create('accounts', { nombre: 'Historical GBP account', currency: 'GBP', activo: true, primary: false }, userId);
    const movement = db.create('transactions', {
      userId, tipo: 'income', monto: 123.45, amountMinor: 12345, accountId: account.id,
      currencyCode: 'GBP', fecha: today, titulo: 'Historical GBP income'
    }, userId);
    const original = db.findById('transactions', movement.id, userId);

    const summary = await agent.get(`/api/summary?month=${today.slice(0, 7)}`);

    expect(summary.body.currencyTotals).toEqual(expect.arrayContaining([
      expect.objectContaining({ currency: 'GBP', income: 123.45 })
    ]));
    expect(db.findById('transactions', movement.id, userId)).toEqual(original);
    expect(db.findById('accounts', account.id, userId).currency).toBe('GBP');
  });

  it('updates both posted transfer balances while excluding the transfer from income and expenses', async () => {
    const setup = await agent.get('/api/accounts/setup');
    const source = setup.body.accounts.find(item => item.primary);
    const destinationResponse = await agent.post('/api/accounts').send({ name: 'ING', currency: 'EUR' });
    const destination = destinationResponse.body;
    const date = ledger.localDateForUser(db, userId);
    await agent.post(`/api/accounts/${source.id}/reconcile`).send({ openingBalance: 0, openingDate: date, includedMovementIds: [] });
    await agent.post(`/api/accounts/${destination.id}/reconcile`).send({ openingBalance: 0, openingDate: date, includedMovementIds: [] });
    await agent.post('/api/transactions').send({ tipo: 'income', monto: 2500, titulo: 'Salary', fecha: date, accountId: source.id });

    const transfer = await agent.post('/api/transfers').send({
      fromAccountId: source.id, toAccountId: destination.id,
      sentAmount: 1100, receivedAmount: 1100, fecha: date, status: 'posted'
    });
    const accounts = await agent.get('/api/accounts');
    const summary = await agent.get(`/api/summary?month=${date.slice(0, 7)}`);

    expect(transfer.status).toBe(201);
    expect(accounts.body.find(item => item.id === source.id).balance).toBe(1400);
    expect(accounts.body.find(item => item.id === destination.id).balance).toBe(1100);
    expect(summary.body.ingresos).toBe(2500);
    expect(summary.body.gastos).toBe(0);
  });

  it('normalizes partial income allocations in their source period and counts an explicit fee once', async () => {
    await agent.get('/api/accounts/setup');
    const eur = (await agent.post('/api/accounts').send({ name: 'EUR wallet', currency: 'EUR' })).body;
    const usd = (await agent.post('/api/accounts').send({ name: 'USD wallet', currency: 'USD' })).body;
    const category = await agent.post('/api/categories').send({ nombre: 'Bank fees', color: '#F00' });
    const date = ledger.localDateForUser(db, userId);
    const month = date.slice(0, 7);
    await agent.post('/api/transactions').send({ tipo: 'income', monto: 2500, titulo: 'Salary', fecha: date, accountId: eur.id });
    const usdIncome = await agent.post('/api/transactions').send({ tipo: 'income', monto: 1000, titulo: 'USD income', fecha: date, accountId: usd.id });

    const conversion = await agent.post('/api/transfers').send({
      fromAccountId: usd.id, toAccountId: eur.id, sentAmount: 400, receivedAmount: 360,
      feeAmount: 5, feeCategoryId: category.body.id, fecha: date, status: 'posted',
      allocations: [{ sourceType: 'income', sourceId: usdIncome.body.id, amount: 400 }]
    });
    const repeatedAllocation = await agent.post('/api/transfers').send({
      fromAccountId: usd.id, toAccountId: eur.id, sentAmount: 700, receivedAmount: 630,
      fecha: date, status: 'posted', allocations: [{ sourceType: 'income', sourceId: usdIncome.body.id, amount: 700 }]
    });
    const summary = await agent.get(`/api/summary?month=${month}`);
    const eurTotals = summary.body.currencyTotals.find(item => item.currency === 'EUR');
    const usdTotals = summary.body.currencyTotals.find(item => item.currency === 'USD');

    expect(conversion.status).toBe(201);
    expect(repeatedAllocation.status).toBe(400);
    expect(eurTotals.income).toBe(2860);
    expect(usdTotals.originalIncome).toBe(1000);
    expect(usdTotals.normalizedIncome).toBe(-400);
    expect(usdTotals.income).toBe(600);
    expect(usdTotals.expenses).toBe(5);
  });

  it('keeps account currency immutable after a movement and blocks archiving unresolved recurring entries', async () => {
    const setup = await agent.get('/api/accounts/setup');
    const account = (await agent.post('/api/accounts').send({ name: 'USD wallet', currency: 'USD' })).body;
    await agent.post('/api/transactions').send({ tipo: 'income', monto: 10, titulo: 'USD income', fecha: '2026-03-01', accountId: account.id });
    const changeCurrency = await agent.put(`/api/accounts/${account.id}`).send({ currency: 'ARS' });
    expect(changeCurrency.status).toBe(409);

    const recurringAccount = (await agent.post('/api/accounts').send({ name: 'Recurring EUR', currency: 'EUR' })).body;
    const category = await agent.post('/api/categories').send({ nombre: 'Housing' });
    const recurring = await agent.post('/api/transactions').send({
      tipo: 'expense', monto: 25, titulo: 'Rent', categoryId: category.body.id,
      fecha: '2026-03-01', recurrente: true, frecuencia: 'monthly', accountId: recurringAccount.id
    });
    const archive = await agent.post(`/api/accounts/${recurringAccount.id}/archive`).send({});
    expect(recurring.status).toBe(201);
    expect(archive.status).toBe(409);
  });

  it('recalculates both transfer projections on edit and blocks deleting a conversion with dependents', async () => {
    const setup = await agent.get('/api/accounts/setup');
    const eur = setup.body.accounts[0];
    const usd = (await agent.post('/api/accounts').send({ name: 'USD wallet', currency: 'USD' })).body;
    const secondUsd = (await agent.post('/api/accounts').send({ name: 'USD reserve', currency: 'USD' })).body;
    const date = ledger.localDateForUser(db, userId);
    await agent.post(`/api/accounts/${eur.id}/reconcile`).send({ openingBalance: 0, openingDate: date, includedMovementIds: [] });
    await agent.post(`/api/accounts/${usd.id}/reconcile`).send({ openingBalance: 0, openingDate: date, includedMovementIds: [] });
    const income = await agent.post('/api/transactions').send({ tipo: 'income', monto: 1000, titulo: 'USD income', fecha: date, accountId: usd.id });
    const first = await agent.post('/api/transfers').send({
      fromAccountId: usd.id, toAccountId: eur.id, sentAmount: 1000, receivedAmount: 900,
      fecha: date, status: 'posted', allocations: [{ sourceType: 'income', sourceId: income.body.id, amount: 1000 }]
    });
    const dependent = await agent.post('/api/transfers').send({
      fromAccountId: eur.id, toAccountId: secondUsd.id, sentAmount: 400, receivedAmount: 450,
      fecha: date, status: 'posted', allocations: [{ sourceType: 'transfer', sourceId: first.body.id, amount: 400 }]
    });

    const blockedDelete = await agent.delete(`/api/transfers/${first.body.id}`);
    const deleteDependent = await agent.delete(`/api/transfers/${dependent.body.id}`);
    const updateFirst = await agent.put(`/api/transfers/${first.body.id}`).send({
      sentAmount: 800, receivedAmount: 720,
      allocations: [{ sourceType: 'income', sourceId: income.body.id, amount: 800 }]
    });
    const beforeDelete = await agent.get('/api/accounts');
    const deleteFirst = await agent.delete(`/api/transfers/${first.body.id}`);
    const afterDelete = await agent.get('/api/accounts');

    expect(dependent.status).toBe(201);
    expect(blockedDelete.status).toBe(409);
    expect(deleteDependent.status).toBe(200);
    expect(updateFirst.status).toBe(200);
    expect(beforeDelete.body.find(item => item.id === usd.id).balance).toBe(200);
    expect(beforeDelete.body.find(item => item.id === eur.id).balance).toBe(720);
    expect(deleteFirst.status).toBe(200);
    expect(afterDelete.body.find(item => item.id === usd.id).balance).toBe(1000);
    expect(afterDelete.body.find(item => item.id === eur.id).balance).toBe(0);
  });

  it('rejects cross-currency transfers without actual received amounts and preserves scheduled conversions until posting', async () => {
    const setup = await agent.get('/api/accounts/setup');
    const eur = setup.body.accounts[0];
    const usd = (await agent.post('/api/accounts').send({ name: 'USD', currency: 'USD' })).body;
    const date = ledger.localDateForUser(db, userId);

    const invalid = await agent.post('/api/transfers').send({ fromAccountId: usd.id, toAccountId: eur.id, sentAmount: 1000, fecha: date });
    const scheduled = await agent.post('/api/transfers').send({
      fromAccountId: usd.id, toAccountId: eur.id, sentAmount: 1000, receivedAmount: 900,
      fecha: date, status: 'scheduled'
    });
    const before = await agent.get(`/api/summary?month=${date.slice(0, 7)}`);
    const posted = await agent.post(`/api/transfers/${scheduled.body.id}/post`).send({ postedAt: date });
    const after = await agent.get(`/api/summary?month=${date.slice(0, 7)}`);

    expect(invalid.status).toBe(400);
    expect(scheduled.status).toBe(201);
    expect(scheduled.body.normalizationAllocations).toEqual([]);
    expect(posted.body.status).toBe('posted');
    expect(before.body.ingresos).toBe(after.body.ingresos);
    expect(before.body.gastos).toBe(after.body.gastos);
  });

  it('keeps deficit alerts account-specific and marks scheduled transfer coverage without crediting current balance', async () => {
    const setup = await agent.get('/api/accounts/setup');
    const other = setup.body.accounts[0];
    const ing = (await agent.post('/api/accounts').send({ name: 'ING', currency: 'EUR' })).body;
    const today = ledger.localDateForUser(db, userId);
    const due = new Date(`${today}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + 5);
    const dueDate = due.toISOString().slice(0, 10);
    await agent.post(`/api/accounts/${other.id}/reconcile`).send({ openingBalance: 100000, openingDate: today, includedMovementIds: [] });
    await agent.post(`/api/accounts/${ing.id}/reconcile`).send({ openingBalance: 0, openingDate: today, includedMovementIds: [] });
    const category = await agent.post('/api/categories').send({ nombre: 'Rent' });
    await agent.post('/api/transactions').send({
      tipo: 'expense', monto: 250, titulo: 'Rent', categoryId: category.body.id,
      fecha: dueDate, recurrente: true, frecuencia: 'monthly', accountId: ing.id
    });

    const openForecast = await agent.get(`/api/accounts/${ing.id}/forecast`);
    const openAlerts = await agent.get('/api/accounts/alerts');
    expect(openForecast.body.alerts[0]).toMatchObject({ accountId: ing.id, date: dueDate, title: 'Rent', neededMinor: 25000, status: 'open' });
    expect(openAlerts.body.some(alert => alert.accountId === ing.id && alert.status === 'open')).toBe(true);

    await agent.post('/api/transfers').send({
      fromAccountId: other.id, toAccountId: ing.id, sentAmount: 300, receivedAmount: 300,
      fecha: dueDate, status: 'scheduled', reference: 'Planned funding'
    });
    const coveredForecast = await agent.get(`/api/accounts/${ing.id}/forecast`);
    const accounts = await agent.get('/api/accounts');
    expect(coveredForecast.body.alerts[0]).toMatchObject({ accountId: ing.id, status: 'covered', plannedTransfer: true });
    expect(accounts.body.find(account => account.id === ing.id).balance).toBe(0);
  });
});
