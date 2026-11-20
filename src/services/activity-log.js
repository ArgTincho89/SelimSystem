// Audit log: maps authenticated write requests to plain Spanish messages and stores them per user.
// Only the route pattern, entity reference and message are stored: never bodies, queries, headers or credentials.
const { formatDisplayDate } = require('../utils/date-format');

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
  // Same request as above, selected by the route (res.locals.activityMeta.action) when the expense pays a due date:
  // the entry reads like the one of "Registrar pago".
  r('POST', '/transactions', 'obligation.payment', 'Registraste un pago de la obligación', 'registrar un pago de una obligación', 'transaction', { join: '' }),
  r('POST', '/transactions/:id/occurrences/:date/post', 'transaction.occurrence-post', 'Contabilizaste una ocurrencia de la transacción recurrente', 'contabilizar una ocurrencia de una transacción recurrente', 'transaction', { id: 'id' }),
  r('PUT', '/transactions/:id/occurrences/:date', 'transaction.occurrence-update', 'Modificaste una ocurrencia de la transacción recurrente', 'modificar una ocurrencia de una transacción recurrente', 'transaction', { id: 'id' }),
  r('DELETE', '/transactions/:id/occurrences/:date', 'transaction.occurrence-delete', 'Eliminaste una ocurrencia de la transacción recurrente', 'eliminar una ocurrencia de una transacción recurrente', 'transaction', { id: 'id' }),
  r('POST', '/transactions/:id/confirm', 'transaction.confirm', 'Confirmaste la imputación de la transacción', 'confirmar la imputación de una transacción', 'transaction', { id: 'id' }),
  r('POST', '/transactions/:id/unconfirm', 'transaction.unconfirm', 'Deshiciste la confirmación de la transacción', 'deshacer la confirmación de una transacción', 'transaction', { id: 'id' }),
  r('PUT', '/transactions/:id', 'transaction.update', 'Modificaste una transacción', 'modificar una transacción', 'transaction', { id: 'id' }),
  r('DELETE', '/transactions/:id', 'transaction.delete', 'Eliminaste una transacción', 'eliminar una transacción', 'transaction', { id: 'id' }),
  r('PUT', '/alerts/settings', 'alert.settings', 'Cambiaste la configuración de avisos', 'cambiar la configuración de avisos', null),
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
  r('POST', '/asset-kinds', 'asset-kind.create', 'Creaste el tipo de bien', 'crear un tipo de bien', null, { join: '' }),
  r('DELETE', '/assets/:id', 'asset.delete', 'Eliminaste el bien', 'eliminar un bien', 'asset', { id: 'id', join: '' }),
  r('POST', '/owners', 'owner.create', 'Agregaste a', 'agregar una persona o entidad', 'owner', { join: '' }),
  r('PUT', '/owners/:id', 'owner.update', 'Modificaste los datos de', 'modificar los datos de una persona o entidad', 'owner', { id: 'id', join: '' }),
  r('DELETE', '/owners/:id', 'owner.delete', 'Eliminaste a', 'eliminar una persona o entidad', 'owner', { id: 'id', join: '' }),
  r('POST', '/documents', 'document.create', 'Adjuntaste un documento', 'adjuntar un documento', 'document'),
  r('DELETE', '/documents/:id', 'document.delete', 'Eliminaste un documento', 'eliminar un documento', 'document', { id: 'id' }),
  r('PUT', '/notes/:id', 'note.update', 'Modificaste una nota', 'modificar una nota', null),
  r('DELETE', '/notes/:id', 'note.delete', 'Eliminaste una nota', 'eliminar una nota', null),
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
  r('POST', '/obligations/:id/occurrences/:occurrenceId/payments/:paymentId/revert', 'obligation.payment-revert', 'Revertiste un pago de la obligación', 'revertir un pago de una obligación', 'obligation', { id: 'id', join: '' }),
  r('POST', '/obligations/:id/occurrences/:occurrenceId/payments', 'obligation.payment', 'Registraste un pago de la obligación', 'registrar un pago de una obligación', 'obligation', { id: 'id', join: '' }),
  r('POST', '/rentals/declarations/:id/end', 'rental.declaration-end', 'Finalizaste el alquiler de', 'finalizar un alquiler', 'declaration', { id: 'id', join: '' }),
  r('POST', '/rentals/declarations/:id/modalities/:contractId/end', 'rental.contract-end', 'Finalizaste un contrato del alquiler de', 'finalizar un contrato de un alquiler', 'declaration', { id: 'id', join: '' }),
  r('DELETE', '/rentals/declarations/:id', 'rental.declaration-delete', 'Eliminaste el alquiler de', 'eliminar un alquiler', 'declaration', { id: 'id', join: '' }),
  r('POST', '/rentals/declarations', 'rental.declaration-create', 'Declaraste el alquiler de', 'declarar un alquiler', 'declaration', { join: '' }),
  r('PUT', '/rentals/declarations/:id', 'rental.declaration-update', 'Modificaste el alquiler de', 'modificar un alquiler', 'declaration', { id: 'id', join: '' }),
  r('POST', '/rentals/collections/:id/reverse', 'rental.collection-undo', 'Deshiciste el cobro del alquiler', 'deshacer un cobro de alquiler', 'collection', { id: 'id', withAmount: true }),
  r('POST', '/rentals/collections/:id/allocations', 'rental.collection-allocate', 'Asignaste un cobro al alquiler', 'asignar un cobro a un alquiler', 'collection', { id: 'id' }),
  r('POST', '/rentals/collections/:id/cheque-cashed/undo', 'rental.cheque-undo', 'Deshiciste el cobro del cheque del alquiler', 'deshacer el cobro de un cheque de alquiler', 'collection', { id: 'id', withAmount: true }),
  r('POST', '/rentals/collections/:id/cheque-cashed', 'rental.cheque-cashed', 'Marcaste como cobrado el cheque del alquiler', 'marcar como cobrado un cheque de alquiler', 'collection', { id: 'id' }),
  r('POST', '/rentals/collections/month', 'rental.collection', 'Registraste el cobro del alquiler', 'registrar el cobro del alquiler', 'collection'),
  // Same request as above, selected by the route (res.locals.activityMeta.action) when a balance stays pending.
  r('POST', '/rentals/collections/month', 'rental.collection-partial', 'Registraste un cobro parcial del alquiler', 'registrar un cobro parcial del alquiler', 'collection'),
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

const SECTIONS = { auth: 'tu perfil', categories: 'tus categorías', transactions: 'tus transacciones', accounts: 'tus cuentas', transfers: 'tus transferencias', goals: 'tus metas', assets: 'tus bienes', owners: 'tus personas y entidades', documents: 'tus documentos', notes: 'tus notas', obligations: 'tus obligaciones', rentals: 'tus alquileres', finance: 'tus finanzas', installments: 'tus cuotas', alerts: 'tus avisos' };

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
  document: (db, userId, id) => {
    const doc = db.findById('documents', id, userId);
    if (!doc) return '';
    return [doc.title || '', documentContext(db, userId, doc)].filter(Boolean).join(' ');
  },
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

// Where an attachment belongs, for its log entry: "al cobro del alquiler de Casa (período noviembre 2026)",
// "al movimiento Sueldo (ARS 100)", "a la obligación ABL de la propiedad Casa", ...
function documentContext(db, userId, doc) {
  const tx = doc.transactionId ? db.findById('transactions', doc.transactionId, userId) : null;
  if (tx?.rentCollectionId) {
    const label = LABELS.collection(db, userId, tx.rentCollectionId);
    return `(comprobante del cobro del alquiler${label ? ` de ${label}` : ''})`;
  }
  if (doc.occurrenceId || doc.obligationId) {
    const obligation = db.findById('obligations', doc.obligationId || db.findById('obligationOccurrences', doc.occurrenceId, userId)?.obligationId, userId);
    const asset = assetNameOf(db, userId, obligation?.assetId);
    if (obligation) return `(comprobante de la obligación ${obligation.title}${asset ? ` de la propiedad ${asset}` : ''}${doc.tenantEntityId ? ', pagada por el inquilino' : ''})`;
  }
  if (tx) return `(comprobante del movimiento ${LABELS.transaction(db, userId, tx.id)})`;
  if (doc.contractId || doc.declarationId) return `(documento del alquiler de ${LABELS.declaration(db, userId, doc.declarationId) || LABELS.contract(db, userId, doc.contractId)})`;
  return '';
}

// Plain "1.234,5" amounts (es-AR), independent of the ICU build.
function formatAmount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  const [whole, fraction = ''] = (Math.round(Math.abs(value) * 100) / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '-' : ''}${grouped}${fraction ? `,${fraction}` : ''}`;
}

// Builds the descriptive label of a log entry from the facts a route provides. A missing fact drops its fragment,
// so the message never contains "undefined" or empty brackets. Facts: title, assetName, period, amount + currencyCode
// (or amounts[]), dueDate, installment ({ number, total }), details (extra short fragments, e.g. the pending balance).
// `base` is used when the route gives no title.
function describe(route, facts = {}, base = '') {
  const title = typeof facts.title === 'string' ? facts.title.trim() : '';
  const assetName = typeof facts.assetName === 'string' ? facts.assetName.trim() : '';
  const head = title ? `${title}${assetName ? ` de la propiedad ${assetName}` : ''}` : base;
  const amounts = (Array.isArray(facts.amounts) ? facts.amounts : [{ amount: facts.amount, currencyCode: facts.currencyCode }])
    .map(item => (item && formatAmount(item.amount) ? `${item.currencyCode ? `${item.currencyCode} ` : ''}${formatAmount(item.amount)}` : ''))
    .filter(Boolean).join(' + ');
  const installment = facts.installment && Number.isInteger(facts.installment.number) && Number.isInteger(facts.installment.total) && facts.installment.number > 0 && facts.installment.total >= facts.installment.number
    ? `cuota ${facts.installment.number}/${facts.installment.total}` : '';
  const due = formatDisplayDate(facts.dueDate);
  const details = (Array.isArray(facts.details) ? facts.details : []).filter(item => typeof item === 'string' && item.trim()).map(item => item.trim());
  return [head, amounts && `por un monto de ${amounts}`, due && `con vencimiento ${due}`, installment, ...details].filter(Boolean).join(', ').slice(0, 300);
}

function activeOwnerIds(db, userId, assetId, today = new Date().toISOString().slice(0, 10)) {
  if (!assetId) return [];
  return [...new Set(db.findAll('assetOwnerships', userId)
    .filter(item => item.assetId === assetId && (!item.startDate || item.startDate <= today) && (!item.endDate || item.endDate >= today))
    .map(item => item.ownerId).filter(Boolean))];
}

const emptyMeta = () => ({ assetId: null, ownerIds: [], tenantIds: [], categoryId: null });

function contractTenants(db, userId, contractId) {
  const contract = contractId ? db.findById('rentalContracts', contractId, userId) : null;
  return contract ? { assetId: contract.assetId || null, tenantIds: [...(contract.tenantIds || [])] } : { assetId: null, tenantIds: [] };
}

// Generic write-time references for an entity: asset, owners of the asset, tenants and category.
// Resolved before the handler runs (so deletes keep them) and again after it for created entities.
function deriveMeta(db, userId, entityType, entityId) {
  const meta = emptyMeta();
  if (!entityType || !entityId || typeof entityId !== 'string') return meta;
  try {
    if (entityType === 'asset') meta.assetId = db.findById('assets', entityId, userId) ? entityId : null;
    else if (entityType === 'category') meta.categoryId = db.findById('categories', entityId, userId) ? entityId : null;
    else if (entityType === 'obligation') {
      const obligation = db.findById('obligations', entityId, userId);
      if (obligation) {
        meta.assetId = obligation.assetId || null;
        meta.categoryId = obligation.categoryId || null;
        meta.tenantIds = contractTenants(db, userId, obligation.rentalContractId).tenantIds;
      }
    } else if (entityType === 'contract') Object.assign(meta, contractTenants(db, userId, entityId));
    else if (entityType === 'declaration') meta.assetId = db.findById('rentalDeclarations', entityId, userId)?.assetId || null;
    else if (entityType === 'collection') {
      const ids = new Set(collectionIdsOf(db, userId, entityId));
      const tenants = new Set();
      db.findAll('rentCollectionAllocations', userId).filter(item => ids.has(item.collectionId)).forEach(item => {
        const occurrence = db.findById('rentOccurrences', item.occurrenceId, userId);
        const found = occurrence ? contractTenants(db, userId, occurrence.contractId) : null;
        if (!found) return;
        meta.assetId = meta.assetId || found.assetId;
        found.tenantIds.forEach(id => tenants.add(id));
      });
      meta.tenantIds = [...tenants];
    }
    meta.ownerIds = activeOwnerIds(db, userId, meta.assetId);
  } catch { return emptyMeta(); }
  return meta;
}

// Meta of an obligation write (resolution, payment, reversal). Owners: the asset holders, or the account owner
// when the obligation has no asset. `undo` is only passed by the actions that can be undone.
function obligationMeta(db, userId, obligation, occurrence, { amount, currencyCode, tenantIds, accountId, categoryId, undo } = {}) {
  const meta = deriveMeta(db, userId, 'obligation', obligation.id);
  let ownerIds = meta.ownerIds;
  if (!ownerIds.length && !obligation.assetId) {
    const ownerId = db.findById('accounts', accountId || occurrence.accountId || obligation.accountId, userId)?.ownerId;
    ownerIds = ownerId ? [ownerId] : [];
  }
  return {
    assetId: obligation.assetId || null, ownerIds, tenantIds: Array.isArray(tenantIds) ? tenantIds : meta.tenantIds,
    categoryId: categoryId || occurrence.categoryId || obligation.categoryId || null,
    facts: { title: obligation.title || '', assetName: assetNameOf(db, userId, obligation.assetId), amount, currencyCode: currencyCode || occurrence.currencyCode, dueDate: occurrence.date, installment: occurrence.installment || obligation.installment || null },
    undo: undo || null
  };
}

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
  const context = { route: found?.route || null, params: found?.params || {}, entityId: null, entityLabel: '', derived: emptyMeta() };
  if (!found) return context;
  context.entityId = found.route.id ? found.params[found.route.id] : null;
  context.entityLabel = labelFor(db, userId, found.route.entityType, context.entityId);
  context.derived = deriveMeta(db, userId, found.route.entityType, context.entityId);
  if (found.route.withAmount) context.entityLabel = withAmount(db, userId, context.entityId, context.entityLabel);
  // Deleting a rent collection's transaction undoes the collection.
  if (found.route.action === 'transaction.delete') {
    const tx = db.findById('transactions', context.entityId, userId);
    if (tx?.rentCollectionId) {
      context.route = ROUTES.find(item => item.action === 'rental.collection-undo');
      context.entityId = tx.rentCollectionId;
      context.derived = deriveMeta(db, userId, 'collection', tx.rentCollectionId);
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
    outcome: entry.outcome, statusCode: entry.statusCode, message: entry.message,
    assetId: entry.assetId || null, ownerIds: Array.isArray(entry.ownerIds) ? entry.ownerIds : [], tenantIds: Array.isArray(entry.tenantIds) ? entry.tenantIds : [],
    categoryId: entry.categoryId || null, undo: entry.undo || null
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

// Whether the stored undo descriptor still points at an active target. Computed on read, never stored.
function isUndoable(db, userId, item) {
  const undo = item && item.outcome === 'success' ? item.undo : null;
  if (!undo || typeof undo !== 'object') return false;
  try {
    if (undo.type === 'obligation.payment') return db.findById('transactions', undo.transactionId, userId)?.obligationOccurrenceId === undo.occurrenceId;
    if (undo.type === 'obligation.resolution') return db.findById('obligationResolutions', undo.resolutionId, userId)?.status === 'active';
    if (undo.type === 'rental.cheque') {
      const ids = collectionIdsOf(db, userId, undo.collectionId);
      return ids.map(id => db.findById('rentCollections', id, userId)).some(item => item && !item.reversedAt && item.cheque && item.cheque.cashedAt);
    }
    if (undo.type === 'rental.collection') {
      const target = db.findById('rentCollectionGroups', undo.collectionId, userId) || db.findById('rentCollections', undo.collectionId, userId);
      return Boolean(target) && !target.reversedAt;
    }
  } catch { return false; }
  return false;
}

const FILTER_KEYS = ['assetId', 'ownerId', 'tenantId', 'categoryId'];

// A filter is absent (undefined or ''), or a string of at most 100 characters.
function validFilters(query = {}) {
  return FILTER_KEYS.every(key => query[key] === undefined || query[key] === '' || (typeof query[key] === 'string' && query[key].length <= 100));
}

// from/to are inclusive YYYY-MM-DD days evaluated in `timezone` (callers validate them first).
// assetId/ownerId/tenantId/categoryId combine with AND and run before pagination; owners and tenants match by
// membership of the stored arrays. Entries without the metadata (legacy) never match a filter.
function list(db, userId, { limit, before, from, to, timezone = 'UTC', assetId, ownerId, tenantId, categoryId } = {}) {
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
  const matches = item => (!assetId || item.assetId === assetId)
    && (!ownerId || (Array.isArray(item.ownerIds) && item.ownerIds.includes(ownerId)))
    && (!tenantId || (Array.isArray(item.tenantIds) && item.tenantIds.includes(tenantId)))
    && (!categoryId || item.categoryId === categoryId);
  const sorted = db.findAll(COLLECTION, userId)
    .filter(item => (!beforeValid || item.timestamp < beforeValid) && inRange(item) && matches(item))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  const items = sorted.slice(0, size).map(item => ({ ...item, undoable: isUndoable(db, userId, item) }));
  return { items, nextBefore: sorted.length > size ? items[items.length - 1].timestamp : null };
}

module.exports = { documentContext, validFilters, isUndoable, describe, deriveMeta, obligationMeta, formatAmount, COLLECTION, ROUTES, refineRoute, labelFor, buildMessage, append, pruneOld, list, resolveContext, isSkipped, normalizePath, periodLabel, isIsoDate, isValidTimezone };
