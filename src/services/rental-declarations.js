const ledger = require('./account-ledger');
const rentals = require('./rentals');
const obligations = require('./obligations');

const CONTRACT_TYPE_BY_KIND = { galpon: 'industrial', lote: 'other' };
const TOUCHED = ['rentalDeclarations', 'rentalContracts', 'rentOccurrences', 'assets', 'obligations', 'obligationOccurrences', 'documents'];
const COLLECTED_OUT_OF_RANGE = 'Hay períodos cobrados fuera del nuevo rango; anulá esos cobros primero';

const fail = (error, status = 400) => ({ error, status });
const OPEN_END = '9999-12-31';

function displayDate(date) {
  return date ? date.split('-').reverse().join('/') : '';
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= (bEnd || OPEN_END) && bStart <= (aEnd || OPEN_END);
}

/**
 * One rental per date range: a modality may not overlap any non-cancelled contract of another
 * rental of the same asset (any modality). Contracts of the declaration being edited are ignored,
 * so an edit never conflicts with itself. Returns a 409 failure with the conflicting rental or null.
 */
function findOverlap(db, userId, assetId, declarationId, entries) {
  const others = db.findAll('rentalContracts', userId)
    .filter(item => item.assetId === assetId && !['cancelled', 'draft'].includes(item.status) && (!declarationId || item.declarationId !== declarationId));
  for (const entry of entries) {
    const other = others.find(item => overlaps(entry.value.startDate, entry.value.endDate, item.startDate, item.endDate));
    if (!other) continue;
    const siblings = other.declarationId ? others.filter(item => item.declarationId === other.declarationId) : [other];
    const startDate = siblings.map(item => item.startDate).sort()[0];
    const endDate = siblings.some(item => !item.endDate) ? null : siblings.map(item => item.endDate).sort().pop();
    const active = siblings.some(isActive);
    const range = `del ${displayDate(startDate)} ${endDate ? `al ${displayDate(endDate)}` : 'sin fecha de finalización'}`;
    const error = active
      ? `Las fechas se superponen con el alquiler vigente de este inmueble (${range}). Primero declará la finalización de ese alquiler para liberar esas fechas.`
      : `Las fechas se superponen con un alquiler finalizado de este inmueble (${range}). Elegí fechas posteriores a su finalización.`;
    return { error, status: 409, conflict: { declarationId: other.declarationId || null, contractId: other.id, startDate, endDate, active } };
  }
  return null;
}

function contractsOf(db, userId, declarationId) {
  return db.findAll('rentalContracts', userId).filter(item => item.declarationId === declarationId)
    .sort((a, b) => rentals.MODALITIES.indexOf(rentals.modalityOf(a)) - rentals.MODALITIES.indexOf(rentals.modalityOf(b)) || String(a.createdAt).localeCompare(String(b.createdAt)));
}

function isActive(contract) {
  return contract.status === 'active';
}

function plusMonths12(db, userId) {
  const future = new Date(`${ledger.localDateForUser(db, userId)}T00:00:00.000Z`);
  future.setUTCMonth(future.getUTCMonth() + 12);
  return future.toISOString().slice(0, 10);
}

function modalityView(db, userId, contract, withOccurrences) {
  const view = {
    contractId: contract.id, kind: rentals.modalityOf(contract), startDate: contract.startDate, endDate: contract.endDate || null,
    amount: contract.initialRent, currencyCode: contract.currencyCode, ivaPercent: contract.ivaPercent ?? null,
    totalAmount: ledger.fromMinorUnits(rentals.grossMinor(contract.initialRentMinor, contract.ivaPercent), contract.currencyCode),
    adjustmentFrequencyMonths: contract.adjustmentFrequencyMonths ?? null, adjustmentCriterion: contract.adjustmentCriterion ?? null,
    status: contract.status, locked: false
  };
  if (!withOccurrences) return { ...view, locked: rentals.hasOccurrences(db, userId, contract.id) };
  const today = ledger.localDateForUser(db, userId);
  const through = contract.status === 'ended' ? (contract.endDate || today) : plusMonths12(db, userId);
  view.occurrences = contract.status === 'draft' || contract.status === 'cancelled'
    ? db.findAll('rentOccurrences', userId).filter(item => item.contractId === contract.id).map(item => rentals.occurrenceView(db, userId, item, today))
    : rentals.generateOccurrences(db, userId, contract, through);
  view.locked = view.occurrences.length > 0;
  return view;
}

function view(db, userId, declaration, { occurrences = true } = {}) {
  const contracts = contractsOf(db, userId, declaration.id);
  return {
    id: declaration.id, assetId: declaration.assetId, notes: declaration.notes || '', endedAt: declaration.endedAt || null,
    status: contracts.some(isActive) ? 'active' : 'ended',
    tenants: (declaration.tenantIds || []).map(id => db.findById('legalOwners', id, userId)).filter(Boolean),
    modalities: contracts.map(contract => modalityView(db, userId, contract, occurrences))
  };
}

/** Active declaration of an asset (first by modality order) or null. */
function activeDeclarationFor(db, userId, assetId) {
  const contract = rentals.activeContractFor(db, userId, assetId);
  return contract && contract.declarationId ? db.findById('rentalDeclarations', contract.declarationId, userId) : null;
}

/** Gives every contract without a declaration its own declaration (add-only, idempotent). Returns changed contracts. */
function backfillDeclarations(db, userId) {
  const contracts = db.findAll('rentalContracts', userId);
  if (!contracts.some(item => item.declarationId === undefined || item.modality === undefined || item.ivaPercent === undefined)) return 0;
  let updated = 0;
  const next = contracts.map(contract => {
    const patch = {};
    if (contract.declarationId === undefined) {
      const endedAt = contract.status === 'active' || contract.status === 'draft' ? null : (contract.endDate || new Date().toISOString().slice(0, 10));
      patch.declarationId = db.create('rentalDeclarations', { assetId: contract.assetId, tenantIds: [...(contract.tenantIds || [])], notes: '', endedAt }, userId).id;
    }
    if (contract.modality === undefined) patch.modality = rentals.modalityOf(contract);
    if (contract.ivaPercent === undefined) patch.ivaPercent = null;
    if (!Object.keys(patch).length) return contract;
    updated += 1;
    return { ...contract, ...patch };
  });
  db.replace('rentalContracts', userId, next);
  return updated;
}

function validateResponsibilities(db, userId, list, asset) {
  if (list === undefined) return { value: [] };
  if (!Array.isArray(list)) return fail('Las responsabilidades deben ser una lista');
  const items = [];
  for (const item of list) {
    if (!item || !['owner', 'tenant'].includes(item.responsibilityType)) return fail('La responsabilidad debe ser Titular o Inquilino');
    const obligation = typeof item.obligationId === 'string' ? db.findById('obligations', item.obligationId, userId) : null;
    if (!obligation || obligation.assetId !== asset.id) return fail('Obligación no encontrada en este bien');
    items.push({ obligationId: obligation.id, responsibilityType: item.responsibilityType });
  }
  return { value: items };
}

/** Validates the whole payload and returns one planned write per modality. Writes nothing. */
function plan(db, userId, body, existing) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('El cuerpo no es válido');
  const asset = db.findById('assets', existing ? existing.assetId : body.assetId, userId);
  if (!asset) return fail('Bien no encontrado', 404);
  if (asset.type !== 'immovable') return fail('Seleccioná un inmueble válido');
  const notes = body.notes === undefined ? (existing?.notes || '') : body.notes;
  if (typeof notes !== 'string' || notes.length > 4000) return fail('Las notas no pueden superar los 4000 caracteres');
  const list = body.modalities;
  if (!Array.isArray(list) || !list.length) return fail('Seleccioná al menos una modalidad');
  if (list.length > 3 || list.some(item => !item || typeof item !== 'object' || !rentals.MODALITIES.includes(item.kind)) || new Set(list.map(item => item.kind)).size !== list.length) return fail('Las modalidades no son válidas o están repetidas');
  const tenantIds = body.tenantIds === undefined ? existing?.tenantIds : body.tenantIds;
  const current = existing ? contractsOf(db, userId, existing.id).filter(isActive) : [];
  const today = ledger.localDateForUser(db, userId);
  const entries = [];
  for (const item of list) {
    if (!rentals.validDate(item.startDate) || !rentals.validDate(item.endDate, true)) return fail('El período del contrato no es válido');
    if (item.endDate && item.endDate <= item.startDate) return fail('La fecha de finalización debe ser posterior a la de inicio');
    if (item.kind !== 'locacion' && item.ivaPercent !== undefined && item.ivaPercent !== null) return fail('Solo el contrato de locación admite IVA');
    const previous = current.find(contract => rentals.modalityOf(contract) === item.kind) || null;
    const occurrences = previous ? db.findAll('rentOccurrences', userId).filter(occ => occ.contractId === previous.id) : [];
    const collected = occurrences.filter(occ => !occ.cancelled && rentals.occurrenceView(db, userId, occ, today).paidMinor > 0);
    const conditions = previous ? rentals.conditionsFor(db, userId, previous.id) : [];
    const input = {
      assetId: asset.id, startDate: item.startDate, endDate: item.endDate || null, initialRent: item.amount, currencyCode: item.currencyCode,
      tenantIds, adjustmentFrequencyMonths: item.adjustmentFrequencyMonths ?? null, adjustmentCriterion: item.adjustmentCriterion ?? null,
      modality: item.kind, ivaPercent: item.kind === 'locacion' ? (item.ivaPercent ?? null) : null, status: 'active'
    };
    if (previous) {
      if (collected.length && item.currencyCode !== previous.currencyCode) return fail('No se puede cambiar la moneda de una modalidad con cobros registrados', 409);
      if (collected.some(occ => occ.date < item.startDate || (item.endDate && occ.date > item.endDate))) return fail(COLLECTED_OUT_OF_RANGE, 409);
      if (conditions.length && item.startDate > conditions[0].effectiveDate) return fail('La fecha de inicio no puede ser posterior a un ajuste de alquiler ya registrado', 409);
      input.dueDay = collected.length || conditions.length ? previous.dueDay : Number(item.startDate.slice(8, 10));
    } else {
      Object.assign(input, {
        type: CONTRACT_TYPE_BY_KIND[asset.propertyKind] || 'residential', periodicity: 'monthly', dueDay: Number(String(item.startDate).slice(8, 10)),
        expenseResponsibility: {}, includedExpenses: [], depositAmount: 0
      });
    }
    const parsed = previous ? rentals.validateContract(db, userId, input, previous) : rentals.validateContract(db, userId, input, null, asset);
    if (parsed.error) return fail(parsed.error);
    entries.push({ kind: item.kind, previous, value: parsed.value });
  }
  const overlap = findOverlap(db, userId, asset.id, existing ? existing.id : null, entries);
  if (overlap) return overlap;
  const responsibilities = validateResponsibilities(db, userId, body.obligationResponsibilities, asset);
  if (responsibilities.error) return responsibilities;
  const token = body.pendingObligationToken;
  if (token !== undefined && token !== null && (typeof token !== 'string' || token.length < 8 || token.length > 120)) return fail('El vínculo con las obligaciones pendientes no es válido');
  const kinds = new Set(list.map(item => item.kind));
  return { value: { asset, notes: notes.trim(), tenantIds: entries[0].value.tenantIds, entries, removed: current.filter(contract => !kinds.has(rentals.modalityOf(contract))), responsibilities: responsibilities.value, pendingToken: token || null } };
}

function rebuildOccurrences(db, userId, contract) {
  const today = ledger.localDateForUser(db, userId);
  const removable = db.findAll('rentOccurrences', userId)
    .filter(item => item.contractId === contract.id && !item.supersededByConditionId && !rentals.occurrenceView(db, userId, item, today).paidMinor);
  const ids = new Set(removable.map(item => item.id));
  db.findAll('documents', userId).filter(item => ids.has(item.rentOccurrenceId)).forEach(item => db.update('documents', item.id, { rentOccurrenceId: null }, userId));
  removable.forEach(item => db.remove('rentOccurrences', item.id, userId));
}

/**
 * Ends one contract (cancelling unpaid future periods) and re-points tenant obligations that referenced it.
 * `endOn` (optional) is an early termination date: when it is still in the future the contract stays
 * active until then (only its end date moves); obligations go back to the owner once it passes.
 */
function endContract(db, userId, contract, endOn = null) {
  const today = ledger.localDateForUser(db, userId);
  if (endOn && contract.startDate <= endOn && endOn >= today) {
    db.update('rentalContracts', contract.id, { endDate: endOn }, userId);
    rentals.cancelUnpaidOccurrences(db, userId, contract.id, endOn);
    return;
  }
  const notStarted = endOn ? contract.startDate > endOn : contract.startDate > today;
  const endDate = endOn && !notStarted ? endOn : notStarted ? contract.endDate : (contract.endDate && contract.endDate < today ? contract.endDate : today);
  db.update('rentalContracts', contract.id, { status: notStarted ? 'cancelled' : 'ended', endDate }, userId);
  rentals.cancelUnpaidOccurrences(db, userId, contract.id, notStarted ? null : endDate);
  const successor = rentals.activeContractsFor(db, userId, contract.assetId)[0] || null;
  db.findAll('obligations', userId).filter(item => item.rentalContractId === contract.id)
    .forEach(item => db.update('obligations', item.id, { rentalContractId: successor ? successor.id : null }, userId));
}

/** Keeps asset condition/usage derived from its active contracts and closes the declaration when none is left. */
function settle(db, userId, assetId, declarationId) {
  const asset = db.findById('assets', assetId, userId);
  const active = rentals.activeContractsFor(db, userId, assetId);
  if (!active.length && asset) {
    const patch = {};
    if (asset.condition !== 'not_rented') patch.condition = 'not_rented';
    if (asset.usageStatus === 'rented') patch.usageStatus = 'vacant';
    if (Object.keys(patch).length) db.update('assets', asset.id, patch, userId);
    db.findAll('obligations', userId).filter(item => item.assetId === assetId && item.responsibilityType === 'tenant')
      .forEach(item => obligations.setResponsibility(db, userId, item, 'owner'));
  } else if (active.length) active.forEach(contract => rentals.afterContractWrite(db, userId, contract));
  const open = contractsOf(db, userId, declarationId).some(isActive);
  db.update('rentalDeclarations', declarationId, { endedAt: open ? null : ledger.localDateForUser(db, userId) }, userId);
}

function withRollback(db, userId, work) {
  const snapshot = TOUCHED.map(name => [name, db.findAll(name, userId)]);
  try {
    return { value: work() };
  } catch (error) {
    db.clearCache();
    try { snapshot.forEach(([name, rows]) => db.replace(name, userId, rows)); } catch { /* best effort restore */ }
    db.clearCache();
    return fail(error.userMessage || 'No se pudo guardar el alquiler', 500);
  }
}

function applyResponsibilities(db, userId, items) {
  items.forEach(item => {
    const obligation = db.findById('obligations', item.obligationId, userId);
    if ((obligation.responsibilityType || 'owner') === item.responsibilityType) return;
    const result = obligations.setResponsibility(db, userId, obligation, item.responsibilityType);
    if (result.error) throw Object.assign(new Error(result.error), { userMessage: result.error });
  });
}

// Obligations created from the (unsaved) declaration modal become tenant obligations now that the
// rental exists; explicit choices in `obligationResponsibilities` win.
function finalizePending(db, userId, planned) {
  if (!planned.pendingToken) return;
  obligations.finalizePendingRentalLinks(db, userId, planned.pendingToken, planned.asset.id, new Set(planned.responsibilities.map(item => item.obligationId)));
}

// Overlapping rentals are rejected by `plan`; a non-overlapping rental may be declared while another one is in force.
function create(db, userId, body) {
  const planned = plan(db, userId, body, null);
  if (planned.error) return planned;
  const { asset, notes, tenantIds, entries, responsibilities } = planned.value;
  const written = withRollback(db, userId, () => {
    const declaration = db.create('rentalDeclarations', { assetId: asset.id, tenantIds, notes, endedAt: null }, userId);
    entries.forEach(entry => rentals.afterContractWrite(db, userId, db.create('rentalContracts', { ...entry.value, declarationId: declaration.id }, userId)));
    finalizePending(db, userId, planned.value);
    applyResponsibilities(db, userId, responsibilities);
    return declaration;
  });
  return written.error ? written : { value: written.value };
}

function update(db, userId, declaration, body) {
  const planned = plan(db, userId, body, declaration);
  if (planned.error) return planned;
  const { asset, notes, tenantIds, entries, removed, responsibilities } = planned.value;
  const written = withRollback(db, userId, () => {
    entries.forEach(entry => {
      if (entry.previous) {
        rebuildOccurrences(db, userId, entry.previous);
        rentals.afterContractWrite(db, userId, db.update('rentalContracts', entry.previous.id, entry.value, userId));
      } else {
        rentals.afterContractWrite(db, userId, db.create('rentalContracts', { ...entry.value, declarationId: declaration.id }, userId));
      }
    });
    removed.forEach(contract => endContract(db, userId, contract));
    db.update('rentalDeclarations', declaration.id, { tenantIds, notes }, userId);
    finalizePending(db, userId, planned.value);
    applyResponsibilities(db, userId, responsibilities);
    settle(db, userId, asset.id, declaration.id);
    return db.findById('rentalDeclarations', declaration.id, userId);
  });
  return written.error ? written : { value: written.value };
}

/**
 * "Finalizar alquiler": ends every active modality. `body.endDate` (optional, defaults to today) declares
 * an early termination: it frees the dates after it for a new rental. It must fall within the rental and
 * after every collected period.
 */
function end(db, userId, declaration, body = {}) {
  const active = contractsOf(db, userId, declaration.id).filter(isActive);
  if (!active.length) return fail('El alquiler ya está finalizado', 409);
  const endOn = body && body.endDate !== undefined && body.endDate !== null && body.endDate !== '' ? body.endDate : null;
  if (endOn !== null) {
    if (!rentals.validDate(endOn)) return fail('La fecha de finalización no es válida');
    if (endOn < active.map(item => item.startDate).sort()[0]) return fail('La fecha de finalización no puede ser anterior al inicio del alquiler');
    const agreed = active.every(item => item.endDate) ? active.map(item => item.endDate).sort().pop() : null;
    if (agreed && endOn > agreed) return fail('La fecha de finalización no puede ser posterior a la pactada; editá el alquiler para extenderlo');
    const today = ledger.localDateForUser(db, userId);
    const collectedAfter = db.findAll('rentOccurrences', userId).some(item => active.some(contract => contract.id === item.contractId) && item.date > endOn && !item.cancelled && rentals.occurrenceView(db, userId, item, today).paidMinor > 0);
    if (collectedAfter) return fail('Hay períodos cobrados posteriores a esa fecha; deshacé esos cobros primero', 409);
  }
  const written = withRollback(db, userId, () => {
    active.forEach(contract => endContract(db, userId, contract, endOn));
    settle(db, userId, declaration.assetId, declaration.id);
    return db.findById('rentalDeclarations', declaration.id, userId);
  });
  return written.error ? written : { value: written.value };
}

module.exports = { view, contractsOf, activeDeclarationFor, backfillDeclarations, create, update, end, findOverlap };
