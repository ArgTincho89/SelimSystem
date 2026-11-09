const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Asset cadastral identification, construction date and age', () => {
  let db;
  let agent;
  let userId;
  let owner;

  const form = (asset = {}) => ({ asset: { type: 'immovable', name: 'Casa', propertyKind: 'casa', ...asset }, owners: [{ ownerId: owner.id, percentage: null }] });
  const create = asset => agent.post('/api/assets/form').send(form(asset));

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'cadastral@test.example', password: '123456', nombre: 'Cadastral' });
    userId = db.findUserByName('Cadastral').id;
    owner = db.create('legalOwners', { name: 'Owner', kind: 'person', roles: ['owner'] }, userId);
  });

  afterAll(() => cleanupTestDb());

  it('stores and clears the cadastral text', async () => {
    const res = await create({ cadastralId: '  Circ. II, Secc. B, Mz 12, Parc 4 ' });
    expect(res.status).toBe(201);
    expect(res.body.cadastralId).toBe('Circ. II, Secc. B, Mz 12, Parc 4');
    const put = await agent.put(`/api/assets/${res.body.id}/form`).send(form({ cadastralId: '' }));
    expect(put.status).toBe(200);
    expect(put.body.cadastralId).toBeNull();
  });

  it('accepts an empty cadastral and rejects 101 characters', async () => {
    const empty = await create({});
    expect(empty.status).toBe(201);
    expect(empty.body.cadastralId).toBeNull();
    const long = await create({ cadastralId: 'x'.repeat(101) });
    expect(long.status).toBe(400);
    expect(long.body.error).toMatch(/100/);
    expect((await create({ cadastralId: 'x'.repeat(100) })).status).toBe(201);
  });

  it('returns the age computed from the construction date', async () => {
    const res = await create({ constructionDate: '2010-03-15' });
    expect(res.status).toBe(201);
    expect(res.body.constructionDate).toBe('2010-03-15');
    expect(res.body.age.source).toBe('constructionDate');
    const year = new Date().getUTCFullYear();
    expect([year - 2010, year - 2011]).toContain(res.body.age.years);
    const list = await agent.get('/api/assets');
    expect(list.body.find(item => item.id === res.body.id).age.source).toBe('constructionDate');
  });

  it('rejects future and malformed dates', async () => {
    const future = await create({ constructionDate: '2999-01-01' });
    expect(future.status).toBe(400);
    expect(future.body.error).toBe('La fecha de construcción no puede ser futura');
    expect((await create({ constructionDate: '2020-02-31' })).status).toBe(400);
  });

  it('reports legacy ageYears only when there is no date and keeps it on edit', async () => {
    const asset = db.create('assets', { name: 'Vieja', type: 'immovable', usageStatus: 'vacant', status: 'active', ageYears: 20, condition: 'not_rented' }, userId);
    const got = await agent.get(`/api/assets/${asset.id}`);
    expect(got.body.age).toEqual({ years: 20, source: 'legacy' });
    const put = await agent.put(`/api/assets/${asset.id}/form`).send({ asset: { name: 'Vieja', constructionDate: '2000-06-01' }, owners: [{ ownerId: owner.id, percentage: null }] });
    expect(put.status).toBe(200);
    expect(put.body.age.source).toBe('constructionDate');
    expect(put.body.ageYears).toBe(20);
  });

  it('creates without condition or rental and defaults to not rented', async () => {
    const res = await create({});
    expect(res.status).toBe(201);
    expect(res.body.condition).toBe('not_rented');
    expect(res.body.activeContract).toBeNull();
    expect(db.findAll('rentalContracts', userId)).toHaveLength(0);
  });

  it('leaves the active contract untouched when the payload has no rental', async () => {
    const tenant = db.create('legalOwners', { name: 'Tenant', kind: 'person', roles: ['tenant'] }, userId);
    const created = await agent.post('/api/assets/form').send({ ...form({ condition: 'rented' }), rental: { tenantId: tenant.id, startDate: '2025-03-15', endDate: null, amount: 1000 } });
    expect(created.status).toBe(201);
    const put = await agent.put(`/api/assets/${created.body.id}/form`).send(form({ name: 'Renombrada' }));
    expect(put.status).toBe(200);
    expect(put.body.activeContract.id).toBe(created.body.activeContract.id);
    expect(put.body.activeContract.status).toBe('active');
  });

  it('does not add the new fields to movables', async () => {
    const res = await agent.post('/api/assets/form').send({ asset: { type: 'movable', name: 'Auto', cadastralId: 'x' }, owners: [{ ownerId: owner.id, percentage: null }] });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('cadastralId');
    expect(res.body.age).toEqual({ years: null, source: null });
  });
});
