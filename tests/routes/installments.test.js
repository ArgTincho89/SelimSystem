const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Credit card installments API', () => {
  let db;
  let agent;
  let userId;
  let accountId;
  let cardId;
  let debitId;
  let categoryId;
  let assetId;

  const plan = (patch = {}) => ({
    title: 'Televisor', purchaseDate: '2030-01-10', totalAmount: 1000, accountId, paymentMethodId: cardId,
    installmentsCount: 12, dueDay: 31, interestPercent: 7, categoryId, ...patch
  });
  const monthSummary = async month => (await agent.get(`/api/summary?month=${month}`)).body;
  const post = (planId, occurrenceId, body = {}) => agent.post(`/api/installments/plans/${planId}/occurrences/${occurrenceId}/post`).send(body);
  const cancel = (planId, occurrenceId) => agent.post(`/api/installments/plans/${planId}/occurrences/${occurrenceId}/cancel`).send({});

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'inst@test.example', password: '123456', nombre: 'Inst User' });
    userId = db.findUserByName('Inst User').id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Hogar', color: '#0F0' })).body.id;
    await agent.get('/api/accounts');
    accountId = db.findAll('accounts', userId)[0].id;
    cardId = (await agent.post('/api/finance/payment-methods').send({ name: 'Visa', type: 'credit_card', accountId, lastFour: '1234' })).body.id;
    debitId = (await agent.post('/api/finance/payment-methods').send({ name: 'Debito', type: 'debit_card', accountId })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'movable', name: 'Casa' })).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('requires authentication', async () => {
    expect((await request(app).get('/api/installments/plans')).status).toBe(401);
  });

  it('creates a plan with generated occurrences and no transactions', async () => {
    const before = db.findAll('transactions', userId).length;
    const res = await agent.post('/api/installments/plans').send(plan());
    expect(res.status).toBe(201);
    expect(res.body.financedTotalMinor).toBe(107000);
    expect(res.body.status).toBe('active');
    expect(res.body.occurrences).toHaveLength(12);
    expect(res.body.occurrences[0].dueDate).toBe('2030-01-31');
    expect(res.body.occurrences[1].dueDate).toBe('2030-02-28');
    expect(res.body.occurrences.reduce((s, o) => s + o.amountMinor, 0)).toBe(107000);
    expect(db.findAll('transactions', userId).length).toBe(before);
  });

  it('rejects invalid payment method, account and ownership', async () => {
    const status = async patch => (await agent.post('/api/installments/plans').send(plan(patch))).status;
    expect(await status({ paymentMethodId: debitId })).toBe(400);
    expect(await status({ paymentMethodId: 'nope' })).toBe(400);
    expect(await status({ accountId: 'nope' })).toBe(400);
    expect(await status({ currencyCode: 'USD' })).toBe(400);
    expect(await status({ assetId: 'nope' })).toBe(400);
    expect(await status({ categoryId: 'nope' })).toBe(400);
    expect(await status({ documentId: 'nope' })).toBe(400);
    expect(await status({ totalAmount: 0 })).toBe(400);
    expect(await status({ totalAmount: 0.05, interestPercent: 0 })).toBe(400);
  });

  it('lists plans and reads one with occurrences', async () => {
    const list = await agent.get('/api/installments/plans');
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(0);
    expect(list.body[0].scheduledCount).toBe(12);
    const one = await agent.get(`/api/installments/plans/${list.body[0].id}`);
    expect(one.body.occurrences).toHaveLength(12);
    expect((await agent.get('/api/installments/plans/missing')).status).toBe(404);
    expect((await agent.get(`/api/installments/plans/${list.body[0].id}/occurrences`)).body).toHaveLength(12);
  });

  it('patches only notes, reminder days and title', async () => {
    const created = (await agent.post('/api/installments/plans').send(plan({ title: 'Patch me', purchaseDate: '2031-01-01' }))).body;
    const ok = await agent.patch(`/api/installments/plans/${created.id}`).send({ notes: ' x ', reminderLeadDays: 3, title: 'Renamed' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ notes: 'x', reminderLeadDays: 3, title: 'Renamed' });
    expect((await agent.patch(`/api/installments/plans/${created.id}`).send({ totalAmount: 5 })).status).toBe(400);
    expect((await agent.patch(`/api/installments/plans/${created.id}`).send({ reminderLeadDays: 500 })).status).toBe(400);
    expect((await agent.patch('/api/installments/plans/missing').send({ notes: 'a' })).status).toBe(404);
  });

  it('lists scheduled occurrences by month without altering totals', async () => {
    const created = (await agent.post('/api/installments/plans').send(plan({ title: 'Heladera', purchaseDate: '2032-03-01', dueDay: 15, installmentsCount: 3, interestPercent: 0 }))).body;
    const before = await monthSummary('2032-03');
    const res = await agent.get('/api/installments/occurrences?month=2032-03');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ label: 'Cuota 1 de 3 · Heladera', planId: created.id, status: 'scheduled' });
    expect(await monthSummary('2032-03')).toEqual(before);
    expect((await agent.get('/api/transactions?month=2032-03')).body).toHaveLength(0);
    expect((await agent.get('/api/installments/occurrences')).status).toBe(400);
    expect((await agent.get('/api/installments/occurrences?month=2032-13')).status).toBe(400);
  });

  it('posts one occurrence as a single expense and rejects duplicates', async () => {
    const created = (await agent.post('/api/installments/plans').send(plan({ title: 'Notebook', purchaseDate: '2033-05-01', dueDay: 10, installmentsCount: 2, interestPercent: 0, totalAmount: 200, assetId }))).body;
    const occ = created.occurrences[0];
    const before = await monthSummary('2033-05');
    const res = await post(created.id, occ.id);
    expect(res.status).toBe(201);
    expect(res.body.occurrence).toMatchObject({ status: 'posted', postedTransactionId: res.body.transaction.id });
    expect(res.body.transaction).toMatchObject({ tipo: 'expense', amountMinor: 10000, fecha: '2033-05-10', installmentOccurrenceId: occ.id, categoryId });
    const after = await monthSummary('2033-05');
    expect(after.gastosNetos).toBe(before.gastosNetos + 100);
    const allocations = db.findAll('movementAllocations', userId).filter(a => a.transactionId === res.body.transaction.id);
    expect(allocations).toHaveLength(1);
    expect(allocations[0].assetId).toBe(assetId);
    expect((await post(created.id, occ.id)).status).toBe(409);
    expect((await cancel(created.id, occ.id)).status).toBe(409);
    expect((await agent.get('/api/installments/occurrences?month=2033-05')).body).toHaveLength(0);
  });

  it('supports amount override, explicit date and validation on post', async () => {
    const created = (await agent.post('/api/installments/plans').send(plan({ title: 'Mesa', purchaseDate: '2034-01-01', dueDay: 5, installmentsCount: 2, interestPercent: 0, categoryId: undefined }))).body;
    const [first, second] = created.occurrences;
    expect((await post(created.id, first.id)).status).toBe(400);
    expect((await post(created.id, first.id, { categoryId, amount: -2 })).status).toBe(400);
    expect((await post(created.id, first.id, { categoryId, date: 'bad' })).status).toBe(400);
    expect((await post(created.id, first.id, { categoryId, accountId: 'nope' })).status).toBe(400);
    const res = await post(created.id, first.id, { categoryId, amount: 123.45, date: '2034-01-07' });
    expect(res.status).toBe(201);
    expect(res.body.transaction).toMatchObject({ amountMinor: 12345, fecha: '2034-01-07' });
    expect((await post(created.id, 'missing')).status).toBe(404);
    const done = await post(created.id, second.id, { categoryId });
    expect(done.body.plan.status).toBe('completed');
  });

  it('cancels a future occurrence and then the plan keeping posted ones', async () => {
    const created = (await agent.post('/api/installments/plans').send(plan({ title: 'Cama', purchaseDate: '2035-01-01', dueDay: 5, installmentsCount: 3, interestPercent: 0 }))).body;
    const [a, b, c] = created.occurrences;
    const res = await cancel(created.id, b.id);
    expect(res.status).toBe(200);
    expect(res.body.occurrence.status).toBe('cancelled');
    expect((await cancel(created.id, b.id)).status).toBe(409);
    expect((await post(created.id, b.id)).status).toBe(409);
    await post(created.id, a.id);
    const cancelled = await agent.post(`/api/installments/plans/${created.id}/cancel`).send({});
    expect(cancelled.body.status).toBe('cancelled');
    const occs = (await agent.get(`/api/installments/plans/${created.id}/occurrences`)).body;
    expect(occs.map(o => o.status)).toEqual(['posted', 'cancelled', 'cancelled']);
    expect((await agent.post(`/api/installments/plans/${created.id}/cancel`).send({})).status).toBe(409);
    expect((await post(created.id, c.id)).status).toBe(409);
    expect((await agent.get('/api/installments/occurrences?month=2035-03')).body).toHaveLength(0);
  });

  it('marks a plan completed when its last scheduled occurrence is cancelled after a posting', async () => {
    const created = (await agent.post('/api/installments/plans').send(plan({ title: 'Silla', purchaseDate: '2036-01-01', dueDay: 5, installmentsCount: 2, interestPercent: 0 }))).body;
    await post(created.id, created.occurrences[0].id);
    const res = await cancel(created.id, created.occurrences[1].id);
    expect(res.body.plan.status).toBe('completed');
  });
});
