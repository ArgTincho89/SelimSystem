const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

const REPLACEMENT_ERROR = 'Elegí una cuenta activa para que sea la nueva principal';

describe('Evolutivo 6 principal account management', () => {
  let db;
  let agent;
  let userId;

  const principals = () => db.findAll('accounts', userId).filter(account => account.primary);
  const create = (body = {}) => agent.post('/api/accounts').send({ name: `Account ${Math.random().toString(36).slice(2, 8)}`, currency: 'ARS', ...body });

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'e6-principal@test.example', password: '123456', nombre: 'E6 Principal' });
    userId = db.findUserByName('E6 Principal').id;
    await agent.get('/api/accounts/setup');
  });

  afterAll(() => cleanupTestDb());

  it('creating with primary:true swaps the principal and leaves exactly one', async () => {
    const before = principals();
    expect(before).toHaveLength(1);
    const created = await create({ primary: true });
    expect(created.status).toBe(201);
    expect(created.body.primary).toBe(true);
    expect(principals().map(account => account.id)).toEqual([created.body.id]);
    expect(db.findById('accounts', before[0].id, userId).primary).toBe(false);
  });

  it('creating without the checkbox keeps the principal', async () => {
    const current = principals()[0].id;
    const created = await create();
    expect(created.status).toBe(201);
    expect(created.body.primary).toBe(false);
    expect(principals().map(account => account.id)).toEqual([current]);
  });

  it('rejects a principal sub-account with 400 and changes nothing', async () => {
    const current = principals()[0];
    const sub = await create({ primary: true, parentId: current.id });
    expect(sub.status).toBe(400);
    expect(principals().map(account => account.id)).toEqual([current.id]);
  });

  it('unchecking requires a valid newPrimaryId (400) and writes nothing', async () => {
    const current = principals()[0];
    const other = (await create()).body;
    const archived = (await create()).body;
    expect((await agent.post(`/api/accounts/${archived.id}/archive`).send({})).status).toBeLessThan(400);
    const sub = (await create({ parentId: other.id, currency: 'ARS' })).body;
    const invalid = [undefined, '', 'missing', current.id, archived.id, sub.id, 42];
    for (const newPrimaryId of invalid) {
      const response = await agent.put(`/api/accounts/${current.id}`).send({ primary: false, ...(newPrimaryId === undefined ? {} : { newPrimaryId }) });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(REPLACEMENT_ERROR);
    }
    expect(principals().map(account => account.id)).toEqual([current.id]);
  });

  it('rejects a replacement that belongs to another user', async () => {
    const current = principals()[0];
    const stranger = request.agent(app);
    await stranger.post('/api/auth/register').send({ email: 'e6-principal-other@test.example', password: '123456', nombre: 'E6 Principal Other' });
    await stranger.get('/api/accounts/setup');
    const foreign = (await stranger.post('/api/accounts').send({ name: 'Foreign', currency: 'ARS' })).body;
    const response = await agent.put(`/api/accounts/${current.id}`).send({ primary: false, newPrimaryId: foreign.id });
    expect(response.status).toBe(400);
    expect(principals().map(account => account.id)).toEqual([current.id]);
  });

  it('unchecking with a valid replacement promotes it and demotes the account in one write', async () => {
    const current = principals()[0];
    const replacement = (await create()).body;
    const response = await agent.put(`/api/accounts/${current.id}`).send({ primary: false, newPrimaryId: replacement.id });
    expect(response.status).toBe(200);
    expect(response.body.primary).toBe(false);
    expect(principals().map(account => account.id)).toEqual([replacement.id]);
  });

  it('promoting a non-principal still swaps and keeps exactly one principal', async () => {
    const target = db.findAll('accounts', userId).find(account => !account.primary && account.activo && !account.parentId);
    const response = await agent.put(`/api/accounts/${target.id}`).send({ primary: true });
    expect(response.status).toBe(200);
    expect(principals().map(account => account.id)).toEqual([target.id]);
  });

  it('rolls back the new account when the swap fails', async () => {
    const current = principals()[0];
    const count = db.findAll('accounts', userId).length;
    const original = db.replace.bind(db);
    let calls = 0;
    const spy = jest.spyOn(db, 'replace').mockImplementation((...args) => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return original(...args);
    });
    const failed = await create({ primary: true });
    spy.mockRestore();
    expect(failed.status).toBe(500);
    expect(principals().map(account => account.id)).toEqual([current.id]);
    expect(db.findAll('accounts', userId)).toHaveLength(count);
  });

  it('keeps rejecting archive and delete of the principal', async () => {
    const current = principals()[0];
    expect((await agent.post(`/api/accounts/${current.id}/archive`).send({})).status).toBe(409);
    expect((await agent.delete(`/api/accounts/${current.id}`)).status).toBe(409);
  });
});
