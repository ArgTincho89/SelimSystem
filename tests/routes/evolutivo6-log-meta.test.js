const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const ledger = require('../../src/services/account-ledger');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

describe('Evolutivo 6 log enrichment: descriptive messages and write-time metadata', () => {
  let db;
  let agent;
  let userId;
  let today;
  let month;
  let accountId;
  let categoryId;
  let assetId;
  let ownerId;
  let tenantId;
  let counter = 0;

  const latest = () => db.findAll('activityLogs', userId).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
  const create = async (extra = {}) => {
    const response = await agent.post('/api/obligations').send({
      title: 'Impuesto Municipal', type: 'other', currencyCode: 'ARS', estimatedAmount: 15000, startDate: today, accountId, categoryId, assetId, ...extra
    });
    expect(response.status).toBe(201);
    return { obligation: response.body, occurrence: response.body.occurrences[0] };
  };
  const base = (obligation, occurrence) => `/api/obligations/${obligation.id}/occurrences/${occurrence.id}`;
  const pay = (obligation, occurrence, body = {}) => { counter += 1; return agent.post(`${base(obligation, occurrence)}/payments`).send({ amount: 15000, notes: 'ok', idempotencyKey: `e6-meta-key-${counter}`, ...body }); };
  const resolve = (obligation, occurrence, body = {}) => agent.post(`${base(obligation, occurrence)}/resolution`).send({ tenantEntityId: tenantId, period: month, amount: 15000, notes: 'ok', ...body });

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    app.locals.documentStorage = new DiskDocumentStorage(TEMP_DATA_DIR);
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'e6-meta@test.example', password: '123456', nombre: 'E6 Meta' });
    userId = db.findUserByName('E6 Meta').id;
    today = ledger.localDateForUser(db, userId);
    month = today.slice(0, 7);
    await agent.get('/api/accounts/setup');
    accountId = (await agent.post('/api/accounts').send({ name: 'ARS account', currency: 'ARS', initialBalance: 1000000 })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Taxes' })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Casa Centro' })).body.id;
    ownerId = (await agent.post('/api/owners').send({ name: 'Holder', kind: 'person', roles: ['owner'] })).body.id;
    tenantId = (await agent.post('/api/owners').send({ name: 'Tenant', kind: 'person', roles: ['tenant'] })).body.id;
    expect((await agent.post(`/api/assets/${assetId}/ownerships`).send({ ownerId, startDate: '2020-01-01', percentage: 100 })).status).toBe(201);
  });

  afterAll(() => cleanupTestDb());

  it('describes a payment with property, amount and due date, and stores the metadata plus undo', async () => {
    const { obligation, occurrence } = await create();
    const paid = await pay(obligation, occurrence);
    expect(paid.status).toBe(201);
    const [d, m, y] = [occurrence.date.slice(8), occurrence.date.slice(5, 7), occurrence.date.slice(0, 4)];
    const entry = latest();
    expect(entry.message).toBe(`Registraste un pago de la obligación Impuesto Municipal de la propiedad Casa Centro, por un monto de ARS 15.000, con vencimiento ${d}/${m}/${y}`);
    expect(entry).toMatchObject({ assetId, ownerIds: [ownerId], tenantIds: [], categoryId });
    expect(entry.undo).toEqual({ type: 'obligation.payment', obligationId: obligation.id, occurrenceId: occurrence.id, transactionId: paid.body.transaction.id });
  });

  it('stores the tenant of the resolution and its undo descriptor, and describes it', async () => {
    const { obligation, occurrence } = await create({ responsibilityType: 'tenant' });
    const resolved = await resolve(obligation, occurrence);
    expect(resolved.status).toBe(201);
    const entry = latest();
    expect(entry.message).toMatch(/^Resolviste un vencimiento de la obligación Impuesto Municipal de la propiedad Casa Centro, por un monto de ARS 15\.000, con vencimiento \d{2}\/\d{2}\/\d{4}$/);
    expect(entry).toMatchObject({ assetId, ownerIds: [ownerId], tenantIds: [tenantId], categoryId });
    expect(entry.undo).toEqual({ type: 'obligation.resolution', obligationId: obligation.id, occurrenceId: occurrence.id, resolutionId: resolved.body.resolution.id });
  });

  it('for an obligation without asset uses the owner of the account', async () => {
    const owner = (await agent.post('/api/owners').send({ name: 'Account holder', kind: 'person', roles: ['owner'] })).body.id;
    const acc = await agent.post('/api/accounts').send({ name: 'Held ARS', currency: 'ARS', initialBalance: 100000, ownerId: owner });
    expect(acc.status).toBe(201);
    const { obligation, occurrence } = await create({ assetId: undefined, accountId: acc.body.id });
    expect((await pay(obligation, occurrence, { accountId: acc.body.id })).status).toBe(201);
    const entry = latest();
    expect(entry.assetId).toBeNull();
    expect(entry.ownerIds).toEqual([owner]);
    expect(entry.message).not.toContain('de la propiedad');
  });

  it('keeps the reversal entries without an undo descriptor and with the same facts', async () => {
    const { obligation, occurrence } = await create();
    const paid = await pay(obligation, occurrence);
    const reverted = await agent.post(`${base(obligation, occurrence)}/payments/${paid.body.transaction.id}/revert`).send({ reason: 'Error' });
    expect(reverted.status).toBe(200);
    const entry = latest();
    expect(entry.message).toMatch(/^Revertiste un pago de la obligación Impuesto Municipal de la propiedad Casa Centro, por un monto de ARS 15\.000, con vencimiento \d{2}\/\d{2}\/\d{4}, motivo: Error$/);
    expect(entry.undo).toBeNull();
    expect(entry.assetId).toBe(assetId);
  });

  it('does not store metadata or an undo descriptor when the request fails', async () => {
    const { obligation, occurrence } = await create();
    const failed = await pay(obligation, occurrence, { notes: '' });
    expect(failed.status).toBe(400);
    const entry = latest();
    expect(entry).toMatchObject({ outcome: 'failure', assetId: null, ownerIds: [], tenantIds: [], categoryId: null, undo: null });
    expect(entry.message).toMatch(/^Intentaste registrar un pago de una obligación/);
  });

  it('prints the installment only when the occurrence carries installment data', async () => {
    const { obligation, occurrence } = await create();
    expect(occurrence.installment).toBeUndefined();
    const paid = await pay(obligation, occurrence);
    expect(paid.status).toBe(201);
    expect(latest().message).not.toMatch(/cuota/);
    // The writer of the facts passes the installment through unchanged when it exists.
    const activityLog = require('../../src/services/activity-log');
    const meta = activityLog.obligationMeta(db, userId, db.findById('obligations', obligation.id, userId), { ...db.findById('obligationOccurrences', occurrence.id, userId), installment: { number: 3, total: 12 } }, { amount: 15000 });
    expect(activityLog.describe(null, meta.facts)).toMatch(/, cuota 3\/12$/);
  });

  it('keeps old entries without the new fields readable', async () => {
    db.create('activityLogs', { timestamp: '2020-01-01T00:00:00.000Z', method: 'POST', route: '/x', action: 'generic', outcome: 'success', statusCode: 200, message: 'Antiguo' }, userId);
    const response = await agent.get('/api/activity-logs?limit=200');
    expect(response.status).toBe(200);
    expect(response.body.items.some(item => item.message === 'Antiguo')).toBe(true);
  });
});

describe('Evolutivo 6 log enrichment: rent collections', () => {
  let f;
  beforeAll(async () => { f = await setupRentFixture('e6-logmeta-rent'); });
  afterAll(() => cleanupTestDb());

  it('stores asset, tenants and the collection undo descriptor with the amount in the message', async () => {
    const contract = await f.createContract();
    const collected = await f.collect(contract, ['2025-01-01']);
    expect(collected.status).toBe(201);
    const entry = f.db.findAll('activityLogs', f.userId).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
    expect(entry.message).toBe('Registraste el cobro del alquiler de Casa Centro, período enero 2025, por un monto de ARS 100.000');
    expect(entry).toMatchObject({ assetId: f.assetId, tenantIds: [f.tenantId], undo: { type: 'rental.collection', collectionId: collected.body.id } });
    const reversed = await f.agent.post(`/api/rentals/collections/${collected.body.id}/reverse`).send({ reason: 'Prueba' });
    expect(reversed.status).toBe(200);
    const undo = f.db.findAll('activityLogs', f.userId).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
    expect(undo).toMatchObject({ assetId: f.assetId, tenantIds: [f.tenantId], undo: null });
  });
});
