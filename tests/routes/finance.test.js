const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('General finance associations and recoveries', () => {
  let db;
  let agent;
  let otherAgent;
  let userId;
  let accountId;
  let categoryId;
  let assetId;
  let today;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    otherAgent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'finance@test.example', password: '123456', nombre: 'Finance User' });
    await otherAgent.post('/api/auth/register').send({ email: 'finance-other@test.example', password: '123456', nombre: 'Other Finance User' });
    await otherAgent.get('/api/accounts/setup');
    userId = db.findUserByName('Finance User').id;
    today = ledger.localDateForUser(db, userId);
    await agent.get('/api/accounts/setup');
    accountId = db.findAll('accounts', userId).find(item => item.currency === 'EUR').id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Finance tests', color: '#123456' })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'movable', name: 'Finance asset' })).body.id;
  });

  afterAll(() => cleanupTestDb());

  async function createExpense(amount = 100, title = 'Finance expense') {
    const result = await agent.post('/api/transactions').send({ tipo: 'expense', monto: amount, titulo: title, categoryId, accountId, fecha: today });
    expect(result.status).toBe(201);
    return result.body;
  }

  it('protects payment methods from cross-user references and credential storage', async () => {
    const foreignAccount = db.findAll('accounts', db.findUserByName('Other Finance User').id)[0];
    const rejectedCredentials = await agent.post('/api/finance/payment-methods').send({ name: 'Card', type: 'credit_card', cardNumber: '4111111111111111' });
    const rejectedReference = await agent.post('/api/finance/payment-methods').send({ name: 'Foreign', type: 'bank_transfer', accountId: foreignAccount.id });
    const created = await agent.post('/api/finance/payment-methods').send({ name: 'Work card', type: 'credit_card', accountId, lastFour: '1234', notes: 'Personal label' });

    expect(rejectedCredentials.status).toBe(400);
    expect(rejectedReference.status).toBe(400);
    expect(created.status).toBe(201);
    expect(created.body).not.toHaveProperty('cardNumber');
    expect(created.body.lastFour).toBe('1234');
    expect((await agent.post('/api/finance/payment-methods').send({ name: 'Bad digits', type: 'credit_card', lastFour: '12345' })).status).toBe(400);
  });

  it('validates partial and exact minor-unit allocations and blocks linked transaction identity edits', async () => {
    const partialTransaction = await createExpense(50, 'Partially allocated expense');
    const partialOnly = await agent.put(`/api/finance/transactions/${partialTransaction.id}/allocations`).send({
      allocations: [{ assetId, amount: 12.34 }], complete: false
    });
    const transaction = await createExpense(50, 'Allocated expense');
    const secondAsset = (await agent.post('/api/assets').send({ type: 'movable', name: 'Second finance asset' })).body;
    const partial = await agent.put(`/api/finance/transactions/${transaction.id}/allocations`).send({
      allocations: [{ assetId, amount: 20 }, { assetId: secondAsset.id, amount: 30 }], complete: true
    });
    expect(partialOnly.status).toBe(200);
    expect(partialOnly.body.allocatedMinor).toBe(1234);
    expect(partialOnly.body.complete).toBe(false);
    expect(partial.status).toBe(200);
    expect(partial.body.allocatedMinor).toBe(5000);
    expect(partial.body.allocations).toHaveLength(2);

    const over = await agent.put(`/api/finance/transactions/${transaction.id}/allocations`).send({ allocations: [{ assetId, amount: 50.01 }] });
    const partialComplete = await agent.put(`/api/finance/transactions/${transaction.id}/allocations`).send({ allocations: [{ assetId, amount: 20 }], complete: true });
    const foreignAsset = (await otherAgent.post('/api/assets').send({ type: 'movable', name: 'Foreign asset' })).body;
    const crossUser = await agent.put(`/api/finance/transactions/${transaction.id}/allocations`).send({ allocations: [{ assetId: foreignAsset.id, amount: 10 }] });
    const crossUserRead = await otherAgent.get('/api/finance/transactions/' + transaction.id + '/associations');
    const amountEdit = await agent.put(`/api/transactions/${transaction.id}`).send({ monto: 60 });
    const typeEdit = await agent.put(`/api/transactions/${transaction.id}`).send({ tipo: 'income' });
    const deleteLinked = await agent.delete(`/api/transactions/${transaction.id}`);

    expect(over.status).toBe(400);
    expect(partialComplete.status).toBe(400);
    expect(crossUser.status).toBe(400);
    expect(crossUserRead.status).toBe(404);
    expect(amountEdit.status).toBe(409);
    expect(typeEdit.status).toBe(409);
    expect(deleteLinked.status).toBe(409);
  });

  it('keeps one transaction in the global ledger when it has multiple asset links', async () => {
    const transaction = await createExpense(40, 'Multi-link expense');
    const secondAsset = (await agent.post('/api/assets').send({ type: 'movable', name: 'Another asset' })).body;
    await agent.put(`/api/finance/transactions/${transaction.id}/allocations`).send({ allocations: [
      { assetId, amount: 15 }, { assetId: secondAsset.id, amount: 25 }
    ] });

    const listed = await agent.get('/api/transactions').query({ month: today.slice(0, 7) });
    expect(listed.body.filter(item => item.id === transaction.id)).toHaveLength(1);
  });

  it('does not double-count legacy obligation payments when a movement allocation points to the same occurrence', async () => {
    const obligation = await agent.post('/api/obligations').send({
      title: 'Finance obligation', type: 'utility', currencyCode: 'EUR', estimatedAmount: 35,
      startDate: today, recurrenceFrequency: null, reminderLeadDays: 0, accountId, categoryId
    });
    expect(obligation.status).toBe(201);
    const occurrence = obligation.body.occurrences.find(item => item.date === today);
    const payment = await agent.post(`/api/obligations/${obligation.body.id}/occurrences/${occurrence.id}/payments`).send({
      amount: 20, accountId, categoryId, idempotencyKey: 'finance-obligation-payment'
    });
    expect(payment.status).toBe(201);
    const transactionId = payment.body.transaction.id;
    const before = (await agent.get(`/api/obligations/${obligation.body.id}`)).body.occurrences.find(item => item.id === occurrence.id).totalPaid;
    const assigned = await agent.put(`/api/finance/transactions/${transactionId}/allocations`).send({
      allocations: [{ obligationId: obligation.body.id, occurrenceId: occurrence.id, amount: 20 }], complete: true
    });
    const afterResponse = await agent.get(`/api/obligations/${obligation.body.id}`);
    const after = afterResponse.body.occurrences.find(item => item.id === occurrence.id).totalPaid;
    const txRows = (await agent.get('/api/transactions').query({ month: today.slice(0, 7) })).body.filter(item => item.id === transactionId);

    expect(assigned.status).toBe(200);
    expect(after).toBe(before);
    expect(txRows).toHaveLength(1);
  });

  it('rejects allocations whose obligation occurrence uses a different transaction currency', async () => {
    const usd = await agent.post('/api/accounts').send({ name: 'Finance USD', currency: 'USD' });
    expect(usd.status).toBe(201);
    const obligation = await agent.post('/api/obligations').send({
      title: 'USD obligation', type: 'utility', currencyCode: 'USD', estimatedAmount: 10,
      startDate: today, recurrenceFrequency: null, reminderLeadDays: 0, accountId: usd.body.id
    });
    expect(obligation.status).toBe(201);
    const occurrence = obligation.body.occurrences.find(item => item.date === today);
    const eurExpense = await createExpense(10, 'EUR payment for USD occurrence');
    const result = await agent.put(`/api/finance/transactions/${eurExpense.id}/allocations`).send({
      allocations: [{ obligationId: obligation.body.id, occurrenceId: occurrence.id, amount: 10 }]
    });
    expect(result.status).toBe(400);
  });

  it('rejects a direct obligation allocation when its currency differs from the transaction', async () => {
    const usd = await agent.post('/api/accounts').send({ name: 'Direct obligation USD', currency: 'USD' });
    expect(usd.status).toBe(201);
    const obligation = await agent.post('/api/obligations').send({
      title: 'Direct USD obligation', type: 'utility', currencyCode: 'USD', estimatedAmount: 10,
      startDate: today, recurrenceFrequency: null, reminderLeadDays: 0, accountId: usd.body.id
    });
    expect(obligation.status).toBe(201);
    const eurExpense = await createExpense(10, 'EUR payment for direct USD obligation');
    const result = await agent.put(`/api/finance/transactions/${eurExpense.id}/allocations`).send({
      allocations: [{ obligationId: obligation.body.id, amount: 10 }]
    });

    expect(result.status).toBe(400);
  });

  it('rejects a direct contract allocation when its currency differs from the transaction', async () => {
    const tenant = await agent.post('/api/owners').send({ name: 'Direct allocation tenant', kind: 'person', roles: ['tenant'] });
    const property = await agent.post('/api/assets').send({ type: 'immovable', name: 'Direct allocation property' });
    const contract = await agent.post('/api/rentals').send({
      assetId: property.body.id, type: 'residential', startDate: today, initialRent: 10, currencyCode: 'USD',
      periodicity: 'monthly', dueDay: Number(today.slice(8, 10)), depositAmount: 0, includedExpenses: [],
      expenseResponsibility: {}, notes: '', tenantIds: [tenant.body.id], status: 'active'
    });
    expect(contract.status).toBe(201);
    const eurIncome = await agent.post('/api/transactions').send({
      tipo: 'income', monto: 10, titulo: 'EUR payment for direct USD contract', accountId, fecha: today
    });
    expect(eurIncome.status).toBe(201);
    const result = await agent.put(`/api/finance/transactions/${eurIncome.body.id}/allocations`).send({
      allocations: [{ contractId: contract.body.id, amount: 10 }]
    });

    expect(result.status).toBe(400);
  });

  it('does not double-count legacy rent collections when a movement allocation points to the same rent period', async () => {
    const tenant = await agent.post('/api/owners').send({ name: 'Finance tenant', kind: 'person', roles: ['tenant'] });
    const property = await agent.post('/api/assets').send({ type: 'immovable', name: 'Finance rental property', propertyType: 'Apartment' });
    const contract = await agent.post('/api/rentals').send({
      assetId: property.body.id, type: 'residential', startDate: today, initialRent: 80, currencyCode: 'EUR',
      periodicity: 'monthly', dueDay: Number(today.slice(8, 10)), depositAmount: 0, includedExpenses: [],
      expenseResponsibility: {}, notes: '', tenantIds: [tenant.body.id], status: 'active'
    });
    expect(contract.status).toBe(201);
    const period = contract.body.occurrences.find(item => item.date === today);
    const collection = await agent.post('/api/rentals/collections').send({
      amount: 30, accountId, date: today, method: 'Legacy text', idempotencyKey: 'finance-rent-collection',
      allocations: [{ occurrenceId: period.id, amount: 30 }]
    });
    expect(collection.status).toBe(201);
    const transactionId = collection.body.transaction.id;
    const before = (await agent.get(`/api/rentals/${contract.body.id}`)).body.occurrences.find(item => item.id === period.id).paidAmount;
    const assigned = await agent.put(`/api/finance/transactions/${transactionId}/allocations`).send({
      allocations: [{ contractId: contract.body.id, rentOccurrenceId: period.id, amount: 30 }], complete: false
    });
    const after = (await agent.get(`/api/rentals/${contract.body.id}`)).body.occurrences.find(item => item.id === period.id).paidAmount;

    expect(assigned.status).toBe(200);
    expect(after).toBe(before);
  });

  it('bounds recoverable claims and records idempotent partial receipts as separate income transactions', async () => {
    const expense = await createExpense(100, 'Recoverable repair');
    const oversized = await agent.post('/api/finance/claims').send({ transactionId: expense.id, assetId, amount: 100.01 });
    expect(oversized.status).toBe(400);
    const created = await agent.post('/api/finance/claims').send({ transactionId: expense.id, assetId, amount: 80 });
    expect(created.status).toBe(201);

    const input = { amount: 30, accountId, date: today, idempotencyKey: 'finance-recovery-part-one' };
    const first = await agent.post(`/api/finance/claims/${created.body.id}/recoveries`).send(input);
    const replay = await agent.post(`/api/finance/claims/${created.body.id}/recoveries`).send(input);
    const differentReplay = await agent.post(`/api/finance/claims/${created.body.id}/recoveries`).send({ ...input, amount: 31 });
    const overRecovery = await agent.post(`/api/finance/claims/${created.body.id}/recoveries`).send({ amount: 51, accountId, date: today, idempotencyKey: 'finance-recovery-too-much' });
    const sourceEdit = await agent.put(`/api/transactions/${expense.id}`).send({ monto: 110 });
    const sourceDelete = await agent.delete(`/api/transactions/${expense.id}`);
    const recoveryId = first.body.recovery.transaction.id;
    const recoveryEdit = await agent.put(`/api/transactions/${recoveryId}`).send({ monto: 31 });
    const claim = (await agent.get('/api/finance/claims').query({ transactionId: expense.id })).body[0];
    const realRows = (await agent.get('/api/transactions').query({ month: today.slice(0, 7) })).body.filter(item => [expense.id, recoveryId].includes(item.id));

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.recoveries).toHaveLength(1);
    expect(differentReplay.status).toBe(409);
    expect(overRecovery.status).toBe(400);
    expect(sourceEdit.status).toBe(409);
    expect(sourceDelete.status).toBe(409);
    expect(recoveryEdit.status).toBe(409);
    expect(claim).toMatchObject({ recoveredAmount: 30, outstandingAmount: 50 });
    expect(realRows.map(item => item.tipo).sort()).toEqual(['expense', 'income']);
  });
});
