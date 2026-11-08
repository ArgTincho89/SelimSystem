const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Assets and legal owners routes', () => {
  let db;
  let agent;
  let otherAgent;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    otherAgent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'assets@test.com', password: '123456', nombre: 'Asset User' });
    await otherAgent.post('/api/auth/register').send({ email: 'other-assets@test.com', password: '123456', nombre: 'Other User' });
  });

  afterAll(() => cleanupTestDb());

  it('requires authentication for assets and legal owners', async () => {
    expect((await request(app).get('/api/assets')).status).toBe(401);
    expect((await request(app).get('/api/owners')).status).toBe(401);
  });

  it('creates and lists scoped person/entity owner records', async () => {
    const created = await agent.post('/api/owners').send({ name: 'Avery Family Trust', kind: 'entity' });
    expect(created.status).toBe(201);
    expect(created.body.kind).toBe('entity');
    expect((await agent.get('/api/owners')).body.map(item => item.id)).toContain(created.body.id);
    expect((await otherAgent.get('/api/owners')).body).toEqual([]);
    expect((await agent.post('/api/owners').send({ name: 'Invalid', kind: 'company' })).status).toBe(400);
  });

  it('creates immovable assets with ownership and returns detail histories', async () => {
    const owner = await agent.post('/api/owners').send({ name: 'Jordan Lee', kind: 'person' });
    const created = await agent.post('/api/assets').send({
      type: 'immovable', name: 'North House', propertyType: 'Townhouse', usageStatus: 'family_home',
      address: '12 Example Road', locality: 'Northfield', province: 'Central', country: 'Exampleland', area: 142.5,
      acquisitionDate: '2021-06-15', acquisitionValue: 250000, status: 'active',
      ownerships: [{ ownerId: owner.body.id, percentage: 60, startDate: '2021-06-15', notes: 'Initial owner' }]
    });
    expect(created.status).toBe(201);
    expect(created.body.type).toBe('immovable');
    expect(created.body.usageStatus).toBe('family_home');
    expect(created.body.ownerships[0].owner.name).toBe('Jordan Lee');
    expect(created.body.statusHistory).toHaveLength(1);
    expect((await agent.get(`/api/assets/${created.body.id}`)).body.address).toBe('12 Example Road');
  });

  it('validates percentages and rejects owner IDs from another user', async () => {
    const localOwner = await agent.post('/api/owners').send({ name: 'Local Owner', kind: 'person' });
    const owner = await otherAgent.post('/api/owners').send({ name: 'Private Owner', kind: 'person' });
    const invalidPercentage = await agent.post('/api/assets').send({
      type: 'movable', name: 'Invalid Ownership', ownerships: [{ ownerId: localOwner.body.id, percentage: 101 }]
    });
    expect(invalidPercentage.status).toBe(400);
    const crossUser = await agent.post('/api/assets').send({
      type: 'movable', name: 'Cross User', ownerships: [{ ownerId: owner.body.id }]
    });
    expect(crossUser.status).toBe(400);
  });

  it('keeps movable details extensible while rejecting sensitive detail keys', async () => {
    const created = await agent.post('/api/assets').send({
      type: 'movable', name: 'Camera', subtype: 'camera', details: { brand: 'Example', lensCount: 2 }
    });
    expect(created.status).toBe(201);
    expect(created.body.details.brand).toBe('Example');
    const rejected = await agent.post('/api/assets').send({
      type: 'movable', name: 'Sensitive Details', details: { cardNumber: '1234' }
    });
    expect(rejected.status).toBe(400);
  });

  it('preserves status and ownership history and supports asset filters', async () => {
    const owner = await agent.post('/api/owners').send({ name: 'Filter Owner', kind: 'entity' });
    const asset = await agent.post('/api/assets').send({
      type: 'immovable', name: 'Rental Flat', propertyType: 'Flat', usageStatus: 'rented', locality: 'Lakeside',
      ownerships: [{ ownerId: owner.body.id, startDate: '2022-01-01' }]
    });
    const ownership = asset.body.ownerships[0];
    await agent.patch(`/api/assets/${asset.body.id}/ownerships/${ownership.id}`).send({ endDate: '2024-12-31' });
    await agent.post(`/api/assets/${asset.body.id}/ownerships`).send({ ownerId: owner.body.id, startDate: '2025-01-01' });
    const updated = await agent.put(`/api/assets/${asset.body.id}`).send({ status: 'sold', statusNotes: 'Sale recorded' });
    expect(updated.body.statusHistory.map(event => event.status)).toEqual(['active', 'sold']);
    expect(updated.body.ownerships.map(item => item.endDate || null)).toEqual(['2024-12-31', null]);
    expect((await agent.get('/api/assets').query({ type: 'immovable', ownerId: owner.body.id, status: 'sold', usage: 'rented', location: 'Lake' })).body).toHaveLength(1);
    expect((await otherAgent.get(`/api/assets/${asset.body.id}`)).status).toBe(404);
    expect((await agent.delete(`/api/assets/${asset.body.id}`)).status).toBe(404);
  });
});
