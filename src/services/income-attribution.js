const ledger = require('./account-ledger');
const { getIncomeBreakdown, getIncomeIva, getExpenseIva, getIncomePercentages } = require('../utils/income');

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

// Holder that receives the credit VAT of an expense: the owner chosen as "Factura a nombre de"
// (snapshot ivaHolderId/ivaHolderName), otherwise the owner of the expense account.
function expenseVatHolder(db, userId, transaction) {
  if (transaction.ivaHolderId) {
    const owner = db.findById('legalOwners', transaction.ivaHolderId, userId);
    return { ownerId: transaction.ivaHolderId, ownerName: owner?.name || transaction.ivaHolderName || UNASSIGNED_NAME };
  }
  const account = ledger.accountForMovement(db, userId, transaction);
  const owner = account?.ownerId ? db.findById('legalOwners', account.ownerId, userId) : null;
  return { ownerId: owner?.id || null, ownerName: owner?.name || UNASSIGNED_NAME };
}

// Monthly VAT position per holder and currency: debit (income A), credit (invoiced expenses)
// and balance = credit - debit. `amount` mirrors the debit for older clients.
function vatTotals(db, userId, transactions) {
  const groups = new Map();
  const groupFor = (holder, currency) => {
    const key = `${holder.ownerId || UNASSIGNED_ID}:${currency}`;
    if (!groups.has(key)) groups.set(key, { ownerId: holder.ownerId, ownerName: holder.ownerName, currency, debitMinor: 0, creditMinor: 0 });
    return groups.get(key);
  };
  transactions.forEach(transaction => {
    if (transaction.tipo !== 'income' && transaction.tipo !== 'expense') return;
    const account = ledger.accountForMovement(db, userId, transaction);
    if (!account) return;
    const currency = account.currency;
    if (transaction.tipo === 'income') {
      groupFor(incomeHolder(db, userId, transaction), currency).debitMinor += ledger.toMinorUnits(getIncomeIva(transaction), currency) || 0;
      return;
    }
    const credit = getExpenseIva(transaction);
    if (!credit) return;
    groupFor(expenseVatHolder(db, userId, transaction), currency).creditMinor += ledger.toMinorUnits(credit, currency) || 0;
  });
  return Array.from(groups.values()).map(group => {
    const debit = ledger.fromMinorUnits(group.debitMinor, group.currency);
    return {
      ownerId: group.ownerId, ownerName: group.ownerName, currency: group.currency,
      amount: debit, debit,
      credit: ledger.fromMinorUnits(group.creditMinor, group.currency),
      balance: ledger.fromMinorUnits(group.creditMinor - group.debitMinor, group.currency)
    };
  }).sort((a, b) => a.ownerName.localeCompare(b.ownerName) || a.currency.localeCompare(b.currency));
}

function ownerSnapshotFields(owner) {
  return {
    incomeHolderId: owner?.id || null,
    incomeHolderName: owner?.name || null
  };
}

module.exports = { UNASSIGNED_ID, UNASSIGNED_NAME, incomeHolderSnapshot, incomeHolder, holderTotals, expenseVatHolder, vatTotals, ownerSnapshotFields, addIncomeToHolderGroups };
