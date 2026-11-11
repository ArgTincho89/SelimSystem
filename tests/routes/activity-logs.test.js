const request = require('supertest');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const activityLog = require('../../src/services/activity-log');

const STORED_KEYS = ['action', 'createdAt', 'entityId', 'entityLabel', 'entityType', 'id', 'message', 'method', 'outcome', 'route', 'statusCode', 'timestamp'];

describe('Activity logs', () => {
  let f;
  beforeAll(async () => { f = await setupRentFixture('audit'); });
  afterAll(() => cleanupTestDb());

  const logs = async (agent = f.agent, query = '') => (await agent.get(`/api/activity-logs${query}`)).body;
  const messages = async (agent = f.agent) => (await logs(agent, '?limit=200')).items.map(item => item.message);

  it('logs successful writes in Spanish with the entity label', async () => {
    const res = await f.agent.post('/api/accounts').send({ name: 'Caja chica', currency: 'ARS' });
    expect(res.status).toBe(201);
    const first = (await logs()).items[0];
    expect(first).toMatchObject({ method: 'POST', route: '/accounts', action: 'account.create', entityType: 'account', entityId: res.body.id, entityLabel: 'Caja chica', outcome: 'success', statusCode: 201, message: 'Creaste la cuenta Caja chica' });
    expect(Number.isNaN(Date.parse(first.timestamp))).toBe(false);
  });

  it('logs failed attempts with the status', async () => {
    const res = await f.agent.post('/api/categories').send({});
    expect(res.status).toBe(400);
    expect((await logs()).items[0]).toMatchObject({ outcome: 'failure', statusCode: 400, message: 'Intentaste crear una categoría, pero no se completó' });
  });

  it('does not log GET requests', async () => {
    const before = (await logs()).items.length;
    await f.agent.get('/api/accounts');
    await f.agent.get('/api/activity-logs');
    expect((await logs()).items).toHaveLength(before);
  });

  it('does not store passwords, tokens or bodies on a password change', async () => {
    const res = await f.agent.post('/api/auth/change-password').send({ currentPassword: '123456', newPassword: 'Secret-9876!' });
    expect(res.status).toBeLessThan(500);
    const all = f.db.findAll('activityLogs', f.userId);
    const stored = all[all.length - 1];
    expect(Object.keys(stored).sort()).toEqual(STORED_KEYS);
    expect(JSON.stringify(stored)).not.toMatch(/Secret-9876|123456/);
    expect(stored.message).toMatch(/^Cambiaste tu contraseña$|^Intentaste cambiar tu contraseña, pero no se completó$/);
  });

  it('does not log unauthenticated requests or auth entry points', async () => {
    const before = f.db.findAll('activityLogs', f.userId).length;
    const anon = request(f.app);
    await anon.post('/api/categories').send({ nombre: 'x' });
    await anon.post('/api/auth/login').send({ nombre: 'no', password: 'no' });
    await anon.post('/api/auth/forgot-password').send({ email: 'a@b.com' });
    expect(f.db.findAll('activityLogs', f.userId)).toHaveLength(before);
    expect(f.db.findAll('activityLogs')).toHaveLength(0);
  });

  it('does not log account deletion', async () => {
    const agent = request.agent(f.app);
    await agent.post('/api/auth/register').send({ email: 'audit-del@test.com', password: '123456', nombre: 'audit del' });
    const id = f.db.findUserByEmail('audit-del@test.com').id;
    await agent.post('/api/categories').send({ nombre: 'Temporal', color: '#ff0000' });
    const before = f.db.findAll('activityLogs', id).length;
    await agent.delete('/api/auth/account').send({ confirmation: 'ELIMINAR' });
    expect(f.db.findAll('activityLogs', id).length).toBeLessThanOrEqual(before);
    expect(f.db.findAll('activityLogs', id).some(item => item.route === '/auth/account')).toBe(false);
  });

  it('keeps users isolated and ignores a userId parameter', async () => {
    await f.other.post('/api/categories').send({ nombre: 'Solo del otro', color: '#00ff00' });
    const mine = await messages();
    const theirs = await messages(f.other);
    expect(theirs.some(text => text.includes('Solo del otro'))).toBe(true);
    expect(mine.some(text => text.includes('Solo del otro'))).toBe(false);
    const forged = await logs(f.agent, `?userId=${f.db.findUserByEmail('audit-other@test.com').id}`);
    expect(forged.items.some(item => item.message.includes('Solo del otro'))).toBe(false);
  });

  it('requires authentication to read', async () => {
    expect((await request(f.app).get('/api/activity-logs')).status).toBe(401);
  });

  it('paginates 120 entries as 50 + 50 + 20 with before and caps the limit', async () => {
    const agent = request.agent(f.app);
    await agent.post('/api/auth/register').send({ email: 'audit-page@test.com', password: '123456', nombre: 'audit page' });
    const id = f.db.findUserByEmail('audit-page@test.com').id;
    f.db.replace('activityLogs', id, []);
    for (let i = 0; i < 120; i += 1) {
      activityLog.append(f.db, id, { method: 'POST', route: '/goals', action: 'goal.create', outcome: 'success', statusCode: 201, message: `Entrada ${i}` });
    }
    const p1 = await logs(agent);
    expect(p1.items).toHaveLength(50);
    expect(p1.items[0].message).toBe('Entrada 119');
    const p2 = await logs(agent, `?before=${encodeURIComponent(p1.nextBefore)}`);
    expect(p2.items).toHaveLength(50);
    expect(p2.items[0].message).toBe('Entrada 69');
    const p3 = await logs(agent, `?before=${encodeURIComponent(p2.nextBefore)}`);
    expect(p3.items).toHaveLength(20);
    expect(p3.nextBefore).toBeNull();
    expect((await logs(agent, '?limit=9999')).items).toHaveLength(120);
    expect((await logs(agent, '?limit=5')).items).toHaveLength(5);
  });

  it('filters by inclusive from/to days in the requested timezone', async () => {
    const agent = request.agent(f.app);
    await agent.post('/api/auth/register').send({ email: 'audit-range@test.com', password: '123456', nombre: 'audit range' });
    const id = f.db.findUserByEmail('audit-range@test.com').id;
    f.db.replace('activityLogs', id, []);
    const add = (timestamp, message) => activityLog.append(f.db, id, { timestamp, method: 'POST', route: '/goals', action: 'goal.create', outcome: 'success', statusCode: 201, message });
    add('2026-03-01T10:00:00.000Z', 'Marzo 1');
    add('2026-03-02T02:30:00.000Z', 'Marzo 2 UTC, marzo 1 en Buenos Aires');
    add('2026-03-03T12:00:00.000Z', 'Marzo 3');
    add('2026-03-05T12:00:00.000Z', 'Marzo 5');
    const messagesOf = async query => (await logs(agent, query)).items.map(item => item.message);

    expect(await messagesOf('?from=2026-03-02&to=2026-03-03&timezone=UTC')).toEqual(['Marzo 3', 'Marzo 2 UTC, marzo 1 en Buenos Aires']);
    expect(await messagesOf('?from=2026-03-01&to=2026-03-01&timezone=America/Argentina/Buenos_Aires')).toEqual(['Marzo 2 UTC, marzo 1 en Buenos Aires', 'Marzo 1']);
    expect(await messagesOf('?from=2026-03-04&timezone=UTC')).toEqual(['Marzo 5']);
    expect(await messagesOf('?to=2026-03-01&timezone=UTC')).toEqual(['Marzo 1']);
    expect(await messagesOf('?from=&to=')).toHaveLength(4);
  });

  it('paginates within a date range', async () => {
    const agent = request.agent(f.app);
    await agent.post('/api/auth/register').send({ email: 'audit-range-page@test.com', password: '123456', nombre: 'audit range page' });
    const id = f.db.findUserByEmail('audit-range-page@test.com').id;
    f.db.replace('activityLogs', id, []);
    for (let i = 0; i < 5; i += 1) {
      activityLog.append(f.db, id, { timestamp: `2026-04-10T1${i}:00:00.000Z`, method: 'POST', route: '/goals', action: 'goal.create', outcome: 'success', statusCode: 201, message: `Abril ${i}` });
    }
    activityLog.append(f.db, id, { timestamp: '2026-04-11T10:00:00.000Z', method: 'POST', route: '/goals', action: 'goal.create', outcome: 'success', statusCode: 201, message: 'Fuera de rango' });
    const p1 = await logs(agent, '?from=2026-04-10&to=2026-04-10&timezone=UTC&limit=3');
    expect(p1.items.map(item => item.message)).toEqual(['Abril 4', 'Abril 3', 'Abril 2']);
    const p2 = await logs(agent, `?from=2026-04-10&to=2026-04-10&timezone=UTC&limit=3&before=${encodeURIComponent(p1.nextBefore)}`);
    expect(p2.items.map(item => item.message)).toEqual(['Abril 1', 'Abril 0']);
    expect(p2.nextBefore).toBeNull();
  });

  it('rejects invalid date filters and timezones', async () => {
    expect((await f.agent.get('/api/activity-logs?from=2026-02-30')).status).toBe(400);
    expect((await f.agent.get('/api/activity-logs?to=ayer')).status).toBe(400);
    expect((await f.agent.get('/api/activity-logs?from=2026-03-05&to=2026-03-01')).status).toBe(400);
    expect((await f.agent.get('/api/activity-logs?from=2026-03-01&timezone=Marte/Olympus')).status).toBe(400);
  });

  it('swallows a logging error without affecting the response', async () => {
    const spy = jest.spyOn(activityLog, 'append').mockImplementation(() => { throw new Error('disk full'); });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await f.agent.post('/api/accounts').send({ name: 'Sobrevive', currency: 'ARS' });
    spy.mockRestore();
    errorSpy.mockRestore();
    expect(res.status).toBe(201);
    expect(res.body.nombre).toBe('Sobrevive');
  });

  it('records one entry for a multi-step operation and the undo keeps the amount', async () => {
    const contract = await f.createContract();
    const count = () => f.db.findAll('activityLogs', f.userId).length;
    const before = count();
    const collected = await f.collect(contract, ['2025-01-01', '2025-02-01']);
    expect(collected.status).toBe(201);
    expect(count()).toBe(before + 1);
    expect((await logs()).items[0].message).toBe('Registraste el cobro del alquiler de Casa Centro, período enero 2025, febrero 2025');
    await f.agent.post(`/api/rentals/collections/${collected.body.id}/reverse`);
    expect((await logs()).items[0].message).toBe('Deshiciste el cobro del alquiler de Casa Centro, período enero 2025, febrero 2025, importe ARS 200000');
    expect(count()).toBe(before + 2);
  });

  it('logs a rental declaration and the deletion of a rent transaction as an undo', async () => {
    const asset = (await f.agent.post('/api/assets').send({ type: 'immovable', name: 'Local 2', propertyType: 'Apartment', usageStatus: 'vacant' })).body;
    const declared = await f.agent.post('/api/rentals/declarations').send({ assetId: asset.id, tenantIds: [f.tenantId], notes: '', modalities: [f.modality('locacion')] });
    expect(declared.status).toBe(201);
    expect((await logs()).items[0].message).toBe('Declaraste el alquiler de Local 2');
    const contract = await f.createContract();
    const collected = await f.collect(contract, ['2025-03-01']);
    await f.agent.delete(`/api/transactions/${collected.body.transactionId}`);
    expect((await logs()).items[0].message).toMatch(/^Deshiciste el cobro del alquiler de Casa Centro, período marzo 2025/);
  });

  it('falls back to a generic message for unmapped write routes', async () => {
    await f.agent.post('/api/rentals/does-not-exist/unknown').send({});
    expect((await logs()).items[0].message).toBe('Intentaste hacer un cambio en tus alquileres, pero no se completó');
  });
});
