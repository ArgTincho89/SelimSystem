const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const ledger = require('../services/account-ledger');
const incomeAttribution = require('../services/income-attribution');
const rentals = require('../services/rentals');

const router = express.Router();
router.use(requireAuth);

function contractResponse(db, userId, contract, throughDate) {
  const occurrenceEnd = contract.status === 'ended' ? (contract.endDate || ledger.localDateForUser(db, userId)) : throughDate;
  const occurrences = contract.status === 'draft' || contract.status === 'cancelled'
    ? db.findAll('rentOccurrences', userId).filter(item => item.contractId === contract.id).map(item => rentals.occurrenceView(db, userId, item, ledger.localDateForUser(db, userId)))
    : rentals.generateOccurrences(db, userId, contract, occurrenceEnd);
  return {
    ...contract,
    asset: db.findById('assets', contract.assetId, userId),
    tenants: contract.tenantIds.map(id => db.findById('legalOwners', id, userId)).filter(Boolean),
    conditions: rentals.conditionsFor(db, userId, contract.id),
    occurrences
  };
}

function upperDate(db, userId, queryTo) {
  if (queryTo) return queryTo;
  const today = ledger.localDateForUser(db, userId);
  const future = new Date(`${today}T00:00:00.000Z`);
  future.setUTCMonth(future.getUTCMonth() + 12);
  return future.toISOString().slice(0, 10);
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const today = ledger.localDateForUser(db, userId);
  const from = req.query.from;
  const to = req.query.to;
  if ((from && !rentals.validDate(from)) || (to && !rentals.validDate(to)) || (from && to && from > to)) return res.status(400).json({ error: 'El período de consulta no es válido' });
  if (req.query.assetId && !db.findById('assets', req.query.assetId, userId)) return res.status(400).json({ error: 'El inmueble no es válido' });
  const rows = db.findAll('rentalContracts', userId)
    .filter(item => (!req.query.assetId || item.assetId === req.query.assetId) && (!req.query.status || item.status === req.query.status))
    .map(item => contractResponse(db, userId, item, upperDate(db, userId, to)))
    .map(item => ({ ...item, occurrences: item.occurrences.filter(occurrence => (!from || occurrence.date >= from) && (!to || occurrence.date <= to)) }));
  res.json(rows);
});

router.get('/alerts', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const today = ledger.localDateForUser(db, userId);
  const settings = ledger.getSettings(db, userId, false);
  const lead = settings?.alertLeadDays || 5;
  const rentThrough = new Date(`${today}T00:00:00.000Z`);
  rentThrough.setUTCDate(rentThrough.getUTCDate() + lead);
  const expiryThrough = new Date(`${today}T00:00:00.000Z`);
  expiryThrough.setUTCDate(expiryThrough.getUTCDate() + 30);
  const rentEnd = rentThrough.toISOString().slice(0, 10);
  const end = expiryThrough.toISOString().slice(0, 10);
  const alerts = [];
  db.findAll('rentalContracts', userId).forEach(contract => {
    const response = contractResponse(db, userId, contract, end);
    if (contract.status === 'active') {
      response.occurrences.filter(item => ['pending', 'partially_collected'].includes(item.status) && item.date >= today && item.date <= rentEnd).forEach(item => {
        alerts.push({ id: `rent:${item.id}`, type: 'rent_due', date: item.date, contractId: contract.id, occurrenceId: item.id, assetId: contract.assetId, assetName: response.asset?.name, amount: item.remainingAmount, currencyCode: item.currencyCode });
      });
      if (contract.endDate && contract.endDate >= today && contract.endDate <= end) {
        alerts.push({ id: `expiry:${contract.id}`, type: 'contract_expiry', date: contract.endDate, contractId: contract.id, assetId: contract.assetId, assetName: response.asset?.name });
      }
    }
  });
  res.json(alerts.sort((a, b) => a.date.localeCompare(b.date)));
});

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const parsed = rentals.validateContract(db, userId, req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const contract = db.create('rentalContracts', parsed.value, userId);
  if (contract.status === 'active') {
    const asset = db.findById('assets', contract.assetId, userId);
    if (asset && asset.usageStatus !== 'rented') db.update('assets', asset.id, { usageStatus: 'rented' }, userId);
  }
  const today = ledger.localDateForUser(db, userId);
  const until = new Date(`${today}T00:00:00.000Z`);
  until.setUTCMonth(until.getUTCMonth() + 12);
  res.status(201).json(contractResponse(db, userId, contract, until.toISOString().slice(0, 10)));
});

router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const contract = db.findById('rentalContracts', req.params.id, userId);
  if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });
  if ((req.query.from && !rentals.validDate(req.query.from)) || (req.query.to && !rentals.validDate(req.query.to)) || (req.query.from && req.query.to && req.query.from > req.query.to)) return res.status(400).json({ error: 'El período de consulta no es válido' });
  const through = upperDate(db, userId, req.query.to);
  const response = contractResponse(db, userId, contract, through);
  if (req.query.from || req.query.to) response.occurrences = response.occurrences.filter(item => (!req.query.from || item.date >= req.query.from) && (!req.query.to || item.date <= req.query.to));
  res.json(response);
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const input = req.body || {};
  const existing = db.findById('rentalContracts', req.params.id, userId);
  if (!existing) return res.status(404).json({ error: 'Contrato no encontrado' });
  const hasOccurrences = db.findAll('rentOccurrences', userId).some(item => item.contractId === existing.id);
  if (hasOccurrences && ['assetId', 'startDate', 'initialRent', 'currencyCode', 'periodicity', 'dueDay', 'tenantIds'].some(field => input[field] !== undefined && JSON.stringify(input[field]) !== JSON.stringify(existing[field]))) {
    return res.status(409).json({ error: 'El contrato ya tiene períodos generados; conserva el historial y registra una nueva condición para cambiar el alquiler' });
  }
  const parsed = rentals.validateContract(db, userId, input, existing);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const updated = db.update('rentalContracts', existing.id, parsed.value, userId);
  if (updated.status === 'active') {
    const asset = db.findById('assets', updated.assetId, userId);
    if (asset && asset.usageStatus !== 'rented') db.update('assets', asset.id, { usageStatus: 'rented' }, userId);
  }
  if (updated.status === 'ended' || updated.status === 'cancelled' || (input.endDate !== undefined && input.endDate !== existing.endDate)) {
    const cancelled = updated.status === 'cancelled';
    const cutoff = cancelled ? null : (updated.endDate || (updated.status === 'ended' ? ledger.localDateForUser(db, userId) : null));
    if (cancelled || cutoff) {
      db.findAll('rentOccurrences', userId).filter(item => item.contractId === updated.id && (!cutoff || item.date > cutoff)).forEach(item => {
        const paid = rentals.occurrenceView(db, userId, item, ledger.localDateForUser(db, userId)).paidMinor;
        if (!paid) db.update('rentOccurrences', item.id, { cancelled: true, cancelledAt: new Date().toISOString() }, userId);
      });
    }
  }
  res.json(contractResponse(db, userId, updated, upperDate(db, userId)));
});

router.post('/:id/conditions', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const contract = db.findById('rentalContracts', req.params.id, userId);
  if (!contract) return res.status(404).json({ error: 'Contrato no encontrado' });
  const result = rentals.applyCondition(db, userId, contract, req.body || {});
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.status(201).json(result.condition);
});

router.post('/:id/occurrences/:occurrenceId/cancel', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const contract = db.findById('rentalContracts', req.params.id, userId);
  const occurrence = db.findById('rentOccurrences', req.params.occurrenceId, userId);
  if (!contract || !occurrence || occurrence.contractId !== contract.id) return res.status(404).json({ error: 'Período de alquiler no encontrado' });
  if (rentals.occurrenceView(db, userId, occurrence, ledger.localDateForUser(db, userId)).paidMinor > 0) return res.status(409).json({ error: 'Un período con cobros no se puede cancelar' });
  const updated = db.update('rentOccurrences', occurrence.id, { cancelled: true, cancelledAt: new Date().toISOString() }, userId);
  res.json(rentals.occurrenceView(db, userId, updated, ledger.localDateForUser(db, userId)));
});

router.get('/collections/list', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const collections = db.findAll('rentCollections', userId)
    .filter(item => !req.query.contractId || (db.findAll('rentCollectionAllocations', userId).some(allocation => allocation.collectionId === item.id && db.findById('rentOccurrences', allocation.occurrenceId, userId)?.contractId === req.query.contractId)))
    .sort((a, b) => b.date.localeCompare(a.date));
  res.json(collections.map(item => {
    const view = rentals.collectionView(db, userId, item);
    if (!req.query.contractId) return view;
    const allocations = view.allocations.filter(allocation => allocation.occurrence?.contractId === req.query.contractId);
    const contractAllocatedMinor = allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0);
    return {
      ...view, allocations, contractAllocatedMinor,
      contractAllocatedAmount: ledger.fromMinorUnits(contractAllocatedMinor, view.currencyCode)
    };
  }));
});

router.post('/collections', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const input = req.body || {};
  const key = input.idempotencyKey;
  if (typeof key !== 'string' || key.length < 8 || key.length > 120) return res.status(400).json({ error: 'Se requiere una clave de idempotencia válida' });
  const keyHash = rentals.hash(key);
  const fingerprint = rentals.hash(JSON.stringify({ amount: input.amount, accountId: input.accountId, date: input.date, method: input.method || '', paymentMethodId: input.paymentMethodId || null, allocations: input.allocations || [] }));
  const prior = db.findAll('rentCollections', userId).find(item => item.idempotencyKey === keyHash);
  if (prior) {
    if (prior.fingerprint !== fingerprint) return res.status(409).json({ error: 'La clave de idempotencia ya se utilizó para otro cobro' });
    return res.json({ ...rentals.collectionView(db, userId, prior), replayed: true });
  }
  const amount = input.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'El importe cobrado debe ser positivo' });
  const date = input.date || ledger.localDateForUser(db, userId);
  if (!rentals.validDate(date) || date > ledger.localDateForUser(db, userId)) return res.status(400).json({ error: 'La fecha de cobro debe ser válida y no futura' });
  const paymentMethod = input.paymentMethodId ? db.findById('paymentMethods', input.paymentMethodId, userId) : null;
  if (input.paymentMethodId && !paymentMethod) return res.status(400).json({ error: 'El medio de cobro no es válido' });
  const methodLabel = typeof input.method === 'string' ? input.method.trim() : '';
  if (!paymentMethod && (!methodLabel || methodLabel.length > 100)) return res.status(400).json({ error: 'El medio de cobro debe tener entre 1 y 100 caracteres' });
  ledger.ensureSetup(db, userId);
  const account = db.findById('accounts', input.accountId, userId);
  if (!account || !account.activo) return res.status(400).json({ error: 'Seleccioná una cuenta activa' });
  const amountMinor = ledger.moneyInput(amount, account.currency);
  if (amountMinor === null) return res.status(400).json({ error: 'El importe no es válido para la moneda de la cuenta' });
  const allocationResult = rentals.validateAllocations(db, userId, input.allocations || [], account.currency);
  if (allocationResult.error) return res.status(400).json({ error: allocationResult.error });
  const allocatedMinor = allocationResult.allocations.reduce((sum, item) => sum + item.amountMinor, 0);
  if (allocatedMinor > amountMinor) return res.status(400).json({ error: 'Las asignaciones superan el importe real cobrado' });
  const collectionId = uuidv4();
  let transaction;
  let collection;
  const savedAllocations = [];
  try {
    transaction = db.create('transactions', {
      userId, tipo: 'income', monto: ledger.fromMinorUnits(amountMinor, account.currency), amountMinor,
      accountId: account.id, currencyCode: account.currency, titulo: 'Cobro de alquiler',
      ...incomeAttribution.incomeHolderSnapshot(db, userId, account),
      categoryId: null, refundSourceId: null, fecha: date, recurrente: false, frecuencia: null, fechaFin: null,
      clasificacion: null, montoA: null, montoB: null, ivaPorcentaje: null,
      rentCollectionId: collectionId, rentCollectionIdempotencyKey: keyHash,
      paymentMethodId: paymentMethod?.id || null, paymentMethod: methodLabel || paymentMethod?.name || ''
    }, userId);
    collection = db.create('rentCollections', {
      id: collectionId, transactionId: transaction.id, amountMinor, amount: ledger.fromMinorUnits(amountMinor, account.currency),
      currencyCode: account.currency, accountId: account.id, date, method: methodLabel || paymentMethod?.name || '', paymentMethodId: paymentMethod?.id || null,
      idempotencyKey: keyHash, fingerprint
    }, userId);
    allocationResult.allocations.forEach(item => savedAllocations.push(db.create('rentCollectionAllocations', {
      collectionId: collection.id, occurrenceId: item.occurrenceId, amountMinor: item.amountMinor,
      amount: ledger.fromMinorUnits(item.amountMinor, account.currency), currencyCode: account.currency
    }, userId)));
  } catch {
    savedAllocations.forEach(item => db.remove('rentCollectionAllocations', item.id, userId));
    if (transaction) db.remove('transactions', transaction.id, userId);
    if (collection) db.remove('rentCollections', collection.id, userId);
    db.clearCache();
    return res.status(500).json({ error: 'No se pudo registrar el cobro' });
  }
  res.status(201).json(rentals.collectionView(db, userId, collection));
});

router.post('/collections/:id/allocations', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const collection = db.findById('rentCollections', req.params.id, userId);
  if (!collection) return res.status(404).json({ error: 'Cobro no encontrado' });
  const input = req.body || {};
  const key = input.idempotencyKey;
  if (typeof key !== 'string' || key.length < 8 || key.length > 120) return res.status(400).json({ error: 'Se requiere una clave de idempotencia válida' });
  const keyHash = rentals.hash(key);
  const fingerprint = rentals.hash(JSON.stringify(input.allocations || []));
  const previous = db.findAll('rentCollectionAllocations', userId).find(item => item.collectionId === collection.id && item.idempotencyKey === keyHash);
  if (previous) return previous.fingerprint === fingerprint ? res.json({ ...rentals.collectionView(db, userId, collection), replayed: true }) : res.status(409).json({ error: 'La clave de idempotencia ya se utilizó para otras asignaciones' });
  const current = rentals.collectionView(db, userId, collection);
  const normalized = rentals.validateAllocations(db, userId, input.allocations || [], collection.currencyCode);
  if (normalized.error) return res.status(400).json({ error: normalized.error });
  const additional = normalized.allocations.reduce((sum, item) => sum + item.amountMinor, 0);
  if (additional > current.unappliedMinor) return res.status(400).json({ error: 'Las asignaciones superan el saldo no aplicado del cobro' });
  const created = [];
  try {
    normalized.allocations.forEach(item => created.push(db.create('rentCollectionAllocations', {
      collectionId: collection.id, occurrenceId: item.occurrenceId, amountMinor: item.amountMinor,
      amount: ledger.fromMinorUnits(item.amountMinor, collection.currencyCode), currencyCode: collection.currencyCode,
      idempotencyKey: keyHash, fingerprint
    }, userId)));
  } catch {
    created.forEach(item => db.remove('rentCollectionAllocations', item.id, userId));
    db.clearCache();
    return res.status(500).json({ error: 'No se pudieron aplicar los importes al alquiler' });
  }
  res.status(201).json(rentals.collectionView(db, userId, collection));
});

module.exports = router;
