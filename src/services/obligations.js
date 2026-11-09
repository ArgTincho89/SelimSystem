const crypto = require('crypto');
const { generateRecurringInstances, addDaysDateOnly } = require('../utils/recurring');
const ledger = require('./account-ledger');
const rentals = require('./rentals');

const COLLECTION = 'obligations';
const OCCURRENCES = 'obligationOccurrences';
const RESOLUTIONS = 'obligationResolutions';
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dueAmountFor(occurrence) {
  return Number.isSafeInteger(occurrence.dueAmountMinor) ? occurrence.dueAmountMinor : 0;
}

function paymentTransactions(db, userId, occurrenceId) {
  return db.findAll('transactions', userId).filter(tx => tx.obligationOccurrenceId === occurrenceId);
}

function activeResolution(db, userId, occurrenceId) {
  return db.findAll(RESOLUTIONS, userId).find(item => item.occurrenceId === occurrenceId && item.status === 'active') || null;
}

function occurrenceView(db, userId, occurrence, today) {
  const payments = paymentTransactions(db, userId, occurrence.id);
  const paidMinor = payments
    .reduce((total, tx) => total + (Number.isSafeInteger(tx.amountMinor) ? tx.amountMinor : ledger.toMinorUnits(tx.monto, tx.currencyCode || occurrence.currencyCode) || 0), 0);
  const dueMinor = dueAmountFor(occurrence);
  const obligation = occurrence.status === 'cancelled' ? null : db.findById(COLLECTION, occurrence.obligationId, userId);
  const split = obligation ? portionsFor(responsibilityFor(obligation, occurrence), dueMinor) : { owner: dueMinor, tenant: 0 };
  const base = { ...occurrence, actualDueAmount: ledger.fromMinorUnits(dueMinor, occurrence.currencyCode), totalPaid: ledger.fromMinorUnits(paidMinor, occurrence.currencyCode), paymentIds: payments.map(tx => tx.id) };
  if (split.tenant === 0) {
    // Legacy path: owner/third/none obligations keep the original expression untouched.
    const status = occurrence.status === 'cancelled' ? 'cancelled' : paidMinor >= dueMinor && paidMinor > 0 ? 'paid' : occurrence.date < today ? 'overdue' : paidMinor > 0 ? 'partial' : occurrence.status === 'confirmed' ? 'confirmed' : 'expected';
    return { ...base, status, remainingAmount: ledger.fromMinorUnits(Math.max(0, dueMinor - paidMinor), occurrence.currencyCode) };
  }
  const resolution = activeResolution(db, userId, occurrence.id);
  const ownerOk = split.owner === 0 || paidMinor >= split.owner;
  let status;
  if (ownerOk && resolution) status = split.owner === 0 ? 'resolved' : 'paid';
  else if (occurrence.date < today) status = 'overdue';
  else if (paidMinor > 0 || resolution) status = 'partial';
  else status = occurrence.status === 'confirmed' ? 'confirmed' : 'expected';
  return {
    ...base, status,
    remainingAmount: ledger.fromMinorUnits(Math.max(0, split.owner - paidMinor), occurrence.currencyCode),
    ownerDueAmount: ledger.fromMinorUnits(split.owner, occurrence.currencyCode),
    tenantDueAmount: ledger.fromMinorUnits(split.tenant, occurrence.currencyCode),
    tenantRemainingAmount: resolution ? 0 : ledger.fromMinorUnits(split.tenant, occurrence.currencyCode),
    resolution
  };
}

function occurrenceIdFor(db, userId, obligationId, date) {
  return db.findAll(OCCURRENCES, userId).find(item => item.obligationId === obligationId && item.date === date) || null;
}

function occurrenceDefinition(db, userId, obligation, date) {
  const revisions = db.findAll('obligationRevisions', userId)
    .filter(item => item.obligationId === obligation.id && item.effectiveFromDate <= date && (!item.effectiveUntilDate || date <= item.effectiveUntilDate))
    .sort((a, b) => b.effectiveFromDate.localeCompare(a.effectiveFromDate));
  const revision = revisions[0];
  return revision?.definition || obligation;
}

function isScheduledOn(obligation, date) {
  if (!obligation.recurrenceFrequency) return obligation.startDate === date;
  return generateRecurringInstances({
    id: obligation.id, fecha: obligation.startDate, recurrente: true,
    frecuencia: obligation.recurrenceFrequency, fechaFin: obligation.endDate || null
  }, date.slice(0, 7))[0]?.fecha === date;
}

function generateOccurrences(db, userId, obligation, fromDate, toDate) {
  const today = ledger.localDateForUser(db, userId);
  const start = fromDate || obligation.startDate;
  const horizonEnd = addDaysDateOnly(today, 365);
  const end = toDate || (obligation.startDate > horizonEnd ? obligation.startDate : horizonEnd);
  if (!validDate(start) || !validDate(end) || start > end) return [];
  let count = 0;
  const generated = [];
  for (let cursor = `${start.slice(0, 7)}-01`; cursor <= end;) {
    const month = cursor.slice(0, 7);
    for (const definition of [obligation, ...db.findAll('obligationRevisions', userId).filter(revision => revision.obligationId === obligation.id).map(revision => revision.definition)]) {
      if (definition.startDate > end || (definition.effectiveUntilDate && definition.effectiveUntilDate < start)) continue;
      if (definition.recurrenceFrequency) {
        const instance = generateRecurringInstances({ id: obligation.id, fecha: definition.startDate, recurrente: true, frecuencia: definition.recurrenceFrequency, fechaFin: definition.endDate || null }, month)[0];
        if (!instance || instance.fecha < start || instance.fecha > end || (definition.effectiveFromDate && instance.fecha < definition.effectiveFromDate) || (definition.effectiveUntilDate && instance.fecha > definition.effectiveUntilDate)) continue;
        const date = instance.fecha;
        const effective = occurrenceDefinition(db, userId, obligation, date);
        if (!occurrenceIdFor(db, userId, obligation.id, date)) {
          const dueAmount = effective.actualDueAmount ?? effective.estimatedAmount;
          const minor = ledger.toMinorUnits(dueAmount, effective.currencyCode);
          const record = db.create(OCCURRENCES, {
            obligationId: obligation.id, date, status: 'expected', currencyCode: effective.currencyCode,
            dueAmountMinor: minor, estimatedAmount: effective.estimatedAmount, title: effective.title,
            categoryId: effective.categoryId || null, accountId: effective.accountId || null,
      paymentMethod: effective.paymentMethod || '', paymentMethodId: effective.paymentMethodId || null, notes: '', generationKey: `${obligation.id}:${date}`
          }, userId);
          generated.push(record);
          count += 1;
        }
      } else if (definition.startDate >= start && definition.startDate <= end) {
        const date = definition.startDate;
        if (!occurrenceIdFor(db, userId, obligation.id, date)) {
          const minor = ledger.toMinorUnits(definition.estimatedAmount, definition.currencyCode);
          generated.push(db.create(OCCURRENCES, {
            obligationId: obligation.id, date, status: 'expected', currencyCode: definition.currencyCode,
            dueAmountMinor: minor, estimatedAmount: definition.estimatedAmount, title: definition.title,
            categoryId: definition.categoryId || null, accountId: definition.accountId || null,
            paymentMethod: definition.paymentMethod || '', paymentMethodId: definition.paymentMethodId || null, notes: '', generationKey: `${obligation.id}:${date}`
          }, userId));
          count += 1;
        }
      }
      if (count > 1200) throw new Error('El rango de ocurrencias supera el límite permitido');
    }
    const year = Number(cursor.slice(0, 4));
    const monthNumber = Number(cursor.slice(5, 7));
    cursor = monthNumber === 12
      ? `${String(year + 1).padStart(4, '0')}-01-01`
      : `${String(year).padStart(4, '0')}-${String(monthNumber + 1).padStart(2, '0')}-01`;
  }
  return generated;
}

function occurrencesFor(db, userId, obligation, options = {}) {
  if (obligation.status !== 'cancelled') generateOccurrences(db, userId, obligation, options.from, options.to);
  const today = ledger.localDateForUser(db, userId);
  return db.findAll(OCCURRENCES, userId)
    .filter(item => item.obligationId === obligation.id && (!options.from || item.date >= options.from) && (!options.to || item.date <= options.to))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(item => occurrenceView(db, userId, item, today));
}

function validateLinks(db, userId, value, existing = null) {
  const result = { ...existing, ...value };
  for (const field of ['assetId', 'providerEntityId', 'responsibleEntityId', 'accountId', 'categoryId', 'paymentMethodId']) {
    if (result[field] === undefined || result[field] === null || result[field] === '') { result[field] = null; continue; }
    const collection = field === 'assetId' ? 'assets' : field.endsWith('EntityId') ? 'legalOwners' : field === 'accountId' ? 'accounts' : field === 'categoryId' ? 'categories' : 'paymentMethods';
    const record = db.findById(collection, result[field], userId);
    if (!record) return { error: `${field} no es válido` };
    if (field === 'providerEntityId' && !(record.roles || ['owner']).includes('provider')) return { error: 'La entidad vinculada debe tener el rol de proveedor' };
    if (field === 'accountId' && !record.activo) return { error: 'La cuenta habitual debe estar activa' };
  }
  if (result.accountId && db.findById('accounts', result.accountId, userId).currency !== result.currencyCode) return { error: 'La moneda debe coincidir con la cuenta habitual' };
  return { value: result };
}

const EXTERNAL_IDENTIFIER_TYPES = new Set(['account', 'contract', 'meter', 'policy', 'client', 'other']);

function normalizeExternalIdentifier(rawIdentifier, rawType) {
  let externalIdentifier = null;
  if (rawIdentifier !== undefined && rawIdentifier !== null) {
    if (typeof rawIdentifier !== 'string') return { error: 'El identificador externo no es válido' };
    externalIdentifier = rawIdentifier.trim() || null;
    if (externalIdentifier && externalIdentifier.length > 120) return { error: 'El identificador externo debe tener entre 1 y 120 caracteres' };
  }
  let externalIdentifierType = null;
  if (rawType !== undefined && rawType !== null && rawType !== '') {
    if (!EXTERNAL_IDENTIFIER_TYPES.has(rawType)) return { error: 'El tipo de identificador externo no es válido' };
    externalIdentifierType = rawType;
  }
  return { externalIdentifier, externalIdentifierType };
}

const RESPONSIBILITY_TYPES = new Set(['owner', 'tenant', 'shared', 'third', 'none']);
const SPLIT_TYPES = new Set(['percentage', 'fixed', 'other']);

function minorOrNull(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function validateSplit(split) {
  if (!split || typeof split !== 'object' || Array.isArray(split) || !SPLIT_TYPES.has(split.type)) return { error: 'El reparto de responsabilidad no es válido' };
  if (split.type === 'percentage') {
    const { ownerPercent, tenantPercent } = split;
    const valid = [ownerPercent, tenantPercent].every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 100);
    if (!valid || Math.abs(ownerPercent + tenantPercent - 100) > 1e-9) return { error: 'Los porcentajes del reparto deben sumar 100' };
    return { value: { type: 'percentage', ownerPercent, tenantPercent } };
  }
  if (split.type === 'fixed') {
    const value = { type: 'fixed' };
    for (const key of ['ownerFixedMinor', 'tenantFixedMinor']) {
      if (split[key] === undefined || split[key] === null) continue;
      if (minorOrNull(split[key]) === null) return { error: 'Los importes fijos del reparto deben ser enteros no negativos en unidades menores' };
      value[key] = split[key];
    }
    if (value.ownerFixedMinor === undefined && value.tenantFixedMinor === undefined) return { error: 'El reparto fijo requiere al menos un importe' };
    return { value };
  }
  if (typeof split.ruleText !== 'string' || !split.ruleText.trim() || split.ruleText.trim().length > 500) return { error: 'La regla acordada debe tener entre 1 y 500 caracteres' };
  return { value: { type: 'other', ruleText: split.ruleText.trim() } };
}

// Splits an occurrence due amount (minor units) between owner and tenant.
// Percentage/fixed splits only apply to `shared`; the owner always absorbs the remainder.
function portionsFor(obligation, dueMinor) {
  const due = Number.isSafeInteger(dueMinor) && dueMinor > 0 ? dueMinor : 0;
  const type = obligation?.responsibilityType || 'owner';
  if (type === 'tenant') return { owner: 0, tenant: due };
  if (type !== 'shared') return { owner: due, tenant: 0 };
  const split = obligation.responsibilitySplit;
  if (split?.type === 'percentage') {
    const tenant = Math.min(due, Math.round(due * split.tenantPercent / 100));
    return { owner: due - tenant, tenant };
  }
  if (split?.type === 'fixed') {
    const tenant = split.tenantFixedMinor !== undefined
      ? Math.min(due, split.tenantFixedMinor)
      : due - Math.min(due, split.ownerFixedMinor || 0);
    return { owner: due - tenant, tenant };
  }
  return { owner: due, tenant: 0 };
}

// A responsibility pinned on the occurrence wins over the live obligation, so changing the
// obligation later never rewrites paid or past history.
function responsibilityFor(obligation, occurrence) {
  if (occurrence && occurrence.responsibilityType) {
    return { responsibilityType: occurrence.responsibilityType, responsibilitySplit: occurrence.responsibilitySplit || null };
  }
  return { responsibilityType: obligation?.responsibilityType || 'owner', responsibilitySplit: obligation?.responsibilitySplit || null };
}

// Switches the live responsibility between owner and tenant. Past-dated or settled occurrences
// are pinned to the previous responsibility first so their history does not change.
function setResponsibility(db, userId, obligation, type) {
  if (type !== 'owner' && type !== 'tenant') return failure('El tipo de responsabilidad no es válido');
  let rentalContractId = obligation.rentalContractId || null;
  if (type === 'tenant') {
    const contract = obligation.assetId ? rentals.activeContractFor(db, userId, obligation.assetId) : null;
    if (!contract) return failure('La responsabilidad del inquilino requiere un bien con contrato de alquiler activo');
    rentalContractId = contract.id;
  }
  const today = ledger.localDateForUser(db, userId);
  if (obligation.status !== 'cancelled') generateOccurrences(db, userId, obligation, null, addDaysDateOnly(today, -1));
  db.findAll(OCCURRENCES, userId).filter(item => item.obligationId === obligation.id && !item.responsibilityType
    && (item.date < today || paymentTransactions(db, userId, item.id).length || activeResolution(db, userId, item.id))).forEach(item => {
    db.update(OCCURRENCES, item.id, { responsibilityType: obligation.responsibilityType || 'owner', responsibilitySplit: obligation.responsibilitySplit || null }, userId);
  });
  const updated = db.update(COLLECTION, obligation.id, { responsibilityType: type, responsibilitySplit: null, responsibleThirdEntityId: null, rentalContractId }, userId);
  return { obligation: updated };
}

function validateResponsibility(db, userId, body, existing = null) {
  const merged = { ...existing, ...body };
  const type = merged.responsibilityType === undefined || merged.responsibilityType === null ? 'owner' : merged.responsibilityType;
  if (!RESPONSIBILITY_TYPES.has(type)) return { error: 'El tipo de responsabilidad no es válido' };
  let responsibilitySplit = null;
  if (type === 'shared') {
    const split = validateSplit(merged.responsibilitySplit);
    if (split.error) return split;
    responsibilitySplit = split.value;
  }
  let responsibleThirdEntityId = null;
  if (type === 'third') {
    const id = merged.responsibleThirdEntityId;
    if (typeof id !== 'string' || !id || !db.findById('legalOwners', id, userId)) return { error: 'El tercero responsable no es válido' };
    responsibleThirdEntityId = id;
  }
  let rentalContractId = null;
  if (merged.rentalContractId !== undefined && merged.rentalContractId !== null && merged.rentalContractId !== '') {
    const contract = typeof merged.rentalContractId === 'string' ? db.findById('rentalContracts', merged.rentalContractId, userId) : null;
    if (!contract || !merged.assetId || contract.assetId !== merged.assetId) return { error: 'El contrato de alquiler debe pertenecer al mismo bien' };
    rentalContractId = contract.id;
  }
  return { value: { responsibilityType: type, responsibilitySplit, responsibleThirdEntityId, rentalContractId } };
}

function validateDefinition(db, userId, body, existing = null) {
  const fields = ['title', 'type', 'assetId', 'providerEntityId', 'responsibleEntityId', 'accountId', 'categoryId', 'paymentMethodId', 'currencyCode', 'estimatedAmount', 'paymentMethod', 'startDate', 'recurrenceFrequency', 'endDate', 'reminderLeadDays', 'notes', 'externalIdentifier', 'externalIdentifierType', 'responsibilityType', 'responsibilitySplit', 'responsibleThirdEntityId', 'rentalContractId'];
  const value = {};
  fields.forEach(field => { if (body[field] !== undefined) value[field] = body[field]; });
  const merged = { ...existing, ...value };
  if (typeof merged.title !== 'string' || !merged.title.trim() || merged.title.trim().length > 160) return { error: 'El nombre debe tener entre 1 y 160 caracteres' };
  if (typeof merged.type !== 'string' || !merged.type.trim() || merged.type.length > 60) return { error: 'El tipo de obligación no es válido' };
  if (!ledger.CURRENCIES.has(merged.currencyCode)) return { error: 'La moneda no es válida' };
  if (typeof merged.estimatedAmount !== 'number' || ledger.moneyInput(merged.estimatedAmount, merged.currencyCode) === null) return { error: 'El importe estimado debe ser positivo y válido para la moneda' };
  if (!validDate(merged.startDate) || (merged.endDate && (!validDate(merged.endDate) || merged.endDate < merged.startDate))) return { error: 'El período de la obligación no es válido' };
  if (merged.recurrenceFrequency && !ledger.FREQUENCIES.has(merged.recurrenceFrequency)) return { error: 'La frecuencia no es válida' };
  // Payment method is no longer part of the obligation; legacy stored values are kept as-is.
  if (merged.paymentMethod === undefined || merged.paymentMethod === null) merged.paymentMethod = '';
  if (typeof merged.paymentMethod !== 'string' || merged.paymentMethod.length > 120) return { error: 'El medio de pago no es válido' };
  if (typeof merged.notes !== 'string' || merged.notes.length > 4000) return { error: 'Las notas no son válidas' };
  if (!Number.isInteger(merged.reminderLeadDays) || merged.reminderLeadDays < 0 || merged.reminderLeadDays > 90) return { error: 'El aviso debe estar entre 0 y 90 días' };
  const identifier = normalizeExternalIdentifier(merged.externalIdentifier, merged.externalIdentifierType);
  if (identifier.error) return identifier;
  merged.externalIdentifier = identifier.externalIdentifier;
  merged.externalIdentifierType = identifier.externalIdentifierType;
  const responsibility = validateResponsibility(db, userId, merged);
  if (responsibility.error) return responsibility;
  Object.assign(merged, responsibility.value);
  const links = validateLinks(db, userId, { ...merged, title: merged.title.trim(), paymentMethod: merged.paymentMethod.trim(), notes: merged.notes.trim() }, existing);
  if (links.error) return links;
  return { value: { ...links.value, type: merged.type.trim(), status: existing?.status || 'active' } };
}

function createObligation(db, userId, body) {
  const parsed = validateDefinition(db, userId, { recurrenceFrequency: null, endDate: null, reminderLeadDays: 7, paymentMethod: '', notes: '', responsibilityType: 'owner', ...body });
  if (parsed.error) return parsed;
  const obligation = db.create(COLLECTION, parsed.value, userId);
  return { obligation };
}

function updateOccurrence(db, userId, obligation, occurrence, body, scope = 'this') {
  if (occurrence.status === 'cancelled' || paymentTransactions(db, userId, occurrence.id).length) return { error: 'Una ocurrencia cancelada o pagada no se puede editar' };
  if (activeResolution(db, userId, occurrence.id)) return { error: 'La ocurrencia tiene una resolución activa; anulala antes de editarla', status: 409 };
  const today = ledger.localDateForUser(db, userId);
  if (scope === 'future' && occurrence.date < today) return { error: 'No se puede cambiar la serie de forma retroactiva', status: 409 };
  if (!['this', 'future'].includes(scope)) return { error: 'El alcance debe ser this o future' };
  const activeFrom = obligation.effectiveFromDate || obligation.startDate;
  if (scope === 'future' && occurrence.date < activeFrom) return { error: 'No se puede editar una versión anterior de la serie', status: 409 };
  const updates = {};
  if (body.actualDueAmount !== undefined) {
    const amount = ledger.moneyInput(body.actualDueAmount, occurrence.currencyCode);
    if (amount === null) return { error: 'El importe real debe ser positivo y válido para la moneda' };
    updates.dueAmountMinor = amount;
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string' || body.notes.length > 2000) return { error: 'Las notas no son válidas' };
    updates.notes = body.notes.trim();
  }
  if (scope === 'this') return { occurrence: db.update(OCCURRENCES, occurrence.id, updates, userId) };
  const nextDefinition = { ...obligation, effectiveFromDate: occurrence.date };
  if (body.actualDueAmount !== undefined) nextDefinition.actualDueAmount = ledger.fromMinorUnits(updates.dueAmountMinor, occurrence.currencyCode);
  if (body.estimatedAmount !== undefined) {
    if (typeof body.estimatedAmount !== 'number' || ledger.moneyInput(body.estimatedAmount, obligation.currencyCode) === null) return { error: 'El importe estimado no es válido' };
    nextDefinition.estimatedAmount = body.estimatedAmount;
    if (body.actualDueAmount === undefined) delete nextDefinition.actualDueAmount;
  }
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 160) return { error: 'El nombre no es válido' };
    nextDefinition.title = body.title.trim();
  }
  const currentDefinition = { ...obligation };
  const revisionEnd = addDaysDateOnly(occurrence.date, -1);
  const currentEffectiveFrom = currentDefinition.effectiveFromDate || currentDefinition.startDate;
  if (occurrence.date > currentEffectiveFrom) {
    db.create('obligationRevisions', {
      obligationId: obligation.id,
      effectiveFromDate: currentEffectiveFrom,
      effectiveUntilDate: revisionEnd,
      definition: { ...currentDefinition, effectiveUntilDate: revisionEnd }
    }, userId);
  }
  const updated = db.update(COLLECTION, obligation.id, nextDefinition, userId);
  db.findAll(OCCURRENCES, userId).filter(item => item.obligationId === obligation.id && item.date >= occurrence.date && !paymentTransactions(db, userId, item.id).length && item.status !== 'cancelled' && !activeResolution(db, userId, item.id)).forEach(item => {
    const changed = { ...updates };
    if (body.estimatedAmount !== undefined && !Object.prototype.hasOwnProperty.call(body, 'actualDueAmount')) changed.dueAmountMinor = ledger.toMinorUnits(body.estimatedAmount, obligation.currencyCode);
    if (body.title !== undefined) changed.title = nextDefinition.title;
    db.update(OCCURRENCES, item.id, changed, userId);
  });
  return { occurrence: db.findById(OCCURRENCES, occurrence.id, userId), obligation: updated };
}

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function failure(error, status = 400) {
  return { error, status };
}

function validateResolutionDocuments(db, userId, ids, occurrenceId, tenantEntityId) {
  if (ids === undefined || ids === null) return { value: [] };
  if (!Array.isArray(ids) || ids.length > 20 || ids.some(id => typeof id !== 'string' || !id)) return failure('Los comprobantes no son válidos');
  const unique = [...new Set(ids)];
  for (const id of unique) {
    const document = db.findById('documents', id, userId);
    if (!document) return failure('Un comprobante no existe');
    if (document.occurrenceId !== occurrenceId && document.tenantEntityId !== tenantEntityId) return failure('Un comprobante no corresponde a la ocurrencia ni al inquilino');
  }
  return { value: unique };
}

// Records that the tenant settled (the tenant portion of) an occurrence.
// Never touches transactions, accounts or any ledger aggregate.
function createResolution(db, userId, obligation, occurrence, body = {}) {
  if (occurrence.status === 'cancelled') return failure('La ocurrencia está cancelada', 409);
  const dueMinor = dueAmountFor(occurrence);
  const responsibility = responsibilityFor(obligation, occurrence);
  const split = portionsFor(responsibility, dueMinor);
  if (!['tenant', 'shared'].includes(responsibility.responsibilityType) || split.tenant <= 0) return failure('La obligación no tiene una parte a cargo del inquilino');
  if (activeResolution(db, userId, occurrence.id)) return failure('La ocurrencia ya tiene una resolución activa', 409);
  const tenant = typeof body.tenantEntityId === 'string' ? db.findById('legalOwners', body.tenantEntityId, userId) : null;
  if (!tenant || !(tenant.roles || ['owner']).includes('tenant')) return failure('El inquilino no es válido');
  let contractId = null;
  if (obligation.rentalContractId) {
    const contract = db.findById('rentalContracts', obligation.rentalContractId, userId);
    if (!contract || !(contract.tenantIds || []).includes(tenant.id)) return failure('El inquilino no pertenece al contrato de alquiler');
    contractId = contract.id;
  }
  if (typeof body.period !== 'string' || !PERIOD_PATTERN.test(body.period)) return failure('El período debe tener formato YYYY-MM');
  if (body.currencyCode !== undefined && body.currencyCode !== occurrence.currencyCode) return failure('La moneda no coincide con la ocurrencia');
  const amountMinor = typeof body.amount === 'number' ? ledger.moneyInput(body.amount, occurrence.currencyCode) : null;
  if (amountMinor === null) return failure('El importe debe ser positivo y válido para la moneda');
  if (responsibility.responsibilityType === 'shared' && amountMinor > split.tenant) return failure('El importe supera la parte del inquilino');
  const today = ledger.localDateForUser(db, userId);
  const resolvedAt = body.resolvedAt === undefined || body.resolvedAt === null || body.resolvedAt === '' ? today : body.resolvedAt;
  if (!validDate(resolvedAt)) return failure('La fecha de resolución no es válida');
  if (body.notes !== undefined && body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 2000)) return failure('Las notas no son válidas');
  const documents = validateResolutionDocuments(db, userId, body.documentIds, occurrence.id, tenant.id);
  if (documents.error) return documents;
  const resolution = db.create(RESOLUTIONS, {
    occurrenceId: occurrence.id, obligationId: obligation.id, assetId: obligation.assetId || null,
    tenantEntityId: tenant.id, contractId, period: body.period,
    portion: responsibility.responsibilityType === 'tenant' ? 'full' : 'tenant_portion',
    amountMinor, currencyCode: occurrence.currencyCode, documentIds: documents.value,
    resolvedAt, notes: typeof body.notes === 'string' ? body.notes.trim() : '', status: 'active'
  }, userId);
  return { resolution };
}

function voidResolution(db, userId, occurrence) {
  const resolution = activeResolution(db, userId, occurrence.id);
  if (!resolution) return failure('La ocurrencia no tiene una resolución activa', 404);
  return { resolution: db.update(RESOLUTIONS, resolution.id, { status: 'voided', voidedAt: new Date().toISOString() }, userId) };
}

function listResolutions(db, userId, filters = {}) {
  return db.findAll(RESOLUTIONS, userId)
    .filter(item => item.status === 'active')
    .filter(item => ['occurrenceId', 'obligationId', 'tenantEntityId', 'assetId', 'period'].every(key => !filters[key] || item[key] === filters[key]))
    .sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt));
}

function getAlerts(db, userId) {
  const today = ledger.localDateForUser(db, userId);
  const end = addDaysDateOnly(today, 90);
  return db.findAll(COLLECTION, userId).filter(item => item.status === 'active').flatMap(obligation =>
    occurrencesFor(db, userId, obligation, { to: end }).filter(item => ['overdue', 'expected', 'confirmed', 'partial'].includes(item.status) && item.remainingAmount > 0)
      .filter(item => item.status === 'overdue' || item.date <= addDaysDateOnly(today, obligation.reminderLeadDays))
      .map(item => ({ obligationId: obligation.id, occurrenceId: item.id, title: item.title, date: item.date, status: item.status, reminderLeadDays: obligation.reminderLeadDays, remainingAmount: item.remainingAmount, currencyCode: item.currencyCode }))
  ).sort((a, b) => a.date.localeCompare(b.date));
}

function categoryChain(db, userId, obligation, occurrence, bodyCategoryId = null) {
  const provider = obligation.providerEntityId ? db.findById('legalOwners', obligation.providerEntityId, userId) : null;
  return bodyCategoryId || occurrence.categoryId || obligation.categoryId || provider?.expenseCategoryId || null;
}

// Ranks the titular accounts of the asset: largest current ownership, earliest start,
// then the user's primary account, then account order.
function titularCandidates(db, userId, obligation, accounts, today) {
  if (!obligation.assetId) return [];
  const holders = db.findAll('assetOwnerships', userId)
    .filter(item => item.assetId === obligation.assetId && item.startDate <= today && (!item.endDate || item.endDate >= today));
  const best = new Map();
  holders.forEach(holder => {
    const percentage = typeof holder.percentage === 'number' ? holder.percentage : 100;
    const current = best.get(holder.ownerId);
    if (!current || percentage > current.percentage) best.set(holder.ownerId, { percentage, startDate: holder.startDate });
  });
  return accounts.filter(account => account.ownerId && best.has(account.ownerId))
    .map(account => ({ account, ...best.get(account.ownerId) }))
    .sort((a, b) => b.percentage - a.percentage || a.startDate.localeCompare(b.startDate)
      || Number(Boolean(b.account.primary)) - Number(Boolean(a.account.primary)) || (a.account.order ?? 0) - (b.account.order ?? 0))
    .map(item => item.account);
}

// Read model for the pay dialog: which account to suggest and whether the owner can pay.
function paymentContext(db, userId, obligation, occurrence) {
  const today = ledger.localDateForUser(db, userId);
  const view = occurrenceView(db, userId, occurrence, today);
  const responsibilityType = responsibilityFor(obligation, occurrence).responsibilityType;
  const owners = new Map(db.findAll('legalOwners', userId).map(item => [item.id, item.name]));
  const accounts = db.findAll('accounts', userId).filter(item => item.activo && item.currency === occurrence.currencyCode)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const context = {
    occurrence: { id: occurrence.id, date: occurrence.date, currencyCode: occurrence.currencyCode, remainingAmount: view.remainingAmount },
    responsibilityType, categoryId: categoryChain(db, userId, obligation, occurrence),
    accounts: accounts.map(item => ({ id: item.id, name: item.nombre || item.name, currency: item.currency, ownerId: item.ownerId || null, ownerName: owners.get(item.ownerId) || null, primary: Boolean(item.primary) })),
    suggestedAccountId: null, accountSource: 'none', warning: null, blocked: false, blockedReason: null,
    paymentMethods: db.findAll('paymentMethods', userId)
  };
  const block = reason => ({ ...context, blocked: true, blockedReason: reason });
  if (occurrence.status === 'cancelled') return block('La ocurrencia está cancelada');
  if (responsibilityType === 'tenant' || (view.ownerDueAmount !== undefined && view.ownerDueAmount === 0)) return block('Este pago está a cargo del inquilino. Usá Resolver');
  if (view.remainingAmount <= 0) return block('La ocurrencia ya está saldada');
  const explicit = [occurrence.accountId, obligation.accountId].map(id => accounts.find(item => item.id === id)).find(Boolean);
  if (explicit) return { ...context, suggestedAccountId: explicit.id, accountSource: 'explicit' };
  const titular = titularCandidates(db, userId, obligation, accounts, today);
  if (titular.length) return { ...context, suggestedAccountId: titular[0].id, accountSource: 'titular' };
  if (accounts.length) {
    return { ...context, suggestedAccountId: accounts[0].id, accountSource: 'fallback', warning: 'Ninguna cuenta de los titulares coincide con la moneda; elegí la cuenta con la que pagás' };
  }
  return block('No hay cuentas activas en la moneda de la obligación');
}

function idempotencyDigest(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

module.exports = {
  COLLECTION, OCCURRENCES, RESOLUTIONS, validDate, occurrenceView, activeResolution, createResolution, voidResolution, listResolutions, occurrencesFor,
  validateDefinition, validateResponsibility, portionsFor, responsibilityFor, setResponsibility, RESPONSIBILITY_TYPES, EXTERNAL_IDENTIFIER_TYPES, createObligation, updateOccurrence, paymentTransactions, getAlerts, idempotencyDigest, isScheduledOn, paymentContext, categoryChain
};
