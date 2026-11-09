const obligations = require('../../src/services/obligations');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

const USER = 'status-user';
const TODAY = '2030-06-15';
const PAST = '2030-06-01';
const FUTURE = '2030-06-30';

// Reference copy of the pre-evolutivo expression, used to prove legacy equivalence.
function legacyView(db, occurrence, today) {
  const payments = db.findAll('transactions', USER).filter(tx => tx.obligationOccurrenceId === occurrence.id);
  const paidMinor = payments.reduce((total, tx) => total + (Number.isSafeInteger(tx.amountMinor) ? tx.amountMinor : 0), 0);
  const dueMinor = Number.isSafeInteger(occurrence.dueAmountMinor) ? occurrence.dueAmountMinor : 0;
  const status = occurrence.status === 'cancelled' ? 'cancelled' : paidMinor >= dueMinor && paidMinor > 0 ? 'paid' : occurrence.date < today ? 'overdue' : paidMinor > 0 ? 'partial' : occurrence.status === 'confirmed' ? 'confirmed' : 'expected';
  return {
    ...occurrence, status, actualDueAmount: ledger.fromMinorUnits(dueMinor, occurrence.currencyCode),
    totalPaid: ledger.fromMinorUnits(paidMinor, occurrence.currencyCode),
    remainingAmount: ledger.fromMinorUnits(Math.max(0, dueMinor - paidMinor), occurrence.currencyCode),
    paymentIds: payments.map(tx => tx.id)
  };
}

describe('occurrenceView status algorithm', () => {
  let db;

  beforeAll(() => { db = setupTestDb(); });
  afterAll(() => cleanupTestDb());

  function build(definition, { date = FUTURE, dueMinor = 10000, paidMinor = 0, resolved = false, occurrenceStatus = 'expected' } = {}) {
    const obligation = db.create('obligations', { title: 'Fee', currencyCode: 'EUR', status: 'active', ...definition }, USER);
    const occurrence = db.create('obligationOccurrences', {
      obligationId: obligation.id, date, status: occurrenceStatus, currencyCode: 'EUR', dueAmountMinor: dueMinor, title: 'Fee'
    }, USER);
    if (paidMinor) db.create('transactions', { userId: USER, tipo: 'expense', amountMinor: paidMinor, monto: paidMinor / 100, obligationOccurrenceId: occurrence.id }, USER);
    if (resolved) db.create('obligationResolutions', { occurrenceId: occurrence.id, status: 'active', amountMinor: 1 }, USER);
    return { obligation, occurrence, view: () => obligations.occurrenceView(db, USER, db.findById('obligationOccurrences', occurrence.id, USER), TODAY) };
  }

  const shared = { responsibilityType: 'shared', responsibilitySplit: { type: 'percentage', ownerPercent: 50, tenantPercent: 50 } };

  it('keeps the legacy output byte-for-byte when the tenant portion is zero', () => {
    const definitions = [{}, { responsibilityType: 'owner' }, { responsibilityType: 'third' }, { responsibilityType: 'none' }, { responsibilityType: 'shared', responsibilitySplit: { type: 'other', ruleText: 'by usage' } }];
    for (const definition of definitions) {
      for (const date of [PAST, FUTURE]) {
        for (const paidMinor of [0, 4000, 10000, 12000]) {
          for (const occurrenceStatus of ['expected', 'confirmed', 'cancelled']) {
            const built = build(definition, { date, paidMinor, occurrenceStatus });
            const stored = db.findById('obligationOccurrences', built.occurrence.id, USER);
            expect(built.view()).toEqual(legacyView(db, stored, TODAY));
          }
        }
      }
    }
  });

  it('does not add portion fields to legacy views', () => {
    const view = build({ responsibilityType: 'owner' }).view();
    expect(view).not.toHaveProperty('tenantDueAmount');
    expect(view).not.toHaveProperty('resolution');
  });

  it('owner responsibility: expected, partial, paid, overdue', () => {
    expect(build({ responsibilityType: 'owner' }).view().status).toBe('expected');
    expect(build({ responsibilityType: 'owner' }, { paidMinor: 5000 }).view().status).toBe('partial');
    expect(build({ responsibilityType: 'owner' }, { paidMinor: 10000 }).view().status).toBe('paid');
    expect(build({ responsibilityType: 'owner' }, { date: PAST }).view().status).toBe('overdue');
  });

  it('tenant responsibility: pending, overdue, resolved', () => {
    const tenant = { responsibilityType: 'tenant' };
    const pending = build(tenant).view();
    expect(pending).toMatchObject({ status: 'expected', remainingAmount: 0, ownerDueAmount: 0, tenantDueAmount: 100, tenantRemainingAmount: 100, resolution: null });
    expect(build(tenant, { occurrenceStatus: 'confirmed' }).view().status).toBe('confirmed');
    expect(build(tenant, { date: PAST }).view().status).toBe('overdue');
    const resolved = build(tenant, { date: PAST, resolved: true }).view();
    expect(resolved).toMatchObject({ status: 'resolved', tenantRemainingAmount: 0, remainingAmount: 0 });
    expect(resolved.resolution).toMatchObject({ status: 'active' });
  });

  it('tenant responsibility ignores voided resolutions and cancelled occurrences', () => {
    const built = build({ responsibilityType: 'tenant' }, { resolved: true });
    const active = db.findAll('obligationResolutions', USER).find(item => item.occurrenceId === built.occurrence.id);
    db.update('obligationResolutions', active.id, { status: 'voided' }, USER);
    expect(built.view().status).toBe('expected');
    expect(build({ responsibilityType: 'tenant' }, { occurrenceStatus: 'cancelled' }).view().status).toBe('cancelled');
  });

  it('shared responsibility: owner and tenant portions settle independently', () => {
    expect(build(shared).view()).toMatchObject({ status: 'expected', ownerDueAmount: 50, tenantDueAmount: 50, remainingAmount: 50, tenantRemainingAmount: 50 });
    expect(build(shared, { paidMinor: 5000 }).view()).toMatchObject({ status: 'partial', remainingAmount: 0, tenantRemainingAmount: 50 });
    expect(build(shared, { resolved: true }).view()).toMatchObject({ status: 'partial', remainingAmount: 50, tenantRemainingAmount: 0 });
    expect(build(shared, { paidMinor: 5000, resolved: true }).view().status).toBe('paid');
    expect(build(shared, { date: PAST, paidMinor: 5000 }).view().status).toBe('overdue');
    expect(build(shared, { date: PAST, resolved: true }).view().status).toBe('overdue');
  });

  it('shared: owner payments never reduce the tenant portion and resolution never reduces the owner remainder', () => {
    const view = build(shared, { paidMinor: 3000, resolved: true }).view();
    expect(view).toMatchObject({ remainingAmount: 20, tenantRemainingAmount: 0, totalPaid: 30, status: 'partial' });
  });
});
