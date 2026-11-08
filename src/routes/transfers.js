const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ledger = require('../services/account-ledger');

const router = express.Router();
router.use(requireAuth);

function hasDependents(transfers, id) {
  return transfers.some(item => [...(item.normalizationAllocations || []), ...(item.pendingAllocations || [])]
    .some(allocation => allocation.sourceType === 'transfer' && allocation.sourceId === id));
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  res.json(db.findAll('transfers', req.session.userId).sort((a, b) => b.fecha.localeCompare(a.fecha)));
});

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  ledger.ensureSetup(db, userId);
  const result = ledger.createTransferRecord(db, userId, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  const transfer = db.create('transfers', result.record, userId);
  ledger.refreshAlerts(db, userId);
  res.status(201).json(transfer);
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const current = db.findById('transfers', req.params.id, userId);
  if (!current) return res.status(404).json({ error: 'Movimiento no encontrado' });
  const all = db.findAll('transfers', userId);
  if (hasDependents(all, current.id)) return res.status(409).json({ error: 'Este movimiento tiene conversiones dependientes; revierte primero las conversiones posteriores' });
  const savedAllocations = (current.normalizationAllocations || []).map(item => ({
    sourceType: item.sourceType, sourceId: item.sourceId, originalIncomeId: item.originalIncomeId,
    amount: ledger.fromMinorUnits(item.sourceMinor, current.fromCurrency)
  }));
  const input = {
    ...current, ...req.body, id: current.id,
    sentAmount: req.body.sentAmount ?? ledger.fromMinorUnits(current.sentMinor, current.fromCurrency),
    receivedAmount: req.body.receivedAmount ?? ledger.fromMinorUnits(current.receivedMinor, current.toCurrency),
    feeAmount: req.body.feeAmount ?? (current.feeMinor ? ledger.fromMinorUnits(current.feeMinor, current.fromCurrency) : undefined),
    allocations: req.body.allocations ?? (savedAllocations.length ? savedAllocations : (current.pendingAllocations || []))
  };
  if (req.body.status === 'posted') input.status = 'posted';
  const result = ledger.createTransferRecord(db, userId, input);
  if (result.error) return res.status(400).json({ error: result.error });
  const updated = db.update('transfers', current.id, { ...result.record, id: current.id }, userId);
  ledger.refreshAlerts(db, userId);
  res.json(updated);
});

router.post('/:id/post', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const transfer = db.findById('transfers', req.params.id, userId);
  if (!transfer) return res.status(404).json({ error: 'Movimiento no encontrado' });
  if (transfer.status === 'posted') return res.json(transfer);
  const allocationResult = transfer.pendingAllocations?.length
    ? ledger.validateAllocations(db, userId, transfer, transfer.pendingAllocations)
    : { allocations: [] };
  if (allocationResult.error) return res.status(400).json({ error: allocationResult.error });
  const postedAt = req.body.postedAt || ledger.localDateForUser(db, userId);
  const postedDate = /^\d{4}-\d{2}-\d{2}$/.test(postedAt) ? new Date(`${postedAt}T00:00:00Z`) : null;
  if (!postedDate || Number.isNaN(postedDate.getTime()) || postedDate.toISOString().slice(0, 10) !== postedAt || postedAt > ledger.localDateForUser(db, userId)) return res.status(400).json({ error: 'Fecha de contabilización no válida' });
  const updated = db.update('transfers', transfer.id, {
    status: 'posted', postedAt,
    normalizationAllocations: allocationResult.allocations, pendingAllocations: []
  }, userId);
  ledger.refreshAlerts(db, userId);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const transfer = db.findById('transfers', req.params.id, userId);
  if (!transfer) return res.status(404).json({ error: 'Movimiento no encontrado' });
  if (hasDependents(db.findAll('transfers', userId), transfer.id)) return res.status(409).json({ error: 'Este movimiento tiene conversiones dependientes; revierte primero las conversiones posteriores' });
  db.remove('transfers', transfer.id, userId);
  ledger.refreshAlerts(db, userId);
  res.json({ ok: true });
});

router.get('/summary/:month', (req, res) => {
  const { month } = req.params;
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'El período debe tener formato YYYY-MM' });
  const db = req.app.locals.db;
  const summary = ledger.incomeByCurrency(db, req.session.userId, db.findAll('transactions', req.session.userId), month);
  res.json({ month, currencies: Object.values(summary) });
});

module.exports = router;
