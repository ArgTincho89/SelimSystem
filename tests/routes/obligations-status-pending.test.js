const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const { addDaysDateOnly } = require('../../src/utils/recurring');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Obligations: dueState and status=pending', () => {
  let db;
  let agent;
  let today;
  let accountId;
  let categoryId;

  async function create(overrides = {}) {
    const response = await agent.post('/api/obligations').send({
      title: 'Impuesto', type: 'tax', currencyCode: 'EUR', estimatedAmount: 100,
      startDate: today, recurrenceFrequency: null, reminderLeadDays: 3, accountId, categoryId, ...overrides
    });
    expect(response.status).toBe(201);
    return response.body;
  }

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'duestate@test.example', password: '123456', nombre: 'Due State User' });
    const userId = db.findUserByName('Due State User').id;
    today = ledger.localDateForUser(db, userId);
    await agent.get('/api/accounts/setup');
    accountId = (await agent.post('/api/accounts').send({ name: 'Due EUR', currency: 'EUR' })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Taxes' })).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('marks today as due-soon, a past day as overdue and next month as pending', async () => {
    const monthly = await create({ recurrenceFrequency: 'monthly' });
    const detail = (await agent.get(`/api/obligations/${monthly.id}`)).body;
    const first = detail.occurrences.find(item => item.date === today);
    expect(first.dueState).toBe('due-soon');
    const later = detail.occurrences.find(item => item.date.slice(0, 7) > today.slice(0, 7));
    expect(later.dueState).toBe('pending');

    const past = await create({ title: 'Pasada', startDate: addDaysDateOnly(today, -40) });
    const pastDetail = (await agent.get(`/api/obligations/${past.id}`)).body;
    expect(pastDetail.occurrences[0].dueState).toBe('overdue');
  });

  it('marks a fully paid occurrence as paid', async () => {
    const obligation = await create({ title: 'Pagable' });
    const occurrence = (await agent.get(`/api/obligations/${obligation.id}`)).body.occurrences[0];
    const paid = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send({ amount: 100, accountId, categoryId, notes: 'Pago de prueba', idempotencyKey: 'due-state-pay-1' });
    expect(paid.status).toBe(201);
    expect(paid.body.occurrence.dueState).toBe('paid');
  });

  it('filters status=pending to expected, confirmed and partial occurrences', async () => {
    const pending = await create({ title: 'Solo pendiente', startDate: addDaysDateOnly(today, 20) });
    const confirmed = await create({ title: 'Confirmada', startDate: addDaysDateOnly(today, 25) });
    const occurrence = (await agent.get(`/api/obligations/${confirmed.id}`)).body.occurrences[0];
    expect((await agent.post(`/api/obligations/${confirmed.id}/occurrences/${occurrence.id}/confirm`)).status).toBe(200);

    const ids = (await agent.get('/api/obligations').query({ status: 'pending' })).body.map(item => item.id);
    expect(ids).toEqual(expect.arrayContaining([pending.id, confirmed.id]));
  });

  it('excludes obligations whose occurrences are all paid and keeps the other filters', async () => {
    const obligation = await create({ title: 'Toda paga', startDate: today });
    const occurrence = (await agent.get(`/api/obligations/${obligation.id}`)).body.occurrences[0];
    await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send({ amount: 100, accountId, categoryId, notes: 'Pago de prueba', idempotencyKey: 'due-state-pay-2' });
    const pendingIds = (await agent.get('/api/obligations').query({ status: 'pending' })).body.map(item => item.id);
    expect(pendingIds).not.toContain(obligation.id);
    const paidIds = (await agent.get('/api/obligations').query({ status: 'paid' })).body.map(item => item.id);
    expect(paidIds).toContain(obligation.id);
    const activeIds = (await agent.get('/api/obligations').query({ status: 'active' })).body.map(item => item.id);
    expect(activeIds).toContain(obligation.id);
  });
});
