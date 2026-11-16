const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const ledger = require('../../src/services/account-ledger');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

describe('Evolutivo 6 log filters and undoable (obligations)', () => {
  let db;
  let agent;
  let userId;
  let today;
  let month;
  let accountId;
  let categoryId;
  let otherCategoryId;
  let assetA;
  let assetB;
  let ownerA;
  let tenantId;
  let counter = 0;

  const logs = async (query = '') => (await agent.get(`/api/activity-logs?limit=200${query}`)).body;
  const create = async (extra = {}) => {
    const response = await agent.post('/api/obligations').send({
      title: 'Expensas', type: 'other', currencyCode: 'ARS', estimatedAmount: 1000, startDate: today, accountId, categoryId, assetId: assetA, ...extra
    });
    expect(response.status).toBe(201);
    return { obligation: response.body, occurrence: response.body.occurrences[0] };
  };
  const base = (obligation, occurrence) => `/api/obligations/${obligation.id}/occurrences/${occurrence.id}`;
  const pay = (obligation, occurrence) => { counter += 1; return agent.post(`${base(obligation, occurrence)}/payments`).send({ amount: 1000, notes: 'ok', idempotencyKey: `e6-filters-key-${counter}` }); };
  const resolve = (obligation, occurrence) => agent.post(`${base(obligation, occurrence)}/resolution`).send({ tenantEntityId: tenantId, period: month, amount: 1000, notes: 'ok' });

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    app.locals.documentStorage = new DiskDocumentStorage(TEMP_DATA_DIR);
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'e6-filters@test.example', password: '123456', nombre: 'E6 Filters' });
    userId = db.findUserByName('E6 Filters').id;
    today = ledger.localDateForUser(db, userId);
    month = today.slice(0, 7);
    await agent.get('/api/accounts/setup');
    accountId = (await agent.post('/api/accounts').send({ name: 'ARS account', currency: 'ARS', initialBalance: 1000000 })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Building' })).body.id;
    otherCategoryId = (await agent.post('/api/categories').send({ nombre: 'Other' })).body.id;
    assetA = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Flat A' })).body.id;
    assetB = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Flat B' })).body.id;
    ownerA = (await agent.post('/api/owners').send({ name: 'Holder', kind: 'person', roles: ['owner'] })).body.id;
    tenantId = (await agent.post('/api/owners').send({ name: 'Tenant', kind: 'person', roles: ['tenant'] })).body.id;
    expect((await agent.post(`/api/assets/${assetA}/ownerships`).send({ ownerId: ownerA, startDate: '2020-01-01', percentage: 100 })).status).toBe(201);
  });

  afterAll(() => cleanupTestDb());

  it('filters by asset, owner, tenant and category with AND semantics and excludes legacy rows', async () => {
    db.create('activityLogs', { timestamp: '2020-01-01T00:00:00.000Z', method: 'POST', route: '/x', action: 'generic', outcome: 'success', statusCode: 200, message: 'Legacy' }, userId);
    const a = await create();
    await pay(a.obligation, a.occurrence);
    const b = await create({ assetId: assetB, categoryId: otherCategoryId });
    await pay(b.obligation, b.occurrence);
    const t = await create({ responsibilityType: 'tenant' });
    expect((await resolve(t.obligation, t.occurrence)).status).toBe(201);
    const all = await logs();
    expect(all.items.some(item => item.message === 'Legacy')).toBe(true);

    const byAsset = await logs(`&assetId=${assetA}`);
    expect(byAsset.items.length).toBeGreaterThan(0);
    expect(byAsset.items.every(item => item.assetId === assetA)).toBe(true);
    expect(byAsset.items.some(item => item.message === 'Legacy')).toBe(false);

    const byOwner = await logs(`&ownerId=${ownerA}`);
    expect(byOwner.items.every(item => item.ownerIds.includes(ownerA))).toBe(true);
    expect(byOwner.items.length).toBeGreaterThan(0);
    expect(byOwner.items.every(item => item.assetId === assetA)).toBe(true);

    const byTenant = await logs(`&tenantId=${tenantId}`);
    expect(byTenant.items).toHaveLength(1);
    expect(byTenant.items[0].undo.type).toBe('obligation.resolution');

    expect((await logs(`&assetId=${assetA}&tenantId=${tenantId}`)).items).toHaveLength(1);
    expect((await logs(`&assetId=${assetB}&tenantId=${tenantId}`)).items).toHaveLength(0);
    const byCategory = await logs(`&categoryId=${otherCategoryId}`);
    expect(byCategory.items.length).toBeGreaterThan(0);
    expect(byCategory.items.every(item => item.categoryId === otherCategoryId)).toBe(true);
    expect((await logs(`&assetId=${assetB}&categoryId=${categoryId}`)).items).toHaveLength(0);
  });

  it('filters before paginating', async () => {
    const page = await logs(`&assetId=${assetA}`);
    const small = (await agent.get(`/api/activity-logs?limit=2&assetId=${assetA}`)).body;
    expect(small.items).toHaveLength(2);
    expect(small.items.every(item => item.assetId === assetA)).toBe(true);
    expect(small.nextBefore).toBe(page.items.length > 2 ? small.items[1].timestamp : null);
    const next = (await agent.get(`/api/activity-logs?limit=200&assetId=${assetA}&before=${encodeURIComponent(small.nextBefore)}`)).body;
    expect(next.items.length + 2).toBe(page.items.length);
  });

  it('returns every entry when no filter is sent or the filters are blank', async () => {
    const plain = await logs();
    const blank = await logs('&assetId=&ownerId=&tenantId=&categoryId=');
    expect(blank.items.map(item => item.id)).toEqual(plain.items.map(item => item.id));
    expect(plain.items.every(item => typeof item.undoable === 'boolean')).toBe(true);
  });

  it.each([
    ['too long', `assetId=${'x'.repeat(101)}`],
    ['repeated', 'assetId=a&assetId=b'],
    ['object', 'ownerId[a]=1']
  ])('rejects a %s filter with 400 "Filtro inválido"', async (_name, query) => {
    const response = await agent.get(`/api/activity-logs?${query}`);
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Filtro inválido');
  });

  it('computes undoable for a payment and turns it off after the undo', async () => {
    const { obligation, occurrence } = await create();
    const paid = await pay(obligation, occurrence);
    const entryOf = async () => (await logs()).items.find(item => item.undo && item.undo.transactionId === paid.body.transaction.id);
    expect((await entryOf()).undoable).toBe(true);
    const reverted = await agent.post(`${base(obligation, occurrence)}/payments/${paid.body.transaction.id}/revert`).send({ reason: 'Error' });
    expect(reverted.status).toBe(200);
    expect((await entryOf()).undoable).toBe(false);
  });

  it('computes undoable for a resolution and turns it off after it is voided', async () => {
    const { obligation, occurrence } = await create({ responsibilityType: 'tenant' });
    const resolved = await resolve(obligation, occurrence);
    const entryOf = async () => (await logs()).items.find(item => item.undo && item.undo.resolutionId === resolved.body.resolution.id);
    expect((await entryOf()).undoable).toBe(true);
    expect((await agent.delete(`${base(obligation, occurrence)}/resolution`).send({ reason: 'Error' })).status).toBe(200);
    expect((await entryOf()).undoable).toBe(false);
  });

  it('never marks failed entries or entries without descriptor as undoable', async () => {
    const failed = await agent.post(`${base((await create()).obligation, { id: 'missing' })}/payments`).send({});
    expect(failed.status).toBe(404);
    const items = (await logs()).items;
    expect(items.filter(item => item.outcome === 'failure').every(item => item.undoable === false)).toBe(true);
    expect(items.filter(item => !item.undo).every(item => item.undoable === false)).toBe(true);
  });

  it('only returns the own entries when filtering by an id of another user', async () => {
    const other = request.agent(app);
    await other.post('/api/auth/register').send({ email: 'e6-filters-other@test.example', password: '123456', nombre: 'E6 Filters Other' });
    const response = await other.get(`/api/activity-logs?assetId=${assetA}`);
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(0);
  });
});

describe('Evolutivo 6 log filters and undoable (rent collections)', () => {
  let f;
  beforeAll(async () => { f = await setupRentFixture('e6-logfilters-rent'); });
  afterAll(() => cleanupTestDb());

  it('is undoable while the collection is active and filters by tenant', async () => {
    const contract = await f.createContract();
    const collected = await f.collect(contract, ['2025-01-01']);
    const list = async query => (await f.agent.get(`/api/activity-logs?limit=200${query}`)).body.items;
    const entry = (await list(`&tenantId=${f.tenantId}`)).find(item => item.undo && item.undo.type === 'rental.collection');
    expect(entry).toMatchObject({ undoable: true, undo: { collectionId: collected.body.id } });
    expect((await f.agent.post(`/api/rentals/collections/${collected.body.id}/reverse`).send({ reason: 'Prueba' })).status).toBe(200);
    expect((await list(`&assetId=${f.assetId}`)).find(item => item.id === entry.id).undoable).toBe(false);
  });
});
