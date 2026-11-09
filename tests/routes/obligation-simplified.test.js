const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Obligation without payment method', () => {
  let db;
  let agent;
  let userId;
  let today;
  let accountId;
  let categoryId;
  let providerId;
  const base = () => ({ title: 'Water', type: 'utility', currencyCode: 'ARS', estimatedAmount: 100, startDate: today });
  const pay = (obligationId, occurrenceId, extra = {}) => agent.post(`/api/obligations/${obligationId}/occurrences/${occurrenceId}/payments`)
    .send({ amount: 100, accountId, idempotencyKey: `key-${Math.random()}-abcdef`, ...extra });
  const firstOccurrence = async id => (await agent.get(`/api/obligations/${id}`)).body.occurrences[0];

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'simple@test.example', password: '123456', nombre: 'Simple User' });
    userId = db.findUserByName('Simple User').id;
    today = ledger.localDateForUser(db, userId);
    accountId = (await agent.post('/api/accounts').send({ nombre: 'Main', tipo: 'checking', currency: 'ARS', saldoInicial: 1000 })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Services' })).body.id;
    providerId = (await agent.post('/api/owners').send({ name: 'Utility Co', kind: 'entity', roles: ['provider'], expenseCategoryId: categoryId })).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('creates an obligation without paymentMethod', async () => {
    const response = await agent.post('/api/obligations').send(base());
    expect(response.status).toBe(201);
    expect(response.body.paymentMethod || '').toBe('');
  });

  it('updates an obligation without paymentMethod and keeps a legacy stored value', async () => {
    const legacy = db.create('obligations', { ...base(), status: 'active', reminderLeadDays: 7, notes: '', recurrenceFrequency: null, endDate: null, paymentMethod: 'card' }, userId);
    const response = await agent.put(`/api/obligations/${legacy.id}`).send({ title: 'Water renamed' });
    expect(response.status).toBe(200);
    expect(response.body.paymentMethod).toBe('card');
    const noMethod = db.create('obligations', { ...base(), status: 'active', reminderLeadDays: 7, notes: '', recurrenceFrequency: null, endDate: null }, userId);
    expect((await agent.put(`/api/obligations/${noMethod.id}`).send({ title: 'No method' })).status).toBe(200);
  });

  it('does not copy a legacy payment method into the payment transaction', async () => {
    const legacy = db.create('obligations', { ...base(), categoryId, status: 'active', reminderLeadDays: 7, notes: '', recurrenceFrequency: null, endDate: null, paymentMethod: 'card' }, userId);
    const occurrence = await firstOccurrence(legacy.id);
    const response = await pay(legacy.id, occurrence.id);
    expect(response.status).toBe(201);
    expect(response.body.transaction.paymentMethod).toBe('');
    expect(response.body.transaction.paymentMethodId).toBeNull();
  });

  it('falls back to the provider category when the obligation has none', async () => {
    const created = await agent.post('/api/obligations').send({ ...base(), providerEntityId: providerId });
    const occurrence = await firstOccurrence(created.body.id);
    const response = await pay(created.body.id, occurrence.id);
    expect(response.status).toBe(201);
    expect(response.body.transaction.categoryId).toBe(categoryId);
  });

  it('still requires a category when neither the obligation nor the provider has one', async () => {
    const created = await agent.post('/api/obligations').send(base());
    const occurrence = await firstOccurrence(created.body.id);
    expect((await pay(created.body.id, occurrence.id)).status).toBe(400);
  });

  it('edits an obligation with payments using a future effective date', async () => {
    const created = await agent.post('/api/obligations').send({ ...base(), categoryId });
    const occurrence = await firstOccurrence(created.body.id);
    expect((await pay(created.body.id, occurrence.id)).status).toBe(201);
    expect((await agent.put(`/api/obligations/${created.body.id}`).send({ notes: 'x' })).status).toBe(409);
    const future = new Date(`${today}T00:00:00Z`);
    future.setUTCDate(future.getUTCDate() + 5);
    const response = await agent.put(`/api/obligations/${created.body.id}`).send({ notes: 'x', effectiveFromDate: future.toISOString().slice(0, 10) });
    expect(response.status).toBe(200);
  });
});
