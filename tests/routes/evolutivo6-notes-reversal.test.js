const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const ledger = require('../../src/services/account-ledger');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

const REASON_ERROR = 'Indicá el motivo (hasta 500 caracteres)';
const NOTES_ERROR = 'Las notas son obligatorias';

describe('Evolutivo 6 mandatory notes and reasoned reversals (obligations)', () => {
  let db;
  let agent;
  let userId;
  let today;
  let month;
  let accountId;
  let categoryId;
  let assetId;
  let tenantId;
  let counter = 0;

  const create = async (extra = {}) => {
    const response = await agent.post('/api/obligations').send({
      title: 'Expensas', type: 'other', currencyCode: 'ARS', estimatedAmount: 1000, startDate: today, accountId, categoryId, assetId, ...extra
    });
    expect(response.status).toBe(201);
    return { obligation: response.body, occurrence: response.body.occurrences[0] };
  };
  const base = (obligation, occurrence) => `/api/obligations/${obligation.id}/occurrences/${occurrence.id}`;
  const pay = (obligation, occurrence, body = {}) => { counter += 1; return agent.post(`${base(obligation, occurrence)}/payments`).send({ amount: 1000, idempotencyKey: `e6-notes-key-${counter}`, ...body }); };
  const resolve = (obligation, occurrence, body = {}) => agent.post(`${base(obligation, occurrence)}/resolution`).send({ tenantEntityId: tenantId, period: month, amount: 1000, ...body });
  const voidResolution = (obligation, occurrence, body) => agent.delete(`${base(obligation, occurrence)}/resolution`).send(body);
  const revert = (obligation, occurrence, transaction, body) => agent.post(`${base(obligation, occurrence)}/payments/${transaction.id}/revert`).send(body);

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    app.locals.documentStorage = new DiskDocumentStorage(TEMP_DATA_DIR);
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'e6-notes@test.example', password: '123456', nombre: 'E6 Notes' });
    userId = db.findUserByName('E6 Notes').id;
    today = ledger.localDateForUser(db, userId);
    month = today.slice(0, 7);
    await agent.get('/api/accounts/setup');
    accountId = (await agent.post('/api/accounts').send({ name: 'ARS account', currency: 'ARS', initialBalance: 100000 })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Building' })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Flat' })).body.id;
    tenantId = (await agent.post('/api/owners').send({ name: 'Tenant', kind: 'person', roles: ['tenant'] })).body.id;
  });

  afterAll(() => cleanupTestDb());

  describe('resolve requires notes', () => {
    it.each([[undefined], [''], ['   '], [42]])('rejects notes %p with 400 and leaves the occurrence unchanged', async notes => {
      const { obligation, occurrence } = await create({ responsibilityType: 'tenant' });
      const response = await resolve(obligation, occurrence, notes === undefined ? {} : { notes });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(NOTES_ERROR);
      expect(db.findAll('obligationResolutions', userId).filter(item => item.occurrenceId === occurrence.id)).toHaveLength(0);
    });

    it('rejects notes over 2000 characters and stores the trimmed note otherwise', async () => {
      const { obligation, occurrence } = await create({ responsibilityType: 'tenant' });
      expect((await resolve(obligation, occurrence, { notes: 'x'.repeat(2001) })).status).toBe(400);
      const ok = await resolve(obligation, occurrence, { notes: `  ${'y'.repeat(2000)}  ` });
      expect(ok.status).toBe(201);
      expect(ok.body.resolution.notes).toHaveLength(2000);
    });
  });

  describe('pay requires notes', () => {
    it.each([[undefined], [''], ['   ']])('rejects notes %p with 400 and creates no transaction', async notes => {
      const { obligation, occurrence } = await create();
      const before = db.findAll('transactions', userId).length;
      const response = await pay(obligation, occurrence, notes === undefined ? {} : { notes });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(NOTES_ERROR);
      expect(db.findAll('transactions', userId)).toHaveLength(before);
    });

    it('rejects notes over 1000 characters and stores the trimmed note otherwise', async () => {
      const { obligation, occurrence } = await create();
      expect((await pay(obligation, occurrence, { notes: 'x'.repeat(1001) })).status).toBe(400);
      const ok = await pay(obligation, occurrence, { notes: '  Pagado por transferencia  ' });
      expect(ok.status).toBe(201);
      expect(ok.body.transaction.comments).toBe('Pagado por transferencia');
    });
  });

  describe('DELETE resolution takes a reason', () => {
    it('requires a reason of 1 to 500 characters and stores it as voidReason', async () => {
      const { obligation, occurrence } = await create({ responsibilityType: 'tenant' });
      const resolution = (await resolve(obligation, occurrence, { notes: 'pagó en efectivo' })).body.resolution;
      for (const body of [undefined, {}, { reason: '   ' }, { reason: 'x'.repeat(501) }, { reason: 5 }]) {
        const rejected = await voidResolution(obligation, occurrence, body);
        expect(rejected.status).toBe(400);
        expect(rejected.body.error).toBe(REASON_ERROR);
      }
      expect(db.findById('obligationResolutions', resolution.id, userId).status).toBe('active');
      const ok = await voidResolution(obligation, occurrence, { reason: '  Se cargó por error ' });
      expect(ok.status).toBe(200);
      expect(db.findById('obligationResolutions', resolution.id, userId)).toMatchObject({ status: 'voided', voidReason: 'Se cargó por error' });
      expect((await agent.get(`/api/obligations/${obligation.id}`)).body.occurrences[0].resolution).toBeFalsy();
    });

    it('answers 404 when there is no active resolution (replay)', async () => {
      const { obligation, occurrence } = await create({ responsibilityType: 'tenant' });
      await resolve(obligation, occurrence, { notes: 'ok' });
      expect((await voidResolution(obligation, occurrence, { reason: 'uno' })).status).toBe(200);
      expect((await voidResolution(obligation, occurrence, { reason: 'dos' })).status).toBe(404);
    });

    it('writes the reason into the log entry', async () => {
      const { obligation, occurrence } = await create({ responsibilityType: 'tenant' });
      await resolve(obligation, occurrence, { notes: 'ok' });
      await voidResolution(obligation, occurrence, { reason: 'Motivo del log' });
      const last = db.findAll('activityLogs', userId).filter(item => item.method === 'DELETE').pop();
      expect(last.message).toContain('motivo: Motivo del log');
    });

    it('exposes the void reason in the asset history', async () => {
      const { obligation, occurrence } = await create({ responsibilityType: 'tenant', title: 'Historial anulado' });
      await resolve(obligation, occurrence, { notes: 'ok' });
      await voidResolution(obligation, occurrence, { reason: 'Visible en historial' });
      const history = await agent.get(`/api/assets/${assetId}/history`);
      expect(history.status).toBe(200);
      const row = history.body.rows.find(item => item.refs.occurrenceId === occurrence.id);
      expect(row.voidedResolutions).toEqual([expect.objectContaining({ voidReason: 'Visible en historial' })]);
    });
  });

  describe('payment revert requires a reason', () => {
    it('rejects a missing, blank or too long reason and keeps the payment', async () => {
      const { obligation, occurrence } = await create();
      const transaction = (await pay(obligation, occurrence, { notes: 'pago' })).body.transaction;
      for (const body of [{}, { reason: '' }, { reason: '  ' }, { reason: 'x'.repeat(501) }]) {
        const rejected = await revert(obligation, occurrence, transaction, body);
        expect(rejected.status).toBe(400);
        expect(rejected.body.error).toBe(REASON_ERROR);
      }
      expect(db.findById('transactions', transaction.id, userId)).toBeTruthy();
      const ok = await revert(obligation, occurrence, transaction, { reason: 'Duplicado' });
      expect(ok.status).toBe(200);
      expect(ok.body.reversal.reason).toBe('Duplicado');
      expect((await revert(obligation, occurrence, transaction, { reason: 'otra vez' })).status).toBe(409);
    });
  });
});

describe('Evolutivo 6 rental collection reversal requires a reason', () => {
  let f;
  beforeAll(async () => { f = await setupRentFixture('e6-rent-reverse'); });
  afterAll(() => cleanupTestDb());

  const reverse = (id, body) => f.agent.post(`/api/rentals/collections/${id}/reverse`).send(body);

  it('rejects a missing, blank or too long reason with 400 and reverses nothing', async () => {
    const contract = await f.createContract();
    const collected = await f.collect(contract, ['2025-01-01']);
    for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(501) }]) {
      const rejected = await reverse(collected.body.id, body);
      expect(rejected.status).toBe(400);
      expect(rejected.body.error).toBe(REASON_ERROR);
    }
    expect(f.db.findById('rentCollections', collected.body.id, f.userId).reversedAt).toBeFalsy();
  });

  it('stores reversalReason on the collection and answers 409 on a replay', async () => {
    const contract = await f.createContract({ startDate: '2024-01-01', endDate: '2024-12-31' });
    const collected = await f.collect(contract, ['2024-01-01']);
    expect((await reverse(collected.body.id, { reason: '  Cobro duplicado ' })).status).toBe(200);
    expect(f.db.findById('rentCollections', collected.body.id, f.userId).reversalReason).toBe('Cobro duplicado');
    expect((await reverse(collected.body.id, { reason: 'otra vez' })).status).toBe(409);
    const last = f.db.findAll('activityLogs', f.userId).filter(item => /reverse/.test(item.route) && item.outcome === 'success').pop();
    expect(last.message).toContain('motivo: Cobro duplicado');
  });

  it('shows the reason in the asset history for a reversed collection', async () => {
    const contract = await f.createContract({ startDate: '2023-01-01', endDate: '2023-12-31' });
    const collected = await f.collect(contract, ['2023-01-01']);
    await reverse(collected.body.id, { reason: 'Motivo histórico' });
    const history = await f.agent.get(`/api/assets/${f.assetId}/history`);
    expect(history.status).toBe(200);
    const row = history.body.rows.find(item => item.id === `reversal:rent:${collected.body.id}`);
    expect(row.reversals[0].reason).toBe('Motivo histórico');
  });
});

describe('Evolutivo 6 month group reversal requires a reason', () => {
  let f;
  beforeAll(async () => { f = await setupRentFixture('e6-rent-group'); });
  afterAll(() => cleanupTestDb());

  const reverse = (id, body) => f.agent.post(`/api/rentals/collections/${id}/reverse`).send(body);

  it('stores the reason on the month group and on each collection of the group', async () => {
    const bank = (await f.agent.post('/api/accounts').send({ name: 'Banco', currency: 'ARS' })).body.id;
    const declaration = (await f.declare([f.modality('locacion', { amount: 9750000, ivaPercent: 21 }), f.modality('comodato', { amount: 3000000 })])).body;
    const part = kind => declaration.modalities.find(item => item.kind === kind).occurrences.find(item => item.date === '2025-01-01');
    const month = await f.agent.post('/api/rentals/collections/month').send({
      idempotencyKey: 'e6-month-key-1', lines: [
        { occurrenceId: part('locacion').id, amount: part('locacion').rentMinor / 100, accountId: bank, date: '2025-01-05', method: 'Transferencia' },
        { occurrenceId: part('comodato').id, amount: 3000000, accountId: bank, date: '2025-01-06', method: 'Efectivo' }
      ]
    });
    expect(month.status).toBe(201);
    expect((await reverse(month.body.id, {})).status).toBe(400);
    expect((await reverse(month.body.id, { reason: 'Mes duplicado' })).status).toBe(200);
    const group = f.db.findById('rentCollectionGroups', month.body.id, f.userId);
    expect(group.reversalReason).toBe('Mes duplicado');
    group.collectionIds.forEach(id => expect(f.db.findById('rentCollections', id, f.userId).reversalReason).toBe('Mes duplicado'));
    expect((await reverse(month.body.id, { reason: 'otra vez' })).status).toBe(409);
  });
});
