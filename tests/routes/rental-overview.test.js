const request = require('supertest');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const ledger = require('../../src/services/account-ledger');

describe('GET /api/rentals/declarations/:id and /overview', () => {
  let f;
  const plusDays = (date, days) => { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
  const today = () => ledger.localDateForUser(f.db, f.userId);
  const overview = (id, query = {}) => f.agent.get(`/api/rentals/declarations/${id}/overview`).query(query);

  beforeEach(async () => { f = await setupRentFixture('rental-overview'); });
  afterAll(() => cleanupTestDb());

  it('returns the rental view by id (modalities and tenants)', async () => {
    const created = (await f.declare([f.modality('locacion'), f.modality('comodato', { amount: 50000 })])).body;
    const response = await f.agent.get(`/api/rentals/declarations/${created.id}`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: created.id, assetId: f.assetId, status: 'active' });
    expect(response.body.modalities.map(item => item.kind)).toEqual(['locacion', 'comodato']);
    expect(response.body.tenants.map(item => item.name)).toEqual(['Tenant']);
  });

  it('returns an active header with tenants, validity, monthly total and modality cards', async () => {
    const start = plusDays(today(), -60);
    const created = (await f.declare([
      f.modality('locacion', { startDate: start, endDate: plusDays(start, 700), ivaPercent: 21 }),
      f.modality('comodato', { startDate: start, endDate: plusDays(start, 700), amount: 50000 })
    ])).body;
    const response = await overview(created.id);
    expect(response.status).toBe(200);
    const { header, modalities } = response.body;
    expect(header).toMatchObject({ status: 'active', assetName: 'Casa Centro', from: start, to: plusDays(start, 700) });
    expect(header.tenants.map(item => item.name)).toEqual(['Tenant']);
    expect(header.monthlyTotals).toEqual([{ currencyCode: 'ARS', amount: 171000 }]);
    expect(modalities).toHaveLength(2);
    expect(modalities[0]).toMatchObject({ modality: 'locacion', status: 'active', classification: 'A', ivaPercent: 21, originalAmount: 121000, currentAmount: 121000, currencyCode: 'ARS' });
    expect(modalities[1]).toMatchObject({ modality: 'comodato', classification: 'B', ivaPercent: null, currentAmount: 50000 });
    expect(modalities[0].futureDueDates.length).toBeGreaterThan(5);
    expect(modalities[0].futureDueDates.every(date => date >= today())).toBe(true);
  });

  it('reports "ending-soon" within 30 days, "upcoming" before the start and "ended" after finishing', async () => {
    const soon = (await f.declare([f.modality('locacion', { startDate: plusDays(today(), -100), endDate: plusDays(today(), 20) })])).body;
    expect((await overview(soon.id)).body.header.status).toBe('ending-soon');
    expect((await f.agent.post(`/api/rentals/declarations/${soon.id}/end`).send({ endDate: plusDays(today(), -1) })).status).toBe(200);
    expect((await overview(soon.id)).body.header.status).toBe('ended');
    const future = (await f.declare([f.modality('locacion', { startDate: plusDays(today(), 60), endDate: plusDays(today(), 500) })])).body;
    expect((await overview(future.id)).body.header.status).toBe('upcoming');
  });

  it('computes the collection progress per modality and in total, with counts and a year filter', async () => {
    const created = (await f.declare([f.modality('locacion', { ivaPercent: null }), f.modality('comodato', { amount: 50000 })])).body;
    const january = kind => created.modalities.find(item => item.kind === kind).occurrences.find(item => item.date === '2025-01-01');
    const locacion = january('locacion');
    expect((await f.agent.post('/api/rentals/collections/month').send({
      idempotencyKey: 'overview-progress-1', lines: [{ occurrenceId: locacion.id, amount: locacion.rentMinor / 100, accountId: f.accountId, date: '2025-01-02' }]
    })).status).toBe(201);
    const { progress } = (await overview(created.id, { year: '2025' })).body;
    expect(progress.byModality.map(item => [item.modality, item.collected, item.expected])).toEqual([['locacion', 1, 12], ['comodato', 0, 12]]);
    expect(progress.total).toEqual([{ currencyCode: 'ARS', expected: 1800000, collected: 100000 }]);
    expect(progress.counts).toEqual({ expected: 12, collected: 0, partial: 1, overdue: 11, pending: 0, cancelled: 0 });
    const other = (await overview(created.id, { year: '2030' })).body;
    expect(other.year).toBe('2030');
    expect(other.progress.counts.expected).toBe(0);
  });

  it('shows an overdue rent alert with a direct collect action, and no alerts when nothing applies', async () => {
    const overdue = (await f.declare([f.modality('locacion')])).body;
    const alerts = (await overview(overdue.id)).body.alerts;
    expect(alerts.find(alert => alert.type === 'rent_due')).toMatchObject({ action: 'collect', status: 'overdue' });
    const clean = await setupRentFixture('rental-overview-clean');
    const future = (await clean.declare([clean.modality('locacion', { startDate: plusDays(today(), 200), endDate: plusDays(today(), 600) })])).body;
    expect((await clean.agent.get(`/api/rentals/declarations/${future.id}/overview`)).body.alerts).toEqual([]);
  });

  it('never writes: generated periods of any year stay in memory', async () => {
    const created = (await f.declare([f.modality('locacion', { startDate: '2025-01-01', endDate: null })])).body;
    const count = () => f.db.findAll('rentOccurrences', f.userId).length;
    const before = count();
    expect((await overview(created.id, { year: '2031' })).status).toBe(200);
    expect(count()).toBe(before);
  });

  it('answers 404 for unknown and foreign rentals, 400 for an invalid year, 401 without session', async () => {
    const created = (await f.declare([f.modality('locacion')])).body;
    expect((await overview('missing')).status).toBe(404);
    expect((await f.other.get(`/api/rentals/declarations/${created.id}/overview`)).status).toBe(404);
    expect((await f.other.get(`/api/rentals/declarations/${created.id}`)).status).toBe(404);
    const invalid = await overview(created.id, { year: '20x6' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe('El año no es válido');
    expect((await request(f.app).get(`/api/rentals/declarations/${created.id}/overview`)).status).toBe(401);
  });
});
