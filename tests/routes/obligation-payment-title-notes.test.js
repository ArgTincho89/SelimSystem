const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Obligation payment: title, notes and suggested payment method', () => {
  let db;
  let agent;
  let userId;
  let today;
  let categoryId;
  let accountId;
  let methodId;
  let n = 0;

  const create = async (extra = {}) => {
    const response = await agent.post('/api/obligations').send({ title: 'Impuesto municipal', type: 'tax', currencyCode: 'ARS', estimatedAmount: 100, startDate: today, categoryId, accountId, ...extra });
    expect(response.status).toBe(201);
    return { obligation: response.body, occurrence: response.body.occurrences[0] };
  };
  const pay = (o, occ, body = {}) => agent.post(`/api/obligations/${o.id}/occurrences/${occ.id}/payments`)
    .send({ amount: 10, idempotencyKey: `title-notes-${n += 1}-abcdefgh`, accountId, categoryId, ...body });

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'paytitle@test.example', password: '123456', nombre: 'PayTitle User' });
    userId = db.findUserByName('PayTitle User').id;
    today = ledger.localDateForUser(db, userId);
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Taxes' })).body.id;
    accountId = (await agent.post('/api/accounts').send({ nombre: 'Caja', tipo: 'checking', currency: 'ARS', saldoInicial: 10000 })).body.id;
    methodId = (await agent.post('/api/finance/payment-methods').send({ name: 'Visa', type: 'credit_card', accountId, lastFour: '1234' })).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('stores the given title and notes on the payment transaction', async () => {
    const { obligation, occurrence } = await create();
    const response = await pay(obligation, occurrence, { title: 'Tasa de noviembre', notes: 'Pagado en ventanilla' });
    expect(response.status).toBe(201);
    expect(response.body.transaction).toMatchObject({ titulo: 'Tasa de noviembre', comments: 'Pagado en ventanilla' });
  });

  it('defaults the title to the obligation title and the notes to empty', async () => {
    const { obligation, occurrence } = await create({ title: 'Seguro hogar' });
    const response = await pay(obligation, occurrence);
    expect(response.status).toBe(201);
    expect(response.body.transaction.titulo).toBe('Seguro hogar');
    expect(response.body.transaction.comments).toBe('');
    const blank = await pay(obligation, occurrence, { title: '   ', notes: '' });
    expect(blank.body.transaction.titulo).toBe('Seguro hogar');
  });

  it('rejects a title over 100 characters and notes over 1000', async () => {
    const { obligation, occurrence } = await create();
    expect((await pay(obligation, occurrence, { title: 'x'.repeat(101) })).status).toBe(400);
    expect((await pay(obligation, occurrence, { notes: 'x'.repeat(1001) })).status).toBe(400);
    expect((await pay(obligation, occurrence, { title: 5 })).status).toBe(400);
    expect((await pay(obligation, occurrence, { title: 'x'.repeat(100), notes: 'y'.repeat(1000) })).status).toBe(201);
  });

  it('replays with the same title and rejects the same key with another title', async () => {
    const { obligation, occurrence } = await create();
    const body = { title: 'Primero', notes: 'a', idempotencyKey: 'title-replay-key-12345' };
    expect((await pay(obligation, occurrence, body)).status).toBe(201);
    const replay = await pay(obligation, occurrence, body);
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect((await pay(obligation, occurrence, { ...body, title: 'Otro' })).status).toBe(409);
    expect((await pay(obligation, occurrence, { ...body, notes: 'b' })).status).toBe(409);
  });

  it('suggests the obligation payment method in the payment context, or null', async () => {
    const withMethod = await create({ paymentMethodId: methodId });
    const context = (await agent.get(`/api/obligations/${withMethod.obligation.id}/occurrences/${withMethod.occurrence.id}/payment-context`)).body;
    expect(context.suggestedPaymentMethodId).toBe(methodId);
    const without = await create({ title: 'Sin medio' });
    const empty = (await agent.get(`/api/obligations/${without.obligation.id}/occurrences/${without.occurrence.id}/payment-context`)).body;
    expect(empty.suggestedPaymentMethodId).toBeNull();
  });
});
