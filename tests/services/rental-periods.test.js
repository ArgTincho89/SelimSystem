const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const rentalPeriods = require('../../src/services/rental-periods');
const ledger = require('../../src/services/account-ledger');

describe('rental-periods service', () => {
  let f;
  const plusDays = (date, days) => { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };

  beforeEach(async () => { f = await setupRentFixture('rental-periods-svc'); });
  afterAll(() => cleanupTestDb());

  const today = () => ledger.localDateForUser(f.db, f.userId);
  const declaration = body => f.db.findById('rentalDeclarations', body.id, f.userId);

  describe('headerStatus', () => {
    const contract = (overrides = {}) => ({ status: 'active', startDate: '2026-01-01', endDate: null, ...overrides });

    it('is active for an open-ended or far-from-expiry rental', () => {
      expect(rentalPeriods.headerStatus([contract()], '2026-11-16')).toBe('active');
      expect(rentalPeriods.headerStatus([contract({ endDate: '2027-05-16' })], '2026-11-16')).toBe('active');
    });

    it('is ending-soon when the last end date is within 30 days', () => {
      expect(rentalPeriods.headerStatus([contract({ endDate: '2026-12-06' })], '2026-11-16')).toBe('ending-soon');
      expect(rentalPeriods.headerStatus([contract({ endDate: '2026-12-16' })], '2026-11-16')).toBe('ending-soon');
      expect(rentalPeriods.headerStatus([contract({ endDate: '2026-12-17' })], '2026-11-16')).toBe('active');
    });

    it('is upcoming before the start and ended when nothing is active or the end date passed', () => {
      expect(rentalPeriods.headerStatus([contract({ startDate: '2026-12-01' })], '2026-11-16')).toBe('upcoming');
      expect(rentalPeriods.headerStatus([contract({ status: 'ended', endDate: '2026-06-30' })], '2026-11-16')).toBe('ended');
      expect(rentalPeriods.headerStatus([contract({ endDate: '2026-10-31' })], '2026-11-16')).toBe('ended');
    });
  });

  it('builds one period per month with every modality part and a consolidated state', async () => {
    const created = (await f.declare([f.modality('locacion', { ivaPercent: null }), f.modality('comodato', { amount: 50000 })])).body;
    const periods = rentalPeriods.rentPeriods(f.db, f.userId, declaration(created), { from: '2025-01-01', to: '2025-12-31', today: today() });
    expect(periods).toHaveLength(12);
    expect(periods[0]).toMatchObject({ period: '2025-01', dueDate: '2025-01-01', state: 'overdue' });
    expect(periods[0].parts.map(part => [part.modality, part.expected, part.classification, part.actionable])).toEqual([['locacion', 100000, 'A', true], ['comodato', 50000, 'B', true]]);
    expect(periods[0].totals).toEqual([{ currencyCode: 'ARS', expected: 150000, collected: 0, remaining: 150000 }]);
  });

  it('marks generated periods as virtual and not actionable, without persisting them', async () => {
    const created = (await f.declare([f.modality('locacion', { startDate: '2025-01-01', endDate: null })])).body;
    const stored = () => f.db.findAll('rentOccurrences', f.userId).length;
    const before = stored();
    const far = plusDays(today(), 800);
    const periods = rentalPeriods.rentPeriods(f.db, f.userId, declaration(created), { from: plusDays(today(), 700), to: far, today: today() });
    expect(periods.length).toBeGreaterThan(0);
    expect(periods.every(period => period.parts.every(part => part.actionable === false && part.occurrenceId.startsWith('virtual:')))).toBe(true);
    expect(stored()).toBe(before);
  });

  it('is partial when one modality is collected and the other is not, collected when all are', async () => {
    const created = (await f.declare([f.modality('locacion', { ivaPercent: null }), f.modality('comodato', { amount: 50000 })])).body;
    const february = kind => created.modalities.find(item => item.kind === kind).occurrences.find(item => item.date === '2025-02-01');
    const collect = (key, occurrence) => f.agent.post('/api/rentals/collections/month').send({ idempotencyKey: key, lines: [{ occurrenceId: occurrence.id, amount: occurrence.rentMinor / 100, accountId: f.accountId, date: '2025-02-02' }] });
    expect((await collect('periods-svc-1', february('locacion'))).status).toBe(201);
    const find = () => rentalPeriods.rentPeriods(f.db, f.userId, declaration(created), { from: '2025-02-01', to: '2025-02-28', today: today() })[0];
    expect(find()).toMatchObject({ state: 'partial', overdue: true });
    expect((await collect('periods-svc-2', february('comodato'))).status).toBe(201);
    expect(find()).toMatchObject({ state: 'collected', overdue: false });
  });

  it('reports a fully cancelled month as cancelled and drops superseded adjustment occurrences', async () => {
    const start = plusDays(today(), 5);
    const created = (await f.declare([f.modality('locacion', { startDate: start, endDate: plusDays(start, 200), ivaPercent: null })])).body;
    const occurrence = created.modalities[0].occurrences[0];
    expect((await f.agent.post(`/api/rentals/${created.modalities[0].contractId}/occurrences/${occurrence.id}/cancel`).send({})).status).toBe(200);
    const periods = rentalPeriods.rentPeriods(f.db, f.userId, declaration(created), { from: start, to: plusDays(start, 40), today: today() });
    expect(periods[0]).toMatchObject({ dueDate: start, state: 'cancelled' });
  });
});
