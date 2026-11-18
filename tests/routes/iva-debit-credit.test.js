const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');
const ledger = require('../../src/services/account-ledger');

describe('IVA mensual por titular: débito fiscal, crédito fiscal y saldo', () => {
  let db;
  let agent;
  let userId;
  let counter = 0;
  let account;
  let owner;
  let otherOwner;
  let categoryId;
  let today;

  beforeEach(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    counter += 1;
    userId = (await agent.post('/api/auth/register').send({ email: `iva-${counter}@example.com`, password: '123456', nombre: 'IVA User' })).body.id;
    await agent.get('/api/accounts/setup');
    account = db.findAll('accounts', userId)[0];
    owner = (await agent.post('/api/owners').send({ name: 'Titular Uno', roles: ['owner'] })).body;
    otherOwner = (await agent.post('/api/owners').send({ name: 'Titular Dos', roles: ['owner'] })).body;
    await agent.put(`/api/accounts/${account.id}`).send({ ownerId: owner.id });
    let categories = (await agent.get('/api/categories')).body;
    if (!categories.length) categories = [(await agent.post('/api/categories').send({ nombre: 'Hogar', color: '#888888' })).body];
    categoryId = categories[0].id;
    today = ledger.localDateForUser(db, userId);
  });

  afterEach(() => cleanupTestDb());

  const holderRow = (body, ownerId) => body.ivaByHolder.find(item => item.ownerId === ownerId && item.currency === account.currency);

  it('nets a 21% invoiced income against a 21% invoiced expense to a zero balance', async () => {
    const income = await agent.post('/api/transactions').send({
      tipo: 'income', monto: 1000000, clasificacion: 'A', ivaPorcentaje: 21, fecha: today, accountId: account.id, titulo: 'Alquiler'
    });
    expect(income.status).toBe(201);
    const expense = await agent.post('/api/transactions').send({
      tipo: 'expense', monto: 1000000, categoryId, ivaPorcentaje: 21, fecha: today, accountId: account.id, titulo: 'Televisor'
    });
    expect(expense.status).toBe(201);
    expect(expense.body.ivaPorcentaje).toBe(21);

    const summary = await agent.get(`/api/summary?month=${today.slice(0, 7)}`);
    expect(holderRow(summary.body, owner.id)).toMatchObject({ debit: 210000, credit: 210000, balance: 0, amount: 210000 });
  });

  it('attributes the credit to the owner chosen as "Factura a nombre de"', async () => {
    await agent.post('/api/transactions').send({ tipo: 'income', monto: 1000, clasificacion: 'A', ivaPorcentaje: 21, fecha: today, accountId: account.id });
    const expense = await agent.post('/api/transactions').send({
      tipo: 'expense', monto: 500, categoryId, ivaPorcentaje: 10.5, ivaHolderId: otherOwner.id, fecha: today, accountId: account.id
    });
    expect(expense.body).toMatchObject({ ivaHolderId: otherOwner.id, ivaHolderName: 'Titular Dos' });

    const summary = await agent.get(`/api/summary?month=${today.slice(0, 7)}`);
    expect(holderRow(summary.body, owner.id)).toMatchObject({ debit: 210, credit: 0, balance: -210 });
    expect(holderRow(summary.body, otherOwner.id)).toMatchObject({ debit: 0, credit: 52.5, balance: 52.5 });

    const trends = await agent.get(`/api/trends?from=${today.slice(0, 7)}&to=${today.slice(0, 7)}`);
    expect(trends.body.monthlyData[0].ivaByHolder).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerId: otherOwner.id, credit: 52.5 })
    ]));
  });

  it('validates the expense IVA and its holder, and rejects IVA on refunds', async () => {
    expect((await agent.post('/api/transactions').send({ tipo: 'expense', monto: 10, categoryId, ivaPorcentaje: 150, accountId: account.id })).status).toBe(400);
    expect((await agent.post('/api/transactions').send({ tipo: 'expense', monto: 10, categoryId, ivaPorcentaje: 21, ivaHolderId: 'nope', accountId: account.id })).status).toBe(400);
    expect((await agent.post('/api/transactions').send({ tipo: 'refund', monto: 10, categoryId, ivaPorcentaje: 21, accountId: account.id })).status).toBe(400);
  });

  it('updates and clears the expense IVA', async () => {
    const created = (await agent.post('/api/transactions').send({ tipo: 'expense', monto: 100, categoryId, fecha: today, accountId: account.id })).body;
    const withIva = await agent.put(`/api/transactions/${created.id}`).send({ ivaPorcentaje: 21, ivaHolderId: otherOwner.id });
    expect(withIva.status).toBe(200);
    let summary = await agent.get(`/api/summary?month=${today.slice(0, 7)}`);
    expect(holderRow(summary.body, otherOwner.id)).toMatchObject({ credit: 21 });

    const cleared = await agent.put(`/api/transactions/${created.id}`).send({ ivaPorcentaje: null });
    expect(cleared.status).toBe(200);
    expect(db.findById('transactions', created.id, userId)).toMatchObject({ ivaPorcentaje: null, ivaHolderId: null });
    summary = await agent.get(`/api/summary?month=${today.slice(0, 7)}`);
    expect(holderRow(summary.body, otherOwner.id)).toBeUndefined();
  });
});
