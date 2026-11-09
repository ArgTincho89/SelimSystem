const alerts = require('../../src/services/alerts');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('alerts service read-only view', () => {
  let db;

  beforeAll(() => { db = setupTestDb(); });
  afterAll(() => cleanupTestDb());

  it('stages created records in memory without touching the database', () => {
    const view = alerts.readOnlyView(db);
    const created = view.create('obligationOccurrences', { generationKey: 'o1:2030-01-01', date: '2030-01-01' }, 'u1');
    expect(created.id).toBe('virtual:o1:2030-01-01');
    expect(view.findAll('obligationOccurrences', 'u1')).toHaveLength(1);
    expect(view.findAll('obligationOccurrences', 'u1', { date: '2031-01-01' })).toHaveLength(0);
    expect(view.findById('obligationOccurrences', created.id, 'u1')).toMatchObject({ date: '2030-01-01' });
    expect(view.query('obligationOccurrences', 'u1', item => item.date === '2030-01-01')).toHaveLength(1);
    expect(view.update()).toBeNull();
    expect(view.remove()).toBe(false);
    view.replace();
    view.clearCache();
    expect(db.findAll('obligationOccurrences', 'u1')).toHaveLength(0);
  });

  it('exposes the supported alert types', () => {
    expect(alerts.ALERT_TYPES).toEqual(expect.arrayContaining([
      'obligation_due', 'obligation_overdue', 'rent_due', 'contract_expiry', 'rent_adjustment_due',
      'card_installment_due', 'account_forecast', 'document_pending', 'partial_payment', 'tenant_obligation_pending'
    ]));
    expect(alerts.DEFAULT_HORIZON_DAYS).toBe(90);
    expect(alerts.DEFAULT_LIMIT).toBe(200);
  });
});
