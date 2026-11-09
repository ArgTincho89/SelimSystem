const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Obligation payment context and owner/tenant ledger impact', () => {
  let db;
  let agent;
  let other;
  let userId;
  let today;
  let categoryId;
  let tenantId;
  let ownerA;
  let ownerB;
  let n = 0;
  let rentedAssetId;

  const account = async (name, extra = {}) => (await agent.post('/api/accounts').send({ nombre: name, tipo: 'checking', currency: 'ARS', saldoInicial: 10000, ...extra })).body.id;
  const asset = async () => (await agent.post('/api/assets').send({ type: 'immovable', name: `Flat ${n += 1}` })).body.id;
  const holder = (assetId, ownerId, percentage, startDate = '2020-01-01') => db.create('assetOwnerships', { assetId, ownerId, startDate, endDate: null, percentage, notes: '' }, userId);
  const create = async (extra = {}) => {
    const response = await agent.post('/api/obligations').send({ title: 'Fee', type: 'other', currencyCode: 'ARS', estimatedAmount: 100, startDate: today, categoryId, ...extra });
    expect(response.status).toBe(201);
    return { obligation: response.body, occurrence: response.body.occurrences[0] };
  };
  const context = (o, occ, who = agent) => who.get(`/api/obligations/${o.id}/occurrences/${occ.id}/payment-context`);
  const pay = (o, occ, body = {}) => agent.post(`/api/obligations/${o.id}/occurrences/${occ.id}/payments`).send({ amount: 100, idempotencyKey: `key-${n += 1}-abcdefgh`, ...body });
  const summary = async () => (await agent.get(`/api/summary?month=${today.slice(0, 7)}`)).body;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    other = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'payctx@test.example', password: '123456', nombre: 'PayCtx User' });
    await other.post('/api/auth/register').send({ email: 'payctx2@test.example', password: '123456', nombre: 'PayCtx Other' });
    userId = db.findUserByName('PayCtx User').id;
    today = ledger.localDateForUser(db, userId);
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Services' })).body.id;
    ownerA = (await agent.post('/api/owners').send({ name: 'Owner A', kind: 'person', roles: ['owner'] })).body.id;
    ownerB = (await agent.post('/api/owners').send({ name: 'Owner B', kind: 'person', roles: ['owner'] })).body.id;
    tenantId = (await agent.post('/api/owners').send({ name: 'Tenant', kind: 'person', roles: ['tenant'] })).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('requires authentication and hides other users data', async () => {
    const { obligation, occurrence } = await create();
    expect((await request(app).get(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payment-context`)).status).toBe(401);
    expect((await context(obligation, occurrence, other)).status).toBe(404);
  });

  it('blocks when the user has no active account in the currency', async () => {
    const { obligation, occurrence } = await create();
    const body = (await context(obligation, occurrence)).body;
    expect(body).toMatchObject({ blocked: true, accountSource: 'none', suggestedAccountId: null, accounts: [] });
    expect(body.blockedReason).toBeTruthy();
  });

  it('suggests the single titular account', async () => {
    const titularAccount = await account('Titular A', { ownerId: ownerA });
    await account('Other');
    const assetId = await asset();
    holder(assetId, ownerA, 100);
    const { obligation, occurrence } = await create({ assetId });
    const body = (await context(obligation, occurrence)).body;
    expect(body).toMatchObject({ accountSource: 'titular', suggestedAccountId: titularAccount, blocked: false, categoryId });
    expect(body.accounts.length).toBeGreaterThan(1);
    expect(body.occurrence).toMatchObject({ id: occurrence.id, currencyCode: 'ARS', remainingAmount: 100 });
  });

  it('ranks co-owners by percentage then earliest start', async () => {
    const accountA = db.findAll('accounts', userId).find(item => item.ownerId === ownerA).id;
    const accountB = await account('Titular B', { ownerId: ownerB });
    const bigger = await asset();
    holder(bigger, ownerA, 40);
    holder(bigger, ownerB, 60);
    const first = await create({ assetId: bigger });
    expect((await context(first.obligation, first.occurrence)).body.suggestedAccountId).toBe(accountB);
    const tie = await asset();
    holder(tie, ownerA, 50, '2022-01-01');
    holder(tie, ownerB, 50, '2021-01-01');
    const second = await create({ assetId: tie });
    expect((await context(second.obligation, second.occurrence)).body.suggestedAccountId).toBe(accountB);
    const tieSameStart = await asset();
    holder(tieSameStart, ownerA, 50);
    holder(tieSameStart, ownerB, 50);
    const primaryA = await agent.put(`/api/accounts/${accountA}`).send({ primary: true });
    expect(primaryA.status).toBe(200);
    const third = await create({ assetId: tieSameStart });
    expect((await context(third.obligation, third.occurrence)).body.suggestedAccountId).toBe(accountA);
  });

  it('ignores titular accounts in another currency and falls back with a warning', async () => {
    const owner = (await agent.post('/api/owners').send({ name: 'Owner USD', kind: 'person', roles: ['owner'] })).body.id;
    await account('USD titular', { ownerId: owner, currency: 'USD' });
    const assetId = await asset();
    holder(assetId, owner, 100);
    const { obligation, occurrence } = await create({ assetId });
    const body = (await context(obligation, occurrence)).body;
    expect(body).toMatchObject({ accountSource: 'fallback', blocked: false });
    expect(body.warning).toBeTruthy();
    expect(body.accounts.every(item => item.currency === 'ARS')).toBe(true);
    expect(body.suggestedAccountId).toBe(body.accounts[0].id);
  });

  it('prefers the explicit obligation account and rejects a wrong-currency account on payment', async () => {
    const explicit = await account('Explicit');
    const usd = await account('USD only', { currency: 'USD' });
    const { obligation, occurrence } = await create({ accountId: explicit });
    expect((await context(obligation, occurrence)).body).toMatchObject({ accountSource: 'explicit', suggestedAccountId: explicit });
    const wrong = await pay(obligation, occurrence, { accountId: usd });
    expect(wrong.status).toBe(400);
  });

  it('blocks tenant-only occurrences with the Resolver hint', async () => {
    const assetId = await asset();
    rentedAssetId = assetId;
    await agent.post('/api/rentals').send({
      assetId, type: 'residential', startDate: '2025-01-01', endDate: '2035-12-31', initialRent: 100, currencyCode: 'ARS',
      periodicity: 'monthly', dueDay: 1, depositAmount: 0, guarantee: '', includedExpenses: [], expenseResponsibility: {}, notes: '', tenantIds: [tenantId], status: 'active'
    });
    const { obligation, occurrence } = await create({ assetId, responsibilityType: 'tenant' });
    const body = (await context(obligation, occurrence)).body;
    expect(body).toMatchObject({ blocked: true, responsibilityType: 'tenant' });
    expect(body.blockedReason).toContain('Resolver');
  });

  it('owner payment reaches Home expenses and savings, accepts an optional method and replays idempotently', async () => {
    const accountId = await account('Payer');
    const before = await summary();
    const { obligation, occurrence } = await create({ accountId, estimatedAmount: 250 });
    const key = 'replay-key-abcdefgh';
    const body = { amount: 250, accountId, idempotencyKey: key, paymentMethod: 'transfer' };
    const paid = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send(body);
    expect(paid.status).toBe(201);
    expect(paid.body.transaction.paymentMethod).toBe('transfer');
    const after = await summary();
    expect(after.gastosNetos - before.gastosNetos).toBe(250);
    expect(after.ahorro - before.ahorro).toBe(-250);
    expect((await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send(body)).body.replayed).toBe(true);
    const changed = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send({ ...body, paymentMethod: 'cash' });
    expect(changed.status).toBe(409);
    expect((await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send({ ...body, idempotencyKey: 'another-key-abcdefgh' })).status).toBe(400);
  });

  it('accepts a stored payment method id and rejects an unknown one', async () => {
    const accountId = await account('Method payer');
    const method = (await agent.post('/api/finance/payment-methods').send({ name: 'Visa', type: 'credit_card' })).body;
    const { obligation, occurrence } = await create({ accountId });
    expect((await pay(obligation, occurrence, { accountId, paymentMethodId: 'missing' })).status).toBe(400);
    const ok = await pay(obligation, occurrence, { accountId, paymentMethodId: method.id });
    expect(ok.status).toBe(201);
    expect(ok.body.transaction.paymentMethodId).toBe(method.id);
  });

  it('allows a partial payment and rejects over-payment', async () => {
    const accountId = await account('Partial payer');
    const { obligation, occurrence } = await create({ accountId });
    expect((await pay(obligation, occurrence, { accountId, amount: 40 })).status).toBe(201);
    expect((await pay(obligation, occurrence, { accountId, amount: 80 })).status).toBe(400);
    const ctx = (await context(obligation, occurrence)).body;
    expect(ctx.occurrence.remainingAmount).toBe(60);
  });

  it('rejects payment on a settled occurrence and blocks its context', async () => {
    const accountId = await account('Settled payer');
    const { obligation, occurrence } = await create({ accountId });
    expect((await pay(obligation, occurrence, { accountId })).status).toBe(201);
    expect((await pay(obligation, occurrence, { accountId, amount: 1 })).status).toBe(400);
    expect((await context(obligation, occurrence)).body.blocked).toBe(true);
  });

  it('tenant resolution leaves expenses and savings untouched', async () => {
    const assetId = rentedAssetId;
    expect(assetId).toBeTruthy();
    const { obligation, occurrence } = await create({ assetId, responsibilityType: 'tenant' });
    const before = await summary();
    const resolved = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/resolution`).send({ tenantEntityId: tenantId, period: today.slice(0, 7), amount: 100 });
    expect(resolved.status).toBe(201);
    const after = await summary();
    expect(after.gastosNetos).toBe(before.gastosNetos);
    expect(after.ahorro).toBe(before.ahorro);
    expect(after.ingresos).toBe(before.ingresos);
  });
});
