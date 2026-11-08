const crypto = require('crypto');
const ledger = require('./account-ledger');

const PAYMENT_METHOD_TYPES = new Set(['cash', 'debit_card', 'credit_card', 'bank_transfer', 'direct_debit', 'digital_wallet', 'check', 'other']);

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function transactionCurrency(transaction, db, userId) {
  return transaction.currencyCode || (db && transaction.accountId ? db.findById('accounts', transaction.accountId, userId)?.currency : null) || 'EUR';
}

function transactionMinor(transaction, db, userId) {
  return Number.isSafeInteger(transaction.amountMinor)
    ? transaction.amountMinor
    : ledger.toMinorUnits(transaction.monto, transactionCurrency(transaction, db, userId));
}

function validateAllocations(db, userId, transaction, input) {
  if (!Array.isArray(input) || input.length > 100) return { error: 'Las asignaciones deben ser una lista válida' };
  if (!['expense', 'income'].includes(transaction.tipo)) return { error: 'Solo se pueden asignar gastos e ingresos reales' };
  const currencyCode = transactionCurrency(transaction, db, userId);
  let totalMinor = 0;
  const allocations = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: 'Cada asignación debe ser un objeto válido' };
    const amountMinor = Number.isSafeInteger(item.amountMinor) ? item.amountMinor : ledger.moneyInput(item.amount, currencyCode);
    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return { error: 'Cada importe asignado debe ser positivo y válido para la moneda' };
    const assetId = item.assetId || null;
    const obligationId = item.obligationId || null;
    const occurrenceId = item.occurrenceId || null;
    const contractId = item.contractId || null;
    const rentOccurrenceId = item.rentOccurrenceId || null;
    if (![assetId, obligationId, occurrenceId, contractId, rentOccurrenceId].some(Boolean)) return { error: 'Cada asignación debe identificar al menos un bien, obligación o contrato' };

    let asset = null;
    let obligation = null;
    let occurrence = null;
    let contract = null;
    let rentOccurrence = null;
    if (assetId) {
      asset = db.findById('assets', assetId, userId);
      if (!asset) return { error: 'El bien de la asignación no es válido' };
    }
    if (obligationId) {
      obligation = db.findById('obligations', obligationId, userId);
      if (!obligation) return { error: 'La obligación de la asignación no es válida' };
    }
    if (occurrenceId) {
      occurrence = db.findById('obligationOccurrences', occurrenceId, userId);
      if (!occurrence || (obligation && occurrence.obligationId !== obligation.id)) return { error: 'La ocurrencia de obligación no corresponde a la obligación indicada' };
      obligation = obligation || db.findById('obligations', occurrence.obligationId, userId);
      if (!obligation) return { error: 'La obligación de la ocurrencia no es válida' };
    }
    if (contractId) {
      contract = db.findById('rentalContracts', contractId, userId);
      if (!contract) return { error: 'El contrato de la asignación no es válido' };
    }
    if (rentOccurrenceId) {
      rentOccurrence = db.findById('rentOccurrences', rentOccurrenceId, userId);
      if (!rentOccurrence || (contract && rentOccurrence.contractId !== contract.id)) return { error: 'El período de alquiler no corresponde al contrato indicado' };
      contract = contract || db.findById('rentalContracts', rentOccurrence.contractId, userId);
      if (!contract) return { error: 'El contrato del período no es válido' };
    }
    if (obligation && obligation.currencyCode !== currencyCode) return { error: 'La moneda de la obligación no coincide con la transacción' };
    if (contract && contract.currencyCode !== currencyCode) return { error: 'La moneda del contrato no coincide con la transacción' };
    const linkedAssetId = obligation?.assetId || contract?.assetId || null;
    if (asset && linkedAssetId && asset.id !== linkedAssetId) return { error: 'El bien no corresponde a la obligación o contrato indicado' };
    if (occurrence && occurrence.currencyCode !== currencyCode) return { error: 'La moneda de la ocurrencia no coincide con la transacción' };
    if (rentOccurrence && rentOccurrence.currencyCode !== currencyCode) return { error: 'La moneda del período no coincide con la transacción' };
    if (obligation && transaction.tipo !== 'expense') return { error: 'Una obligación solo puede asociarse a un gasto' };
    if (contract && transaction.tipo !== 'income') return { error: 'Un contrato de alquiler solo puede asociarse a un ingreso' };
    totalMinor += amountMinor;
    if (!Number.isSafeInteger(totalMinor) || totalMinor > transactionMinor(transaction, db, userId)) return { error: 'Las asignaciones superan el importe real de la transacción' };
    allocations.push({
      transactionId: transaction.id, amountMinor, amount: ledger.fromMinorUnits(amountMinor, currencyCode), currencyCode,
      assetId: asset?.id || linkedAssetId || null,
      obligationId: obligation?.id || null, occurrenceId: occurrence?.id || null,
      contractId: contract?.id || null, rentOccurrenceId: rentOccurrence?.id || null
    });
  }
  return { allocations, totalMinor };
}

function validatePaymentMethod(db, userId, body, existing = null) {
  const allowed = new Set(['name', 'type', 'accountId', 'notes', 'lastFour']);
  if (Object.keys(body || {}).some(key => !allowed.has(key))) return { error: 'No se admiten credenciales ni campos adicionales del medio de pago' };
  const value = { ...existing, ...body };
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 100) return { error: 'El nombre debe tener entre 1 y 100 caracteres' };
  if (!PAYMENT_METHOD_TYPES.has(value.type)) return { error: 'El tipo de medio de pago no es válido' };
  if (value.accountId) {
    const account = db.findById('accounts', value.accountId, userId);
    if (!account) return { error: 'La cuenta vinculada no es válida' };
    if (!account.activo) return { error: 'La cuenta vinculada debe estar activa' };
  }
  const lastFour = value.lastFour || '';
  if (typeof lastFour !== 'string' || (lastFour !== '' && !/^\d{4}$/.test(lastFour))) return { error: 'Solo se permiten los últimos cuatro dígitos' };
  if (typeof (value.notes || '') !== 'string' || (value.notes || '').length > 500) return { error: 'Las notas no son válidas' };
  const text = `${value.name} ${value.notes || ''}`;
  const compact = text.replace(/[\s-]/g, '');
  if (/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/i.test(compact) || /\d{12,19}/.test(compact)) return { error: 'No guardes números completos de tarjetas o cuentas bancarias' };
  return { value: { name: value.name.trim(), type: value.type, accountId: value.accountId || null, notes: (value.notes || '').trim(), lastFour } };
}

function claimView(db, userId, claim) {
  const recoveries = db.findAll('recoveries', userId).filter(item => item.claimId === claim.id);
  const recoveredMinor = recoveries.reduce((sum, item) => sum + item.amountMinor, 0);
  return {
    ...claim,
    recoveries: recoveries.map(item => ({ ...item, transaction: db.findById('transactions', item.transactionId, userId) })),
    recoveredMinor,
    outstandingMinor: claim.recoverableMinor - recoveredMinor,
    recoveredAmount: ledger.fromMinorUnits(recoveredMinor, claim.currencyCode),
    outstandingAmount: ledger.fromMinorUnits(claim.recoverableMinor - recoveredMinor, claim.currencyCode)
  };
}

function validateClaim(db, userId, body) {
  const transaction = db.findById('transactions', body.transactionId, userId);
  if (!transaction || transaction.tipo !== 'expense' || transaction.recoverableClaimId) return { error: 'Seleccioná un gasto real sin reclamo previo' };
  const currencyCode = transactionCurrency(transaction, db, userId);
  const recoverableMinor = ledger.moneyInput(body.amount, currencyCode);
  if (recoverableMinor === null || recoverableMinor > transactionMinor(transaction, db, userId)) return { error: 'El importe recuperable debe ser positivo y no superar el gasto de origen' };
  const asset = db.findById('assets', body.assetId, userId);
  if (!asset) return { error: 'Seleccioná un bien válido' };
  let contract = null;
  if (body.contractId) {
    contract = db.findById('rentalContracts', body.contractId, userId);
    if (!contract || contract.assetId !== asset.id) return { error: 'El contrato no corresponde al bien indicado' };
  }
  let tenant = null;
  if (body.tenantEntityId) {
    tenant = db.findById('legalOwners', body.tenantEntityId, userId);
    if (!tenant || !(tenant.roles || ['owner']).includes('tenant') || (contract && !contract.tenantIds.includes(tenant.id))) return { error: 'El inquilino no es válido para este contrato' };
  }
  if (body.contractId && !body.tenantEntityId) return { error: 'Indicá el inquilino responsable del reintegro' };
  return { value: { transaction, asset, contract, tenant, recoverableMinor, currencyCode } };
}

module.exports = {
  PAYMENT_METHOD_TYPES, digest, transactionCurrency, transactionMinor,
  validateAllocations, validatePaymentMethod, validateClaim, claimView
};
