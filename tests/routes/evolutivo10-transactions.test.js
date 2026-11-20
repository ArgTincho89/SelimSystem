const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const overview = require('../../src/services/economic-overview');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Evolutivo 10 transactions: medio de pago, cheque and credit installments', () => {
  let db;
  let agent;
  let userId;
  let accountId;
  let categoryId;
  let assetId;
  let today;

  const month = date => date.slice(0, 7);
  const totals = monthKey => overview.globalOverview(db, userId, monthKey).currencies.find(item => item.currency === 'ARS');
  const base = (extra = {}) => ({ tipo: 'expense', titulo: 'Heladera', monto: 1000, categoryId, accountId, fecha: today, ...extra });
  const cheques = (rows) => rows.map(([dueDate, amount, chequeNumber]) => ({ dueDate, amount, chequeNumber }));

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'evo10@test.example', password: '123456', nombre: 'Evo10 User' });
    userId = db.findUserByName('Evo10 User').id;
    await agent.get('/api/accounts/setup');
    accountId = (await agent.post('/api/accounts').send({ name: 'Banco', currency: 'ARS' })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Hogar' })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Casa' })).body.id;
    today = ledger.localDateForUser(db, userId);
  });

  afterAll(() => cleanupTestDb());

  it('accepts only the fixed payment methods allowed for the type', async () => {
    expect((await agent.post('/api/transactions').send(base({ paymentMethod: 'Efectivo' }))).status).toBe(201);
    expect((await agent.post('/api/transactions').send(base({ paymentMethod: '' }))).status).toBe(201);
    expect((await agent.post('/api/transactions').send(base({ paymentMethod: 'Bitcoin' }))).status).toBe(400);
    expect((await agent.post('/api/transactions').send(base({ paymentMethod: 7 }))).status).toBe(400);
    expect((await agent.post('/api/transactions').send({ tipo: 'income', monto: 10, accountId, paymentMethod: 'Crédito' })).status).toBe(400);
    expect((await agent.post('/api/transactions').send({ tipo: 'refund', monto: 10, categoryId, accountId, paymentMethod: 'Cheque' })).status).toBe(400);
  });

  it('keeps a legacy free-text payment method on edit but validates a new value', async () => {
    const legacy = db.create('transactions', { tipo: 'expense', titulo: 'Viejo', monto: 5, amountMinor: 500, accountId, currencyCode: 'ARS', categoryId, fecha: today, paymentMethod: 'Visa oro' }, userId);
    const kept = await agent.put(`/api/transactions/${legacy.id}`).send({ titulo: 'Viejo 2', paymentMethod: 'Visa oro' });
    expect(kept.status).toBe(200);
    expect(kept.body.paymentMethod).toBe('Visa oro');
    expect((await agent.put(`/api/transactions/${legacy.id}`).send({ paymentMethod: 'Otra tarjeta' })).status).toBe(400);
    expect((await agent.put(`/api/transactions/${legacy.id}`).send({ paymentMethod: 'Débito' })).body.paymentMethod).toBe('Débito');
  });

  it('creates one pending transaction per cheque, outside the totals until confirmed', async () => {
    const before = totals(month(today)).expenses;
    const response = await agent.post('/api/transactions').send(base({
      titulo: 'Sillones', monto: 1000, paymentMethod: 'Cheque', attributionAssetId: assetId,
      chequeInstallments: cheques([[today, 333.33, '0001-23456789'], [ledger.localDateForUser(db, userId), 333.33, 'A-2'], [today, 333.34, '3']])
    }));
    expect(response.status).toBe(201);
    const created = response.body.installments;
    expect(created).toHaveLength(3);
    expect(response.body.id).toBe(created[0].id);
    expect(new Set(created.map(item => item.chequeGroupId)).size).toBe(1);
    expect(created.map(item => item.monto)).toEqual([333.33, 333.33, 333.34]);
    expect(created[0]).toMatchObject({
      status: 'pending', paymentMethod: 'Cheque', titulo: 'Sillones — Cheque cuota 1/3', fecha: today,
      chequeInstallment: { number: 1, total: 3, dueDate: today, originalDate: today, chequeNumber: '0001-23456789', baseTitle: 'Sillones' }
    });
    expect(db.findAll('movementAllocations', userId).filter(item => created.some(tx => tx.id === item.transactionId))).toHaveLength(3);
    expect(totals(month(today)).expenses).toBe(before);

    const confirmed = await agent.post(`/api/transactions/${created[0].id}/confirm`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body).toMatchObject({ status: 'posted' });
    expect(confirmed.body.confirmedAt).toBeTruthy();
    expect(totals(month(today)).expenses).toBeCloseTo(before + 333.33, 2);
    expect((await agent.post(`/api/transactions/${created[0].id}/confirm`)).status).toBe(409);
    const log = db.findAll('activityLogs', userId).find(item => item.action === 'transaction.confirm');
    expect(log.message).toMatch(/Confirmaste la imputación/);

    expect((await agent.post(`/api/transactions/${created[0].id}/unconfirm`).send({ reason: '  ' })).status).toBe(400);
    expect((await agent.post(`/api/transactions/${created[1].id}/unconfirm`).send({ reason: 'x' })).status).toBe(409);
    const undone = await agent.post(`/api/transactions/${created[0].id}/unconfirm`).send({ reason: 'Rebotó' });
    expect(undone.status).toBe(200);
    expect(undone.body).toMatchObject({ status: 'pending', confirmedAt: null, unconfirmReason: 'Rebotó' });
    expect(totals(month(today)).expenses).toBe(before);
    expect((await agent.post('/api/transactions/missing/confirm')).status).toBe(404);
    expect((await agent.post('/api/transactions/missing/unconfirm').send({ reason: 'x' })).status).toBe(404);
  });

  it('excludes pending cheques from the legacy summary and account balances', async () => {
    const monthKey = month(today);
    const summaryBefore = (await agent.get(`/api/summary?month=${monthKey}`)).body;
    await agent.post('/api/transactions').send({
      tipo: 'income', monto: 500, accountId, fecha: today, titulo: 'Cobro', paymentMethod: 'Cheque',
      chequeInstallments: cheques([[today, 500, '777']])
    });
    const summaryAfter = (await agent.get(`/api/summary?month=${monthKey}`)).body;
    expect(summaryAfter.ingresos).toBe(summaryBefore.ingresos);
    expect(summaryAfter.ivaByHolder).toEqual(summaryBefore.ivaByHolder);
    const totalsByCurrency = ledger.incomeByCurrency(db, userId, db.findAll('transactions', userId), monthKey);
    const pendingMinor = db.findAll('transactions', userId).filter(item => item.status === 'pending' && item.tipo === 'income').reduce((sum, item) => sum + item.amountMinor, 0);
    expect(pendingMinor).toBe(50000);
    expect(totalsByCurrency.ARS.originalIncomeMinor).toBe(Math.round(summaryAfter.ingresos * 100));
  });

  it('keeps pending cheques out of the reconciled account balance until confirmed', async () => {
    const fresh = (await agent.post('/api/accounts').send({ name: 'Caja', currency: 'ARS' })).body.id;
    expect((await agent.post(`/api/accounts/${fresh}/reconcile`).send({ openingBalance: 1000, openingDate: today, includedMovementIds: [] })).status).toBe(200);
    const balance = () => ledger.getAccountBalances(db, userId).find(item => item.id === fresh).balance;
    const created = (await agent.post('/api/transactions').send({ tipo: 'expense', titulo: 'Cheque', monto: 100, categoryId, accountId: fresh, fecha: today, paymentMethod: 'Cheque', chequeInstallments: cheques([[today, 100, '55']]) })).body;
    expect(balance()).toBe(1000);
    await agent.post(`/api/transactions/${created.id}/confirm`);
    expect(balance()).toBe(900);
  });

  it('rejects invalid cheque payloads without writing anything', async () => {
    const count = db.findAll('transactions', userId).length;
    const post = extra => agent.post('/api/transactions').send(base({ paymentMethod: 'Cheque', ...extra }));
    expect((await post({ chequeInstallments: cheques([[today, 500, '1'], [today, 400, '2']]) })).body.error).toMatch(/suma/);
    expect((await post({ chequeInstallments: cheques([[today, 1000, '']]) })).body.error).toMatch(/Nº de cheque/);
    expect((await post({ chequeInstallments: [{ dueDate: today, amount: 1000 }] })).body.error).toMatch(/Nº de cheque/);
    expect((await post({ chequeInstallments: cheques([[today, 1000, 'x'.repeat(31)]]) })).body.error).toMatch(/hasta 30/);
    expect((await post({ chequeInstallments: cheques([['', 1000, '1']]) })).body.error).toMatch(/vencimiento/);
    expect((await post({ paymentMethod: 'Efectivo', chequeInstallments: cheques([[today, 1000, '1']]) })).body.error).toMatch(/medio de pago Cheque/);
    expect((await post({ recurrente: true, frecuencia: 'monthly', chequeInstallments: cheques([[today, 1000, '1']]) })).body.error).toMatch(/recurrente/);
    expect((await post({ attributionAssetId: 'missing', chequeInstallments: cheques([[today, 1000, '1']]) })).body.error).toMatch(/bien/);
    expect((await post({ chequeInstallments: cheques([[today, 1000, '1']]), creditInstallments: { count: 2 } })).body.error).toMatch(/no ambas/);
    expect((await agent.post('/api/transactions').send({ tipo: 'refund', monto: 10, categoryId, accountId, paymentMethod: '', chequeInstallments: cheques([[today, 10, '1']]) })).body.error).toMatch(/gastos e ingresos/);
    expect((await agent.post('/api/transactions').send({ tipo: 'income', monto: 10, accountId, paymentMethod: 'Cheque', clasificacion: 'Mixto', montoA: 5, montoB: 5, chequeInstallments: cheques([[today, 10, '1']]) })).body.error).toMatch(/Mixto/);
    expect((await post({ fecha: '2026-02-30', chequeInstallments: cheques([[today, 1000, '1']]) })).body.error).toMatch(/fecha/);
    expect(db.findAll('transactions', userId)).toHaveLength(count);
  });

  it('creates credit installments on the purchase day of the following months with the interest', async () => {
    const response = await agent.post('/api/transactions').send(base({
      titulo: 'Notebook', monto: 1000, fecha: '2026-01-31', paymentMethod: 'Crédito', creditInstallments: { count: 3, interestPercent: 10 }
    }));
    expect(response.status).toBe(201);
    const rows = response.body.installments;
    expect(rows.map(item => [item.fecha, item.monto])).toEqual([['2026-02-28', 366.66], ['2026-03-31', 366.66], ['2026-04-30', 366.68]]);
    expect(rows[0]).toMatchObject({
      titulo: '«Notebook» — cuota 1/3', paymentMethod: 'Crédito',
      creditInstallment: { number: 1, total: 3, interestPercent: 10, purchaseDate: '2026-01-31', purchaseTitle: 'Notebook', baseAmountMinor: 100000 }
    });
    expect(rows[0].status).toBeUndefined();
    expect(new Set(rows.map(item => item.creditGroupId)).size).toBe(1);
    expect(db.findAll('transactions', userId).some(item => item.fecha === '2026-01-31' && item.titulo === 'Notebook')).toBe(false);
    expect(overview.globalOverview(db, userId, '2026-02').currencies.find(item => item.currency === 'ARS').expenses).toBe(366.66);
  });

  it('keeps a single credit installment as a normal expense with the interest applied', async () => {
    const response = await agent.post('/api/transactions').send(base({ titulo: 'Zapatillas', monto: 200, paymentMethod: 'Crédito', creditInstallments: { count: 1, interestPercent: 5 } }));
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ monto: 210, fecha: today, titulo: 'Zapatillas', paymentMethod: 'Crédito' });
    expect(response.body.creditGroupId).toBeUndefined();
  });

  it('rejects invalid credit payloads', async () => {
    const post = extra => agent.post('/api/transactions').send(base({ paymentMethod: 'Crédito', ...extra }));
    expect((await post({ creditInstallments: { count: 0 } })).body.error).toMatch(/entre 1 y 36/);
    expect((await post({ creditInstallments: { count: 2, interestPercent: -1 } })).body.error).toMatch(/interés/);
    expect((await post({ creditInstallments: [] })).body.error).toMatch(/no son válidas/);
    expect((await post({ paymentMethod: 'Efectivo', creditInstallments: { count: 2 } })).body.error).toMatch(/medio de pago Crédito/);
    expect((await agent.post('/api/transactions').send({ tipo: 'income', monto: 10, accountId, paymentMethod: '', creditInstallments: { count: 2 } })).body.error).toMatch(/solo se admiten en gastos/);
  });
});
