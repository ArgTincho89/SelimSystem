const { validateHolders } = require('./asset-holders');
const { validateOwnershipSet } = require('../utils/ownership-overlap');
const ledger = require('./account-ledger');
const rentals = require('./rentals');
const obligations = require('./obligations');
const declarations = require('./rental-declarations');

function isoDay(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function samePercentage(a, b) {
  return (a == null ? null : a) === (b == null ? null : b);
}

/**
 * Diff the requested holders against the asset's current ownership records.
 * Unchanged open holders stay; changed/removed ones close as of yesterday
 * (or are edited/removed in place when they start today or later); new or
 * changed holders open today.
 */
function diffHolders(current, desired, today) {
  const yesterday = isoDay(-1);
  const plan = { close: [], update: [], remove: [], create: [], resulting: [] };
  const open = current.filter(record => !record.endDate);
  const keptIds = new Set();
  const handled = new Set();
  for (const record of open) {
    const want = desired.find(item => item.ownerId === record.ownerId);
    if (want && samePercentage(want.percentage, record.percentage)) {
      keptIds.add(record.id);
      handled.add(want.ownerId);
      plan.resulting.push(record);
    } else if (record.startDate >= today) {
      if (want) {
        plan.update.push({ id: record.id, percentage: want.percentage });
        plan.resulting.push({ ...record, percentage: want.percentage });
        handled.add(want.ownerId);
      } else {
        plan.remove.push(record.id);
      }
    } else {
      plan.close.push({ id: record.id, endDate: yesterday });
      plan.resulting.push({ ...record, endDate: yesterday });
    }
  }
  for (const record of current.filter(item => item.endDate)) plan.resulting.push(record);
  for (const want of desired) {
    if (handled.has(want.ownerId)) continue;
    const fresh = { ownerId: want.ownerId, startDate: today, endDate: null, percentage: want.percentage, notes: '' };
    plan.create.push(fresh);
    plan.resulting.push(fresh);
  }
  return plan;
}

/**
 * Validate the whole composite payload without writing anything.
 * `validateAsset` is injected by the route to avoid a circular dependency.
 */
function validate(db, userId, body, existing, validateAsset) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'El cuerpo no es válido' };
  const asset = body.asset;
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) return { error: 'Faltan los datos del bien' };
  const parsedAsset = validateAsset(asset, existing, db, userId);
  if (parsedAsset.error) return { error: parsedAsset.error };
  const holders = validateHolders(body.owners);
  if (holders.error) return { error: holders.error };
  for (const holder of holders.value) {
    const owner = db.findById('legalOwners', holder.ownerId, userId);
    if (!owner || (Array.isArray(owner.roles) && !owner.roles.includes('owner'))) return { error: 'Titular legal no encontrado' };
  }
  if (body.obligationResponsibilities !== undefined && !Array.isArray(body.obligationResponsibilities)) {
    return { error: 'Las responsabilidades deben ser una lista' };
  }
  const rental = planRental(db, userId, body.rental, existing, parsedAsset.value);
  if (rental.error) return rental;
  const responsibilities = planResponsibilities(db, userId, body.obligationResponsibilities, existing, rental.value);
  if (responsibilities.error) return responsibilities;
  const today = isoDay();
  const current = existing ? db.findAll('assetOwnerships', userId).filter(record => record.assetId === existing.id) : [];
  const plan = diffHolders(current, holders.value, today);
  const overlap = validateOwnershipSet(plan.resulting);
  if (overlap.error) return { error: overlap.error };
  return { value: { asset: parsedAsset.value, statusNotes: asset.statusNotes, plan, rental: rental.value, responsibilities: responsibilities.value } };
}

const fail = (error, status = 400) => ({ error, status });
const CONTRACT_TYPE_BY_KIND = { galpon: 'industrial', lote: 'other' };

/**
 * Decide what happens to the asset's contract without writing anything.
 * Actions: create | update | end | none. Contracts with rent occurrences are locked.
 */
function planRental(db, userId, rental, existing, asset) {
  const active = existing ? rentals.activeContractFor(db, userId, existing.id) : null;
  // The UI no longer sends `rental`: contracts are managed by declarations, so leave them untouched.
  if (rental === undefined) return { value: { action: 'none', contract: active } };
  if (!(asset.type === 'immovable' && ['rented', 'usufruct'].includes(asset.condition))) {
    if (rental != null && asset.type !== 'immovable') return fail('Solo los inmuebles pueden tener un alquiler');
    return { value: { action: active ? 'end' : 'none', contract: active } };
  }
  if (rental == null) {
    if (active) return { value: { action: 'none', contract: active } };
    return fail('Completá los datos del alquiler: inquilino, fechas y monto');
  }
  if (typeof rental !== 'object' || Array.isArray(rental)) return fail('Los datos del alquiler no son válidos');
  if (typeof rental.tenantId !== 'string' || !rental.tenantId) return fail('Seleccioná un inquilino');
  if (!Number.isInteger(rental.amount) || rental.amount <= 0) return fail('El monto debe ser un número entero positivo');
  const input = {
    tenantIds: [rental.tenantId], startDate: rental.startDate, endDate: rental.endDate || null, initialRent: rental.amount,
    currencyCode: rental.currencyCode || 'ARS', adjustmentFrequencyMonths: rental.adjustmentFrequencyMonths ?? null,
    adjustmentCriterion: rental.adjustmentCriterion ?? null, contractKind: asset.condition === 'usufruct' ? 'usufruct' : 'rental'
  };
  const dueDay = Number(String(rental.startDate).slice(8, 10));
  if (active) {
    const locked = rentals.hasOccurrences(db, userId, active.id);
    if (locked && (JSON.stringify(input.tenantIds) !== JSON.stringify(active.tenantIds) || input.startDate !== active.startDate
      || input.initialRent !== active.initialRent || input.currencyCode !== active.currencyCode)) {
      return fail('El contrato ya tiene períodos generados; para cambiar inquilino, inicio o monto, marcá el bien como No alquilado y cargá el contrato de nuevo', 409);
    }
    if (!locked) input.dueDay = dueDay;
    const parsed = rentals.validateContract(db, userId, input, active);
    return parsed.error ? fail(parsed.error) : { value: { action: 'update', contract: active, contractValue: parsed.value } };
  }
  const parsed = rentals.validateContract(db, userId, {
    ...input, type: CONTRACT_TYPE_BY_KIND[asset.propertyKind] || 'residential', periodicity: 'monthly', dueDay, status: 'active',
    expenseResponsibility: {}, includedExpenses: [], depositAmount: 0
  }, null, existing || { id: 'pending', type: 'immovable' });
  return parsed.error ? fail(parsed.error) : { value: { action: 'create', contractValue: parsed.value } };
}

function planResponsibilities(db, userId, list, existing, rental) {
  const hasTenant = rental.action === 'create' || rental.action === 'update' || (rental.action === 'none' && Boolean(rental.contract));
  const items = [];
  for (const item of list || []) {
    if (!item || !['owner', 'tenant'].includes(item.responsibilityType)) return fail('La responsabilidad debe ser Titular o Inquilino');
    const obligation = existing && typeof item.obligationId === 'string' ? db.findById('obligations', item.obligationId, userId) : null;
    if (!obligation || obligation.assetId !== existing.id) return fail('Obligación no encontrada en este bien');
    if (item.responsibilityType === 'tenant' && !hasTenant) return fail('La responsabilidad del inquilino requiere un inquilino con contrato activo');
    items.push({ obligationId: obligation.id, responsibilityType: item.responsibilityType });
  }
  return { value: items };
}

function applyRental(db, userId, asset, plan) {
  const { action, contract, contractValue } = plan;
  if (action === 'create') {
    rentals.afterContractWrite(db, userId, db.create('rentalContracts', { ...contractValue, assetId: asset.id }, userId));
  } else if (action === 'update') {
    const updated = db.update('rentalContracts', contract.id, contractValue, userId);
    rentals.afterContractWrite(db, userId, updated);
    if (updated.endDate && updated.endDate !== contract.endDate) rentals.cancelUnpaidOccurrences(db, userId, updated.id, updated.endDate);
  } else if (action === 'end') {
    const today = ledger.localDateForUser(db, userId);
    const endDate = contract.endDate && contract.endDate < today ? contract.endDate : today;
    db.update('rentalContracts', contract.id, { status: contract.startDate > today ? 'cancelled' : 'ended', endDate: contract.startDate > today ? contract.endDate : endDate }, userId);
    rentals.cancelUnpaidOccurrences(db, userId, contract.id, contract.startDate > today ? null : endDate);
    db.findAll('obligations', userId).filter(item => item.assetId === asset.id && item.responsibilityType === 'tenant')
      .forEach(item => obligations.setResponsibility(db, userId, item, 'owner'));
  }
}

function applyResponsibilities(db, userId, items) {
  items.forEach(item => {
    const obligation = db.findById('obligations', item.obligationId, userId);
    if ((obligation.responsibilityType || 'owner') === item.responsibilityType) return;
    const result = obligations.setResponsibility(db, userId, obligation, item.responsibilityType);
    if (result.error) throw new Error(result.error);
  });
}

/** Contract and obligation data appended to asset responses. */
function describe(db, userId, asset) {
  const contract = rentals.activeContractFor(db, userId, asset.id);
  const declaration = declarations.activeDeclarationFor(db, userId, asset.id);
  return {
    declaration: declaration ? declarations.view(db, userId, declaration, { occurrences: false }) : null,
    activeContract: contract ? {
      ...contract, adjustmentFrequencyMonths: contract.adjustmentFrequencyMonths ?? null,
      adjustmentCriterion: contract.adjustmentCriterion ?? null, contractKind: contract.contractKind || 'rental',
      locked: rentals.hasOccurrences(db, userId, contract.id),
      tenants: (contract.tenantIds || []).map(id => db.findById('legalOwners', id, userId)).filter(Boolean)
    } : null,
    obligations: db.findAll('obligations', userId).filter(item => item.assetId === asset.id).map(item => ({
      id: item.id, title: item.title, providerName: db.findById('legalOwners', item.providerEntityId, userId)?.name || null,
      externalIdentifier: item.externalIdentifier || null, externalIdentifierType: item.externalIdentifierType || null,
      responsibilityType: item.responsibilityType || 'owner'
    }))
  };
}

/** Write a validated payload. Throws on failure; the caller resets the cache. */
function apply(db, userId, existing, parsed) {
  let asset;
  if (existing) {
    asset = db.update('assets', existing.id, parsed.asset, userId);
    if (asset.status !== existing.status) {
      db.create('assetStatusHistory', { assetId: asset.id, status: asset.status, changedAt: new Date().toISOString(), notes: parsed.statusNotes || '' }, userId);
    }
  } else {
    asset = db.create('assets', parsed.asset, userId);
    db.create('assetStatusHistory', { assetId: asset.id, status: asset.status, changedAt: asset.createdAt, notes: 'Estado inicial' }, userId);
  }
  const { plan } = parsed;
  plan.close.forEach(item => db.update('assetOwnerships', item.id, { endDate: item.endDate }, userId));
  plan.update.forEach(item => db.update('assetOwnerships', item.id, { percentage: item.percentage }, userId));
  plan.remove.forEach(id => db.remove('assetOwnerships', id, userId));
  plan.create.forEach(record => db.create('assetOwnerships', { ...record, assetId: asset.id }, userId));
  applyRental(db, userId, asset, parsed.rental);
  applyResponsibilities(db, userId, parsed.responsibilities);
  return asset;
}

module.exports = { validate, apply, diffHolders, describe };
