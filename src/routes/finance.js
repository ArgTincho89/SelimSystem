const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ledger = require('../services/account-ledger');
const finance = require('../services/finance');
const economicOverview = require('../services/economic-overview');
const incomeAttribution = require('../services/income-attribution');

const router = express.Router();
router.use(requireAuth);

router.get('/overview', (req, res) => {
  const result = economicOverview.globalOverview(req.app.locals.db, req.session.userId, req.query.month || undefined);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

router.get('/payment-methods', (req, res) => {
  res.json(req.app.locals.db.findAll('paymentMethods', req.session.userId));
});

router.post('/payment-methods', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const parsed = finance.validatePaymentMethod(db, userId, req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  res.status(201).json(db.create('paymentMethods', parsed.value, userId));
});

router.put('/payment-methods/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const existing = db.findById('paymentMethods', req.params.id, userId);
  if (!existing) return res.status(404).json({ error: 'Medio de pago no encontrado' });
  const parsed = finance.validatePaymentMethod(db, userId, req.body || {}, existing);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  res.json(db.update('paymentMethods', existing.id, parsed.value, userId));
});

router.delete('/payment-methods/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const method = db.findById('paymentMethods', req.params.id, userId);
  if (!method) return res.status(404).json({ error: 'Medio de pago no encontrado' });
  const referenced = ['transactions', 'obligations', 'obligationOccurrences', 'rentCollections'].some(collection =>
    db.findAll(collection, userId).some(item => !item.reversedAt && item.paymentMethodId === method.id)
  );
  if (referenced) return res.status(409).json({ error: 'El medio de pago tiene movimientos o historial vinculado' });
  db.remove('paymentMethods', method.id, userId);
  res.json({ ok: true });
});

router.get('/transactions/:id/associations', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const transaction = db.findById('transactions', req.params.id, userId);
  if (!transaction) return res.status(404).json({ error: 'Transacción no encontrada' });
  res.json({
    transaction,
    allocations: db.findAll('movementAllocations', userId).filter(item => item.transactionId === transaction.id),
    legacyLinks: {
      obligationId: transaction.obligationId || null,
      obligationOccurrenceId: transaction.obligationOccurrenceId || null,
      rentCollectionId: transaction.rentCollectionId || null
    },
    claims: db.findAll('recoverableExpenseClaims', userId).filter(item => item.transactionId === transaction.id).map(item => finance.claimView(db, userId, item))
  });
});

router.get('/allocations', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const targets = [
    ['assetId', 'assets'], ['obligationId', 'obligations'], ['occurrenceId', 'obligationOccurrences'],
    ['contractId', 'rentalContracts'], ['rentOccurrenceId', 'rentOccurrences']
  ];
  for (const [field, collection] of targets) {
    if (req.query[field] && !db.findById(collection, req.query[field], userId)) return res.status(400).json({ error: 'El destino de las asignaciones no es válido' });
  }
  const allocations = db.findAll('movementAllocations', userId).filter(item =>
    targets.every(([field]) => !req.query[field] || item[field] === req.query[field])
  ).map(item => ({ ...item, transaction: db.findById('transactions', item.transactionId, userId) })).filter(item => item.transaction);
  res.json(allocations);
});

router.put('/transactions/:id/allocations', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const transaction = db.findById('transactions', req.params.id, userId);
  if (!transaction) return res.status(404).json({ error: 'Transacción no encontrada' });
  const input = req.body?.allocations;
  const parsed = finance.validateAllocations(db, userId, transaction, input);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const complete = req.body?.complete === true;
  if (req.body?.complete !== undefined && typeof req.body.complete !== 'boolean') return res.status(400).json({ error: 'El estado de asignación completa no es válido' });
  if (complete && parsed.totalMinor !== finance.transactionMinor(transaction, db, userId)) return res.status(400).json({ error: 'Una asignación completa debe cubrir exactamente el importe de la transacción' });
  const old = db.findAll('movementAllocations', userId).filter(item => item.transactionId === transaction.id);
  try {
    old.forEach(item => db.remove('movementAllocations', item.id, userId));
    const saved = parsed.allocations.map(item => db.create('movementAllocations', { ...item, complete }, userId));
    return res.json({ allocations: saved, allocatedMinor: parsed.totalMinor, complete });
  } catch {
    db.clearCache();
    return res.status(500).json({ error: 'No se pudieron guardar las asignaciones' });
  }
});

router.get('/claims', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  if (req.query.assetId && !db.findById('assets', req.query.assetId, userId)) return res.status(400).json({ error: 'El bien no es válido' });
  const rows = db.findAll('recoverableExpenseClaims', userId)
    .filter(item => (!req.query.assetId || item.assetId === req.query.assetId) && (!req.query.transactionId || item.transactionId === req.query.transactionId))
    .map(item => finance.claimView(db, userId, item));
  res.json(rows);
});

router.post('/claims', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const parsed = finance.validateClaim(db, userId, req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { transaction, asset, contract, tenant, recoverableMinor, currencyCode } = parsed.value;
  const claim = db.create('recoverableExpenseClaims', {
    transactionId: transaction.id, assetId: asset.id, contractId: contract?.id || null,
    tenantEntityId: tenant?.id || null, recoverableMinor, amount: ledger.fromMinorUnits(recoverableMinor, currencyCode),
    currencyCode
  }, userId);
  db.update('transactions', transaction.id, { recoverableClaimId: claim.id }, userId);
  res.status(201).json(finance.claimView(db, userId, claim));
});

router.post('/claims/:id/recoveries', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const claim = db.findById('recoverableExpenseClaims', req.params.id, userId);
  if (!claim) return res.status(404).json({ error: 'Reclamo de reintegro no encontrado' });
  const { amount, accountId, date, idempotencyKey } = req.body || {};
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 120) return res.status(400).json({ error: 'Se requiere una clave de idempotencia válida' });
  const keyHash = finance.digest(idempotencyKey);
  const fingerprint = finance.digest(JSON.stringify({ amount, accountId: accountId || null, date: date || null }));
  const existing = db.findAll('recoveries', userId).find(item => item.claimId === claim.id && item.idempotencyKey === keyHash);
  if (existing) {
    if (existing.fingerprint !== fingerprint) return res.status(409).json({ error: 'La clave de idempotencia ya se utilizó para otro reintegro' });
    return res.json({ ...finance.claimView(db, userId, claim), replayed: true });
  }
  const account = db.findById('accounts', accountId, userId);
  if (!account || !account.activo) return res.status(400).json({ error: 'Seleccioná una cuenta activa' });
  if (account.currency !== claim.currencyCode) return res.status(400).json({ error: 'La moneda de la cuenta no coincide con el reclamo' });
  const amountMinor = ledger.moneyInput(amount, claim.currencyCode);
  if (amountMinor === null) return res.status(400).json({ error: 'El importe reintegrado debe ser positivo y válido para la moneda' });
  const current = finance.claimView(db, userId, claim);
  if (amountMinor > current.outstandingMinor) return res.status(400).json({ error: 'El reintegro supera el importe pendiente del reclamo' });
  const today = ledger.localDateForUser(db, userId);
  const recoveryDate = date || today;
  if (!validDate(recoveryDate) || recoveryDate > today) return res.status(400).json({ error: 'La fecha del reintegro debe ser válida y no futura' });
  let transaction;
  let recovery;
  try {
    transaction = db.create('transactions', {
      userId, tipo: 'income', monto: ledger.fromMinorUnits(amountMinor, claim.currencyCode), amountMinor,
      accountId: account.id, currencyCode: claim.currencyCode, titulo: 'Reintegro de gasto',
      ...incomeAttribution.incomeHolderSnapshot(db, userId, account),
      categoryId: null, refundSourceId: null, fecha: recoveryDate, recurrente: false,
      frecuencia: null, fechaFin: null, clasificacion: null, montoA: null, montoB: null,
      ivaPorcentaje: null, recoverableExpenseClaimId: claim.id, recoveryIdempotencyKey: keyHash
    }, userId);
    recovery = db.create('recoveries', {
      claimId: claim.id, transactionId: transaction.id, amountMinor,
      amount: ledger.fromMinorUnits(amountMinor, claim.currencyCode), currencyCode: claim.currencyCode,
      accountId: account.id, date: recoveryDate, idempotencyKey: keyHash, fingerprint
    }, userId);
  } catch {
    if (recovery) db.remove('recoveries', recovery.id, userId);
    if (transaction) db.remove('transactions', transaction.id, userId);
    db.clearCache();
    return res.status(500).json({ error: 'No se pudo registrar el reintegro' });
  }
  res.status(201).json({ ...finance.claimView(db, userId, claim), recovery: { ...recovery, transaction } });
});

module.exports = router;
