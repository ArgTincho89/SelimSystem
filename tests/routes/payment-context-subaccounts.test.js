const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Sub-accounts: balances, summary, ranking and assignment', () => {
  let db;
  let agent;
  let userId;
  let today;
  let parent;
  let usdChild;
  let arsChild;
  let owner;
  let categoryId;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({ email: 'subctx@test.example', password: '123456', nombre: 'SubCtx User' });
    userId = reg.body.id;
    today = ledger.localDateForUser(db, userId);
    categoryId = (await agent.post('/api/categories').send({ nombre: 'General' })).body.id;
    owner = (await agent.post('/api/owners').send({ name: 'Owner', kind: 'person', roles: ['owner'] })).body;
    parent = (await agent.post('/api/accounts').send({ name: 'Banco', currency: 'ARS', ownerId: owner.id })).body;
    usdChild = (await agent.post('/api/accounts').send({ name: 'Caja USD', currency: 'USD', parentId: parent.id })).body;
    arsChild = (await agent.post('/api/accounts').send({ name: 'Caja ARS', currency: 'ARS', parentId: parent.id })).body;
    for (const acc of [parent, usdChild, arsChild]) {
      await agent.post(`/api/accounts/${acc.id}/reconcile`).send({ openingBalance: 0, openingDate: today, includedMovementIds: [] });
    }
  });
  afterAll(() => cleanupTestDb());

  const tx = body => agent.post('/api/transactions').send({ titulo: 't', fecha: today, categoryId, ...body });

  it('keeps per-account balances without roll-up and orders parent then children', async () => {
    expect((await tx({ tipo: 'income', monto: 100, accountId: usdChild.id })).status).toBe(201);
    expect((await tx({ tipo: 'income', monto: 50, accountId: arsChild.id })).status).toBe(201);
    expect((await tx({ tipo: 'expense', monto: 20, accountId: arsChild.id })).status).toBe(201);
    expect((await tx({ tipo: 'income', monto: 1000, accountId: parent.id })).status).toBe(201);
    const list = (await agent.get('/api/accounts')).body;
    const byId = Object.fromEntries(list.map(item => [item.id, item]));
    expect(byId[usdChild.id]).toMatchObject({ balance: 100, currency: 'USD', parentId: parent.id });
    expect(byId[arsChild.id].balance).toBe(30);
    expect(byId[parent.id].balance).toBe(1000);
    const ids = list.map(item => item.id);
    const i = ids.indexOf(parent.id);
    expect(new Set(ids.slice(i + 1, i + 3))).toEqual(new Set([usdChild.id, arsChild.id]));
  });

  it('counts each movement once in the summary', async () => {
    const body = (await agent.get(`/api/summary?month=${today.slice(0, 7)}`)).body;
    expect(body.currencyTotals.find(item => item.currency === 'USD').income).toBe(100);
    expect(body.currencyTotals.find(item => item.currency === 'ARS').income).toBe(1050);
  });

  it('accepts refunds on sub-accounts and takes the sub-account currency', async () => {
    const refund = await tx({ tipo: 'refund', monto: 5, accountId: usdChild.id });
    expect(refund.status).toBe(201);
    expect(refund.body.currencyCode).toBe('USD');
  });

  it('ranks top-level accounts before sub-accounts in the occurrence currency', async () => {
    const category = (await agent.post('/api/categories').send({ nombre: 'Services' })).body.id;
    const asset = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Flat' })).body.id;
    db.create('assetOwnerships', { assetId: asset, ownerId: owner.id, startDate: '2020-01-01', endDate: null, percentage: 100, notes: '' }, userId);
    const other = (await agent.post('/api/accounts').send({ name: 'Otra', currency: 'USD' })).body;
    const created = await agent.post('/api/obligations').send({ title: 'Fee', type: 'other', currencyCode: 'USD', estimatedAmount: 100, startDate: today, categoryId: category, assetId: asset });
    expect(created.status).toBe(201);
    const ctx = (await agent.get(`/api/obligations/${created.body.id}/occurrences/${created.body.occurrences[0].id}/payment-context`)).body;
    expect(ctx.accounts.map(item => item.id)).toEqual([other.id, usdChild.id]);
    expect(ctx.suggestedAccountId).toBe(usdChild.id);
    expect(ctx.accounts.find(item => item.id === usdChild.id).parentId).toBe(parent.id);
    expect(ctx.accountSource).toBe('titular');
  });
});
