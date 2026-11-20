const fs = require('fs');
const path = require('path');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const ledger = require('../../src/services/account-ledger');

describe('Retroactive rent adjustment (up to 3 past due dates)', () => {
  let f;
  let contractId;
  let declarationId;
  const today = () => ledger.localDateForUser(f.db, f.userId);
  const monthStart = delta => { const value = new Date(`${today().slice(0, 7)}-01T00:00:00.000Z`); value.setUTCMonth(value.getUTCMonth() + delta); return value.toISOString().slice(0, 10); };
  const preview = query => f.agent.get(`/api/rentals/${contractId}/conditions/preview`).query(query);
  const percentage = effectiveDate => ({ method: 'percentage', percentage: 10, effectiveDate });

  beforeEach(async () => {
    f = await setupRentFixture('rental-condition-retro');
    const created = (await f.declare([f.modality('locacion', { startDate: monthStart(-6), endDate: monthStart(9), ivaPercent: null })])).body;
    contractId = created.modalities[0].contractId;
    declarationId = created.id;
  });
  afterAll(() => cleanupTestDb());

  const pastDueDates = () => {
    const rentals = require('../../src/services/rentals');
    const contract = f.db.findById('rentalContracts', contractId, f.userId);
    return rentals.retroDueDates(f.db, f.userId, contract, today());
  };

  it('offers exactly the last 3 past due dates and accepts them', async () => {
    const past = pastDueDates();
    expect(past).toHaveLength(3);
    expect(past.every(date => date < today())).toBe(true);
    const ok = await preview(percentage(past[0]));
    expect(ok.status).toBe(200);
    expect(ok.body.affectedDates).toContain(past[0]);
  });

  it('rejects a due date older than the last 3', async () => {
    const tooOld = monthStart(-6);
    expect(pastDueDates()).not.toContain(tooOld);
    const res = await preview(percentage(tooOld));
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Solo se puede actualizar de forma retroactiva hasta 3 vencimientos anteriores');
  });

  it('updates uncollected past periods and keeps collected ones with their amount', async () => {
    const past = pastDueDates();
    const occurrences = f.db.findAll('rentOccurrences', f.userId).filter(item => item.contractId === contractId && !item.cancelled);
    const collected = occurrences.find(item => item.date === past[1]);
    f.db.create('rentCollectionAllocations', { collectionId: 'c-retro', occurrenceId: collected.id, amountMinor: collected.rentMinor, currencyCode: 'ARS' }, f.userId);
    const applied = await f.agent.post(`/api/rentals/${contractId}/conditions`).send(percentage(past[0]));
    expect(applied.status).toBe(201);
    const after = (await f.agent.get(`/api/rentals/${contractId}`)).body.occurrences.filter(item => !item.cancelled);
    const byDate = date => after.find(item => item.date === date);
    expect(byDate(past[1]).rentMinor).toBe(collected.rentMinor);
    expect(byDate(past[0]).rentMinor).toBe(Math.round(collected.rentMinor * 1.1));
    expect(byDate(past[2]).rentMinor).toBe(Math.round(collected.rentMinor * 1.1));
  });

  it('lists the past due dates in the rental overview and the dialog marks them as retroactive', async () => {
    const overview = (await f.agent.get(`/api/rentals/declarations/${declarationId}/overview`)).body;
    const card = overview.modalities.find(item => item.contractId === contractId);
    expect(card.pastDueDates).toEqual(pastDueDates());
    const source = fs.readFileSync(path.join(__dirname, '../../public/js/pages/rentalModal.js'), 'utf8');
    expect(source).toContain('(retroactivo)');
    expect(source).toContain('Podés elegir hasta 3 vencimientos anteriores. Los períodos ya cobrados conservan su importe.');
  });
});
