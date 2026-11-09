const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Composite asset form (holders only)', () => {
  let agent;
  let db;
  let userId;
  let a;
  let b;
  let tenant;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
  const body = (owners, extra = {}) => ({ asset: { type: 'movable', name: 'Auto' }, owners, rental: null, ...extra });
  const holders = assetId => db.findAll('assetOwnerships', userId).filter(r => r.assetId === assetId);

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    const reg = await agent.post('/api/auth/register').send({ email: 'form@test.example', password: '123456', nombre: 'Form' });
    userId = reg.body.user?.id || reg.body.id || db.findAll('users')[0]?.id;
    a = db.create('legalOwners', { name: 'A', kind: 'person', roles: ['owner'] }, userId);
    b = db.create('legalOwners', { name: 'B', kind: 'person', roles: ['owner'] }, userId);
    tenant = db.create('legalOwners', { name: 'T', kind: 'person', roles: ['tenant'] }, userId);
  });

  afterAll(() => cleanupTestDb());

  it('creates asset, status history and open holder', async () => {
    const res = await agent.post('/api/assets/form').send(body([{ ownerId: a.id, percentage: null }]));
    expect(res.status).toBe(201);
    expect(res.body.ownerships).toHaveLength(1);
    expect(res.body.ownerships[0]).toMatchObject({ ownerId: a.id, startDate: today, endDate: null });
    expect(res.body.statusHistory).toHaveLength(1);
  });

  it('rejects invalid payloads without writing', async () => {
    const before = db.findAll('assets', userId).length;
    const cases = [
      [null, 400],
      [{ owners: [{ ownerId: a.id }] }, 400],
      [{ asset: [], owners: [{ ownerId: a.id }] }, 400],
      [body([]), 400],
      [body([{ ownerId: a.id, percentage: 50 }, { ownerId: b.id, percentage: 40 }]), 400],
      [body([{ ownerId: tenant.id, percentage: null }]), 400],
      [body([{ ownerId: 'missing', percentage: null }]), 400],
      [{ asset: { type: 'boat', name: 'X' }, owners: [{ ownerId: a.id }] }, 400],
      [body([{ ownerId: a.id, percentage: null }], { rental: { tenantId: tenant.id } }), 400],
      [body([{ ownerId: a.id, percentage: null }], { obligationResponsibilities: 'x' }), 400]
    ];
    for (const [payload, status] of cases) {
      const res = await agent.post('/api/assets/form').send(payload || {});
      expect(res.status).toBe(status);
    }
    expect(db.findAll('assets', userId)).toHaveLength(before);
  });

  it('creates co-owners and edits same-day records in place', async () => {
    const res = await agent.post('/api/assets/form').send(body([{ ownerId: a.id, percentage: 60 }, { ownerId: b.id, percentage: 40 }]));
    expect(res.status).toBe(201);
    const id = res.body.id;
    const put = await agent.put(`/api/assets/${id}/form`).send(body([{ ownerId: a.id, percentage: 70 }, { ownerId: b.id, percentage: 30 }], { asset: { name: 'Auto 2' } }));
    expect(put.status).toBe(200);
    expect(put.body.name).toBe('Auto 2');
    const rows = holders(id);
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.ownerId === a.id)).toMatchObject({ percentage: 70, endDate: null });
    const drop = await agent.put(`/api/assets/${id}/form`).send(body([{ ownerId: a.id, percentage: null }]));
    expect(drop.status).toBe(200);
    expect(holders(id)).toHaveLength(1);
  });

  it('closes older changed holders as of yesterday and keeps unchanged ones', async () => {
    const asset = db.create('assets', { name: 'Casa', type: 'immovable', status: 'active', usageStatus: 'vacant', propertyType: '' }, userId);
    const old = db.create('assetOwnerships', { assetId: asset.id, ownerId: a.id, startDate: '2020-01-01', endDate: null, percentage: 100, notes: '' }, userId);
    const same = await agent.put(`/api/assets/${asset.id}/form`).send({ asset: { name: 'Casa' }, owners: [{ ownerId: a.id, percentage: 100 }] });
    expect(same.status).toBe(200);
    expect(holders(asset.id)).toHaveLength(1);
    const swap = await agent.put(`/api/assets/${asset.id}/form`).send({ asset: { name: 'Casa', status: 'sold', statusNotes: 'venta' }, owners: [{ ownerId: b.id, percentage: null }] });
    expect(swap.status).toBe(200);
    expect(db.findById('assetOwnerships', old.id, userId).endDate).toBe(yesterday);
    expect(holders(asset.id).find(r => r.ownerId === b.id)).toMatchObject({ startDate: today, endDate: null });
    expect(swap.body.statusHistory.some(e => e.notes === 'venta')).toBe(true);
  });

  it('returns 404 for a missing asset and 400 on holder overlap', async () => {
    expect((await agent.put('/api/assets/nope/form').send(body([{ ownerId: a.id }]))).status).toBe(404);
    const asset = db.create('assets', { name: 'Lote', type: 'movable', status: 'active' }, userId);
    db.create('assetOwnerships', { assetId: asset.id, ownerId: a.id, startDate: '2020-01-01', endDate: today, percentage: 100, notes: '' }, userId);
    const res = await agent.put(`/api/assets/${asset.id}/form`).send({ asset: { name: 'Lote' }, owners: [{ ownerId: a.id, percentage: 100 }] });
    expect(res.status).toBe(400);
  });

  it('returns 500 and clears the cache when a write fails', async () => {
    const spy = jest.spyOn(db, 'create').mockImplementationOnce(() => { throw new Error('disk'); });
    const clear = jest.spyOn(db, 'clearCache');
    const res = await agent.post('/api/assets/form').send(body([{ ownerId: a.id, percentage: null }]));
    expect(res.status).toBe(500);
    expect(clear).toHaveBeenCalled();
    spy.mockRestore();
    clear.mockRestore();
  });
});
