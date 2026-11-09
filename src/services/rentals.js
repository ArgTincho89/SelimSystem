const crypto = require('crypto');
const ledger = require('./account-ledger');

const CONTRACT_TYPES = new Set(['residential', 'commercial', 'industrial', 'temporary', 'other']);
const CONTRACT_STATES = new Set(['draft', 'active', 'ended', 'cancelled']);
const PERIODICITIES = new Set(['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual']);
const CONDITION_METHODS = new Set(['manual', 'percentage', 'index']);

function validDate(value, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function monthDate(date) {
  return date.slice(0, 7);
}

function addMonths(date, count, dueDay) {
  const base = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
  base.setUTCMonth(base.getUTCMonth() + count);
  const year = base.getUTCFullYear();
  const month = String(base.getUTCMonth() + 1).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, base.getUTCMonth() + 1, 0)).getUTCDate();
  return `${year}-${month}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`;
}

function intervalMonths(periodicity) {
  return ({ monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 })[periodicity];
}

function decimalScaled(value, precision) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const match = String(value).match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match) return null;
  const digits = `${match[2]}${match[3] || ''}`;
  const shift = Number(match[4] || 0) - (match[3] || '').length + precision;
  let scaled = BigInt(digits || '0');
  if (shift >= 0) scaled *= 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    const remainder = scaled % divisor;
    scaled /= divisor;
    if (remainder * 2n >= divisor) scaled += 1n;
  }
  if (match[1] === '-') scaled = -scaled;
  const result = Number(scaled);
  return Number.isSafeInteger(result) ? result : null;
}

function occurrenceDates(contract, throughDate, conditions = []) {
  const dueDay = contract.dueDay;
  const first = addMonths(contract.startDate, 0, dueDay);
  const dates = [];
  let date = first < contract.startDate ? addMonths(first, intervalMonths(contract.periodicity), dueDay) : first;
  for (let count = 0; date <= throughDate && count < 1200; count += 1) {
    if (!contract.endDate || date <= contract.endDate) dates.push(date);
    const applicable = [...conditions].filter(item => item.effectiveDate <= date).pop();
    date = addMonths(date, intervalMonths(applicable?.periodicity || contract.periodicity), dueDay);
  }
  return dates;
}

const CONTRACT_KINDS = new Set(['rental', 'usufruct']);

// `assetHint` lets the composite asset form validate a contract before its asset exists.
function validateContract(db, userId, input, existing = null, assetHint = null) {
  const value = { ...(existing || {}) };
  const fields = ['assetId', 'type', 'startDate', 'endDate', 'initialRent', 'currencyCode', 'periodicity', 'dueDay', 'depositAmount', 'guarantee', 'includedExpenses', 'expenseResponsibility', 'notes', 'documentId', 'status', 'tenantIds', 'adjustmentFrequencyMonths', 'adjustmentCriterion', 'contractKind'];
  fields.forEach(field => { if (input[field] !== undefined) value[field] = input[field]; });
  if (assetHint) value.assetId = assetHint.id;
  const asset = assetHint || db.findById('assets', value.assetId, userId);
  if (!asset || asset.type !== 'immovable') return { error: 'Seleccioná un inmueble válido' };
  if (!CONTRACT_TYPES.has(value.type)) return { error: 'El tipo de contrato no es válido' };
  const frequency = value.adjustmentFrequencyMonths ?? null;
  if (frequency !== null && (!Number.isInteger(frequency) || frequency < 1 || frequency > 120)) return { error: 'La frecuencia de ajuste debe ser un entero entre 1 y 120 meses' };
  const criterion = value.adjustmentCriterion ?? null;
  if (criterion !== null && (typeof criterion !== 'string' || criterion.trim().length > 120)) return { error: 'El criterio de ajuste no es válido' };
  const contractKind = value.contractKind ?? 'rental';
  if (!CONTRACT_KINDS.has(contractKind)) return { error: 'El tipo de contrato (alquiler o usufructo) no es válido' };
  if (!validDate(value.startDate) || !validDate(value.endDate, true) || (value.endDate && value.endDate < value.startDate)) return { error: 'El período del contrato no es válido' };
  if (!ledger.CURRENCIES.has(value.currencyCode)) return { error: 'La moneda del contrato no es válida' };
  if (!PERIODICITIES.has(value.periodicity)) return { error: 'La periodicidad no es válida' };
  if (!Number.isInteger(value.dueDay) || value.dueDay < 1 || value.dueDay > 31) return { error: 'El día de vencimiento debe estar entre 1 y 31' };
  const initialRentMinor = ledger.moneyInput(value.initialRent, value.currencyCode);
  if (initialRentMinor === null) return { error: 'El alquiler inicial debe ser positivo y válido para la moneda' };
  const depositAmount = value.depositAmount === undefined || value.depositAmount === null || value.depositAmount === '' ? 0 : value.depositAmount;
  const depositMinor = ledger.toMinorUnits(depositAmount, value.currencyCode);
  if (depositMinor === null || depositMinor < 0) return { error: 'El depósito o garantía debe ser válido para la moneda' };
  if (!Array.isArray(value.tenantIds) || !value.tenantIds.length || new Set(value.tenantIds).size !== value.tenantIds.length) return { error: 'Seleccioná al menos un inquilino sin duplicados' };
  for (const tenantId of value.tenantIds) {
    const tenant = db.findById('legalOwners', tenantId, userId);
    if (!tenant || !(tenant.roles || ['owner']).includes('tenant')) return { error: 'Uno de los inquilinos no es válido' };
  }
  if (!CONTRACT_STATES.has(value.status || 'active')) return { error: 'El estado del contrato no es válido' };
  if (!Array.isArray(value.includedExpenses || [])) return { error: 'Los gastos incluidos deben ser una lista' };
  if ((value.includedExpenses || []).some(item => typeof item !== 'string' || item.trim().length > 120)) return { error: 'Hay un gasto incluido no válido' };
  if (!value.expenseResponsibility || typeof value.expenseResponsibility !== 'object' || Array.isArray(value.expenseResponsibility)) return { error: 'La responsabilidad de gastos debe ser un objeto' };
  if (Object.entries(value.expenseResponsibility).some(([name, party]) => !name.trim() || name.length > 120 || !['owner', 'tenant', 'shared', 'included'].includes(party))) return { error: 'La responsabilidad de gastos no es válida' };
  if (typeof (value.guarantee || '') !== 'string' || (value.guarantee || '').length > 1000 || typeof (value.notes || '') !== 'string' || (value.notes || '').length > 4000) return { error: 'Las notas o la garantía no son válidas' };
  if (value.documentId) {
    const document = db.findById('documents', value.documentId, userId);
    if (!document || document.contractId !== (existing?.id || input.id || null)) return { error: 'El documento del contrato no es válido' };
  }
  return { value: {
    assetId: asset.id, type: value.type, startDate: value.startDate, endDate: value.endDate || null,
    initialRent: ledger.fromMinorUnits(initialRentMinor, value.currencyCode), initialRentMinor,
    currencyCode: value.currencyCode, periodicity: value.periodicity, dueDay: value.dueDay,
    depositAmount: ledger.fromMinorUnits(depositMinor, value.currencyCode), depositMinor,
    guarantee: value.guarantee || '', includedExpenses: (value.includedExpenses || []).map(item => item.trim()),
    expenseResponsibility: { ...value.expenseResponsibility }, notes: (value.notes || '').trim(),
    documentId: value.documentId || null, tenantIds: [...value.tenantIds], status: value.status || 'active',
    adjustmentFrequencyMonths: frequency, adjustmentCriterion: criterion === null ? null : criterion.trim() || null, contractKind
  } };
}

function activeContractFor(db, userId, assetId) {
  return db.findAll('rentalContracts', userId).find(item => item.assetId === assetId && item.status === 'active') || null;
}

function hasOccurrences(db, userId, contractId) {
  return db.findAll('rentOccurrences', userId).some(item => item.contractId === contractId);
}

/** Keeps the asset in sync with an active contract (usage status and condition). */
function afterContractWrite(db, userId, contract) {
  if (contract.status !== 'active') return;
  const asset = db.findById('assets', contract.assetId, userId);
  if (!asset) return;
  const condition = contract.contractKind === 'usufruct' ? 'usufruct' : 'rented';
  const patch = {};
  if (asset.usageStatus !== 'rented') patch.usageStatus = 'rented';
  if (asset.condition !== condition) patch.condition = condition;
  if (Object.keys(patch).length) db.update('assets', asset.id, patch, userId);
}

/** Cancels unpaid occurrences after `cutoff` (all of them when cutoff is null). */
function cancelUnpaidOccurrences(db, userId, contractId, cutoff) {
  const today = ledger.localDateForUser(db, userId);
  db.findAll('rentOccurrences', userId).filter(item => item.contractId === contractId && (!cutoff || item.date > cutoff)).forEach(item => {
    if (!occurrenceView(db, userId, item, today).paidMinor) db.update('rentOccurrences', item.id, { cancelled: true, cancelledAt: new Date().toISOString() }, userId);
  });
}

function conditionsFor(db, userId, contractId) {
  return db.findAll('rentalConditions', userId).filter(item => item.contractId === contractId).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
}

function applyCondition(db, userId, contract, input) {
  const method = input.method;
  if (!CONDITION_METHODS.has(method) || !validDate(input.effectiveDate)) return { error: 'El tipo de ajuste o la fecha efectiva no es válido' };
  if (input.periodicity !== undefined && !PERIODICITIES.has(input.periodicity)) return { error: 'La periodicidad del ajuste no es válida' };
  const dueDates = occurrenceDates(contract, input.effectiveDate, conditionsFor(db, userId, contract.id));
  if (!dueDates.includes(input.effectiveDate)) return { error: 'La fecha efectiva debe coincidir con un vencimiento del contrato' };
  if (input.effectiveDate < ledger.localDateForUser(db, userId)) return { error: 'No se puede registrar una condición de alquiler de forma retroactiva', status: 409 };
  const old = conditionsFor(db, userId, contract.id);
  if (old.some(item => item.effectiveDate === input.effectiveDate)) return { error: 'Ya existe una condición para esa fecha efectiva' };
  const occurrences = db.findAll('rentOccurrences', userId).filter(item => item.contractId === contract.id && item.date >= input.effectiveDate);
  if (occurrences.some(item => allocatedForOccurrence(db, userId, item.id).length > 0)) return { error: 'Un período de alquiler con cobros no se puede reescribir', status: 409 };
  const previous = [...old].filter(item => item.effectiveDate < input.effectiveDate).pop();
  const previousMinor = previous?.rentMinor || contract.initialRentMinor;
  let rentMinor;
  let adjustmentValue = null;
  let indexValue = null;
  let baseIndexValue = null;
  if (method === 'manual') rentMinor = ledger.moneyInput(input.rentAmount, contract.currencyCode);
  if (method === 'percentage') {
    if (typeof input.percentage !== 'number' || !Number.isFinite(input.percentage) || input.percentage < -100 || input.percentage > 100000) return { error: 'El porcentaje ingresado no es válido' };
    adjustmentValue = input.percentage;
    const percentageMinor = decimalScaled(input.percentage, 2);
    rentMinor = percentageMinor === null ? null : ledger.mulDivRound(previousMinor, 10000 + percentageMinor, 10000);
  }
  if (method === 'index') {
    baseIndexValue = previous?.indexValue || input.baseIndexValue;
    if (typeof input.indexValue !== 'number' || !Number.isFinite(input.indexValue) || input.indexValue <= 0 || typeof baseIndexValue !== 'number' || !Number.isFinite(baseIndexValue) || baseIndexValue <= 0) return { error: 'El índice actual y el índice base ingresado deben ser positivos' };
    indexValue = input.indexValue;
    const currentIndexScaled = decimalScaled(indexValue, 6);
    const baseIndexScaled = decimalScaled(baseIndexValue, 6);
    rentMinor = currentIndexScaled === null || baseIndexScaled === null || baseIndexScaled <= 0 ? null : ledger.mulDivRound(previousMinor, currentIndexScaled, baseIndexScaled);
    adjustmentValue = input.indexValue;
  }
  if (!Number.isSafeInteger(rentMinor) || rentMinor < 1) return { error: 'El alquiler resultante no es válido' };
  const condition = db.create('rentalConditions', {
    contractId: contract.id, effectiveDate: input.effectiveDate, method,
    rentMinor, rentAmount: ledger.fromMinorUnits(rentMinor, contract.currencyCode),
    adjustmentValue, indexValue, baseIndexValue, periodicity: input.periodicity || previous?.periodicity || contract.periodicity,
    previousConditionId: previous?.id || null
  }, userId);
  occurrences.filter(item => !item.cancelled).forEach(item => db.update('rentOccurrences', item.id, {
    cancelled: true, cancelledAt: new Date().toISOString(), supersededByConditionId: condition.id
  }, userId));
  return { condition };
}

function allocatedForOccurrence(db, userId, occurrenceId) {
  return db.findAll('rentCollectionAllocations', userId).filter(item => item.occurrenceId === occurrenceId);
}

function occurrenceView(db, userId, occurrence, today) {
  const allocations = allocatedForOccurrence(db, userId, occurrence.id);
  const paidMinor = allocations.reduce((sum, item) => sum + item.amountMinor, 0);
  const remainingMinor = Math.max(0, occurrence.rentMinor - paidMinor);
  let status = occurrence.cancelled ? 'cancelled' : paidMinor >= occurrence.rentMinor ? 'collected' : paidMinor > 0 ? 'partially_collected' : occurrence.date < today ? 'overdue' : 'pending';
  const contract = db.findById('rentalContracts', occurrence.contractId, userId);
  return {
    ...occurrence, status, paidMinor, remainingMinor,
    paidAmount: ledger.fromMinorUnits(paidMinor, occurrence.currencyCode),
    remainingAmount: ledger.fromMinorUnits(remainingMinor, occurrence.currencyCode),
    allocations: allocations.map(item => ({ ...item, collection: db.findById('rentCollections', item.collectionId, userId) })),
    contract: contract ? { id: contract.id, assetId: contract.assetId, type: contract.type, status: contract.status } : null
  };
}

function generateOccurrences(db, userId, contract, throughDate) {
  const conditions = conditionsFor(db, userId, contract.id);
  const existing = db.findAll('rentOccurrences', userId).filter(item => item.contractId === contract.id);
  for (const date of occurrenceDates(contract, throughDate, conditions)) {
    const onDate = existing.filter(item => item.date === date);
    if (onDate.some(item => !item.cancelled)) continue;
    if (onDate.some(item => item.cancelled && !item.supersededByConditionId)) continue;
    const applicable = [...conditions].filter(item => item.effectiveDate <= date).pop();
    const rentMinor = applicable?.rentMinor || contract.initialRentMinor;
    const item = db.create('rentOccurrences', {
      contractId: contract.id, date, period: monthDate(date), currencyCode: contract.currencyCode,
      rentMinor, rentAmount: ledger.fromMinorUnits(rentMinor, contract.currencyCode),
      conditionId: applicable?.id || null, generationKey: applicable ? `${contract.id}:${date}:${applicable.id}` : `${contract.id}:${date}`,
      cancelled: contract.status === 'cancelled' || contract.status === 'ended' && date > (contract.endDate || throughDate),
      generatedAt: new Date().toISOString()
    }, userId);
    existing.push(item);
  }
  return existing.map(item => occurrenceView(db, userId, item, ledger.localDateForUser(db, userId)))
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.cancelled) - Number(b.cancelled) || a.createdAt.localeCompare(b.createdAt));
}

function validateAllocations(db, userId, input, currencyCode, ignoreCollectionId = null) {
  if (!Array.isArray(input || [])) return { error: 'Las asignaciones deben ser una lista' };
  const pending = new Map();
  const normalized = [];
  for (const entry of input || []) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { error: 'Cada asignación debe indicar un período y un importe' };
    const occurrence = db.findById('rentOccurrences', entry.occurrenceId, userId);
    if (!occurrence || occurrence.currencyCode !== currencyCode || occurrence.cancelled) return { error: 'Una ocurrencia no existe, está cancelada o usa otra moneda' };
    const amountMinor = ledger.moneyInput(entry.amount, currencyCode);
    if (amountMinor === null) return { error: 'Cada asignación debe ser positiva y válida para la moneda' };
    const allocations = db.findAll('rentCollectionAllocations', userId).filter(item => item.occurrenceId === occurrence.id && item.collectionId !== ignoreCollectionId);
    const already = allocations.reduce((sum, item) => sum + item.amountMinor, 0);
    const extra = pending.get(occurrence.id) || 0;
    if (already + extra + amountMinor > occurrence.rentMinor) return { error: 'La asignación supera el saldo pendiente del período' };
    pending.set(occurrence.id, extra + amountMinor);
    normalized.push({ occurrenceId: occurrence.id, amountMinor });
  }
  return { allocations: normalized };
}

function reverseCollection(db, userId, collectionId) {
  const collection = db.findById('rentCollections', collectionId, userId);
  if (!collection) return { status: 404, error: 'Cobro no encontrado' };
  if (collection.reversedAt) return { status: 409, error: 'Ese cobro ya fue anulado' };
  const transaction = db.findById('transactions', collection.transactionId, userId);
  const account = transaction && db.findById('accounts', transaction.accountId || collection.accountId, userId);
  if (account && account.reconciled && account.openingDate && (collection.date < account.openingDate || (account.includedMovementIds || []).includes(transaction.id))) {
    return { status: 409, error: 'La cuenta fue conciliada; no se puede revertir el cobro' };
  }
  if (transaction) {
    const linkedNormalization = db.findAll('transfers', userId).some(transfer => [...(transfer.normalizationAllocations || []), ...(transfer.pendingAllocations || [])].some(item => item.sourceType === 'income' && item.sourceId === transaction.id));
    const linkedRefund = db.findAll('transactions', userId).some(item => item.tipo === 'refund' && item.refundSourceId === transaction.id);
    const allocated = db.findAll('movementAllocations', userId).some(item => item.transactionId === transaction.id);
    if (linkedNormalization || linkedRefund || allocated) return { status: 409, error: 'Este cobro tiene referencias activas; resuélvelas antes de anularlo' };
  }
  const allocations = db.findAll('rentCollectionAllocations', userId).filter(item => item.collectionId === collection.id);
  const documents = transaction ? db.findAll('documents', userId).filter(item => item.transactionId === transaction.id) : [];
  const removedAllocations = [];
  let removedTransaction = null;
  try {
    allocations.forEach(item => { db.remove('rentCollectionAllocations', item.id, userId); removedAllocations.push(item); });
    if (transaction) { db.remove('transactions', transaction.id, userId); removedTransaction = transaction; }
    db.update('rentCollections', collection.id, { reversedAt: new Date().toISOString(), reversedTransactionId: transaction?.id || null }, userId);
    documents.forEach(item => db.update('documents', item.id, { transactionId: null, detachedFromCollectionId: collection.id }, userId));
  } catch {
    db.clearCache();
    try {
      removedAllocations.forEach(item => { if (!db.findById('rentCollectionAllocations', item.id, userId)) db.create('rentCollectionAllocations', item, userId); });
      if (removedTransaction && !db.findById('transactions', removedTransaction.id, userId)) db.create('transactions', removedTransaction, userId);
      if (db.findById('rentCollections', collection.id, userId)?.reversedAt) db.update('rentCollections', collection.id, { reversedAt: null, reversedTransactionId: null }, userId);
    } catch { /* best effort restore */ }
    db.clearCache();
    return { status: 500, error: 'No se pudo anular el cobro' };
  }
  ledger.refreshAlerts(db, userId);
  return { ok: true, collectionId: collection.id, reopenedOccurrenceIds: [...new Set(allocations.map(item => item.occurrenceId))] };
}

function collectionView(db, userId, collection) {
  const allocations = db.findAll('rentCollectionAllocations', userId).filter(item => item.collectionId === collection.id);
  const allocatedMinor = allocations.reduce((sum, item) => sum + item.amountMinor, 0);
  return {
    ...collection, allocations: allocations.map(item => ({ ...item, occurrence: occurrenceView(db, userId, db.findById('rentOccurrences', item.occurrenceId, userId), ledger.localDateForUser(db, userId)) })),
    allocatedMinor, unappliedMinor: collection.amountMinor - allocatedMinor,
    allocatedAmount: ledger.fromMinorUnits(allocatedMinor, collection.currencyCode),
    unappliedAmount: ledger.fromMinorUnits(collection.amountMinor - allocatedMinor, collection.currencyCode),
    transaction: db.findById('transactions', collection.transactionId, userId)
  };
}

function plusDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Raw rent-related alert items for active contracts: pending/overdue rent, contract expiry and
 * scheduled rent adjustments (rental conditions taking effect soon). Pass a read-only db view so
 * lazily generated occurrences are never persisted.
 */
function rentAlerts(db, userId, { today, leadDays = 5, expiryDays = 30, adjustmentDays = 30 } = {}) {
  const rentEnd = plusDays(today, leadDays);
  const expiryEnd = plusDays(today, expiryDays);
  const adjustmentEnd = plusDays(today, adjustmentDays);
  const items = [];
  db.findAll('rentalContracts', userId).filter(contract => contract.status === 'active').forEach(contract => {
    const base = { contractId: contract.id, assetId: contract.assetId, tenantIds: contract.tenantIds || [] };
    generateOccurrences(db, userId, contract, rentEnd)
      .filter(item => ['pending', 'partially_collected', 'overdue'].includes(item.status) && (item.date < today || item.date <= rentEnd))
      .forEach(item => items.push({
        ...base, type: 'rent_due', id: `rent:${contract.id}:${item.date}`, date: item.date, period: item.period,
        rentOccurrenceId: String(item.id).startsWith('virtual:') ? null : item.id,
        amount: item.remainingAmount, expectedAmount: item.rentAmount, currencyCode: item.currencyCode,
        status: item.date < today ? 'overdue' : item.status
      }));
    if (contract.endDate && contract.endDate >= today && contract.endDate <= expiryEnd) {
      items.push({ ...base, type: 'contract_expiry', id: `expiry:${contract.id}`, date: contract.endDate, status: 'expiring', currencyCode: contract.currencyCode });
    }
    conditionsFor(db, userId, contract.id).filter(item => item.effectiveDate >= today && item.effectiveDate <= adjustmentEnd).forEach(item => items.push({
      ...base, type: 'rent_adjustment_due', id: `adjust:${item.id}`, date: item.effectiveDate, amount: item.rentAmount,
      currencyCode: contract.currencyCode, status: 'scheduled'
    }));
  });
  return items;
}

module.exports = {
  rentAlerts,
  CONTRACT_TYPES, CONTRACT_STATES, PERIODICITIES, CONDITION_METHODS, validDate, hash,
  validateContract, conditionsFor, applyCondition, generateOccurrences, occurrenceView,
  validateAllocations, collectionView, reverseCollection, intervalMonths,
  CONTRACT_KINDS, activeContractFor, hasOccurrences, afterContractWrite, cancelUnpaidOccurrences
};
