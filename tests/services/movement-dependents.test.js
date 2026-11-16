const { setupTestDb, cleanupTestDb, createTestUser } = require('../helpers/setup');
const movementDependents = require('../../src/services/movement-dependents');

describe('movement-dependents', () => {
  let db;
  let userId;
  const expense = (extra = {}) => db.create('transactions', { userId, tipo: 'expense', monto: 10, amountMinor: 1000, currencyCode: 'ARS', titulo: 'Pago', fecha: '2026-11-01', ...extra }, userId);

  beforeAll(() => {
    db = setupTestDb();
    userId = createTestUser(db).id;
  });
  afterAll(() => cleanupTestDb());

  it('finds nothing on a movement without dependents', () => {
    const tx = expense();
    expect(movementDependents.dependentMovement(db, userId, tx, { claims: false })).toBeNull();
    expect(movementDependents.dependentMovement(db, userId, tx, { claims: true })).toBeNull();
  });

  it('detects a refund, a transfer normalization and a movement allocation in both modes', () => {
    const refunded = expense({ titulo: 'Con reembolso' });
    db.create('transactions', { userId, tipo: 'refund', monto: 1, amountMinor: 100, currencyCode: 'ARS', titulo: 'Reintegro', fecha: '2026-11-03', refundSourceId: refunded.id }, userId);
    const normalized = expense({ titulo: 'Normalizada' });
    db.create('transfers', { fecha: '2026-11-02', normalizationAllocations: [{ sourceType: 'income', sourceId: normalized.id }] }, userId);
    const pending = expense({ titulo: 'Pendiente' });
    db.create('transfers', { fecha: '2026-11-04', pendingAllocations: [{ sourceType: 'income', sourceId: pending.id }] }, userId);
    const allocated = expense({ titulo: 'Atribuida' });
    db.create('movementAllocations', { transactionId: allocated.id }, userId);
    [false, true].forEach(claims => {
      expect(movementDependents.dependentMovement(db, userId, refunded, { claims })).toBe('un reembolso (Reintegro, 2026-11-03)');
      expect(movementDependents.dependentMovement(db, userId, normalized, { claims })).toBe('una normalización de transferencia (2026-11-02)');
      expect(movementDependents.dependentMovement(db, userId, pending, { claims })).toBe('una normalización de transferencia (2026-11-04)');
      expect(movementDependents.dependentMovement(db, userId, allocated, { claims })).toBe('una atribución de movimiento');
    });
  });

  it('ignores claims and recoveries when claims is false (rent undo keeps its current behavior)', () => {
    const claimed = expense({ titulo: 'Con reclamo' });
    db.create('recoverableExpenseClaims', { transactionId: claimed.id }, userId);
    const flagged = expense({ titulo: 'Marcada', recoverableClaimId: 'claim-1' });
    const recovered = expense({ titulo: 'Recuperada' });
    db.create('recoveries', { transactionId: recovered.id, claimId: 'claim-x' }, userId);
    [claimed, flagged, recovered].forEach(tx => expect(movementDependents.dependentMovement(db, userId, tx, { claims: false })).toBeNull());
    expect(movementDependents.dependentMovement(db, userId, claimed, { claims: true })).toBe('un gasto a recuperar');
    expect(movementDependents.dependentMovement(db, userId, flagged, { claims: true })).toBe('un gasto a recuperar');
    expect(movementDependents.dependentMovement(db, userId, recovered, { claims: true })).toBe('un recupero de gastos');
  });

  it('defaults to claims:false and the index answers many movements from one scan', () => {
    const tx = expense({ titulo: 'Reclamada otra' });
    db.create('recoverableExpenseClaims', { transactionId: tx.id }, userId);
    expect(movementDependents.dependentMovement(db, userId, tx)).toBeNull();
    const index = movementDependents.buildIndex(db, userId, { claims: true });
    expect(index.find(tx)).toBe('un gasto a recuperar');
    expect(index.find(expense({ titulo: 'Libre' }))).toBeNull();
  });

  it('is what the rent collection undo delegates to (same message as before)', () => {
    const rentals = require('../../src/services/rentals');
    expect(typeof rentals.reverseCollection).toBe('function');
    const source = require('fs').readFileSync(require('path').join(__dirname, '../../src/services/rentals.js'), 'utf8');
    expect(source).toContain("require('./movement-dependents')");
    expect(source).toContain('movementDependents.dependentMovement(db, userId, transaction, { claims: false })');
  });
});
