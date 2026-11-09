const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Party fields on /api/owners', () => {
  let agent;
  let db;
  let userId;
  let category;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'party@test.example', password: '123456', nombre: 'Party User' });
    userId = db.findAll('users')[0].id;
    category = db.create('categories', { nombre: 'Impuesto municipal', orden: 1 }, userId);
  });

  afterAll(() => cleanupTestDb());

  it('derives and persists the name of a person', async () => {
    const res = await agent.post('/api/owners').send({ kind: 'person', firstName: ' Ana ', lastName: 'Pérez', dni: '12.345.678', roles: ['owner'] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Ana Pérez', firstName: 'Ana', lastName: 'Pérez', dni: '12.345.678' });
    const edited = await agent.put(`/api/owners/${res.body.id}`).send({ lastName: 'Gómez' });
    expect(edited.body.name).toBe('Ana Gómez');
  });

  it('validates person fields', async () => {
    expect((await agent.post('/api/owners').send({ kind: 'person', firstName: ' ', lastName: 'X' })).status).toBe(400);
    expect((await agent.post('/api/owners').send({ kind: 'person', firstName: 'a'.repeat(81), lastName: 'X' })).status).toBe(400);
    expect((await agent.post('/api/owners').send({ kind: 'person', firstName: 'A', lastName: 'B', dni: '12a' })).status).toBe(400);
    expect((await agent.post('/api/owners').send({ kind: 'person', firstName: 'A', lastName: 'B'.repeat(81) })).status).toBe(400);
  });

  it('keeps the organization name as razon social', async () => {
    const res = await agent.post('/api/owners').send({ kind: 'entity', name: 'Municipalidad de Córdoba', taxIdentification: '30-1', roles: ['provider'] });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Municipalidad de Córdoba');
    expect(res.body.firstName).toBeUndefined();
  });

  it('leaves legacy name-only records untouched', async () => {
    const legacy = db.create('legalOwners', { name: 'Juan Gómez', kind: 'person', roles: ['owner'] }, userId);
    const read = await agent.get(`/api/owners/${legacy.id}`);
    expect(read.body).toMatchObject({ name: 'Juan Gómez' });
    expect(read.body.firstName).toBeUndefined();
    const updated = await agent.put(`/api/owners/${legacy.id}`).send({ phone: '123' });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Juan Gómez');
  });

  it('uses the same fields for tenants', async () => {
    const res = await agent.post('/api/owners').send({ kind: 'person', firstName: 'Luis', lastName: 'Paz', email: 'l@x.com', roles: ['tenant'] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Luis Paz', roles: ['tenant'] });
  });

  it('stores the expense category on providers and rejects unknown ones', async () => {
    const ok = await agent.post('/api/owners').send({ kind: 'entity', name: 'Muni', roles: ['provider'], expenseCategoryId: category.id });
    expect(ok.status).toBe(201);
    expect(ok.body.expenseCategoryId).toBe(category.id);
    const unknown = await agent.post('/api/owners').send({ kind: 'entity', name: 'Muni2', roles: ['provider'], expenseCategoryId: 'nope' });
    expect(unknown.status).toBe(400);
    const notProvider = await agent.post('/api/owners').send({ kind: 'entity', name: 'Muni3', roles: ['owner'], expenseCategoryId: category.id });
    expect(notProvider.status).toBe(400);
    const cleared = await agent.put(`/api/owners/${ok.body.id}`).send({ expenseCategoryId: null });
    expect(cleared.body.expenseCategoryId).toBeNull();
  });

  it('allows a party in two roles and clears person fields when switching to organization', async () => {
    const res = await agent.post('/api/owners').send({ kind: 'person', firstName: 'Eva', lastName: 'Ruiz', roles: ['owner', 'tenant'] });
    expect(res.body.roles).toEqual(['owner', 'tenant']);
    const org = await agent.put(`/api/owners/${res.body.id}`).send({ kind: 'entity', name: 'Eva SA' });
    expect(org.body).toMatchObject({ name: 'Eva SA', firstName: null, lastName: null, dni: null });
  });

  it('blocks deleting a referenced party and deletes free ones', async () => {
    const titular = (await agent.post('/api/owners').send({ kind: 'person', firstName: 'Tito', lastName: 'Lar', roles: ['owner'] })).body;
    db.create('accounts', { name: 'Cta', ownerId: titular.id }, userId);
    const blocked = await agent.delete(`/api/owners/${titular.id}`);
    expect(blocked.status).toBe(409);
    expect((await agent.get(`/api/owners/${titular.id}`)).status).toBe(200);
    const free = (await agent.post('/api/owners').send({ kind: 'person', firstName: 'Libre', lastName: 'Uno', roles: ['owner'] })).body;
    expect((await agent.delete(`/api/owners/${free.id}`)).status).toBe(200);
    expect((await agent.delete(`/api/owners/${free.id}`)).status).toBe(404);
  });
});
