const crypto = require('crypto');
const { generateRecurringInstances, addDaysDateOnly } = require('../utils/recurring');
const ledger = require('./account-ledger');

const COLLECTION = 'obligations';
const OCCURRENCES = 'obligationOccurrences';
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

function occurrenceView(db, userId, occurrence, today) {
  const paidMinor = paymentTransactions(db, userId, occurrence.id)
    .reduce((total, tx) => total + (Number.isSafeInteger(tx.amountMinor) ? tx.amountMinor : ledger.toMinorUnits(tx.monto, tx.currencyCode || occurrence.currencyCode) || 0), 0);
  const dueMinor = dueAmountFor(occurrence);
  let status = occurrence.status === 'cancelled' ? 'cancelled' : paidMinor >= dueMinor && paidMinor > 0 ? 'paid' : occurrence.date < today ? 'overdue' : paidMinor > 0 ? 'partial' : occurrence.status === 'confirmed' ? 'confirmed' : 'expected';
  return { ...occurrence, status, actualDueAmount: ledger.fromMinorUnits(dueMinor, occurrence.currencyCode), totalPaid: ledger.fromMinorUnits(paidMinor, occurrence.currencyCode), remainingAmount: ledger.fromMinorUnits(Math.max(0, dueMinor - paidMinor), occurrence.currencyCode), paymentIds: paymentTransactions(db, userId, occurrence.id).map(tx => tx.id) };
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

function validateDefinition(db, userId, body, existing = null) {
  const fields = ['title', 'type', 'assetId', 'providerEntityId', 'responsibleEntityId', 'accountId', 'categoryId', 'paymentMethodId', 'currencyCode', 'estimatedAmount', 'paymentMethod', 'startDate', 'recurrenceFrequency', 'endDate', 'reminderLeadDays', 'notes'];
  const value = {};
  fields.forEach(field => { if (body[field] !== undefined) value[field] = body[field]; });
  const merged = { ...existing, ...value };
  if (typeof merged.title !== 'string' || !merged.title.trim() || merged.title.trim().length > 160) return { error: 'El nombre debe tener entre 1 y 160 caracteres' };
  if (typeof merged.type !== 'string' || !merged.type.trim() || merged.type.length > 60) return { error: 'El tipo de obligación no es válido' };
  if (!ledger.CURRENCIES.has(merged.currencyCode)) return { error: 'La moneda no es válida' };
  if (typeof merged.estimatedAmount !== 'number' || ledger.moneyInput(merged.estimatedAmount, merged.currencyCode) === null) return { error: 'El importe estimado debe ser positivo y válido para la moneda' };
  if (!validDate(merged.startDate) || (merged.endDate && (!validDate(merged.endDate) || merged.endDate < merged.startDate))) return { error: 'El período de la obligación no es válido' };
  if (merged.recurrenceFrequency && !ledger.FREQUENCIES.has(merged.recurrenceFrequency)) return { error: 'La frecuencia no es válida' };
  if (typeof merged.paymentMethod !== 'string' || merged.paymentMethod.length > 120) return { error: 'El medio de pago no es válido' };
  if (typeof merged.notes !== 'string' || merged.notes.length > 4000) return { error: 'Las notas no son válidas' };
  if (!Number.isInteger(merged.reminderLeadDays) || merged.reminderLeadDays < 0 || merged.reminderLeadDays > 90) return { error: 'El aviso debe estar entre 0 y 90 días' };
  const links = validateLinks(db, userId, { ...merged, title: merged.title.trim(), paymentMethod: merged.paymentMethod.trim(), notes: merged.notes.trim() }, existing);
  if (links.error) return links;
  return { value: { ...links.value, type: merged.type.trim(), status: existing?.status || 'active' } };
}

function createObligation(db, userId, body) {
  const parsed = validateDefinition(db, userId, { recurrenceFrequency: null, endDate: null, reminderLeadDays: 7, paymentMethod: '', notes: '', ...body });
  if (parsed.error) return parsed;
  const obligation = db.create(COLLECTION, parsed.value, userId);
  return { obligation };
}

function updateOccurrence(db, userId, obligation, occurrence, body, scope = 'this') {
  if (occurrence.status === 'cancelled' || paymentTransactions(db, userId, occurrence.id).length) return { error: 'Una ocurrencia cancelada o pagada no se puede editar' };
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
  db.findAll(OCCURRENCES, userId).filter(item => item.obligationId === obligation.id && item.date >= occurrence.date && !paymentTransactions(db, userId, item.id).length && item.status !== 'cancelled').forEach(item => {
    const changed = { ...updates };
    if (body.estimatedAmount !== undefined && !Object.prototype.hasOwnProperty.call(body, 'actualDueAmount')) changed.dueAmountMinor = ledger.toMinorUnits(body.estimatedAmount, obligation.currencyCode);
    if (body.title !== undefined) changed.title = nextDefinition.title;
    db.update(OCCURRENCES, item.id, changed, userId);
  });
  return { occurrence: db.findById(OCCURRENCES, occurrence.id, userId), obligation: updated };
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

function idempotencyDigest(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

module.exports = {
  COLLECTION, OCCURRENCES, validDate, occurrenceView, occurrencesFor,
  validateDefinition, createObligation, updateOccurrence, paymentTransactions, getAlerts, idempotencyDigest, isScheduledOn
};
