const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Account-aware financial routes', () => {
  let db;
  let agent;
  let primaryAccount;
  let categoryId;
  let userId;
  let userSequence = 0;

  beforeEach(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    userSequence += 1;
    const register = await agent.post('/api/auth/register').send({
      email: `account-routes-${userSequence}@example.com`, password: '123456', nombre: 'Account Routes'
    });
    userId = register.body.id;
    const setup = await agent.get('/api/accounts/setup');
    primaryAccount = setup.body.accounts.find(account => account.primary);
    await agent.put(`/api/accounts/${primaryAccount.id}`).send({ currency: 'EUR' });
    await agent.patch('/api/accounts/settings').send({ appCurrency: 'EUR' });
    primaryAccount.currency = 'EUR';
    const category = await agent.post('/api/categories').send({ nombre: 'Route Test', color: '#FF6B6B' });
    categoryId = category.body.id;
  });

  afterEach(() => cleanupTestDb());

  function createTransaction(data) {
    return agent.post('/api/transactions').send({ fecha: '2020-03-10', ...data });
  }

  function createTransfer(data) {
    return agent.post('/api/transfers').send({ fecha: '2020-03-10', status: 'posted', ...data });
  }

  it('lists same- and cross-currency transfer projections with month and either-account filters', async () => {
    const secondEur = (await agent.post('/api/accounts').send({ name: 'EUR reserve', currency: 'EUR' })).body;
    const usd = (await agent.post('/api/accounts').send({ name: 'USD wallet', currency: 'USD' })).body;
    const same = await createTransfer({
      fromAccountId: primaryAccount.id, toAccountId: secondEur.id, sentAmount: 110, receivedAmount: 110
    });
    const cross = await createTransfer({
      fromAccountId: usd.id, toAccountId: primaryAccount.id, sentAmount: 1000, receivedAmount: 900
    });
    await createTransfer({
      fromAccountId: primaryAccount.id, toAccountId: secondEur.id,
      sentAmount: 20, receivedAmount: 20, fecha: '2020-02-10'
    });

    const month = await agent.get('/api/transactions?month=2020-03');
    const sameProjection = month.body.find(item => item.id === same.body.id);
    const crossProjection = month.body.find(item => item.id === cross.body.id);
    const usdAccount = await agent.get(`/api/transactions?month=2020-03&accountId=${usd.id}`);
    const eurAccount = await agent.get(`/api/transactions?month=2020-03&accountId=${primaryAccount.id}`);
    const otherMonth = await agent.get('/api/transactions?month=2020-04');

    expect(month.status).toBe(200);
    expect(sameProjection).toMatchObject({
      tipo: 'transfer', isTransfer: true, fromAccountId: primaryAccount.id, toAccountId: secondEur.id,
      fromCurrency: 'EUR', toCurrency: 'EUR', monto: 110, receivedAmount: 110
    });
    expect(crossProjection).toMatchObject({
      tipo: 'transfer', isTransfer: true, fromAccountId: usd.id, toAccountId: primaryAccount.id,
      fromCurrency: 'USD', toCurrency: 'EUR', monto: 1000, receivedAmount: 900
    });
    expect(usdAccount.body.map(item => item.id)).toEqual([cross.body.id]);
    expect(eurAccount.body.map(item => item.id)).toContain(same.body.id);
    expect(eurAccount.body.map(item => item.id)).toContain(cross.body.id);
    expect(otherMonth.body).toEqual([]);
  });

  it('links refunds to expense sources, rejects invalid sources, clears links, and protects linked expenses', async () => {
    const expense = await createTransaction({ tipo: 'expense', monto: 90, titulo: 'Source expense', categoryId });
    const otherExpense = await createTransaction({ tipo: 'expense', monto: 40, titulo: 'Other expense', categoryId });
    const income = await createTransaction({ tipo: 'income', monto: 500, titulo: 'Income' });
    const refund = await createTransaction({
      tipo: 'refund', monto: 20, titulo: 'Linked refund', categoryId, refundSourceId: expense.body.id
    });
    const invalidCreate = await createTransaction({
      tipo: 'refund', monto: 10, titulo: 'Invalid refund', categoryId, refundSourceId: income.body.id
    });
    const invalidUpdate = await agent.put(`/api/transactions/${refund.body.id}`).send({ refundSourceId: income.body.id });
    const reassign = await agent.put(`/api/transactions/${refund.body.id}`).send({ refundSourceId: otherExpense.body.id });
    const clear = await agent.put(`/api/transactions/${refund.body.id}`).send({ refundSourceId: null });
    const relink = await agent.put(`/api/transactions/${refund.body.id}`).send({ refundSourceId: expense.body.id });
    const deleteLinkedSource = await agent.delete(`/api/transactions/${expense.body.id}`);

    expect(refund.status).toBe(201);
    expect(refund.body.refundSourceId).toBe(expense.body.id);
    expect(invalidCreate.status).toBe(400);
    expect(invalidUpdate.status).toBe(400);
    expect(reassign.body.refundSourceId).toBe(otherExpense.body.id);
    expect(clear.body.refundSourceId).toBeNull();
    expect(relink.body.refundSourceId).toBe(expense.body.id);
    expect(deleteLinkedSource.status).toBe(409);
    const retained = await agent.get(`/api/transactions/${expense.body.id}`);
    expect(retained.status).toBe(200);
    expect(retained.body.id).toBe(expense.body.id);
  });

  it('reassigns an amount without conversion and rejects unknown, inactive, and unrepresentable accounts', async () => {
    const usd = (await agent.post('/api/accounts').send({ name: 'USD', currency: 'USD' })).body;
    const jpy = db.create('accounts', { nombre: 'JPY legacy', currency: 'JPY', activo: true, primary: false }, userId);
    const inactive = (await agent.post('/api/accounts').send({ name: 'Archived EUR', currency: 'EUR' })).body;
    await agent.post(`/api/accounts/${inactive.id}/archive`).send({});
    const original = await createTransaction({ tipo: 'income', monto: 100.5, titulo: 'Reassignable' });
    const invalidPost = await createTransaction({ tipo: 'income', monto: 5, accountId: 'missing-account' });
    const inactivePost = await createTransaction({ tipo: 'income', monto: 5, accountId: inactive.id });
    const unknownUpdate = await agent.put(`/api/transactions/${original.body.id}`).send({ accountId: 'missing-account' });
    const inactiveUpdate = await agent.put(`/api/transactions/${original.body.id}`).send({ accountId: inactive.id });
    const reassigned = await agent.put(`/api/transactions/${original.body.id}`).send({ accountId: usd.id, monto: 100.5 });
    const unrepresentable = await agent.put(`/api/transactions/${original.body.id}`).send({ accountId: jpy.id, monto: 100.5 });
    const stored = await agent.get(`/api/transactions/${original.body.id}`);

    expect(invalidPost.status).toBe(400);
    expect(inactivePost.status).toBe(400);
    expect(unknownUpdate.status).toBe(400);
    expect(inactiveUpdate.status).toBe(400);
    expect(reassigned.body).toMatchObject({ accountId: usd.id, currencyCode: 'USD', monto: 100.5 });
    expect(unrepresentable.status).toBe(400);
    expect(stored.body).toMatchObject({ accountId: usd.id, currencyCode: 'USD', monto: 100.5 });
  });

  it('creates and updates occurrence overrides, skips scheduled dates, and rejects skipping posted dates', async () => {
    const template = await createTransaction({
      tipo: 'expense', monto: 30, titulo: 'Recurring source', categoryId,
      fecha: '2020-01-15', recurrente: true, frecuencia: 'monthly'
    });
    const firstOverride = await agent.put(`/api/transactions/${template.body.id}/occurrences/2020-02-15`).send({ monto: 45, titulo: 'February rent' });
    const updatedOverride = await agent.put(`/api/transactions/${template.body.id}/occurrences/2020-02-15`).send({ monto: 55, titulo: 'February rent updated' });
    const february = await agent.get('/api/transactions?month=2020-02');
    const skipped = await agent.delete(`/api/transactions/${template.body.id}/occurrences/2020-02-15`);
    const skippedList = await agent.get('/api/transactions?month=2020-02');
    const posted = await agent.post(`/api/transactions/${template.body.id}/occurrences/2020-03-15/post`).send({});
    const skipPosted = await agent.delete(`/api/transactions/${template.body.id}/occurrences/2020-03-15`);
    const postedAgain = await agent.post(`/api/transactions/${template.body.id}/occurrences/2020-03-15/post`).send({});

    expect(firstOverride.status).toBe(200);
    expect(updatedOverride.body).toMatchObject({ status: 'scheduled', amountMinor: 5500 });
    expect(february.body.find(item => item.isRecurringInstance).monto).toBe(55);
    expect(skipped.body.status).toBe('skipped');
    expect(skippedList.body.find(item => item.isRecurringInstance).occurrenceStatus).toBe('skipped');
    expect(posted.status).toBe(201);
    expect(skipPosted.status).toBe(409);
    expect(postedAgain.status).toBe(200);
    expect(postedAgain.body.occurrenceStatus).toBe('posted');
  });

  it('rejects invalid, future, and non-scheduled occurrence posting dates', async () => {
    const template = await createTransaction({
      tipo: 'expense', monto: 30, titulo: 'Posting validation', categoryId,
      fecha: '2020-01-15', recurrente: true, frecuencia: 'monthly'
    });
    const invalidCalendarDate = await agent.post(`/api/transactions/${template.body.id}/occurrences/2020-02-30/post`).send({});
    const nonOccurrence = await agent.post(`/api/transactions/${template.body.id}/occurrences/2020-02-14/post`).send({});
    const futureOccurrence = await agent.post(`/api/transactions/${template.body.id}/occurrences/2030-01-15/post`).send({});

    expect(invalidCalendarDate.status).toBe(404);
    expect(nonOccurrence.status).toBe(404);
    expect(futureOccurrence.status).toBe(409);
  });

  it('partitions recurring totals by the selected application currency', async () => {
    const usd = (await agent.post('/api/accounts').send({ name: 'USD recurring', currency: 'USD' })).body;
    await createTransaction({ tipo: 'expense', monto: 50, titulo: 'EUR rent', categoryId, recurrente: true, frecuencia: 'monthly', fecha: '2020-01-01' });
    await createTransaction({ tipo: 'expense', monto: 300, titulo: 'USD rent', categoryId, recurrente: true, frecuencia: 'monthly', fecha: '2020-01-01', accountId: usd.id });

    const eurTotal = await agent.get('/api/transactions/recurring-total?month=2020-02');
    await agent.patch('/api/accounts/settings').send({ appCurrency: 'USD' });
    const usdTotal = await agent.get('/api/transactions/recurring-total?month=2020-02');

    expect(eurTotal.body).toMatchObject({ currency: 'EUR', total: 50 });
    expect(eurTotal.body.items.map(item => item.titulo)).toEqual(['EUR rent']);
    expect(usdTotal.body).toMatchObject({ currency: 'USD', total: 300 });
    expect(usdTotal.body.items.map(item => item.titulo)).toEqual(['USD rent']);
  });

  it('validates earlier, malformed, and non-occurrence series effective dates', async () => {
    const template = await createTransaction({
      tipo: 'expense', monto: 30, titulo: 'Series validation', categoryId,
      fecha: '2020-01-15', recurrente: true, frecuencia: 'monthly'
    });
    const invalid = await agent.put(`/api/transactions/${template.body.id}`).send({ effectiveFromDate: '2020-02-30' });
    const earlier = await agent.put(`/api/transactions/${template.body.id}`).send({ effectiveFromDate: '2019-12-15' });
    const nonOccurrence = await agent.put(`/api/transactions/${template.body.id}`).send({ effectiveFromDate: '2020-02-14' });
    const validOccurrence = await agent.put(`/api/transactions/${template.body.id}`).send({
      effectiveFromDate: '2020-02-15', fecha: '2020-01-15', monto: 60,
      recurrente: true, frecuencia: 'monthly'
    });
    const january = await agent.get('/api/transactions?month=2020-01');
    const february = await agent.get('/api/transactions?month=2020-02');

    expect(invalid.status).toBe(400);
    expect(earlier.status).toBe(409);
    expect(nonOccurrence.status).toBe(400);
    expect(validOccurrence.status).toBe(200);
    expect(january.body.find(item => item.id === template.body.id).monto).toBe(30);
    expect(february.body.find(item => item.isRecurringInstance).monto).toBe(60);
  });

  it('partitions income, expenses, and refunds by currency when the application currency changes', async () => {
    const usd = (await agent.post('/api/accounts').send({ name: 'USD ledger', currency: 'USD' })).body;
    await createTransaction({ tipo: 'income', monto: 1000, titulo: 'EUR income', fecha: '2020-04-10', accountId: primaryAccount.id });
    await createTransaction({ tipo: 'expense', monto: 200, titulo: 'EUR expense', categoryId, fecha: '2020-04-11', accountId: primaryAccount.id });
    await createTransaction({ tipo: 'refund', monto: 50, titulo: 'EUR refund', categoryId, fecha: '2020-04-12', accountId: primaryAccount.id });
    await createTransaction({ tipo: 'income', monto: 2000, titulo: 'USD income', fecha: '2020-04-10', accountId: usd.id });
    await createTransaction({ tipo: 'expense', monto: 300, titulo: 'USD expense', categoryId, fecha: '2020-04-11', accountId: usd.id });
    await createTransaction({ tipo: 'refund', monto: 25, titulo: 'USD refund', categoryId, fecha: '2020-04-12', accountId: usd.id });

    const eurSummary = await agent.get('/api/summary?month=2020-04');
    await agent.patch('/api/accounts/settings').send({ appCurrency: 'USD' });
    const usdSummary = await agent.get('/api/summary?month=2020-04');

    expect(eurSummary.body).toMatchObject({ activeCurrency: 'EUR', ingresos: 1000, gastos: 200, reembolsos: 50, gastosNetos: 150 });
    expect(eurSummary.body.currencyTotals.find(item => item.currency === 'USD')).toMatchObject({ income: 2000, expenses: 300, refunds: 25, savings: 1725 });
    expect(usdSummary.body).toMatchObject({ activeCurrency: 'USD', ingresos: 2000, gastos: 300, reembolsos: 25, gastosNetos: 275 });
    expect(usdSummary.body.currencyTotals.find(item => item.currency === 'EUR')).toMatchObject({ income: 1000, expenses: 200, refunds: 50, savings: 850 });
  });

  it('counts posted fees once in burn rate while excluding another currency', async () => {
    const eurReserve = (await agent.post('/api/accounts').send({ name: 'EUR reserve', currency: 'EUR' })).body;
    const usd = (await agent.post('/api/accounts').send({ name: 'USD ledger', currency: 'USD' })).body;
    const usdReserve = (await agent.post('/api/accounts').send({ name: 'USD reserve', currency: 'USD' })).body;
    const fees = await agent.post('/api/categories').send({ nombre: 'Transfer fees', color: '#F00' });
    await createTransaction({ tipo: 'expense', monto: 100, titulo: 'EUR purchase', categoryId, fecha: '2020-05-05', accountId: primaryAccount.id });
    await createTransaction({ tipo: 'expense', monto: 999, titulo: 'USD purchase', categoryId, fecha: '2020-05-05', accountId: usd.id });
    const eurTransfer = await createTransfer({
      fromAccountId: primaryAccount.id, toAccountId: eurReserve.id, sentAmount: 1, receivedAmount: 1,
      feeAmount: 10, feeCategoryId: fees.body.id, fecha: '2020-05-08'
    });
    const usdTransfer = await createTransfer({
      fromAccountId: usd.id, toAccountId: usdReserve.id, sentAmount: 1, receivedAmount: 1,
      feeAmount: 20, feeCategoryId: fees.body.id, fecha: '2020-05-08'
    });
    const summary = await agent.get('/api/summary?month=2020-05');
    const burnRate = await agent.get('/api/summary/burn-rate?month=2020-05&compare=1');
    const dayFive = burnRate.body.currentMonth.find(item => item.day === 5);
    const dayEight = burnRate.body.currentMonth.find(item => item.day === 8);

    expect(eurTransfer.status).toBe(201);
    expect(usdTransfer.status).toBe(201);
    expect(summary.body.gastos).toBe(110);
    expect(summary.body.currencyTotals.find(item => item.currency === 'USD').expenses).toBe(1019);
    expect(dayFive.cumulative).toBe(100);
    expect(dayEight.cumulative).toBe(110);
  });

  it('returns selected-currency month and category trends plus separate totals for other currencies', async () => {
    const usd = (await agent.post('/api/accounts').send({ name: 'USD analytics', currency: 'USD' })).body;
    await createTransaction({ tipo: 'income', monto: 1000, titulo: 'EUR income', fecha: '2020-06-10', accountId: primaryAccount.id });
    await createTransaction({ tipo: 'expense', monto: 50, titulo: 'EUR category', categoryId, fecha: '2020-06-11', accountId: primaryAccount.id });
    await createTransaction({ tipo: 'income', monto: 2000, titulo: 'USD income', fecha: '2020-06-10', accountId: usd.id });
    await createTransaction({ tipo: 'expense', monto: 500, titulo: 'USD category', categoryId, fecha: '2020-06-11', accountId: usd.id });

    const eur = await agent.get(`/api/trends?from=2020-06&to=2020-06&categoryId=${categoryId}`);
    await agent.patch('/api/accounts/settings').send({ appCurrency: 'USD' });
    const usdTrends = await agent.get(`/api/trends?from=2020-06&to=2020-06&categoryId=${categoryId}`);
    const usdMonth = usdTrends.body.monthlyData[0];

    expect(eur.body.monthlyData[0]).toMatchObject({ activeCurrency: 'EUR', ingresos: 1000, gastos: 50 });
    expect(eur.body.monthlyData[0].currencyTotals.find(item => item.currency === 'USD')).toMatchObject({ income: 2000, expenses: 500 });
    expect(eur.body.categoryTrends[categoryId].months[0].neto).toBe(50);
    expect(usdMonth).toMatchObject({ activeCurrency: 'USD', ingresos: 2000, gastos: 500 });
    expect(usdTrends.body.categoryTrends[categoryId].months[0].neto).toBe(500);
  });

  it('includes only posted recurring movements and selected-currency fees in trend totals', async () => {
    const usd = (await agent.post('/api/accounts').send({ name: 'USD scheduled', currency: 'USD' })).body;
    const usdReserve = (await agent.post('/api/accounts').send({ name: 'USD reserve', currency: 'USD' })).body;
    const eurReserve = (await agent.post('/api/accounts').send({ name: 'EUR reserve', currency: 'EUR' })).body;
    const fees = await agent.post('/api/categories').send({ nombre: 'Monthly fees', color: '#F00' });
    const postedRecurring = await createTransaction({
      tipo: 'expense', monto: 30, titulo: 'Posted recurrence', categoryId, fecha: '2020-01-15', recurrente: true, frecuencia: 'monthly'
    });
    await createTransaction({
      tipo: 'expense', monto: 80, titulo: 'Unposted recurrence', categoryId, fecha: '2020-01-20', recurrente: true, frecuencia: 'monthly', accountId: usd.id
    });
    await agent.post(`/api/transactions/${postedRecurring.body.id}/occurrences/2020-02-15/post`).send({});
    const eurFee = await createTransfer({
      fromAccountId: primaryAccount.id, toAccountId: eurReserve.id, sentAmount: 1, receivedAmount: 1,
      feeAmount: 10, feeCategoryId: fees.body.id, fecha: '2020-02-08'
    });
    const usdFee = await createTransfer({
      fromAccountId: usd.id, toAccountId: usdReserve.id, sentAmount: 1, receivedAmount: 1,
      feeAmount: 20, feeCategoryId: fees.body.id, fecha: '2020-02-08'
    });

    const trends = await agent.get(`/api/trends?from=2020-02&to=2020-02&categoryId=${categoryId}`);
    const month = trends.body.monthlyData[0];

    expect(eurFee.status).toBe(201);
    expect(usdFee.status).toBe(201);
    expect(month).toMatchObject({ activeCurrency: 'EUR', gastos: 40 });
    expect(month.currencyTotals.find(item => item.currency === 'EUR').expenses).toBe(40);
    expect(month.currencyTotals.find(item => item.currency === 'USD').expenses).toBe(20);
    expect(trends.body.categoryTrends[categoryId].months[0].neto).toBe(30);
    const feeTrends = await agent.get(`/api/trends?from=2020-02&to=2020-02&categoryId=${fees.body.id}`);
    expect(feeTrends.body.categoryTrends[fees.body.id].months[0].neto).toBe(10);
  });
});
