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

  describe('describe(route, facts)', () => {
    const resolve = () => route('obligation.resolve');
    const full = { title: 'Impuesto Municipal', assetName: 'Casa Centro', amount: 15000, currencyCode: 'ARS', dueDate: '2026-11-10' };

    it('builds the full descriptive label', () => {
      expect(activityLog.describe(resolve(), full)).toBe('Impuesto Municipal de la propiedad Casa Centro, por un monto de ARS 15.000, con vencimiento 10/11/2026');
      expect(activityLog.buildMessage({ route: resolve(), label: activityLog.describe(resolve(), full), outcome: 'success' }))
        .toBe('Resolviste un vencimiento de la obligación Impuesto Municipal de la propiedad Casa Centro, por un monto de ARS 15.000, con vencimiento 10/11/2026');
    });

    it('drops the fragments whose facts are missing', () => {
      const label = activityLog.describe(resolve(), { title: 'Expensas', amount: undefined, currencyCode: 'ARS', dueDate: null, assetName: '' });
      expect(label).toBe('Expensas');
      expect(label).not.toMatch(/undefined|null|\[\]/);
      expect(activityLog.describe(resolve(), { ...full, amount: null })).toBe('Impuesto Municipal de la propiedad Casa Centro, con vencimiento 10/11/2026');
    });

    it('prints the installment only when it is provided and valid', () => {
      expect(activityLog.describe(resolve(), { ...full, installment: { number: 3, total: 12 } })).toMatch(/, cuota 3\/12$/);
      expect(activityLog.describe(resolve(), full)).not.toMatch(/cuota/);
      expect(activityLog.describe(resolve(), { ...full, installment: { number: 5, total: 2 } })).not.toMatch(/cuota/);
    });

    it('formats decimals and joins several currencies', () => {
      expect(activityLog.formatAmount(1234567.5)).toBe('1.234.567,5');
      expect(activityLog.formatAmount(10.25)).toBe('10,25');
      expect(activityLog.describe(route('rental.collection'), { amounts: [{ amount: 100, currencyCode: 'ARS' }, { amount: 5, currencyCode: 'USD' }] }, 'Casa'))
        .toBe('Casa, por un monto de ARS 100 + USD 5');
    });

    it('caps the label at 300 characters', () => {
      expect(activityLog.describe(resolve(), { ...full, title: 'x'.repeat(500) }).length).toBe(300);
    });
  });

  it('stores the additive metadata fields and keeps old entries readable', () => {
    db.create('activityLogs', { ...entry(), timestamp: '2026-01-01T00:00:00.000Z' }, userId);
    const created = activityLog.append(db, userId, entry({ assetId: 'a1', ownerIds: ['o1'], tenantIds: ['t1'], categoryId: 'c1', undo: { type: 'rental.collection', collectionId: 'x' } }));
    expect(created).toMatchObject({ assetId: 'a1', ownerIds: ['o1'], tenantIds: ['t1'], categoryId: 'c1', undo: { type: 'rental.collection', collectionId: 'x' } });
    expect(activityLog.list(db, userId).items).toHaveLength(2);
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
    expect(Object.keys(created).sort()).toEqual(['action', 'assetId', 'categoryId', 'createdAt', 'entityId', 'entityLabel', 'entityType', 'id', 'message', 'method', 'outcome', 'ownerIds', 'route', 'statusCode', 'tenantIds', 'timestamp', 'undo'].sort());
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
