const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Transaction validation branches', () => {
  let db;
  let agent;
  let userId;
  let categoryId;
  let primary;
  let sequence = 0;

  beforeEach(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    sequence += 1;
    const register = await agent.post('/api/auth/register').send({
      email: `tx-branches-${sequence}@example.com`, password: '123456', nombre: 'Tx Branches'
    });
    if (register.status < 200 || register.status >= 300 || !register.body || !register.body.id) {
      throw new Error(`POST /api/auth/register setup failed with status ${register.status}; expected a successful response with a user id`);
    }
    userId = register.body.id;
    const setup = await agent.get('/api/accounts/setup');
    if (setup.status < 200 || setup.status >= 300 || !setup.body || !Array.isArray(setup.body.accounts)) {
      throw new Error(`GET /api/accounts/setup failed with status ${setup.status}; expected a successful response with an accounts array`);
    }
    primary = setup.body.accounts.find(account => account.primary);
    const category = await agent.post('/api/categories').send({ nombre: 'Branches', color: '#F00' });
    categoryId = category.body.id;
  });

  afterEach(() => cleanupTestDb());

  function create(data) {
    return agent.post('/api/transactions').send({ fecha: '2020-03-10', ...data });
  }

  it('validates income splits and non-income classifications on create', async () => {
    const badSplit = await create({
      tipo: 'income', monto: 100, titulo: 'Bad split', clasificacion: 'Mixto', montoA: 60, montoB: 30
    });
    const missingSplit = await create({
      tipo: 'income', monto: 100, titulo: 'Missing split', clasificacion: 'Mixto'
    });
    const badExpenseClass = await create({
      tipo: 'expense', monto: 40, titulo: 'Bad class', categoryId, clasificacion: 'A'
    });
    const validSplit = await create({
      tipo: 'income', monto: 100, titulo: 'Good split', clasificacion: 'Mixto', montoA: 60, montoB: 40
    });

    expect(badSplit.status).toBe(400);
    expect(missingSplit.status).toBe(400);
    expect(badExpenseClass.status).toBe(400);
    expect(validSplit.status).toBe(201);
    expect(validSplit.body).toMatchObject({ monto: 100, montoA: 60, montoB: 40, currencyCode: 'EUR' });
  });

  it('clears a refund source when the movement stops being a refund', async () => {
    const expense = await create({ tipo: 'expense', monto: 80, titulo: 'Source', categoryId });
    const refund = await create({ tipo: 'refund', monto: 20, titulo: 'Refund', categoryId, refundSourceId: expense.body.id });
    const converted = await agent.put(`/api/transactions/${refund.body.id}`).send({ tipo: 'income' });

    expect(converted.status).toBe(200);
    expect(converted.body.tipo).toBe('income');
    expect(converted.body.refundSourceId).toBeNull();
  });

  it('rejects split updates on non-mixto income and invalid amounts', async () => {
    const income = await create({ tipo: 'income', monto: 100, titulo: 'Income' });
    const unexpectedSplit = await agent.put(`/api/transactions/${income.body.id}`).send({ montoA: 10, montoB: 90 });
    const zeroAmount = await agent.put(`/api/transactions/${income.body.id}`).send({ monto: 0 });
    const textAmount = await agent.put(`/api/transactions/${income.body.id}`).send({ monto: '100' });
    const invalidFrequency = await agent.put(`/api/transactions/${income.body.id}`).send({
      recurrente: true, frecuencia: 'weekly'
    });

    expect(unexpectedSplit.status).toBe(400);
    expect(zeroAmount.status).toBe(400);
    expect(textAmount.status).toBe(400);
    expect(invalidFrequency.status).toBe(400);
  });

  it('updates the amount of a legacy movement that has no account', async () => {
    const legacy = db.create('transactions', {
      userId, tipo: 'expense', monto: 25, titulo: 'Legacy', categoryId, fecha: '2020-03-10'
    }, userId);
    const updated = await agent.put(`/api/transactions/${legacy.id}`).send({ monto: 30 });

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ monto: 30, amountMinor: 3000 });
  });

  it('validates classification updates for both income and expense movements', async () => {
    const expense = await create({ tipo: 'expense', monto: 40, titulo: 'Expense', categoryId });
    const invalidExpenseClass = await agent.put(`/api/transactions/${expense.body.id}`).send({ clasificacion: 'A' });
    const validExpenseClass = await agent.put(`/api/transactions/${expense.body.id}`).send({ clasificacion: 'fijo' });
    const invalidIncomeClass = await agent.put(`/api/transactions/${expense.body.id}`).send({
      tipo: 'income', clasificacion: 'X'
    });

    expect(invalidExpenseClass.status).toBe(400);
    expect(validExpenseClass.status).toBe(200);
    expect(validExpenseClass.body.clasificacion).toBe('fijo');
    expect(invalidIncomeClass.status).toBe(400);
  });

  it('clears stored split amounts when an income leaves Mixto', async () => {
    const income = await create({
      tipo: 'income', monto: 100, titulo: 'Mixto income', clasificacion: 'Mixto', montoA: 60, montoB: 40
    });
    const simplified = await agent.put(`/api/transactions/${income.body.id}`).send({ clasificacion: 'A' });

    expect(simplified.status).toBe(200);
    expect(simplified.body).toMatchObject({ clasificacion: 'A', montoA: null, montoB: null });
  });

  it('requires both split amounts when a Mixto income changes its total', async () => {
    const income = await create({
      tipo: 'income', monto: 100, titulo: 'Mixto income', clasificacion: 'Mixto', montoA: 60, montoB: 40
    });
    const missingSplit = await agent.put(`/api/transactions/${income.body.id}`).send({ monto: 200 });

    expect(missingSplit.status).toBe(400);
  });

  it('blocks updates and deletions of income that sustains normalizations', async () => {
    const income = await create({ tipo: 'income', monto: 1000, titulo: 'Normalized income' });
    const target = (await agent.post('/api/accounts').send({ name: 'Reserve', currency: 'EUR' })).body;
    const transfer = await agent.post('/api/transfers').send({
      fromAccountId: primary.id, toAccountId: target.id, sentAmount: 1, receivedAmount: 1,
      status: 'posted', fecha: '2020-03-10'
    });
    expect(transfer.status).toBe(201);
    db.update('transfers', transfer.body.id, {
      normalizationAllocations: [{ sourceType: 'income', sourceId: income.body.id }]
    }, userId);

    const blockedUpdate = await agent.put(`/api/transactions/${income.body.id}`).send({ monto: 900 });
    const blockedDelete = await agent.delete(`/api/transactions/${income.body.id}`);

    expect(blockedUpdate.status).toBe(409);
    expect(blockedDelete.status).toBe(409);
    expect(db.findById('transactions', income.body.id, userId)).not.toBeNull();
  });
});
