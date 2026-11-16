// One rule for "does this movement have something hanging from it?", shared by the rent collection undo and the
// obligation payment revert. `claims: false` keeps the original rent undo behavior (refund, transfer
// normalization, movement allocation); `claims: true` also looks at recoverable expense claims and recoveries.

/**
 * Builds the lookups once, so history views can check many movements without rescanning the collections.
 * Returns `{ find(transaction) }` where `find` answers the Spanish noun phrase of the first dependent found, or null.
 */
function buildIndex(db, userId, { claims = false } = {}) {
  const refunds = new Map();
  db.findAll('transactions', userId).forEach(item => {
    if (item.tipo === 'refund' && item.refundSourceId && !refunds.has(item.refundSourceId)) refunds.set(item.refundSourceId, item);
  });
  const normalizations = new Map();
  db.findAll('transfers', userId).forEach(transfer => {
    [...(transfer.normalizationAllocations || []), ...(transfer.pendingAllocations || [])].forEach(entry => {
      if (entry.sourceType === 'income' && !normalizations.has(entry.sourceId)) normalizations.set(entry.sourceId, transfer);
    });
  });
  const allocated = new Set(db.findAll('movementAllocations', userId).map(item => item.transactionId));
  const claimed = new Set(claims ? db.findAll('recoverableExpenseClaims', userId).map(item => item.transactionId) : []);
  const recovered = new Set(claims ? db.findAll('recoveries', userId).map(item => item.transactionId) : []);

  return {
    find(transaction) {
      const refund = refunds.get(transaction.id);
      if (refund) return `un reembolso (${refund.titulo || 'sin título'}, ${refund.fecha})`;
      const transfer = normalizations.get(transaction.id);
      if (transfer) return `una normalización de transferencia (${transfer.fecha || transfer.date || 'sin fecha'})`;
      if (allocated.has(transaction.id)) return 'una atribución de movimiento';
      if (claims) {
        if (claimed.has(transaction.id) || transaction.recoverableClaimId) return 'un gasto a recuperar';
        if (recovered.has(transaction.id)) return 'un recupero de gastos';
      }
      return null;
    }
  };
}

function dependentMovement(db, userId, transaction, options = {}) {
  return buildIndex(db, userId, options).find(transaction);
}

module.exports = { buildIndex, dependentMovement };
