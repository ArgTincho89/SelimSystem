const request = require('supertest');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const ledger = require('../../src/services/account-ledger');

describe('Rent adjustment: preview and skip-collected apply', () => {
  let f;
  let contractId;
  let start;
  let end;
  let effective;
  const today = () => ledger.localDateForUser(f.db, f.userId);
  const firstOfMonth = (date, delta) => { const value = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`); value.setUTCMonth(value.getUTCMonth() + delta); return value.toISOString().slice(0, 10); };
  const preview = query => f.agent.get(`/api/rentals/${contractId}/conditions/preview`).query(query);
  const percentage = (extra = {}) => ({ method: 'percentage', percentage: 30, effectiveDate: effective, ...extra });
  const logs = () => f.db.findAll('activityLogs', f.userId);
  const occurrences = async () => (await f.agent.get(`/api/rentals/${contractId}`)).body.occurrences;

  beforeEach(async () => {
    f = await setupRentFixture('rental-condition-preview');
    start = firstOfMonth(today(), -2);
    end = firstOfMonth(today(), 9);
    effective = firstOfMonth(today(), 1);
    const created = (await f.declare([f.modality('locacion', { startDate: start, endDate: end, ivaPercent: null })])).body;
    contractId = created.modalities[0].contractId;
  });
  afterAll(() => cleanupTestDb());

  it('previews the new amount, the updated periods and the collected ones it skips, without writing or logging', async () => {
    const logCount = logs().length;
    const before = JSON.stringify(f.db.findAll('rentalConditions', f.userId)) + f.db.findAll('rentOccurrences', f.userId).length;
    const response = await preview(percentage());
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ currencyCode: 'ARS', previousAmount: 100000, newAmount: 130000, effectiveDate: effective, skippedCollectedDates: [] });
    expect(response.body.affectedDates[0]).toBe(effective);
    expect(response.body.affectedDates.at(-1)).toBe(end);
    expect(response.body.affectedDates).toHaveLength(9);
    expect(JSON.stringify(f.db.findAll('rentalConditions', f.userId)) + f.db.findAll('rentOccurrences', f.userId).length).toBe(before);
    expect(logs().length).toBe(logCount);
  });

  it('supports manual amounts and index adjustments in the preview', async () => {
    expect((await preview({ method: 'manual', rentAmount: 150000, effectiveDate: effective })).body.newAmount).toBe(150000);
    const index = await preview({ method: 'index', indexValue: 120, baseIndexValue: 100, effectiveDate: effective });
    expect(index.body.newAmount).toBe(120000);
  });

  it('reports the amounts with IVA included', async () => {
    const other = await setupRentFixture('rental-condition-preview-iva');
    const created = (await other.declare([other.modality('locacion', { startDate: start, endDate: end, ivaPercent: 21 })])).body;
    f = other;
    contractId = created.modalities[0].contractId;
    const response = await preview(percentage());
    expect(response.body).toMatchObject({ previousAmount: 121000, newAmount: 157300, ivaPercent: 21 });
  });

  it('skips collected periods: previews them as skipped and applies only to the uncollected ones', async () => {
    const collectedOccurrence = (await occurrences()).find(item => item.date === effective);
    const collected = await f.agent.post('/api/rentals/collections/month').send({
      idempotencyKey: 'condition-preview-1', lines: [{ occurrenceId: collectedOccurrence.id, amount: collectedOccurrence.rentMinor / 100, accountId: f.accountId, date: today() }]
    });
    expect(collected.status).toBe(201);
    const dry = await preview(percentage());
    expect(dry.body.skippedCollectedDates).toEqual([effective]);
    expect(dry.body.affectedDates).not.toContain(effective);
    expect(dry.body.affectedDates).toHaveLength(8);
    const applied = await f.agent.post(`/api/rentals/${contractId}/conditions`).send(percentage());
    expect(applied.status).toBe(201);
    expect(applied.body).toMatchObject({ method: 'percentage', skippedCollectedDates: [effective] });
    expect(applied.body.updatedDates).not.toContain(effective);
    const list = await occurrences();
    const live = list.filter(item => !item.cancelled);
    expect(live.find(item => item.date === effective)).toMatchObject({ rentAmount: 100000, paidAmount: 100000, status: 'collected' });
    const next = live.find(item => item.date === firstOfMonth(today(), 2));
    expect(next.rentAmount).toBe(130000);
    expect(list.filter(item => item.cancelled && item.supersededByConditionId).map(item => item.date)).not.toContain(effective);
  });

  it('logs the adjustment with its specific action and keeps GET previews unlogged', async () => {
    await preview(percentage());
    expect(logs().some(entry => entry.action === 'rental.condition')).toBe(false);
    expect((await f.agent.post(`/api/rentals/${contractId}/conditions`).send(percentage())).status).toBe(201);
    expect(logs().some(entry => entry.action === 'rental.condition' && entry.outcome === 'success')).toBe(true);
  });

  it('rejects non due dates, invalid methods and values without changing any period', async () => {
    expect((await preview(percentage({ effectiveDate: `${effective.slice(0, 8)}15` }))).body.error).toBe('La fecha efectiva debe coincidir con un vencimiento del contrato');
    expect((await preview({ method: 'weird', effectiveDate: effective })).status).toBe(400);
    expect((await preview(percentage({ percentage: 'abc' }))).status).toBe(400);
    expect((await preview({ method: 'manual', effectiveDate: effective })).body.error).toBe('El alquiler resultante no es válido');
    expect(f.db.findAll('rentalConditions', f.userId)).toEqual([]);
  });

  it('answers 404 for an unknown or foreign contract and 401 without a session', async () => {
    expect((await f.agent.get('/api/rentals/missing/conditions/preview').query(percentage())).status).toBe(404);
    expect((await f.other.get(`/api/rentals/${contractId}/conditions/preview`).query(percentage())).status).toBe(404);
    expect((await request(f.app).get(`/api/rentals/${contractId}/conditions/preview`).query(percentage())).status).toBe(401);
  });
});
