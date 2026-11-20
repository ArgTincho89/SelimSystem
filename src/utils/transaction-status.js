// Confirmation state of a transaction. `status: 'pending'` (cheque installments waiting for confirmation) keeps the
// movement out of every total; a missing status means posted (records created before the field existed).
const PENDING = 'pending';
const POSTED = 'posted';

function isPendingTransaction(transaction) {
  return Boolean(transaction) && transaction.status === PENDING;
}

function isPostedTransaction(transaction) {
  return Boolean(transaction) && transaction.status !== PENDING;
}

module.exports = { PENDING, POSTED, isPendingTransaction, isPostedTransaction };
