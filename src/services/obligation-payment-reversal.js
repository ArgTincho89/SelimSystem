// "Revertir pago": undoes ONE registered payment of an owner obligation. The expense transaction is removed (so every
// balance, month total, saving and alert recomputes from the transactions) and a tombstone keeps a snapshot, the
// reason, the key hash of the original request and the receipts. The occurrence status is derived from its remaining
// payments, so it needs no write.
const ledger = require('./account-ledger');
const obligations = require('./obligations');
const movementDependents = require('./movement-dependents');
const { MAX_REASON, REASON_ERROR, parseReason } = require('./reasons');

const REVERSALS = 'obligationPaymentReversals';
const TOUCHED = ['transactions', 'documents', 'accounts', REVERSALS];

const DEPENDENT_ERROR = 'No se puede revertir este pago porque tiene movimientos dependientes.';
const ALREADY_REVERTED = 'Ese pago ya fue revertido';
const REPLAY_REVERTED = 'Ese pago fue revertido; registrá uno nuevo';
const TENANT_ERROR = 'Este pago pertenece a una obligación a cargo del inquilino; anulá la resolución en lugar de revertir un pago.';

const fail = (error, status = 400) => ({ error, status });

/** The tombstone of a payment (by its transaction id) or of an idempotency key hash, if it was reverted. */
function reversalOf(db, userId, { transactionId = null, keyHash = null } = {}) {
  return db.findAll(REVERSALS, userId).find(item => (transactionId && item.transactionId === transactionId) || (keyHash && item.idempotencyKeyHash === keyHash)) || null;
}

function isTenantSide(obligation, occurrence) {
  return obligations.responsibilityFor(obligation, occurrence).responsibilityType === 'tenant';
}

function resetsReconciliation(account, transaction) {
  return Boolean(account && account.reconciled && account.openingDate && (transaction.fecha < account.openingDate || (account.includedMovementIds || []).includes(transaction.id)));
}

/** Everything the confirmation dialog shows, and whether the payment can be reverted. */
function paymentDetail(db, userId, obligation, occurrence, transaction) {
  const account = db.findById('accounts', transaction.accountId, userId);
  const method = transaction.paymentMethodId ? db.findById('paymentMethods', transaction.paymentMethodId, userId) : null;
  const documents = db.findAll('documents', userId).filter(item => item.transactionId === transaction.id || item.occurrenceId === occurrence.id)
    .map(({ storageKey, ...item }) => item);
  const dependent = movementDependents.dependentMovement(db, userId, transaction, { claims: true });
  const tenantSide = isTenantSide(obligation, occurrence);
  const currency = transaction.currencyCode || occurrence.currencyCode;
  return {
    payment: {
      id: transaction.id, date: transaction.fecha, amount: ledger.fromMinorUnits(transaction.amountMinor ?? ledger.toMinorUnits(transaction.monto, currency), currency),
      currencyCode: currency, title: transaction.titulo || '', notes: transaction.comments || '', accountId: transaction.accountId || null
    },
    obligation: { id: obligation.id, title: obligation.title }, occurrence: { id: occurrence.id, date: occurrence.date, title: occurrence.title || obligation.title },
    account: account ? { id: account.id, name: account.nombre || account.name || '', currency: account.currency } : null,
    paymentMethod: method?.name || transaction.paymentMethod || '',
    documents,
    dependent: dependent ? `Tiene ${dependent}.` : null,
    revertible: !dependent && !tenantSide,
    reconciliationWillReset: resetsReconciliation(account, transaction)
  };
}

/**
 * Reverts one payment. `reason` is required (1 to 500 characters, trimmed). Atomic: on any failure the touched collections
 * are restored from a snapshot. Returns `{ reversal, reconciliationReset }` or `{ error, status }`.
 */
function revert(db, userId, { obligation, occurrence, transaction, reason }) {
  const reversalReason = parseReason(reason);
  if (!reversalReason) return fail(REASON_ERROR);
  if (reversalOf(db, userId, { transactionId: transaction.id })) return fail(ALREADY_REVERTED, 409);
  if (isTenantSide(obligation, occurrence)) return fail(TENANT_ERROR, 409);
  if (movementDependents.dependentMovement(db, userId, transaction, { claims: true })) return fail(DEPENDENT_ERROR, 409);

  const account = db.findById('accounts', transaction.accountId, userId);
  const reset = resetsReconciliation(account, transaction);
  const documents = db.findAll('documents', userId).filter(item => item.transactionId === transaction.id);
  const currency = transaction.currencyCode || occurrence.currencyCode;
  const method = transaction.paymentMethodId ? db.findById('paymentMethods', transaction.paymentMethodId, userId) : null;
  const snapshots = TOUCHED.map(name => [name, db.findAll(name, userId)]);
  try {
    const reversal = db.create(REVERSALS, {
      obligationId: obligation.id, occurrenceId: occurrence.id, transactionId: transaction.id, paymentId: transaction.paymentId || null,
      reversedAt: new Date().toISOString(), reason: reversalReason,
      idempotencyKeyHash: transaction.obligationIdempotencyKey || null, documentIds: documents.map(item => item.id),
      snapshot: {
        date: transaction.fecha, amount: ledger.fromMinorUnits(transaction.amountMinor ?? ledger.toMinorUnits(transaction.monto, currency), currency), currencyCode: currency,
        title: transaction.titulo || '', notes: transaction.comments || '', obligationTitle: obligation.title, occurrenceDate: occurrence.date,
        accountId: transaction.accountId || null, accountName: account ? (account.nombre || account.name || '') : '', paymentMethod: method?.name || transaction.paymentMethod || '',
        transaction: { ...transaction }
      }
    }, userId);
    db.remove('transactions', transaction.id, userId);
    // Receipts stay: they lose the removed transaction and point to the reverted record instead.
    documents.forEach(item => db.update('documents', item.id, { transactionId: null, revertedPaymentId: reversal.id }, userId));
    if (reset) db.update('accounts', account.id, { reconciled: false, includedMovementIds: (account.includedMovementIds || []).filter(id => id !== transaction.id) }, userId);
    ledger.refreshAlerts(db, userId);
    return { reversal, reconciliationReset: reset };
  } catch {
    db.clearCache();
    try { snapshots.forEach(([name, rows]) => db.replace(name, userId, rows)); } catch { /* best effort restore */ }
    db.clearCache();
    return fail('No se pudo revertir el pago', 500);
  }
}

module.exports = { REVERSALS, MAX_REASON, DEPENDENT_ERROR, ALREADY_REVERTED, REPLAY_REVERTED, reversalOf, paymentDetail, revert, isTenantSide };
