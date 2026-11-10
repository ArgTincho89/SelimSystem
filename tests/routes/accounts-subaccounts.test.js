const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Sub-accounts API', () => {
  let db;
  let agent;
  let userId;
  let parent;
  let today;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({ email: 'sub@test.example', password: '123456', nombre: 'Sub User' });
    userId = reg.body.id;
    today = ledger.localDateForUser(db, userId);
    parent = (await agent.post('/api/accounts').send({ name: 'Banco Nación', currency: 'ARS' })).body;
  });
  afterAll(() => cleanupTestDb());

  const sub = (body = {}) => agent.post('/api/accounts').send({ name: 'Caja USD', currency: 'USD', parentId: parent.id, ...body });

  it('creates a child in another currency with parentId', async () => {
    const res = await sub();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ parentId: parent.id, currency: 'USD', primary: false });
  });

  it('rejects depth, unknown parent, inactive parent, primary and missing currency', async () => {
    const child = (await sub({ name: 'Hija' })).body;
    const deep = await sub({ parentId: child.id });
    expect(deep.status).toBe(400);
    expect(deep.body.error).toBe('Una sub-cuenta no puede tener sub-cuentas');
    expect((await sub({ parentId: 'nope' })).status).toBe(400);
    const archived = (await agent.post('/api/accounts').send({ name: 'Vieja', currency: 'ARS' })).body;
    await agent.post(`/api/accounts/${archived.id}/archive`);
    expect((await sub({ parentId: archived.id })).status).toBe(400);
    const primary = await sub({ primary: true });
    expect(primary.status).toBe(400);
    expect(primary.body.error).toBe('Una sub-cuenta no puede ser la principal');
    expect((await agent.post('/api/accounts').send({ name: 'Sin moneda', parentId: parent.id })).status).toBe(400);
  });

  it('inherits the parent owner and cannot be made primary or moved', async () => {
    const owner = (await agent.post('/api/owners').send({ name: 'Titular A', kind: 'person', roles: ['owner'] })).body;
    const owned = (await agent.post('/api/accounts').send({ name: 'Con titular', currency: 'ARS', ownerId: owner.id })).body;
    const child = (await sub({ name: 'Hereda', parentId: owned.id })).body;
    expect(child.ownerId).toBe(owner.id);
    expect((await agent.put(`/api/accounts/${child.id}`).send({ parentId: parent.id })).status).toBe(400);
    expect((await agent.put(`/api/accounts/${child.id}`).send({ parentId: owned.id, name: 'Hereda 2' })).status).toBe(200);
    expect((await agent.put(`/api/accounts/${child.id}`).send({ primary: true })).status).toBe(400);
  });

  it('blocks archive and delete of a parent with children', async () => {
    const p = (await agent.post('/api/accounts').send({ name: 'Padre', currency: 'ARS' })).body;
    const c1 = (await agent.post('/api/accounts').send({ name: 'Hijo 1', currency: 'USD', parentId: p.id })).body;
    const archive = await agent.post(`/api/accounts/${p.id}/archive`);
    expect(archive.status).toBe(409);
    expect(archive.body.error).toBe('Archivá primero las sub-cuentas');
    expect((await agent.delete(`/api/accounts/${p.id}`)).status).toBe(409);
    expect((await agent.delete(`/api/accounts/${c1.id}`)).status).toBe(200);
    const c2 = (await agent.post('/api/accounts').send({ name: 'Hijo 2', currency: 'USD', parentId: p.id })).body;
    await agent.post(`/api/accounts/${c2.id}/reconcile`).send({ openingBalance: 0, openingDate: today, includedMovementIds: [] });
    await agent.post('/api/transactions').send({ tipo: 'income', monto: 5, titulo: 'x', fecha: today, accountId: c2.id });
    expect((await agent.delete(`/api/accounts/${c2.id}`)).status).toBe(409);
    expect((await agent.post(`/api/accounts/${c2.id}/archive`)).status).toBe(200);
    expect((await agent.post(`/api/accounts/${p.id}/archive`)).status).toBe(200);
    expect((await agent.delete(`/api/accounts/${p.id}`)).status).toBe(409);
  });

  it('locks child currency after movements and leaves children alone when the parent currency changes', async () => {
    const p = (await agent.post('/api/accounts').send({ name: 'Padre 2', currency: 'ARS' })).body;
    const c = (await agent.post('/api/accounts').send({ name: 'Hijo', currency: 'USD', parentId: p.id })).body;
    await agent.post(`/api/accounts/${c.id}/reconcile`).send({ openingBalance: 0, openingDate: today, includedMovementIds: [] });
    await agent.post('/api/transactions').send({ tipo: 'income', monto: 10, titulo: 'in', fecha: today, accountId: c.id });
    expect((await agent.put(`/api/accounts/${c.id}`).send({ currency: 'EUR' })).status).toBe(409);
    expect((await agent.put(`/api/accounts/${p.id}`).send({ currency: 'EUR' })).status).toBe(200);
    expect(db.findById('accounts', c.id, userId).currency).toBe('USD');
  });

  it('keeps legacy accounts unaffected', async () => {
    const list = (await agent.get('/api/accounts')).body;
    const legacy = list.find(item => item.primary);
    expect(legacy.parentId).toBeNull();
    expect((await agent.post(`/api/accounts/${legacy.id}/archive`)).status).toBe(409);
  });

  it('logs sub-account creation in the audit log', async () => {
    const created = await sub({ name: 'Caja log' });
    const first = (await agent.get('/api/activity-logs')).body.items[0];
    expect(first).toMatchObject({ action: 'account.create-sub', entityId: created.body.id, message: 'Creaste la subcuenta Caja log de Banco Nación' });
  });
});
