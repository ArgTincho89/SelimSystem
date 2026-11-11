// Audit log: maps authenticated write requests to plain Spanish messages and stores them per user.
// Only the route pattern, entity reference and message are stored: never bodies, queries, headers or credentials.
const COLLECTION = 'activityLogs';
const RETENTION_MONTHS = 12;
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// done: past-tense phrase; attempt: infinitive phrase used for failures; join: preposition before the entity label
// (default "de", '' = none). entity: type resolved by labelFor; id: path param holding its id
// (omitted = the id comes from the response body of a create).
const r = (method, pattern, action, done, attempt, entity, extra = {}) => ({ method, pattern, action, done, attempt, entityType: entity || null, ...extra });
const ROUTES = [
  r('POST', '/auth/change-password', 'auth.change-password', 'Cambiaste tu contraseña', 'cambiar tu contraseña', null),
  r('POST', '/auth/change-email', 'auth.change-email', 'Cambiaste tu email', 'cambiar tu email', null),
  r('PUT', '/auth/photo', 'auth.photo', 'Cambiaste tu foto de perfil', 'cambiar tu foto de perfil', null),
  r('DELETE', '/auth/photo', 'auth.photo-remove', 'Quitaste tu foto de perfil', 'quitar tu foto de perfil', null),
  r('POST', '/categories', 'category.create', 'Creaste la categoría', 'crear una categoría', 'category', { join: '' }),
  r('PATCH', '/categories/reorder', 'category.reorder', 'Reordenaste tus categorías', 'reordenar tus categorías', null),
  r('PUT', '/categories/:id', 'category.update', 'Modificaste la categoría', 'modificar una categoría', 'category', { id: 'id', join: '' }),
  r('DELETE', '/categories/:id', 'category.delete', 'Eliminaste la categoría', 'eliminar una categoría', 'category', { id: 'id', join: '' }),
  r('POST', '/transactions', 'transaction.create', 'Registraste una transacción', 'registrar una transacción', 'transaction'),
  r('POST', '/transactions/:id/occurrences/:date/post', 'transaction.occurrence-post', 'Contabilizaste una ocurrencia de la transacción recurrente', 'contabilizar una ocurrencia de una transacción recurrente', 'transaction', { id: 'id' }),
  r('PUT', '/transactions/:id/occurrences/:date', 'transaction.occurrence-update', 'Modificaste una ocurrencia de la transacción recurrente', 'modificar una ocurrencia de una transacción recurrente', 'transaction', { id: 'id' }),
  r('DELETE', '/transactions/:id/occurrences/:date', 'transaction.occurrence-delete', 'Eliminaste una ocurrencia de la transacción recurrente', 'eliminar una ocurrencia de una transacción recurrente', 'transaction', { id: 'id' }),
  r('PUT', '/transactions/:id', 'transaction.update', 'Modificaste una transacción', 'modificar una transacción', 'transaction', { id: 'id' }),
  r('DELETE', '/transactions/:id', 'transaction.delete', 'Eliminaste una transacción', 'eliminar una transacción', 'transaction', { id: 'id' }),
  r('POST', '/accounts/migration/rollback', 'account.migration-rollback', 'Revertiste la migración de cuentas', 'revertir la migración de cuentas', null),
  r('POST', '/accounts/migration/reapply', 'account.migration-reapply', 'Volviste a aplicar la migración de cuentas', 'volver a aplicar la migración de cuentas', null),
  r('PATCH', '/accounts/settings', 'account.settings', 'Cambiaste la configuración de tus cuentas', 'cambiar la configuración de tus cuentas', null),
  r('PATCH', '/accounts/order', 'account.reorder', 'Reordenaste tus cuentas', 'reordenar tus cuentas', null),
  r('POST', '/accounts', 'account.create', 'Creaste la cuenta', 'crear una cuenta', 'account', { join: '' }),
  r('POST', '/accounts', 'account.create-sub', 'Creaste la subcuenta', 'crear una subcuenta', 'account', { join: '' }),
  r('POST', '/accounts/:id/reconcile', 'account.reconcile', 'Conciliaste la cuenta', 'conciliar una cuenta', 'account', { id: 'id', join: '' }),
  r('POST', '/accounts/:id/archive', 'account.archive', 'Archivaste la cuenta', 'archivar una cuenta', 'account', { id: 'id', join: '' }),
  r('PUT', '/accounts/:id', 'account.update', 'Modificaste la cuenta', 'modificar una cuenta', 'account', { id: 'id', join: '' }),
  r('DELETE', '/accounts/:id', 'account.delete', 'Eliminaste la cuenta', 'eliminar una cuenta', 'account', { id: 'id', join: '' }),
  r('POST', '/transfers', 'transfer.create', 'Registraste una transferencia', 'registrar una transferencia', 'transfer'),
  r('POST', '/transfers/:id/post', 'transfer.post', 'Contabilizaste una transferencia', 'contabilizar una transferencia', 'transfer', { id: 'id' }),
  r('PUT', '/transfers/:id', 'transfer.update', 'Modificaste una transferencia', 'modificar una transferencia', 'transfer', { id: 'id' }),
  r('DELETE', '/transfers/:id', 'transfer.delete', 'Eliminaste una transferencia', 'eliminar una transferencia', 'transfer', { id: 'id' }),
  r('POST', '/goals', 'goal.create', 'Creaste una meta', 'crear una meta', 'goal'),
  r('DELETE', '/goals/:id', 'goal.delete', 'Eliminaste una meta', 'eliminar una meta', 'goal', { id: 'id' }),
  r('POST', '/assets/form', 'asset.create', 'Creaste el bien', 'crear un bien', 'asset', { join: '' }),
  r('PUT', '/assets/:id/form', 'asset.update', 'Modificaste el bien', 'modificar un bien', 'asset', { id: 'id', join: '' }),
  r('POST', '/assets/:id/ownerships', 'asset.ownership-add', 'Agregaste una titularidad al bien', 'agregar una titularidad a un bien', 'asset', { id: 'id', join: '' }),
  r('PATCH', '/assets/:id/ownerships/:ownershipId', 'asset.ownership-update', 'Modificaste una titularidad del bien', 'modificar una titularidad de un bien', 'asset', { id: 'id', join: '' }),
  r('POST', '/assets', 'asset.create', 'Creaste el bien', 'crear un bien', 'asset', { join: '' }),
  r('PUT', '/assets/:id', 'asset.update', 'Modificaste el bien', 'modificar un bien', 'asset', { id: 'id', join: '' }),
  r('POST', '/owners', 'owner.create', 'Agregaste a', 'agregar una persona o entidad', 'owner', { join: '' }),
  r('PUT', '/owners/:id', 'owner.update', 'Modificaste los datos de', 'modificar los datos de una persona o entidad', 'owner', { id: 'id', join: '' }),
  r('DELETE', '/owners/:id', 'owner.delete', 'Eliminaste a', 'eliminar una persona o entidad', 'owner', { id: 'id', join: '' }),
  r('POST', '/documents', 'document.create', 'Adjuntaste un documento', 'adjuntar un documento', 'document'),
  r('POST', '/notes', 'note.create', 'Agregaste una nota', 'agregar una nota', null),
  r('POST', '/obligations/pending-links/release', 'obligation.pending-release', 'Dejaste a cargo del propietario las obligaciones de un alquiler no guardado', 'liberar las obligaciones de un alquiler no guardado', null),
  r('POST', '/obligations', 'obligation.create', 'Creaste la obligación', 'crear una obligación', 'obligation', { join: '' }),
  r('PATCH', '/obligations/:id/responsibility', 'obligation.responsibility', 'Cambiaste el responsable de la obligación', 'cambiar el responsable de una obligación', 'obligation', { id: 'id', join: '' }),
  r('PUT', '/obligations/:id', 'obligation.update', 'Modificaste la obligación', 'modificar una obligación', 'obligation', { id: 'id', join: '' }),
  r('DELETE', '/obligations/:id', 'obligation.delete', 'Eliminaste la obligación', 'eliminar una obligación', 'obligation', { id: 'id', join: '' }),
  r('POST', '/obligations/:id/occurrences/:occurrenceId/confirm', 'obligation.occurrence-confirm', 'Confirmaste un vencimiento de la obligación', 'confirmar un vencimiento de una obligación', 'obligation', { id: 'id', join: '' }),
  r('POST', '/obligations/:id/occurrences/:occurrenceId/cancel', 'obligation.occurrence-cancel', 'Cancelaste un vencimiento de la obligación', 'cancelar un vencimiento de una obligación', 'obligation', { id: 'id', join: '' }),
  r('PUT', '/obligations/:id/occurrences/:occurrenceId', 'obligation.occurrence-update', 'Modificaste un vencimiento de la obligación', 'modificar un vencimiento de una obligación', 'obligation', { id: 'id', join: '' }),
  r('POST', '/obligations/:id/occurrences/:occurrenceId/resolution', 'obligation.resolve', 'Resolviste un vencimiento de la obligación', 'resolver un vencimiento de una obligación', 'obligation', { id: 'id', join: '' }),
  r('DELETE', '/obligations/:id/occurrences/:occurrenceId/resolution', 'obligation.unresolve', 'Deshiciste la resolución de un vencimiento de la obligación', 'deshacer la resolución de un vencimiento de una obligación', 'obligation', { id: 'id', join: '' }),
  r('POST', '/obligations/:id/occurrences/:occurrenceId/payments', 'obligation.payment', 'Registraste un pago de la obligación', 'registrar un pago de una obligación', 'obligation', { id: 'id', join: '' }),
  r('POST', '/rentals/declarations/:id/end', 'rental.declaration-end', 'Finalizaste el alquiler de', 'finalizar un alquiler', 'declaration', { id: 'id', join: '' }),
  r('POST', '/rentals/declarations', 'rental.declaration-create', 'Declaraste el alquiler de', 'declarar un alquiler', 'declaration', { join: '' }),
  r('PUT', '/rentals/declarations/:id', 'rental.declaration-update', 'Modificaste el alquiler de', 'modificar un alquiler', 'declaration', { id: 'id', join: '' }),
  r('POST', '/rentals/collections/:id/reverse', 'rental.collection-undo', 'Deshiciste el cobro del alquiler', 'deshacer un cobro de alquiler', 'collection', { id: 'id', withAmount: true }),
  r('POST', '/rentals/collections/:id/allocations', 'rental.collection-allocate', 'Asignaste un cobro al alquiler', 'asignar un cobro a un alquiler', 'collection', { id: 'id' }),
  r('POST', '/rentals/collections/month', 'rental.collection', 'Registraste el cobro del alquiler', 'registrar el cobro del alquiler', 'collection'),
  r('POST', '/rentals/collections', 'rental.collection', 'Registraste el cobro del alquiler', 'registrar el cobro del alquiler', 'collection'),
  r('POST', '/rentals/:id/conditions', 'rental.condition', 'Registraste un ajuste en el alquiler', 'registrar un ajuste en un alquiler', 'contract', { id: 'id' }),
  r('POST', '/rentals/:id/occurrences/:occurrenceId/cancel', 'rental.occurrence-cancel', 'Cancelaste un período del alquiler', 'cancelar un período de un alquiler', 'contract', { id: 'id' }),
  r('POST', '/rentals', 'rental.create', 'Creaste un contrato de alquiler', 'crear un contrato de alquiler', 'contract'),
  r('PUT', '/rentals/:id', 'rental.update', 'Modificaste el contrato de alquiler', 'modificar un contrato de alquiler', 'contract', { id: 'id' }),
  r('POST', '/finance/payment-methods', 'payment-method.create', 'Creaste el medio de pago', 'crear un medio de pago', 'paymentMethod', { join: '' }),
  r('PUT', '/finance/payment-methods/:id', 'payment-method.update', 'Modificaste el medio de pago', 'modificar un medio de pago', 'paymentMethod', { id: 'id', join: '' }),
  r('DELETE', '/finance/payment-methods/:id', 'payment-method.delete', 'Eliminaste el medio de pago', 'eliminar un medio de pago', 'paymentMethod', { id: 'id', join: '' }),
  r('PUT', '/finance/transactions/:id/allocations', 'finance.allocations', 'Cambiaste la distribución de una transacción', 'cambiar la distribución de una transacción', 'transaction', { id: 'id' }),
  r('POST', '/finance/claims/:id/recoveries', 'finance.recovery', 'Registraste un recupero de gastos', 'registrar un recupero de gastos', null),
  r('POST', '/finance/claims', 'finance.claim', 'Registraste un gasto a recuperar', 'registrar un gasto a recuperar', null),
  r('POST', '/installments/plans/:id/occurrences/:occurrenceId/post', 'installment.post', 'Contabilizaste una cuota', 'contabilizar una cuota', null),
  r('POST', '/installments/plans/:id/occurrences/:occurrenceId/cancel', 'installment.occurrence-cancel', 'Cancelaste una cuota', 'cancelar una cuota', null),
  r('POST', '/installments/plans/:id/cancel', 'installment.cancel', 'Cancelaste un plan de cuotas', 'cancelar un plan de cuotas', null),
  r('POST', '/installments/plans', 'installment.create', 'Creaste un plan de cuotas', 'crear un plan de cuotas', null),
  r('PATCH', '/installments/plans/:id', 'installment.update', 'Modificaste un plan de cuotas', 'modificar un plan de cuotas', null)
].map(route => ({ ...route, regex: new RegExp(`^${route.pattern.replace(/:[A-Za-z]+/g, '([^/]+)')}$`), keys: (route.pattern.match(/:[A-Za-z]+/g) || []).map(key => key.slice(1)) }));

const SECTIONS = { auth: 'tu perfil', categories: 'tus categorías', transactions: 'tus transacciones', accounts: 'tus cuentas', transfers: 'tus transferencias', goals: 'tus metas', assets: 'tus bienes', owners: 'tus personas y entidades', documents: 'tus documentos', notes: 'tus notas', obligations: 'tus obligaciones', rentals: 'tus alquileres', finance: 'tus finanzas', installments: 'tus cuotas' };

const SKIPPED = [/^POST \/auth\/(register|login|logout|forgot-password|reset-password)$/, /^DELETE \/auth\/account$/];

function assetNameOf(db, userId, assetId) {
  return assetId ? db.findById('assets', assetId, userId)?.name || '' : '';
}

function periodLabel(period) {
  const [year, month] = String(period || '').split('-');
  return MONTHS[Number(month) - 1] ? `${MONTHS[Number(month) - 1]} ${year}` : '';
}

const LABELS = {
  transaction: (db, userId, id) => {
    const tx = db.findById('transactions', id, userId);
    if (!tx) return '';
    const amount = typeof tx.monto === 'number' ? ` (${tx.currencyCode ? `${tx.currencyCode} ` : ''}${tx.monto})` : '';
    return `${tx.titulo || ''}${amount}`.trim();
  },
  account: (db, userId, id) => (db.findById('accounts', id, userId)?.nombre || db.findById('accounts', id, userId)?.name) || '',
  category: (db, userId, id) => db.findById('categories', id, userId)?.nombre || '',
  goal: (db, userId, id) => db.findById('goals', id, userId)?.categoryName || '',
  asset: (db, userId, id) => db.findById('assets', id, userId)?.name || '',
  owner: (db, userId, id) => db.findById('legalOwners', id, userId)?.name || '',
  obligation: (db, userId, id) => db.findById('obligations', id, userId)?.title || '',
  transfer: (db, userId, id) => db.findById('transfers', id, userId)?.reference || '',
  paymentMethod: (db, userId, id) => db.findById('paymentMethods', id, userId)?.name || '',
  document: (db, userId, id) => db.findById('documents', id, userId)?.title || '',
  contract: (db, userId, id) => assetNameOf(db, userId, db.findById('rentalContracts', id, userId)?.assetId),
  declaration: (db, userId, id) => assetNameOf(db, userId, db.findById('rentalDeclarations', id, userId)?.assetId),
  collection: (db, userId, id) => {
    const periods = new Set();
    let assetName = '';
    const ids = new Set(collectionIdsOf(db, userId, id));
    db.findAll('rentCollectionAllocations', userId).filter(item => ids.has(item.collectionId)).forEach(item => {
      const occurrence = db.findById('rentOccurrences', item.occurrenceId, userId);
      if (!occurrence) return;
      periods.add(occurrence.period);
      assetName = assetName || assetNameOf(db, userId, db.findById('rentalContracts', occurrence.contractId, userId)?.assetId);
    });
    const months = [...periods].sort().map(periodLabel).filter(Boolean).join(', ');
    return [assetName, months && `período ${months}`].filter(Boolean).join(', ');
  }
};

// A created account that has a parent is logged as "Creaste la subcuenta X de Y".
function refineRoute(db, userId, route, entityId) {
  if (!route || route.action !== 'account.create' || !entityId) return { route, label: '' };
  const account = db.findById('accounts', entityId, userId);
  const parent = account && account.parentId ? db.findById('accounts', account.parentId, userId) : null;
  if (!parent) return { route, label: '' };
  const name = account.nombre || account.name || '';
  return { route: ROUTES.find(item => item.action === 'account.create-sub'), label: `${name} de ${parent.nombre || parent.name || ''}`.slice(0, 120) };
}

function labelFor(db, userId, type, id) {
  if (!type || !id || typeof id !== 'string') return '';
  try { return String(LABELS[type]?.(db, userId, id) || '').slice(0, 120); } catch { return ''; }
}

function normalizePath(url) {
  const path = String(url || '').split('?')[0].replace(/^\/api(?=\/)/, '').replace(/\/+$/, '');
  return path || '/';
}

function isSkipped(method, path) { return SKIPPED.some(rule => rule.test(`${method} ${path}`)); }

function matchRoute(method, path) {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const match = route.regex.exec(path);
    if (match) return { route, params: Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])])) };
  }
  return null;
}

// A "Cobrar mes" group (or any of its modality collections) stands for all of its collections.
function collectionIdsOf(db, userId, id) {
  const groupId = db.findById('rentCollectionGroups', id, userId) ? id : db.findById('rentCollections', id, userId)?.groupId;
  const group = groupId ? db.findById('rentCollectionGroups', groupId, userId) : null;
  return group ? group.collectionIds : [id];
}

// Undo entries keep the amount that was collected (per currency for a multi-modality month).
function withAmount(db, userId, collectionId, label) {
  const totals = new Map();
  collectionIdsOf(db, userId, collectionId).map(id => db.findById('rentCollections', id, userId)).filter(Boolean)
    .forEach(item => totals.set(item.currencyCode, Math.round(((totals.get(item.currencyCode) || 0) + item.amount) * 100) / 100));
  const amount = totals.size ? `importe ${[...totals].map(([currency, value]) => `${currency} ${value}`).join(' + ')}` : '';
  return [label, amount].filter(Boolean).join(', ');
}

// Resolves the route definition and the entity label before the handler runs (needed for PUT/DELETE/reverse).
function resolveContext(db, userId, method, path) {
  const found = matchRoute(method, path);
  const context = { route: found?.route || null, params: found?.params || {}, entityId: null, entityLabel: '' };
  if (!found) return context;
  context.entityId = found.route.id ? found.params[found.route.id] : null;
  context.entityLabel = labelFor(db, userId, found.route.entityType, context.entityId);
  if (found.route.withAmount) context.entityLabel = withAmount(db, userId, context.entityId, context.entityLabel);
  // Deleting a rent collection's transaction undoes the collection.
  if (found.route.action === 'transaction.delete') {
    const tx = db.findById('transactions', context.entityId, userId);
    if (tx?.rentCollectionId) {
      context.route = ROUTES.find(item => item.action === 'rental.collection-undo');
      context.entityId = tx.rentCollectionId;
      context.entityLabel = withAmount(db, userId, tx.rentCollectionId, labelFor(db, userId, 'collection', tx.rentCollectionId));
    }
  }
  return context;
}

function buildMessage({ route, label, path, outcome }) {
  let text;
  if (!route) {
    const section = SECTIONS[String(path || '').split('/')[1]] || 'tu cuenta';
    text = outcome === 'success' ? `Realizaste un cambio en ${section}` : `Intentaste hacer un cambio en ${section}, pero no se completó`;
  } else {
    const join = route.join === undefined ? 'de' : route.join;
    const suffix = label ? ` ${join ? `${join} ` : ''}${label}` : '';
    text = outcome === 'success' ? `${route.done}${suffix}` : `Intentaste ${route.attempt}${suffix}, pero no se completó`;
  }
  return text.slice(0, 300);
}

const lastPrune = new WeakMap();

// Removes entries older than 12 months, at most once per user per day.
function pruneOld(db, userId, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const marks = lastPrune.get(db) || new Map();
  lastPrune.set(db, marks);
  if (marks.get(userId) === day) return 0;
  marks.set(userId, day);
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - RETENTION_MONTHS);
  const all = db.findAll(COLLECTION, userId);
  const kept = all.filter(item => item.timestamp >= cutoff.toISOString());
  if (kept.length !== all.length) db.replace(COLLECTION, userId, kept);
  return all.length - kept.length;
}

function append(db, userId, entry) {
  const record = {
    timestamp: entry.timestamp || new Date().toISOString(), method: entry.method, route: entry.route, action: entry.action,
    entityType: entry.entityType || null, entityId: entry.entityId || null, entityLabel: entry.entityLabel || '',
    outcome: entry.outcome, statusCode: entry.statusCode, message: entry.message
  };
  // Strictly increasing timestamps keep "before" pagination exact.
  const existing = db.findAll(COLLECTION, userId);
  const last = existing.length ? existing[existing.length - 1].timestamp : '';
  if (last && record.timestamp <= last) record.timestamp = new Date(new Date(last).getTime() + 1).toISOString();
  const created = db.create(COLLECTION, record, userId);
  pruneOld(db, userId, new Date());
  return created;
}

// True for a real calendar date written as YYYY-MM-DD.
function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTimezone(value) {
  if (typeof value !== 'string' || !value) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}

// Returns a function mapping an ISO timestamp to its YYYY-MM-DD day in the given timezone.
function dayIn(timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return iso => {
    const parts = formatter.formatToParts(new Date(iso)).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
}

// from/to are inclusive YYYY-MM-DD days evaluated in `timezone` (callers validate them first).
function list(db, userId, { limit, before, from, to, timezone = 'UTC' } = {}) {
  const size = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50));
  const beforeValid = typeof before === 'string' && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : null;
  const fromDay = isIsoDate(from) ? from : null;
  const toDay = isIsoDate(to) ? to : null;
  const localDay = fromDay || toDay ? dayIn(isValidTimezone(timezone) ? timezone : 'UTC') : null;
  const inRange = item => {
    if (!localDay) return true;
    const day = localDay(item.timestamp);
    return (!fromDay || day >= fromDay) && (!toDay || day <= toDay);
  };
  const sorted = db.findAll(COLLECTION, userId)
    .filter(item => (!beforeValid || item.timestamp < beforeValid) && inRange(item))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const items = sorted.slice(0, size);
  return { items, nextBefore: sorted.length > size ? items[items.length - 1].timestamp : null };
}

module.exports = { COLLECTION, ROUTES, refineRoute, labelFor, buildMessage, append, pruneOld, list, resolveContext, isSkipped, normalizePath, periodLabel, isIsoDate, isValidTimezone };
