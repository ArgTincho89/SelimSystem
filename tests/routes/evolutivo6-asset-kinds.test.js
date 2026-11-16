const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Evolutivo 6 custom asset kinds', () => {
  let db;
  let agent;
  let other;
  let userId;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    other = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'e6-kinds@test.example', password: '123456', nombre: 'E6 Kinds' });
    await other.post('/api/auth/register').send({ email: 'e6-kinds2@test.example', password: '123456', nombre: 'E6 Kinds Two' });
    userId = db.findUserByName('E6 Kinds').id;
  });
  afterAll(() => cleanupTestDb());

  it('requires authentication', async () => {
    expect((await request(app).get('/api/asset-kinds')).status).toBe(401);
  });

  it('creates and lists a kind, and logs it', async () => {
    const created = await agent.post('/api/asset-kinds').send({ name: 'Local comercial' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Local comercial', key: 'custom-local-comercial' });
    const listed = await agent.get('/api/asset-kinds');
    expect(listed.body.map(kind => kind.key)).toEqual(['custom-local-comercial']);
    const entry = db.findAll('activityLogs', userId).find(item => item.action === 'asset-kind.create');
    expect(entry).toMatchObject({ outcome: 'success' });
    expect(entry.message).toMatch(/^Creaste el tipo de bien/);
  });

  it('rejects blank, too long and duplicate names without storing', async () => {
    expect((await agent.post('/api/asset-kinds').send({ name: '  ' })).status).toBe(400);
    expect((await agent.post('/api/asset-kinds').send({ name: 'x'.repeat(51) })).status).toBe(400);
    const dup = await agent.post('/api/asset-kinds').send({ name: 'local comercial' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('Ese tipo ya existe');
    expect((await agent.post('/api/asset-kinds').send({ name: 'GALPÓN' })).status).toBe(409);
    expect((await agent.get('/api/asset-kinds')).body).toHaveLength(1);
  });

  it('isolates kinds per user', async () => {
    expect((await other.post('/api/asset-kinds').send({ name: 'Cochera' })).status).toBe(201);
    expect((await agent.get('/api/asset-kinds')).body.some(kind => kind.name === 'Cochera')).toBe(false);
    const rejected = await agent.post('/api/assets').send({ type: 'immovable', name: 'Cochera 1', propertyKind: 'custom-cochera' });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toBe('El tipo de inmueble no es válido');
  });

  it('accepts a custom key on create and update; rejects unknown keys', async () => {
    const created = await agent.post('/api/assets').send({ type: 'immovable', name: 'Local 1', propertyKind: 'custom-local-comercial' });
    expect(created.status).toBe(201);
    expect(created.body.propertyKind).toBe('custom-local-comercial');
    const updated = await agent.put(`/api/assets/${created.body.id}`).send({ propertyKind: 'casa' });
    expect(updated.status).toBe(200);
    expect((await agent.put(`/api/assets/${created.body.id}`).send({ propertyKind: 'custom-local-comercial' })).status).toBe(200);
    const unknown = await agent.post('/api/assets').send({ type: 'immovable', name: 'X', propertyKind: 'custom-nope' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toBe('El tipo de inmueble no es válido');
    expect((await agent.post('/api/assets').send({ type: 'immovable', name: 'Casa', propertyKind: 'casa' })).status).toBe(201);
  });
});
