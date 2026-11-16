const ledger = require('./account-ledger');
const obligations = require('./obligations');
const rentals = require('./rentals');
const alerts = require('./alerts');
const economicOverview = require('./economic-overview');
const movementDependents = require('./movement-dependents');

/**
 * Read-only typed timeline of an asset. Every generated record (obligation and rent occurrences) stays
 * in memory (see alerts.readOnlyView); nothing is persisted. Used by the history modal and, with a
 * custom range, by the monthly sheet.
 */
const MAX_RANGE_MONTHS = 36;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const KIND_ORDER = { event: 0, adjustment: 1, rent: 2, obligation: 3, reversal: 4 };
const MODALITY_LABEL = { locacion: 'Locación', comodato: 'Comodato', mutuo: 'Mutuo' };

const fail = error => ({ error, status: 400 });

function monthLabel(period) {
  return `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
}

function monthEnd(month) {
  return economicOverview.monthRange(month).to;
}

function shiftMonth(month, delta) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return date.toISOString().slice(0, 7);
}

function monthCount(from, to) {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
}

/** Resolves the query into an inclusive month range. Default: the current month. */
function resolveRange(query, current) {
  const { year, month, from, to } = query;
  if (from !== undefined || to !== undefined) {
    if (year !== undefined || month !== undefined) return fail('Indicá año y mes, o un rango desde-hasta, pero no ambos');
    if (!economicOverview.validMonth(from) || !economicOverview.validMonth(to)) return fail('Los meses deben tener formato YYYY-MM');
    if (from > to) return fail('El mes inicial no puede ser posterior al mes final');
    if (monthCount(from, to) > MAX_RANGE_MONTHS) return fail(`El rango no puede superar los ${MAX_RANGE_MONTHS} meses`);
    return { value: { from, to, year: null, month: null } };
  }
  if (year === undefined && month === undefined) return { value: { from: current, to: current, year: current.slice(0, 4), month: current.slice(5, 7) } };
  const resolvedYear = year === undefined ? current.slice(0, 4) : String(year);
  if (!/^\d{4}$/.test(resolvedYear) || Number(resolvedYear) < 1900 || Number(resolvedYear) > 2200) return fail('El año no es válido');
  if (month === undefined || month === 'all' || month === '') {
    return { value: { from: `${resolvedYear}-01`, to: `${resolvedYear}-12`, year: resolvedYear, month: 'all' } };
  }
  if (!/^(0?[1-9]|1[0-2])$/.test(String(month))) return fail('El mes no es válido');
  const padded = String(month).padStart(2, '0');
  return { value: { from: `${resolvedYear}-${padded}`, to: `${resolvedYear}-${padded}`, year: resolvedYear, month: padded } };
}

function majorOf(minor, currencyCode) {
  return ledger.fromMinorUnits(minor, currencyCode);
}

/** Years with data: from the earliest asset, obligation or rental date to the current year (+1 with future rent). */
function yearsFor(db, userId, asset, contracts, assetObligations, current) {
  const dates = [asset.createdAt, asset.acquisitionDate, ...assetObligations.map(item => item.startDate), ...contracts.map(item => item.startDate)]
    .map(value => String(value || '').slice(0, 4)).filter(value => /^\d{4}$/.test(value));
  const currentYear = Number(current.slice(0, 4));
  let first = dates.length ? Math.min(...dates.map(Number)) : currentYear;
  if (first > currentYear) first = currentYear;
  let last = currentYear;
  const nextYearStart = `${currentYear + 1}-01-01`;
  if (contracts.some(item => item.status === 'active' && (!item.endDate || item.endDate >= nextYearStart))) last = currentYear + 1;
  const years = [];
  for (let value = last; value >= first; value -= 1) years.push(String(value));
  return years;
}

function documentView(doc) {
  return { id: doc.id, title: doc.title, fileName: doc.fileName, contentType: doc.contentType, mimeType: doc.contentType, uploadedAt: doc.uploadedAt };
}

function noteView(note) {
  return { id: note.id, date: note.date, title: note.title || '', content: note.content, author: note.author || '' };
}

function obligationState(item, responsibilityType, hasResolution) {
  if (item.status === 'cancelled') return 'cancelled';
  if (item.status === 'resolved') return 'resolved';
  if (responsibilityType === 'tenant') {
    if (hasResolution) return 'resolved';
    return item.dueState === 'overdue' || item.status === 'overdue' ? 'overdue' : 'pending';
  }
  if (item.status === 'paid' || (item.status === 'resolved')) return 'paid';
  if (item.totalPaid > 0 && item.remainingAmount > 0) return 'partial';
  return item.status === 'overdue' ? 'overdue' : 'pending';
}

// A payment can be reverted when its obligation is on the owner side and nothing depends on its movement.
function paymentRevertState(ctx, transaction, tenantSide) {
  if (!transaction || tenantSide) return { revertible: false, revertBlockedReason: tenantSide ? 'Es un pago a cargo del inquilino.' : null };
  const dependent = ctx.dependents.find(transaction);
  return { revertible: !dependent, revertBlockedReason: dependent ? `Tiene ${dependent}.` : null };
}

function buildObligationRows(ctx, obligation, range) {
  const { db, userId, view, today, documents, providers, notes, reversals } = ctx;
  let occurrences;
  try {
    occurrences = obligations.occurrencesFor(view, userId, obligation, { from: range.fromDate, to: range.toDate });
  } catch {
    return [];
  }
  return occurrences.map(item => {
    const base = economicOverview.obligationRow(db, userId, obligation, item, documents);
    const responsibilityType = base.responsibilityType;
    const tenantSide = responsibilityType === 'tenant';
    const resolution = item.resolution || null;
    const state = obligationState(item, responsibilityType, Boolean(resolution));
    const currency = item.currencyCode;
    const expected = Number(item.actualDueAmount);
    let executed = Number(item.totalPaid || 0);
    let balance = Number(item.remainingAmount || 0);
    if (tenantSide) {
      executed = resolution ? majorOf(resolution.amountMinor, currency) : 0;
      balance = Number(item.tenantRemainingAmount ?? Math.max(0, expected - executed));
    }
    if (state === 'cancelled') balance = 0;
    const payments = base.payments.map(payment => {
      const tx = db.findById('transactions', payment.transactionId, userId);
      return {
        transactionId: payment.transactionId, date: payment.date, amount: majorOf(payment.amountMinor, currency), amountMinor: payment.amountMinor,
        accountName: payment.accountName, paymentMethod: payment.paymentMethod, title: tx?.titulo || '', notes: tx?.comments || '',
        ...paymentRevertState(ctx, tx, tenantSide)
      };
    });
    const itemReversals = reversals.filter(entry => entry.occurrenceId === item.id).map(entry => ({
      id: entry.id, reversedAt: entry.reversedAt || null, reason: entry.reason || '', ...(entry.snapshot || {})
    }));
    const actions = [];
    if (state !== 'cancelled') {
      if (!tenantSide && responsibilityType !== 'none' && balance > 0) actions.push('pay');
      if (tenantSide && !resolution) actions.push('resolve');
      if (tenantSide && resolution) actions.push('unresolve');
      if (!tenantSide && payments.some(payment => payment.revertible)) actions.push('revert');
    }
    return {
      id: `obligation:${item.id}`, kind: 'obligation', date: item.date, concept: item.title || obligation.title,
      typeLabel: 'Obligación', responsibility: ['owner', 'tenant'].includes(responsibilityType) ? responsibilityType : (responsibilityType === 'shared' ? 'owner' : null),
      counterpart: providers.get(obligation.providerEntityId) || null, currencyCode: currency,
      expected, executed, balance, state, overdue: state === 'overdue' || (state === 'partial' && item.date < today),
      obligationType: obligation.type || 'other', obligationTitle: obligation.title,
      payments, reversals: itemReversals, documents: base.documents.map(doc => ({ ...doc })),
      notes: notes.filter(note => (note.targetType === 'obligation' && note.targetId === obligation.id) || false).map(noteView),
      resolution: resolution ? { id: resolution.id, resolvedAt: resolution.resolvedAt, amount: majorOf(resolution.amountMinor, currency), notes: resolution.notes || '', documentIds: resolution.documentIds || [] } : null,
      refs: { obligationId: obligation.id, occurrenceId: item.id, assetId: obligation.assetId || null },
      actions, actionable: actions.length > 0
    };
  });
}

function reversalRows(ctx, assetObligationIds) {
  return ctx.reversals.filter(entry => assetObligationIds.has(entry.obligationId)).map(entry => {
    const snapshot = entry.snapshot || {};
    const date = snapshot.date || String(entry.reversedAt || '').slice(0, 10);
    return {
      id: `reversal:${entry.id}`, kind: 'reversal', date, concept: `Pago revertido: ${snapshot.obligationTitle || snapshot.title || 'obligación'}`,
      typeLabel: 'Evento', responsibility: 'owner', counterpart: null, currencyCode: snapshot.currencyCode || null,
      expected: Number(snapshot.amount || 0), executed: 0, balance: 0, state: 'reverted', overdue: false,
      payments: [], reversals: [{ id: entry.id, reversedAt: entry.reversedAt || null, reason: entry.reason || '', ...snapshot }],
      documents: ctx.documents.filter(doc => doc.revertedPaymentId === entry.id).map(documentView), notes: [], refs: { obligationId: entry.obligationId, occurrenceId: entry.occurrenceId, reversalId: entry.id },
      actions: [], actionable: false
    };
  });
}

function rentState(month, today) {
  if (month.status === 'collected') return 'collected';
  if (month.status === 'partially_collected') return 'partial';
  return month.date < today ? 'overdue' : 'pending';
}

function buildRent(ctx, contracts, range) {
  const { db, userId, view, today, documents } = ctx;
  const views = contracts.filter(contract => contract.status !== 'draft').flatMap(contract => {
    if (contract.status === 'cancelled') {
      return db.findAll('rentOccurrences', userId).filter(item => item.contractId === contract.id).map(item => rentals.occurrenceView(db, userId, item, today));
    }
    const through = contract.status === 'ended' && contract.endDate && contract.endDate < range.toDate ? contract.endDate : range.toDate;
    return rentals.generateOccurrences(view, userId, contract, through);
  });
  const contractsById = new Map(contracts.map(contract => [contract.id, contract]));
  const rows = [];
  const collectionIdsSeen = new Set();
  rentals.monthViews(views, today).filter(month => month.date >= range.fromDate && month.date <= range.toDate).forEach(month => {
    const currencies = [...new Set(month.parts.map(part => part.currencyCode))];
    const single = currencies.length === 1 ? currencies[0] : null;
    const sum = field => (single ? majorOf(month.parts.reduce((total, part) => total + part[field], 0), single) : null);
    const first = month.parts[0];
    const contract = contractsById.get(first.contractId);
    const declaration = month.declarationId ? db.findById('rentalDeclarations', month.declarationId, userId) : null;
    const tenantIds = declaration?.tenantIds || contract?.tenantIds || [];
    const collections = month.collectionIds.map(id => db.findById('rentCollections', id, userId)).filter(collection => collection && !collection.reversedAt);
    collections.forEach(collection => collectionIdsSeen.add(collection.id));
    const transactionIds = new Set(collections.map(collection => collection.transactionId).filter(Boolean));
    const state = rentState(month, today);
    const actions = [];
    if (state !== 'collected') actions.push('collect');
    if (collections.length) actions.push('undo-collect');
    rows.push({
      id: `rent:${month.key}`, kind: 'rent', date: month.date, concept: `Alquiler ${monthLabel(month.period)}`,
      typeLabel: 'Cobro de alquiler', responsibility: 'tenant',
      counterpart: tenantIds.map(id => db.findById('legalOwners', id, userId)?.name).filter(Boolean).join(', ') || null,
      currencyCode: single, expected: sum('rentMinor'), executed: sum('paidMinor'), balance: sum('remainingMinor'),
      totals: month.totals.map(row => ({ currencyCode: row.currencyCode, expected: row.rentAmount, executed: row.paidAmount, balance: row.remainingAmount })),
      state, overdue: state === 'overdue' || (state === 'partial' && month.date < today),
      parts: month.parts.map(part => ({
        modality: part.modality, modalityLabel: MODALITY_LABEL[part.modality] || part.modality, amount: part.rentAmount, executed: part.paidAmount,
        currencyCode: part.currencyCode, classification: part.modality === 'locacion' ? 'A' : 'B', state: part.status, occurrenceId: part.occurrenceId
      })),
      payments: collections.map(collection => ({
        collectionId: collection.id, date: collection.date, amount: majorOf(collection.amountMinor, collection.currencyCode), currencyCode: collection.currencyCode,
        accountName: db.findById('accounts', collection.accountId, userId)?.nombre || '', paymentMethod: collection.method || '', modality: collection.modality || null
      })),
      reversals: [], documents: documents.filter(doc => transactionIds.has(doc.transactionId)).map(documentView), notes: [],
      refs: { declarationId: month.declarationId, assetId: contract?.assetId || null, contractIds: month.parts.map(part => part.contractId), occurrenceIds: month.parts.map(part => part.occurrenceId), monthKey: month.key, collectionIds: month.collectionIds },
      actions, actionable: actions.length > 0 && month.parts.every(part => !String(part.occurrenceId).startsWith('virtual:'))
    });
  });
  return { rows, views };
}

function buildEvents(ctx, contracts, views, range) {
  const { db, userId } = ctx;
  const rows = [];
  const inRange = date => typeof date === 'string' && date >= range.fromDate && date <= range.toDate;
  const groups = new Map();
  contracts.filter(contract => contract.status !== 'draft').forEach(contract => {
    const key = contract.declarationId || `contract:${contract.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(contract);
  });
  groups.forEach((items, key) => {
    const label = items.map(item => MODALITY_LABEL[rentals.modalityOf(item)]).join(' + ');
    const start = items.map(item => item.startDate).sort()[0];
    const refs = { declarationId: items[0].declarationId || null, assetId: items[0].assetId, contractIds: items.map(item => item.id) };
    if (inRange(start)) rows.push(eventRow(`event:start:${key}`, start, `Inicio del alquiler (${label})`, refs));
    const open = items.some(item => item.status === 'active');
    const endDates = items.map(item => item.endDate).filter(Boolean).sort();
    if (!open && endDates.length) {
      const end = endDates[endDates.length - 1];
      if (inRange(end)) rows.push(eventRow(`event:end:${key}`, end, `Finalización del alquiler (${label})`, refs));
    }
  });
  const cancelled = new Map();
  views.filter(item => item.cancelled && !item.supersededByConditionId && inRange(item.date)).forEach(item => {
    const contract = contracts.find(candidate => candidate.id === item.contractId);
    const key = `${contract?.declarationId || `contract:${item.contractId}`}|${item.date}`;
    if (!cancelled.has(key)) cancelled.set(key, { date: item.date, contract, parts: [] });
    cancelled.get(key).parts.push(item);
  });
  cancelled.forEach((entry, key) => {
    const label = entry.parts.map(part => MODALITY_LABEL[part.modality] || part.modality).join(' + ');
    const row = eventRow(`event:cancelled:${key}`, entry.date, `Período cancelado (${label})`, { declarationId: entry.contract?.declarationId || null, assetId: entry.contract?.assetId || null, occurrenceIds: entry.parts.map(part => part.id) });
    row.state = 'cancelled';
    rows.push(row);
  });
  const contractIds = new Set(contracts.map(contract => contract.id));
  const occurrenceContract = new Map(db.findAll('rentOccurrences', userId).filter(item => contractIds.has(item.contractId)).map(item => [item.id, item.contractId]));
  db.findAll('rentCollections', userId).filter(collection => collection.reversedAt && Array.isArray(collection.reversedOccurrenceIds)
    && collection.reversedOccurrenceIds.some(id => occurrenceContract.has(id))).forEach(collection => {
    const date = String(collection.reversedAt).slice(0, 10);
    if (!inRange(date)) return;
    const row = eventRow(`reversal:rent:${collection.id}`, date, `Cobro de alquiler revertido (${MODALITY_LABEL[collection.modality] || 'alquiler'})`, { collectionId: collection.id, assetId: contracts[0]?.assetId || null });
    row.kind = 'reversal';
    row.state = 'reverted';
    row.currencyCode = collection.currencyCode;
    row.expected = majorOf(collection.amountMinor, collection.currencyCode);
    row.responsibility = 'tenant';
    rows.push(row);
  });
  return rows;
}

function eventRow(id, date, concept, refs) {
  return {
    id, kind: 'event', date, concept, typeLabel: 'Evento', responsibility: null, counterpart: null, currencyCode: null,
    expected: null, executed: null, balance: null, state: null, overdue: false, payments: [], reversals: [], documents: [], notes: [], refs,
    actions: [], actionable: false
  };
}

function buildAdjustments(ctx, contracts, range) {
  const { db, userId } = ctx;
  const rows = [];
  contracts.forEach(contract => {
    const conditions = rentals.conditionsFor(db, userId, contract.id);
    conditions.filter(item => item.effectiveDate >= range.fromDate && item.effectiveDate <= range.toDate).forEach(item => {
      const previous = conditions.filter(other => other.effectiveDate < item.effectiveDate).pop();
      const previousMinor = previous?.rentMinor || contract.initialRentMinor;
      rows.push({
        id: `adjustment:${item.id}`, kind: 'adjustment', date: item.effectiveDate,
        concept: `Ajuste de alquiler (${MODALITY_LABEL[rentals.modalityOf(contract)]})`, typeLabel: 'Ajuste', responsibility: 'tenant', counterpart: null,
        currencyCode: contract.currencyCode, expected: item.rentAmount, executed: null, balance: null, state: null, overdue: false,
        previousAmount: majorOf(previousMinor, contract.currencyCode), method: item.method,
        payments: [], reversals: [], documents: [], notes: [],
        refs: { contractId: contract.id, declarationId: contract.declarationId || null, conditionId: item.id, assetId: contract.assetId },
        actions: [], actionable: false
      });
    });
  });
  return rows;
}

/**
 * `query`: `{ year, month }` (month 01-12 or `all`) or `{ from, to }` as YYYY-MM (at most 36 months).
 * Returns `{ error, status }` for an invalid query.
 */
function build(db, userId, asset, query = {}) {
  const today = ledger.localDateForUser(db, userId);
  const current = today.slice(0, 7);
  const resolved = resolveRange(query, current);
  if (resolved.error) return resolved;
  const range = { ...resolved.value, fromDate: `${resolved.value.from}-01`, toDate: monthEnd(resolved.value.to) };
  const view = alerts.readOnlyView(db);
  const contracts = db.findAll('rentalContracts', userId).filter(contract => contract.assetId === asset.id);
  const assetObligations = db.findAll('obligations', userId).filter(obligation => obligation.assetId === asset.id);
  const allNotes = db.findAll('wealthNotes', userId);
  const ctx = {
    db, userId, view, today,
    documents: db.findAll('documents', userId),
    providers: new Map(db.findAll('legalOwners', userId).map(owner => [owner.id, owner.name])),
    notes: allNotes,
    reversals: db.findAll('obligationPaymentReversals', userId),
    dependents: movementDependents.buildIndex(db, userId, { claims: true })
  };
  const rows = [];
  assetObligations.forEach(obligation => rows.push(...buildObligationRows(ctx, obligation, range)));
  const assetObligationIds = new Set(assetObligations.map(obligation => obligation.id));
  rows.push(...reversalRows(ctx, assetObligationIds).filter(row => row.date >= range.fromDate && row.date <= range.toDate));
  const rent = buildRent(ctx, contracts, range);
  rows.push(...rent.rows);
  rows.push(...buildEvents(ctx, contracts, rent.views, range));
  rows.push(...buildAdjustments(ctx, contracts, range));
  allNotes.filter(note => note.targetType === 'asset' && note.targetId === asset.id && note.date >= range.fromDate && note.date <= range.toDate).forEach(note => {
    const row = eventRow(`note:${note.id}`, note.date, note.title || note.content.slice(0, 80), { assetId: asset.id, noteId: note.id });
    row.typeLabel = 'Nota';
    row.notes = [noteView(note)];
    rows.push(row);
  });
  rows.sort((a, b) => a.date.localeCompare(b.date) || (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || a.id.localeCompare(b.id));
  return {
    value: {
      assetId: asset.id, years: yearsFor(db, userId, asset, contracts, assetObligations, current),
      year: range.year, month: range.month, range: { from: range.from, to: range.to }, today: current, rows
    }
  };
}

/** Shared lookups of the read models (documents, providers, notes, payment reversals) over a read-only view. */
function makeContext(db, userId) {
  return {
    db, userId, view: alerts.readOnlyView(db), today: ledger.localDateForUser(db, userId),
    documents: db.findAll('documents', userId),
    providers: new Map(db.findAll('legalOwners', userId).map(owner => [owner.id, owner.name])),
    notes: db.findAll('wealthNotes', userId),
    reversals: db.findAll('obligationPaymentReversals', userId),
    dependents: movementDependents.buildIndex(db, userId, { claims: true })
  };
}

module.exports = { build, resolveRange, makeContext, buildObligationRows, noteView, documentView, MAX_RANGE_MONTHS };
