const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Asset ownership overlap validation', () => {
  let agent;
  let a;
  let b;
  const newAsset = async (ownerships = []) => agent.post('/api/assets').send({ type: 'movable', name: 'Item', ownerships });
  const add = (assetId, body) => agent.post(`/api/assets/${assetId}/ownerships`).send(body);

  beforeAll(async () => {
    app.locals.db = setupTestDb();
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'ovl@test.example', password: '123456', nombre: 'Ovl User' });
    a = (await agent.post('/api/owners').send({ name: 'Holder A', kind: 'person', roles: ['owner'] })).body.id;
    b = (await agent.post('/api/owners').send({ name: 'Holder B', kind: 'person', roles: ['owner'] })).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('allows concurrent co-owners', async () => {
    const asset = (await newAsset([{ ownerId: a, startDate: '2024-01-01', percentage: 50 }])).body;
    expect((await add(asset.id, { ownerId: b, startDate: '2024-01-01', percentage: 50 })).status).toBe(201);
  });

  it('rejects same-holder overlap, open-ended overlap and boundary day', async () => {
    const closed = (await newAsset([{ ownerId: a, startDate: '2024-01-01', endDate: '2024-12-31' }])).body;
    expect((await add(closed.id, { ownerId: a, startDate: '2024-06-01', endDate: '2024-08-31' })).status).toBe(400);
    expect((await add(closed.id, { ownerId: a, startDate: '2025-01-01' })).status).toBe(201);
    const open = (await newAsset([{ ownerId: a, startDate: '2024-01-01' }])).body;
    expect((await add(open.id, { ownerId: a, startDate: '2025-01-01' })).status).toBe(400);
    const edge = (await newAsset([{ ownerId: a, startDate: '2024-01-01', endDate: '2024-06-30' }])).body;
    expect((await add(edge.id, { ownerId: a, startDate: '2024-06-30' })).status).toBe(400);
  });

  it('enforces the 100% cap and allows it after a period closes', async () => {
    const asset = (await newAsset([{ ownerId: a, startDate: '2024-01-01', percentage: 60 }])).body;
    expect((await add(asset.id, { ownerId: b, startDate: '2024-06-01', percentage: 50 })).status).toBe(400);
    const closed = (await newAsset([{ ownerId: a, startDate: '2024-01-01', endDate: '2024-12-31', percentage: 100 }])).body;
    expect((await add(closed.id, { ownerId: b, startDate: '2025-01-01', percentage: 100 })).status).toBe(201);
  });

  it('validates batch creation', async () => {
    expect((await newAsset([{ ownerId: a, startDate: '2024-01-01', endDate: '2024-12-31' }, { ownerId: a, startDate: '2024-06-01' }])).status).toBe(400);
    expect((await newAsset([{ ownerId: a, startDate: '2024-01-01', percentage: 50 }, { ownerId: b, startDate: '2024-01-01', percentage: 50 }])).status).toBe(201);
  });

  it('allows closing a period without overlap rejection', async () => {
    const asset = (await newAsset([{ ownerId: a, startDate: '2024-01-01', percentage: 60 }])).body;
    const second = (await add(asset.id, { ownerId: b, startDate: '2024-06-01', percentage: 40 })).body;
    expect((await agent.patch(`/api/assets/${asset.id}/ownerships/${second.id}`).send({ endDate: '2024-12-31' })).status).toBe(200);
    const first = asset.ownerships[0];
    expect((await agent.patch(`/api/assets/${asset.id}/ownerships/${first.id}`).send({ endDate: '2024-12-31' })).status).toBe(200);
  });

  it('allows closing a period on legacy data that already violates a rule', async () => {
    const asset = (await newAsset([{ ownerId: a, startDate: '2024-01-01', percentage: 80 }])).body;
    const me = (await agent.get('/api/auth/me')).body;
    const userId = me.id || me.user?.id;
    // Legacy record written directly, bypassing validation: 80% + 80% concurrent.
    const legacy = app.locals.db.create('assetOwnerships', { assetId: asset.id, ownerId: b, startDate: '2024-01-01', endDate: null, percentage: 80, notes: '' }, userId);
    expect((await agent.patch(`/api/assets/${asset.id}/ownerships/${legacy.id}`).send({ endDate: '2024-03-31' })).status).toBe(200);
  });
});
