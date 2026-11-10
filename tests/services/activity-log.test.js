const activityLog = require('../../src/services/activity-log');
const { setupTestDb, cleanupTestDb, createTestUser } = require('../helpers/setup');

describe('activity-log service', () => {
  let db;
  let userId;
  beforeEach(() => {
    db = setupTestDb();
    userId = createTestUser(db).id;
  });
  afterAll(() => cleanupTestDb());

  const entry = (overrides = {}) => ({ method: 'POST', route: '/transactions', action: 'transaction.create', entityType: 'transaction', outcome: 'success', statusCode: 201, message: 'x', ...overrides });
  const route = action => activityLog.ROUTES.find(item => item.action === action);

  it('builds the rent collection message with asset and month', () => {
    const message = activityLog.buildMessage({ route: route('rental.collection'), label: 'Casa Centro, período mayo 2026', outcome: 'success' });
    expect(message).toBe('Registraste el cobro del alquiler de Casa Centro, período mayo 2026');
  });

  it('builds the failure wording', () => {
    expect(activityLog.buildMessage({ route: route('rental.collection-undo'), label: '', outcome: 'failure' })).toBe('Intentaste deshacer un cobro de alquiler, pero no se completó');
  });

  it('uses a generic Spanish message without raw URLs for unmapped routes', () => {
    const ok = activityLog.buildMessage({ route: null, path: '/rentals/zzz/unknown', outcome: 'success' });
    const bad = activityLog.buildMessage({ route: null, path: '/zzz/unknown', outcome: 'failure' });
    expect(ok).toBe('Realizaste un cambio en tus alquileres');
    expect(bad).toBe('Intentaste hacer un cambio en tu cuenta, pero no se completó');
    expect(ok + bad).not.toMatch(/\/|api/);
  });

  it('resolves the label before the handler for DELETE', () => {
    const tx = db.create('transactions', { tipo: 'expense', monto: 1500, currencyCode: 'ARS', titulo: 'Super' }, userId);
    const context = activityLog.resolveContext(db, userId, 'DELETE', `/transactions/${tx.id}`);
    expect(context.route.action).toBe('transaction.delete');
    expect(context.entityLabel).toBe('Super (ARS 1500)');
    expect(activityLog.buildMessage({ route: context.route, label: context.entityLabel, outcome: 'success' })).toBe('Eliminaste una transacción de Super (ARS 1500)');
  });

  it('resolves the label of a PUT before the handler runs', () => {
    const account = db.create('accounts', { name: 'Caja' }, userId);
    expect(activityLog.resolveContext(db, userId, 'PUT', `/accounts/${account.id}`).entityLabel).toBe('Caja');
  });

  it('keeps entries to the documented fields only', () => {
    const created = activityLog.append(db, userId, { ...entry(), body: { password: 'secret' }, password: 'secret' });
    expect(Object.keys(created).sort()).toEqual(['action', 'createdAt', 'entityId', 'entityLabel', 'entityType', 'id', 'message', 'method', 'outcome', 'route', 'statusCode', 'timestamp'].sort());
  });

  it('prunes entries older than 12 months and keeps recent ones', () => {
    const now = new Date('2026-11-10T12:00:00.000Z');
    db.create('activityLogs', entry({ timestamp: '2025-10-01T00:00:00.000Z', message: 'old' }), userId);
    db.create('activityLogs', entry({ timestamp: '2026-09-10T00:00:00.000Z', message: 'recent' }), userId);
    expect(activityLog.pruneOld(db, userId, now)).toBe(1);
    expect(db.findAll('activityLogs', userId).map(item => item.message)).toEqual(['recent']);
  });

  it('prunes at most once per user per day', () => {
    const now = new Date('2026-11-10T12:00:00.000Z');
    expect(activityLog.pruneOld(db, userId, now)).toBe(0);
    db.create('activityLogs', entry({ timestamp: '2025-01-01T00:00:00.000Z' }), userId);
    expect(activityLog.pruneOld(db, userId, now)).toBe(0);
    expect(db.findAll('activityLogs', userId)).toHaveLength(1);
    expect(activityLog.pruneOld(db, userId, new Date('2026-11-11T12:00:00.000Z'))).toBe(1);
  });
});
