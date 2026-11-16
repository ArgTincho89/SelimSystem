const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

const REFERENCING = [
  ['transactions', 'movimientos', assetId => ({ assetId })],
  ['movementAllocations', 'movimientos', assetId => ({ assetId })],
  ['obligations', 'obligaciones', assetId => ({ assetId })],
  ['obligationResolutions', 'obligaciones', assetId => ({ assetId })],
  ['rentalContracts', 'alquileres', assetId => ({ assetId })],
  ['rentalDeclarations', 'alquileres', assetId => ({ assetId })],
  ['documents', 'documentos', assetId => ({ assetId })],
  ['wealthNotes', 'notas', assetId => ({ targetType: 'asset', targetId: assetId })],
  ['recoverableExpenseClaims', 'gastos a recuperar', assetId => ({ assetId })],
  ['creditCardInstallmentPlans', 'planes de cuotas', assetId => ({ assetId })]
];

describe('Evolutivo 6 asset deletion', () => {
  let db;
  let agent;
  let userId;
  let ownerId;

  const createAsset = async (name = 'Casa a borrar') => {
    const response = await agent.post('/api/assets').send({
      type: 'immovable', name, propertyKind: 'casa', ownerships: [{ ownerId, startDate: '2024-01-01', percentage: 100 }]
    });
    expect(response.status).toBe(201);
    return response.body;
  };

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'e6-delete@test.example', password: '123456', nombre: 'E6 Delete' });
    userId = db.findUserByName('E6 Delete').id;
    ownerId = (await agent.post('/api/owners').send({ name: 'Titular', roles: ['owner'] })).body.id;
  });
  afterAll(() => cleanupTestDb());

  it('requires authentication', async () => {
    expect((await request(app).delete('/api/assets/x')).status).toBe(401);
  });

  it('deletes an unreferenced asset with its ownerships and status history, and logs it', async () => {
    const asset = await createAsset('Casa a borrar');
    const other = await createAsset('Casa que queda');
    expect(db.findAll('assetOwnerships', userId).filter(item => item.assetId === asset.id)).toHaveLength(1);
    expect(db.findAll('assetStatusHistory', userId).filter(item => item.assetId === asset.id)).toHaveLength(1);
    const response = await agent.delete(`/api/assets/${asset.id}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
    expect(db.findById('assets', asset.id, userId)).toBeFalsy();
    expect(db.findAll('assetOwnerships', userId).some(item => item.assetId === asset.id)).toBe(false);
    expect(db.findAll('assetStatusHistory', userId).some(item => item.assetId === asset.id)).toBe(false);
    expect(db.findById('assets', other.id, userId)).toBeTruthy();
    expect(db.findAll('assetOwnerships', userId).some(item => item.assetId === other.id)).toBe(true);
    expect((await agent.get(`/api/assets/${asset.id}`)).status).toBe(404);
    const entry = db.findAll('activityLogs', userId).find(item => item.action === 'asset.delete');
    expect(entry).toMatchObject({ outcome: 'success', entityType: 'asset' });
    expect(entry.message).toBe('Eliminaste el bien Casa a borrar');
  });

  it.each(REFERENCING)('answers 409 and keeps the asset when %s references it', async (collection, label, build) => {
    const asset = await createAsset(`Con ${collection}`);
    const row = db.create(collection, build(asset.id), userId);
    const response = await agent.delete(`/api/assets/${asset.id}`);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe(`No se puede eliminar el bien porque tiene ${label} asociados`);
    expect(response.body.references).toEqual([expect.objectContaining({ collection, label, count: 1 })]);
    expect(db.findById('assets', asset.id, userId)).toBeTruthy();
    expect(db.findAll('assetOwnerships', userId).some(item => item.assetId === asset.id)).toBe(true);
    db.remove(collection, row.id, userId);
    expect((await agent.delete(`/api/assets/${asset.id}`)).status).toBe(200);
  });

  it('joins every blocking label in the message', async () => {
    const asset = await createAsset('Con varias');
    db.create('transactions', { assetId: asset.id }, userId);
    db.create('documents', { assetId: asset.id }, userId);
    const response = await agent.delete(`/api/assets/${asset.id}`);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('No se puede eliminar el bien porque tiene movimientos, documentos asociados');
    expect(response.body.references.map(item => item.collection)).toEqual(['transactions', 'documents']);
  });

  it('answers 404 for unknown ids and for assets of another user', async () => {
    expect((await agent.delete('/api/assets/does-not-exist')).status).toBe(404);
    const stranger = request.agent(app);
    await stranger.post('/api/auth/register').send({ email: 'e6-delete2@test.example', password: '123456', nombre: 'E6 Delete Two' });
    const asset = await createAsset('Ajeno');
    expect((await stranger.delete(`/api/assets/${asset.id}`)).status).toBe(404);
    expect(db.findById('assets', asset.id, userId)).toBeTruthy();
  });

  it('rolls back every collection when a write fails midway', async () => {
    const asset = await createAsset('Rollback');
    const original = db.replace.bind(db);
    let calls = 0;
    const spy = jest.spyOn(db, 'replace').mockImplementation((collection, user, data) => {
      calls += 1;
      if (calls === 2) throw new Error('disk failure');
      return original(collection, user, data);
    });
    const response = await agent.delete(`/api/assets/${asset.id}`);
    spy.mockRestore();
    expect(response.status).toBe(500);
    expect(db.findById('assets', asset.id, userId)).toBeTruthy();
    expect(db.findAll('assetOwnerships', userId).some(item => item.assetId === asset.id)).toBe(true);
    expect(db.findAll('assetStatusHistory', userId).some(item => item.assetId === asset.id)).toBe(true);
  });
});
