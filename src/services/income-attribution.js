const ledger = require('./account-ledger');
const { getIncomeBreakdown, getIncomeIva, getIncomePercentages } = require('../utils/income');

const UNASSIGNED_ID = 'unassigned';
const UNASSIGNED_NAME = 'Sin titular asignado';

function incomeHolderSnapshot(db, userId, account) {
  const owner = account?.ownerId ? db.findById('legalOwners', account.ownerId, userId) : null;
  return {
    incomeHolderId: owner?.id || null,
    incomeHolderName: owner?.name || null
  };
}

function incomeHolder(db, userId, transaction) {
  const hasSnapshot = Object.prototype.hasOwnProperty.call(transaction, 'incomeHolderId')
    || Object.prototype.hasOwnProperty.call(transaction, 'incomeHolderName');
  if (hasSnapshot) {
    return {
      ownerId: transaction.incomeHolderId || null,
      ownerName: transaction.incomeHolderName || UNASSIGNED_NAME
    };
  }
  const account = ledger.accountForMovement(db, userId, transaction);
  const owner = account?.ownerId ? db.findById('legalOwners', account.ownerId, userId) : null;
  return { ownerId: owner?.id || null, ownerName: owner?.name || UNASSIGNED_NAME };
}

function addIncomeToHolderGroups(groups, db, userId, transaction, currency) {
  const holder = incomeHolder(db, userId, transaction);
  const key = `${holder.ownerId || UNASSIGNED_ID}:${currency}`;
  if (!groups.has(key)) groups.set(key, {
    ownerId: holder.ownerId,
    ownerName: holder.ownerName,
    currency,
    aMinor: 0,
    bMinor: 0,
    ivaMinor: 0
  });
  const group = groups.get(key);
  const breakdown = getIncomeBreakdown(transaction);
  group.aMinor += ledger.toMinorUnits(breakdown.a, currency) || 0;
  group.bMinor += ledger.toMinorUnits(breakdown.b, currency) || 0;
  group.ivaMinor += ledger.toMinorUnits(getIncomeIva(transaction), currency) || 0;
}

function holderTotals(db, userId, transactions) {
  const groups = new Map();
  transactions.forEach(transaction => {
    if (transaction.tipo !== 'income') return;
    const account = ledger.accountForMovement(db, userId, transaction);
    if (!account) return;
    addIncomeToHolderGroups(groups, db, userId, transaction, account.currency);
  });
  return Array.from(groups.values()).map(group => {
    const a = ledger.fromMinorUnits(group.aMinor, group.currency);
    const b = ledger.fromMinorUnits(group.bMinor, group.currency);
    const iva = ledger.fromMinorUnits(group.ivaMinor, group.currency);
    return {
      ownerId: group.ownerId, ownerName: group.ownerName, currency: group.currency,
      A: a, B: b, iva, ...getIncomePercentages(a, b)
    };
  }).sort((a, b) => a.ownerName.localeCompare(b.ownerName) || a.currency.localeCompare(b.currency));
}

function ownerSnapshotFields(owner) {
  return {
    incomeHolderId: owner?.id || null,
    incomeHolderName: owner?.name || null
  };
}

module.exports = { UNASSIGNED_ID, UNASSIGNED_NAME, incomeHolderSnapshot, incomeHolder, holderTotals, ownerSnapshotFields, addIncomeToHolderGroups };
