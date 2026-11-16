const request = require('supertest');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const ledger = require('../../src/services/account-ledger');

describe('GET /api/assets/:id/history', () => {
  let f;
  let declaration;
  let obligation;
  let accountId;

  beforeAll(async () => {
    f = await setupRentFixture('asset-history');
    accountId = f.accountId;
    const categoryId = (await f.agent.post('/api/categories').send({ nombre: 'Taxes' })).body.id;
    declaration = (await f.declare([f.modality('locacion', { ivaPercent: null }), f.modality('comodato', { amount: 50000 })])).body;
    obligation = (await f.agent.post('/api/obligations').send({ title: 'Municipal', type: 'tax', currencyCode: 'ARS', estimatedAmount: 100, startDate: '2025-03-10', accountId, categoryId, assetId: f.assetId })).body;
  });

  afterAll(() => cleanupTestDb());

  const history = query => f.agent.get(`/api/assets/${f.assetId}/history`).query(query);
  const collect = (key, occurrences, date) => f.agent.post('/api/rentals/collections/month').send({
    idempotencyKey: key, lines: occurrences.map(occurrence => ({ occurrenceId: occurrence.id, amount: occurrence.rentMinor / 100, accountId, date }))
  });
  const occurrenceOf = async (kind, date) => (await f.agent.get('/api/rentals/declarations').query({ assetId: f.assetId })).body.find(item => item.id === declaration.id).modalities.find(item => item.kind === kind).occurrences.find(item => item.date === date);

  it('defaults to the current month and lists the years with data up to the current year', async () => {
    const response = await history({});
    const current = ledger.localDateForUser(f.db, f.userId).slice(0, 7);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ assetId: f.assetId, year: current.slice(0, 4), month: current.slice(5, 7), range: { from: current, to: current } });
    expect(response.body.years[0]).toBe(current.slice(0, 4));
    expect(response.body.years).toContain('2025');
    expect(response.body.years).toEqual([...response.body.years].sort().reverse());
  });

  it('returns typed rows of one month: owner obligation, rent with modality breakdown and the start event', async () => {
    const response = await history({ year: '2025', month: '03' });
    expect(response.status).toBe(200);
    const owner = response.body.rows.find(row => row.kind === 'obligation');
    expect(owner).toMatchObject({
      concept: 'Municipal', typeLabel: 'Obligación', responsibility: 'owner', currencyCode: 'ARS', expected: 100, executed: 0, balance: 100, state: 'overdue',
      refs: { obligationId: obligation.id }, actions: ['pay'], actionable: true
    });
    const rent = response.body.rows.find(row => row.kind === 'rent');
    expect(rent).toMatchObject({ concept: 'Alquiler marzo 2025', typeLabel: 'Cobro de alquiler', responsibility: 'tenant', counterpart: 'Tenant', expected: 150000, executed: 0, balance: 150000, state: 'overdue', currencyCode: 'ARS' });
    expect(rent.parts.map(part => [part.modality, part.amount, part.classification])).toEqual([['locacion', 100000, 'A'], ['comodato', 50000, 'B']]);
    expect(rent.actions).toEqual(['collect']);
    const january = await history({ year: '2025', month: '01' });
    expect(january.body.rows.find(row => row.kind === 'event')).toMatchObject({ concept: 'Inicio del alquiler (Locación + Comodato)', state: null });
  });

  it('marks a partially collected month as partial and a fully collected one as collected', async () => {
    const locacion = await occurrenceOf('locacion', '2025-02-01');
    const comodato = await occurrenceOf('comodato', '2025-02-01');
    expect((await collect('asset-history-partial', [locacion], '2025-02-02')).status).toBe(201);
    let row = (await history({ year: '2025', month: '02' })).body.rows.find(item => item.kind === 'rent');
    expect(row).toMatchObject({ state: 'partial', executed: 100000, balance: 50000 });
    expect(row.payments).toHaveLength(1);
    expect(row.actions).toEqual(['collect', 'undo-collect']);
    expect((await collect('asset-history-rest', [comodato], '2025-02-02')).status).toBe(201);
    row = (await history({ year: '2025', month: '02' })).body.rows.find(item => item.kind === 'rent');
    expect(row).toMatchObject({ state: 'collected', executed: 150000, balance: 0 });
    expect(row.actions).toEqual(['undo-collect']);
  });

  it('shows a reversed collection as a "Revertido" row and the period as overdue again', async () => {
    const occurrence = await occurrenceOf('locacion', '2025-04-01');
    const created = await collect('asset-history-rev', [occurrence], '2025-04-02');
    expect((await f.agent.post(`/api/rentals/collections/${created.body.id}/reverse`).send({})).status).toBe(200);
    const rows = (await history({ year: '2025', month: '04' })).body.rows;
    expect(rows.find(row => row.kind === 'rent')).toMatchObject({ state: 'overdue', executed: 0 });
    // The reversal event is dated when it happened (today), not at the period it reopened.
    const current = (await history({})).body.rows;
    expect(current.find(row => row.kind === 'reversal')).toMatchObject({ state: 'reverted', typeLabel: 'Evento', responsibility: 'tenant' });
  });

  it('returns a whole year (month=all) and a custom range, capped at 36 months', async () => {
    const year = await history({ year: '2025', month: 'all' });
    expect(year.status).toBe(200);
    expect(new Set(year.body.rows.filter(row => row.kind === 'rent').map(row => row.date.slice(0, 7))).size).toBe(12);
    expect(year.body.range).toEqual({ from: '2025-01', to: '2025-12' });
    const range = await history({ from: '2025-01', to: '2025-03' });
    expect(range.body.range).toEqual({ from: '2025-01', to: '2025-03' });
    expect(range.body.rows.every(row => row.date >= '2025-01-01' && row.date <= '2025-03-31')).toBe(true);
    expect((await history({ from: '2020-01', to: '2025-03' })).status).toBe(400);
  });

  it('answers 400 for invalid year, month or range with a Spanish message', async () => {
    const month = await history({ year: '2025', month: '13' });
    expect(month.status).toBe(400);
    expect(month.body.error).toBe('El mes no es válido');
    expect((await history({ year: 'abcd' })).body.error).toBe('El año no es válido');
    expect((await history({ from: 'x', to: 'y' })).status).toBe(400);
  });

  it('reaches old years without an artificial 120-month limit', async () => {
    const old = f.db.create('obligations', {
      title: 'Old tax', type: 'tax', currencyCode: 'ARS', estimatedAmount: 10, startDate: '2012-05-10', status: 'active', assetId: f.assetId, responsibilityType: 'owner'
    }, f.userId);
    const response = await history({ year: '2012', month: '05' });
    expect(response.status).toBe(200);
    expect((await history({})).body.years).toContain('2012');
    expect(response.body.rows.find(row => row.refs.obligationId === old.id)).toMatchObject({ concept: 'Old tax', date: '2012-05-10' });
  });

  it('is read-only: it never persists generated occurrences', async () => {
    await history({ year: '2030', month: 'all' });
    await history({ year: '2013', month: 'all' });
    expect(f.db.findAll('rentOccurrences', f.userId).filter(item => item.date.startsWith('2030'))).toEqual([]);
    expect(f.db.findAll('obligationOccurrences', f.userId).filter(item => item.date.startsWith('2013'))).toEqual([]);
  });

  it('answers 404 for an unknown asset and for another user, 401 without a session', async () => {
    expect((await f.agent.get('/api/assets/missing/history')).status).toBe(404);
    expect((await f.other.get(`/api/assets/${f.assetId}/history`)).status).toBe(404);
    expect((await request(f.app).get(`/api/assets/${f.assetId}/history`)).status).toBe(401);
  });

  it('keeps the legacy obligation-history endpoint working', async () => {
    const legacy = await f.agent.get(`/api/assets/${f.assetId}/obligation-history`);
    expect(legacy.status).toBe(200);
    expect(legacy.body.months).toBeDefined();
  });
});
