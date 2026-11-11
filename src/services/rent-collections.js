const { v4: uuidv4 } = require('uuid');
const ledger = require('./account-ledger');
const incomeAttribution = require('./income-attribution');
const rentals = require('./rentals');

/**
 * "Cobrar mes" split by modality. One collection group (`rentCollectionGroups`) holds one child
 * collection per modality line; every child has its own income transaction, account, payment method,
 * date and A/B classification (locación with IVA -> A, comodato/mutuo -> B). Children keep the legacy
 * `rentCollections` shape (one transaction, one allocation), so every existing reader keeps working.
 * Legacy collections (no `groupId`) are read as a group of one.
 */
const GROUPS = 'rentCollectionGroups';
const MAX_LINES = 10;
const TOUCHED = ['transactions', 'rentCollections', 'rentCollectionAllocations', GROUPS, 'documents', 'accounts'];
const NON_TRANSACTION_TARGETS = ['assetId', 'entityId', 'obligationId', 'contractId', 'occurrenceId', 'rentOccurrenceId', 'tenantEntityId'];

const fail = (error, status = 400) => ({ error, status });

// Runs every write of `work` or none: on failure the touched collections are restored from a snapshot.
function atomically(db, userId, work, message) {
  const snapshot = TOUCHED.map(name => [name, db.findAll(name, userId)]);
  try {
    return { value: work() };
  } catch {
    db.clearCache();
    try { snapshot.forEach(([name, rows]) => db.replace(name, userId, rows)); } catch { /* best effort restore */ }
    db.clearCache();
    return fail(message, 500);
  }
}

function lineFingerprint(lines) {
  return rentals.hash(JSON.stringify(lines.map(line => ({
    occurrenceId: line?.occurrenceId ?? null, amount: line?.amount ?? null, accountId: line?.accountId ?? null, date: line?.date || '',
    method: line?.method || '', paymentMethodId: line?.paymentMethodId || null, clasificacion: line?.clasificacion || null
  }))));
}

function validateLine(db, userId, line, today) {
  if (!line || typeof line !== 'object' || Array.isArray(line)) return fail('Cada modalidad debe indicar el período, el importe y la cuenta');
  const account = typeof line.accountId === 'string' ? db.findById('accounts', line.accountId, userId) : null;
  if (!account || !account.activo) return fail('Seleccioná una cuenta activa para cada modalidad');
  const amountMinor = typeof line.amount === 'number' ? ledger.moneyInput(line.amount, account.currency) : null;
  if (amountMinor === null) return fail('El importe de cada modalidad debe ser positivo y válido para la moneda de su cuenta');
  const date = line.date || today;
  if (!rentals.validDate(date) || date > today) return fail('La fecha de cobro debe ser válida y no futura');
  const paymentMethod = line.paymentMethodId ? db.findById('paymentMethods', line.paymentMethodId, userId) : null;
  if (line.paymentMethodId && !paymentMethod) return fail('El medio de cobro no es válido');
  const methodLabel = typeof line.method === 'string' ? line.method.trim() : '';
  if (methodLabel.length > 100) return fail('El medio de cobro no puede superar los 100 caracteres');
  if (line.clasificacion !== undefined && line.clasificacion !== null && !['A', 'B'].includes(line.clasificacion)) return fail('La clasificación debe ser A o B');
  const allocation = rentals.validateAllocations(db, userId, [{ occurrenceId: line.occurrenceId, amount: line.amount }], account.currency);
  if (allocation.error) return fail(allocation.error);
  const occurrence = db.findById('rentOccurrences', line.occurrenceId, userId);
  const contract = db.findById('rentalContracts', occurrence.contractId, userId);
  return { value: {
    account, amountMinor, date, paymentMethod, method: methodLabel || paymentMethod?.name || '', clasificacion: line.clasificacion || null,
    allocation: allocation.allocations[0], modality: occurrence.modality || (contract ? rentals.modalityOf(contract) : null), assetId: contract?.assetId || null
  } };
}

/** Registers one month collection with one transaction per modality line. Atomic and idempotent. */
function createMonthCollection(db, userId, input = {}) {
  const key = input.idempotencyKey;
  if (typeof key !== 'string' || key.length < 8 || key.length > 120) return fail('Se requiere una clave de idempotencia válida');
  const keyHash = rentals.hash(key);
  const lines = input.lines;
  if (!Array.isArray(lines) || !lines.length || lines.length > MAX_LINES) return fail('Indicá al menos una modalidad a cobrar');
  const fingerprint = lineFingerprint(lines);
  const prior = db.findAll(GROUPS, userId).find(item => item.idempotencyKey === keyHash);
  if (prior) {
    if (prior.reversedAt) return fail('Ese cobro fue deshecho; registrá uno nuevo', 409);
    if (prior.fingerprint !== fingerprint) return fail('La clave de idempotencia ya se utilizó para otro cobro', 409);
    return { value: { ...collectionDetail(db, userId, prior.id), replayed: true } };
  }
  if (new Set(lines.map(line => line && line.occurrenceId)).size !== lines.length) return fail('Una modalidad está repetida en el cobro');
  ledger.ensureSetup(db, userId);
  const today = ledger.localDateForUser(db, userId);
  const planned = [];
  for (const line of lines) {
    const checked = validateLine(db, userId, line, today);
    if (checked.error) return checked;
    planned.push(checked.value);
  }
  if (new Set(planned.map(line => line.assetId)).size !== 1) return fail('Las modalidades deben pertenecer al mismo alquiler');
  const groupId = uuidv4();
  const written = atomically(db, userId, () => {
    const collectionIds = [];
    const transactionIds = [];
    planned.forEach((line, index) => {
      const collectionId = uuidv4();
      const { account, amountMinor } = line;
      const allocation = { ...line.allocation, ...(line.clasificacion ? { clasificacion: line.clasificacion } : {}) };
      const { clasificacion, ivaPercent } = rentals.classifyCollection(db, userId, [allocation], amountMinor, null);
      const ivaApplies = ivaPercent !== null && clasificacion === 'A';
      const amount = ledger.fromMinorUnits(amountMinor, account.currency);
      const lineKey = `${keyHash}:${index}`;
      const transaction = db.create('transactions', {
        userId, tipo: 'income', monto: amount, amountMinor, accountId: account.id, currencyCode: account.currency, titulo: 'Cobro de alquiler',
        ...incomeAttribution.incomeHolderSnapshot(db, userId, account),
        categoryId: null, refundSourceId: null, fecha: line.date, recurrente: false, frecuencia: null, fechaFin: null,
        clasificacion, montoA: null, montoB: null, ivaPorcentaje: ivaApplies ? ivaPercent : null, ivaIncluded: ivaApplies,
        rentCollectionId: collectionId, rentCollectionGroupId: groupId, rentCollectionIdempotencyKey: lineKey, rentModality: line.modality,
        paymentMethodId: line.paymentMethod?.id || null, paymentMethod: line.method
      }, userId);
      db.create('rentCollections', {
        id: collectionId, groupId, transactionId: transaction.id, amountMinor, amount, currencyCode: account.currency, accountId: account.id,
        date: line.date, method: line.method, paymentMethodId: line.paymentMethod?.id || null, clasificacion, modality: line.modality,
        idempotencyKey: lineKey, fingerprint
      }, userId);
      db.create('rentCollectionAllocations', {
        collectionId, occurrenceId: line.allocation.occurrenceId, amountMinor: line.allocation.amountMinor,
        amount: ledger.fromMinorUnits(line.allocation.amountMinor, account.currency), currencyCode: account.currency
      }, userId);
      collectionIds.push(collectionId);
      transactionIds.push(transaction.id);
    });
    return db.create(GROUPS, {
      id: groupId, idempotencyKey: keyHash, fingerprint, date: planned.map(line => line.date).sort().pop(),
      collectionIds, transactionIds, reversedAt: null
    }, userId);
  }, 'No se pudo registrar el cobro');
  if (written.error) return written;
  ledger.refreshAlerts(db, userId);
  return { value: collectionDetail(db, userId, written.value.id) };
}

/** Group and child collections for a group, child collection or transaction id (legacy = group of one). */
function resolve(db, userId, id) {
  if (typeof id !== 'string' || !id) return null;
  const group = db.findById(GROUPS, id, userId);
  if (group) return { group, collections: group.collectionIds.map(item => db.findById('rentCollections', item, userId)).filter(Boolean) };
  const transaction = db.findById('transactions', id, userId);
  const collection = db.findById('rentCollections', id, userId) || (transaction?.rentCollectionId ? db.findById('rentCollections', transaction.rentCollectionId, userId) : null);
  if (!collection) return null;
  const parent = collection.groupId ? db.findById(GROUPS, collection.groupId, userId) : null;
  if (parent) return { group: parent, collections: parent.collectionIds.map(item => db.findById('rentCollections', item, userId)).filter(Boolean) };
  return { group: null, collections: [collection] };
}

function ivaSplit(amountMinor, ivaPercent) {
  const bp = ivaPercent ? rentals.decimalScaled(Number(ivaPercent), 2) : 0;
  if (!bp || bp < 0) return { netMinor: amountMinor, ivaMinor: 0 };
  const netMinor = ledger.mulDivRound(amountMinor, 10000, 10000 + bp);
  return { netMinor, ivaMinor: amountMinor - netMinor };
}

/**
 * Read-only "Ver" model of a collection: one line per modality with payment date, amount, IVA
 * (locación), payment method and destination account, plus totals and the rental/property/periods.
 * A legacy single-transaction collection is split by its allocations (sharing date, method and account).
 */
function collectionDetail(db, userId, id) {
  const resolved = resolve(db, userId, id);
  if (!resolved) return null;
  const { group, collections } = resolved;
  const lines = [];
  let contract = null;
  collections.forEach(collection => {
    const account = db.findById('accounts', collection.accountId, userId);
    const transaction = db.findById('transactions', collection.transactionId, userId);
    const clasificacion = transaction?.clasificacion ?? collection.clasificacion ?? null;
    const base = {
      collectionId: collection.id, transactionId: collection.transactionId || null, date: collection.date, method: collection.method || '',
      accountId: collection.accountId || null, accountName: account ? (account.nombre || account.name || '') : '', currencyCode: collection.currencyCode,
      clasificacion: clasificacion === 'Mixto' ? null : clasificacion
    };
    const allocations = db.findAll('rentCollectionAllocations', userId).filter(item => item.collectionId === collection.id);
    let allocatedMinor = 0;
    allocations.forEach(allocation => {
      const occurrence = db.findById('rentOccurrences', allocation.occurrenceId, userId);
      const owner = occurrence ? db.findById('rentalContracts', occurrence.contractId, userId) : null;
      contract = contract || owner;
      const modality = occurrence?.modality || (owner ? rentals.modalityOf(owner) : null);
      const lineClass = allocation.clasificacion || base.clasificacion || (modality === 'locacion' ? 'A' : modality ? 'B' : null);
      const ivaPercent = modality === 'locacion' && lineClass !== 'B' ? (occurrence?.ivaPercent ?? owner?.ivaPercent ?? null) : null;
      const split = ivaSplit(allocation.amountMinor, ivaPercent);
      allocatedMinor += allocation.amountMinor;
      lines.push({
        ...base, clasificacion: lineClass, modality, period: occurrence?.period || null, occurrenceDate: occurrence?.date || null,
        amountMinor: allocation.amountMinor, amount: ledger.fromMinorUnits(allocation.amountMinor, collection.currencyCode),
        ivaPercent: split.ivaMinor ? Number(ivaPercent) : null, ivaMinor: split.ivaMinor, ivaAmount: ledger.fromMinorUnits(split.ivaMinor, collection.currencyCode),
        netAmount: ledger.fromMinorUnits(split.netMinor, collection.currencyCode)
      });
    });
    if (!collection.reversedAt && collection.amountMinor > allocatedMinor) {
      const rest = collection.amountMinor - allocatedMinor;
      lines.push({ ...base, modality: null, unapplied: true, period: null, occurrenceDate: null, amountMinor: rest, amount: ledger.fromMinorUnits(rest, collection.currencyCode), ivaPercent: null, ivaMinor: 0, ivaAmount: 0, netAmount: ledger.fromMinorUnits(rest, collection.currencyCode) });
    }
  });
  lines.sort((a, b) => (a.modality ? rentals.MODALITIES.indexOf(a.modality) : 9) - (b.modality ? rentals.MODALITIES.indexOf(b.modality) : 9) || String(a.date).localeCompare(String(b.date)));
  const totals = new Map();
  lines.forEach(line => {
    const row = totals.get(line.currencyCode) || { currencyCode: line.currencyCode, amountMinor: 0, ivaMinor: 0 };
    row.amountMinor += line.amountMinor;
    row.ivaMinor += line.ivaMinor;
    totals.set(line.currencyCode, row);
  });
  const asset = contract ? db.findById('assets', contract.assetId, userId) : null;
  const declaration = contract?.declarationId ? db.findById('rentalDeclarations', contract.declarationId, userId) : null;
  const tenantIds = declaration?.tenantIds || contract?.tenantIds || [];
  return {
    id: group ? group.id : collections[0].id, groupId: group ? group.id : null, legacy: !group,
    collectionIds: collections.map(item => item.id), transactionIds: collections.map(item => item.transactionId).filter(Boolean),
    date: group ? group.date : collections[0].date, reversed: group ? Boolean(group.reversedAt) : collections.every(item => item.reversedAt),
    asset: asset ? { id: asset.id, name: asset.name } : null, declarationId: contract?.declarationId || null,
    tenants: tenantIds.map(tenantId => db.findById('legalOwners', tenantId, userId)?.name).filter(Boolean),
    periods: [...new Set(lines.map(line => line.period).filter(Boolean))].sort(),
    lines,
    totals: [...totals.values()].map(row => ({ ...row, amount: ledger.fromMinorUnits(row.amountMinor, row.currencyCode), ivaAmount: ledger.fromMinorUnits(row.ivaMinor, row.currencyCode) }))
  };
}

function dependentFor(db, userId, transaction) {
  if (db.findAll('transactions', userId).some(item => item.tipo === 'refund' && item.refundSourceId === transaction.id)) return 'un reembolso';
  if (db.findAll('transfers', userId).some(item => [...(item.normalizationAllocations || []), ...(item.pendingAllocations || [])].some(entry => entry.sourceType === 'income' && entry.sourceId === transaction.id))) return 'una normalización de transferencia';
  if (db.findAll('movementAllocations', userId).some(item => item.transactionId === transaction.id)) return 'una atribución de movimiento';
  return null;
}

/**
 * "Deshacer cobro" for a whole group: every modality transaction, allocation and receipt goes at once
 * (all or nothing). Same rules as a single collection: only a dependent movement blocks it and a
 * reconciled account gets its reconciliation reset.
 */
function reverseGroup(db, userId, group, storage = null) {
  if (group.reversedAt) return fail('Ese cobro ya fue deshecho', 409);
  const collections = group.collectionIds.map(id => db.findById('rentCollections', id, userId)).filter(item => item && !item.reversedAt);
  for (const collection of collections) {
    const transaction = db.findById('transactions', collection.transactionId, userId);
    const dependent = transaction && dependentFor(db, userId, transaction);
    if (dependent) return fail(`Este cobro tiene ${dependent}; deshacé primero ese movimiento`, 409);
  }
  const reopened = new Set();
  const removedDocuments = [];
  let reconciliationReset = false;
  const reversedAt = new Date().toISOString();
  const written = atomically(db, userId, () => {
    collections.forEach(collection => {
      const transaction = db.findById('transactions', collection.transactionId, userId);
      db.findAll('rentCollectionAllocations', userId).filter(item => item.collectionId === collection.id).forEach(item => {
        reopened.add(item.occurrenceId);
        db.remove('rentCollectionAllocations', item.id, userId);
      });
      if (transaction) {
        const account = db.findById('accounts', transaction.accountId || collection.accountId, userId);
        if (account && account.reconciled && account.openingDate && (collection.date < account.openingDate || (account.includedMovementIds || []).includes(transaction.id))) {
          db.update('accounts', account.id, { reconciled: false, includedMovementIds: (account.includedMovementIds || []).filter(id => id !== transaction.id) }, userId);
          reconciliationReset = true;
        }
        db.findAll('documents', userId).filter(item => item.transactionId === transaction.id).forEach(item => {
          if (!NON_TRANSACTION_TARGETS.some(field => item[field])) { db.remove('documents', item.id, userId); removedDocuments.push(item); }
          else db.update('documents', item.id, { transactionId: null, detachedFromCollectionId: collection.id }, userId);
        });
        db.remove('transactions', transaction.id, userId);
      }
      db.update('rentCollections', collection.id, { reversedAt, reversedTransactionId: transaction?.id || null }, userId);
    });
    db.update(GROUPS, group.id, { reversedAt }, userId);
  }, 'No se pudo deshacer el cobro');
  if (written.error) return written;
  removedDocuments.forEach(item => { try { storage?.remove(userId, item.storageKey); } catch { /* orphan file is harmless */ } });
  ledger.refreshAlerts(db, userId);
  return {
    ok: true, collectionId: group.id, groupId: group.id, collectionIds: group.collectionIds, reopenedOccurrenceIds: [...reopened],
    reconciliationReset, deletedDocumentIds: removedDocuments.map(item => item.id)
  };
}

module.exports = { GROUPS, createMonthCollection, collectionDetail, reverseGroup, resolve };
