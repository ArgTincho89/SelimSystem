// "Registrar pago" of one obligation occurrence. Shared by the obligation payment dialog
// (POST /api/obligations/:id/occurrences/:occurrenceId/payments) and by the transaction form, where an expense
// attributed to a due date (vencimiento) is saved as a payment of it. Both paths write the same record: one expense
// transaction linked through obligationId/obligationOccurrenceId, so totalPaid, the status, the receipts, the alerts
// and "Revertir pago" behave the same whichever path created it.
const { v4: uuidv4 } = require('uuid');
const ledger = require('./account-ledger');
const obligations = require('./obligations');
const paymentReversal = require('./obligation-payment-reversal');
const activityLog = require('./activity-log');

// Fields of the transaction form that a payment may carry besides the payment fields (never the payment links).
const EXTRA_FIELDS = ['clasificacion', 'ivaPorcentaje', 'ivaHolderId', 'ivaHolderName'];

const fail = (error, status = 400) => ({ error, status });

function pickExtras(extraFields) {
  const extras = {};
  EXTRA_FIELDS.forEach(key => {
    if (extraFields && extraFields[key] !== undefined) extras[key] = extraFields[key];
  });
  return extras;
}

/**
 * Validates and registers one payment of `occurrence`. `input`: amount, accountId, categoryId, date, paymentMethodId,
 * paymentMethod, title, notes and idempotencyKey (the body of "Registrar pago"). `extraFields` are copied to the
 * transaction (clasificacion and the IVA fields of the transaction form). Nothing is written when a validation fails.
 * Returns `{ transaction, replayed, account, category }` or `{ error, status }`.
 */
function register(db, userId, { obligation, occurrence, input = {}, extraFields = {} }) {
  if (occurrence.status === 'cancelled') return fail('La ocurrencia está cancelada', 409);
  const { amount, accountId, categoryId, idempotencyKey, paymentMethodId, paymentMethod, title, notes } = input;
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 120) return fail('Se requiere una clave de idempotencia válida');
  if (title !== undefined && title !== null && (typeof title !== 'string' || title.trim().length > 100)) return fail('El título no es válido');
  if (typeof notes !== 'string' || !notes.trim()) return fail(obligations.NOTES_REQUIRED);
  if (notes.trim().length > 1000) return fail('Las notas no son válidas');
  const extras = pickExtras(extraFields);
  const paymentTitle = typeof title === 'string' ? title.trim() : '';
  const paymentNotes = notes.trim();
  const keyHash = obligations.idempotencyDigest(idempotencyKey);
  const fingerprint = obligations.idempotencyDigest(JSON.stringify({
    amount, accountId: accountId || null, categoryId: categoryId || null, date: input.date || null, paymentMethodId: paymentMethodId || null,
    paymentMethod: paymentMethod || null, title: paymentTitle || null, notes: paymentNotes || null,
    // Payments from the dialog keep their original fingerprint; the transaction form adds its extra fields.
    ...(Object.keys(extras).length ? { extras } : {})
  }));
  if (paymentReversal.reversalOf(db, userId, { keyHash })) return fail(paymentReversal.REPLAY_REVERTED, 409);
  const existing = db.findAll('transactions', userId).find(tx => tx.obligationIdempotencyKey === keyHash);
  if (existing) {
    if (existing.obligationOccurrenceId !== occurrence.id || existing.obligationPaymentFingerprint !== fingerprint) return fail('La clave de idempotencia ya fue utilizada para otro pago', 409);
    return { transaction: existing, replayed: true };
  }
  const selectedAccountId = accountId || occurrence.accountId || obligation.accountId;
  const account = db.findById('accounts', selectedAccountId, userId);
  if (!account || !account.activo) return fail('Seleccioná una cuenta activa');
  if (account.currency !== occurrence.currencyCode) return fail('La moneda de la cuenta no coincide con la obligación');
  const selectedCategoryId = obligations.categoryChain(db, userId, obligation, occurrence, categoryId);
  const category = db.findById('categories', selectedCategoryId, userId);
  if (!category) return fail('Seleccioná una categoría válida');
  if (paymentMethodId && !db.findById('paymentMethods', paymentMethodId, userId)) return fail('El medio de pago no es válido');
  if (paymentMethod !== undefined && paymentMethod !== null && (typeof paymentMethod !== 'string' || paymentMethod.length > 120)) return fail('El medio de pago no es válido');
  const amountMinor = ledger.moneyInput(amount, account.currency);
  if (amountMinor === null) return fail('El importe pagado debe ser positivo y válido para la moneda');
  const today = ledger.localDateForUser(db, userId);
  const paymentDate = input.date || today;
  if (!obligations.validDate(paymentDate) || paymentDate > today) return fail('La fecha de pago debe ser válida y no futura');
  const current = obligations.occurrenceView(db, userId, occurrence, today);
  if (amountMinor > ledger.toMinorUnits(current.remainingAmount, account.currency)) return fail('El pago supera el importe pendiente');
  let transaction;
  try {
    transaction = db.create('transactions', {
      userId, tipo: 'expense', monto: ledger.fromMinorUnits(amountMinor, account.currency), amountMinor,
      accountId: account.id, currencyCode: account.currency, titulo: paymentTitle || occurrence.title || obligation.title, comments: paymentNotes,
      categoryId: category.id, fecha: paymentDate, recurrente: false, frecuencia: null, fechaFin: null,
      clasificacion: 'variable', ...extras, obligationId: obligation.id, obligationOccurrenceId: occurrence.id,
      obligationIdempotencyKey: keyHash, obligationPaymentFingerprint: fingerprint,
      // The payment method is chosen when paying; legacy obligation values are not copied.
      paymentMethod: paymentMethod || '', paymentMethodId: paymentMethodId || null, paymentId: uuidv4()
    }, userId);
  } catch {
    db.clearCache();
    return fail('No se pudo registrar el pago', 500);
  }
  return { transaction, replayed: false, account, category };
}

/** Audit log context of a registered payment ("Registraste un pago de la obligación ..."), with its undo descriptor. */
function activityMeta(db, userId, obligation, occurrence, { transaction, account, category }) {
  return activityLog.obligationMeta(db, userId, obligation, occurrence, {
    amount: transaction.monto, currencyCode: transaction.currencyCode, accountId: account.id, categoryId: category.id,
    undo: { type: 'obligation.payment', obligationId: obligation.id, occurrenceId: occurrence.id, transactionId: transaction.id }
  });
}

module.exports = { EXTRA_FIELDS, register, activityMeta };
