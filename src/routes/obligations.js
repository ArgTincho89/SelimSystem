const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ledger = require('../services/account-ledger');
const obligations = require('../services/obligations');
const paymentReversal = require('../services/obligation-payment-reversal');
const obligationPayments = require('../services/obligation-payments');
const activityLog = require('../services/activity-log');

const router = express.Router();
router.use(requireAuth);

function listOptions(query) {
  return { from: query.from || undefined, to: query.to || undefined };
}

function responseFor(db, userId, obligation, options) {
  const occurrences = obligations.occurrencesFor(db, userId, obligation, options);
  const today = ledger.localDateForUser(db, userId);
  const actionable = occurrences.filter(item => item.status !== 'cancelled' && item.remainingAmount > 0);
  const provider = obligation.providerEntityId ? db.findById('legalOwners', obligation.providerEntityId, userId) : null;
  return {
    ...obligation,
    providerName: provider?.name || null,
    nextDue: actionable.find(item => item.date >= today) || null,
    overdue: actionable.some(item => item.status === 'overdue'),
    occurrences
  };
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const options = listOptions(req.query);
  if ((options.from && !obligations.validDate(options.from)) || (options.to && !obligations.validDate(options.to)) || (options.from && options.to && options.from > options.to)) {
    return res.status(400).json({ error: 'El período de consulta no es válido' });
  }
  if (req.query.assetId && !db.findById('assets', req.query.assetId, userId)) return res.status(400).json({ error: 'El bien no es válido' });
  // Lazy automatic reassignment (the daily job does the same): ended rentals hand obligations back to the owner.
  obligations.reassignEndedTenantObligations(db, userId);
  if (req.query.providerEntityId) {
    const provider = db.findById('legalOwners', req.query.providerEntityId, userId);
    if (!provider || !(provider.roles || ['owner']).includes('provider')) return res.status(400).json({ error: 'El proveedor no es válido' });
  }
  const externalIdentifier = typeof req.query.externalIdentifier === 'string' ? req.query.externalIdentifier.trim() : '';
  const rows = db.findAll('obligations', userId).filter(item =>
    (!externalIdentifier || item.externalIdentifier === externalIdentifier)
    &&
    (!req.query.assetId || item.assetId === req.query.assetId)
    && (!req.query.providerEntityId || item.providerEntityId === req.query.providerEntityId)
    && (!req.query.type || item.type === req.query.type)
  ).map(item => responseFor(db, userId, item, options)).filter(item => {
    if (!req.query.status) return true;
    if (req.query.status === 'active' || req.query.status === 'cancelled') return item.status === req.query.status;
    if (req.query.status === 'pending') return item.occurrences.some(occurrence => ['expected', 'confirmed', 'partial'].includes(occurrence.status));
    return item.occurrences.some(occurrence => occurrence.status === req.query.status);
  });
  res.json(rows);
});

router.get('/resolutions', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const filters = {};
  for (const key of ['occurrenceId', 'obligationId', 'tenantEntityId', 'assetId', 'period']) {
    if (req.query[key] === undefined || req.query[key] === '') continue;
    if (typeof req.query[key] !== 'string') return res.status(400).json({ error: 'Los filtros no son válidos' });
    filters[key] = req.query[key];
  }
  if (filters.period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.period)) return res.status(400).json({ error: 'El período debe tener formato YYYY-MM' });
  res.json(obligations.listResolutions(db, userId, filters));
});

router.get('/alerts', (req, res) => res.json(obligations.getAlerts(req.app.locals.db, req.session.userId)));

// "Declaración de alquiler" closed without saving: obligations created from it stay with the owner.
router.post('/pending-links/release', (req, res) => {
  const token = (req.body || {}).token;
  if (typeof token !== 'string' || token.length < 8 || token.length > 120) return res.status(400).json({ error: 'El vínculo con la declaración de alquiler no es válido' });
  res.json({ released: obligations.releasePendingRentalLinks(req.app.locals.db, req.session.userId, token) });
});

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const result = obligations.createObligation(db, req.session.userId, req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(responseFor(db, req.session.userId, result.obligation));
});

router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  if (!db.findById('obligations', req.params.id, userId)) return res.status(404).json({ error: 'Obligación no encontrada' });
  obligations.reassignEndedTenantObligations(db, userId);
  const obligation = db.findById('obligations', req.params.id, userId);
  const options = listOptions(req.query);
  if ((options.from && !obligations.validDate(options.from)) || (options.to && !obligations.validDate(options.to)) || (options.from && options.to && options.from > options.to)) return res.status(400).json({ error: 'El período de consulta no es válido' });
  res.json(responseFor(db, userId, obligation, options));
});

router.patch('/:id/responsibility', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const obligation = db.findById('obligations', req.params.id, userId);
  if (!obligation) return res.status(404).json({ error: 'Obligación no encontrada' });
  const result = obligations.setResponsibility(db, userId, obligation, (req.body || {}).responsibilityType);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json(responseFor(db, userId, result.obligation));
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const existing = db.findById('obligations', req.params.id, userId);
  if (!existing) return res.status(404).json({ error: 'Obligación no encontrada' });
  const hasHistory = db.findAll('transactions', userId).some(tx => tx.obligationId === existing.id);
  const effectiveFromDate = req.body.effectiveFromDate;
  if (hasHistory && (!effectiveFromDate || !obligations.validDate(effectiveFromDate) || effectiveFromDate < ledger.localDateForUser(db, userId))) {
    return res.status(409).json({ error: 'La obligación tiene pagos; los cambios requieren una fecha futura explícita' });
  }
  if (hasHistory && effectiveFromDate < (existing.effectiveFromDate || existing.startDate)) return res.status(409).json({ error: 'No se puede editar una versión anterior de la serie' });
  if (effectiveFromDate && effectiveFromDate < ledger.localDateForUser(db, userId)) return res.status(409).json({ error: 'No se permiten cambios retroactivos' });
  const scheduleChanged = ['startDate', 'endDate', 'recurrenceFrequency'].some(field => req.body[field] !== undefined && req.body[field] !== existing[field]);
  if (hasHistory && req.body.startDate !== undefined && req.body.startDate !== existing.startDate && req.body.startDate !== effectiveFromDate) {
    return res.status(409).json({ error: 'La nueva fecha de inicio debe coincidir con la fecha efectiva del cambio' });
  }
  const parsed = obligations.validateDefinition(db, userId, req.body || {}, existing);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const changes = parsed.value;
  delete changes.status;
  if (effectiveFromDate) {
    const currentEffectiveFrom = existing.effectiveFromDate || existing.startDate;
    if (effectiveFromDate > currentEffectiveFrom) {
      const revisionEnd = require('../utils/recurring').addDaysDateOnly(effectiveFromDate, -1);
      db.create('obligationRevisions', {
        obligationId: existing.id,
        effectiveFromDate: currentEffectiveFrom,
        effectiveUntilDate: revisionEnd,
        definition: { ...existing, effectiveUntilDate: revisionEnd }
      }, userId);
    }
    changes.effectiveFromDate = effectiveFromDate;
    if (hasHistory && scheduleChanged) changes.startDate = effectiveFromDate;
  }
  const updated = db.update('obligations', existing.id, changes, userId);
  const affectedFrom = effectiveFromDate || (hasHistory ? null : existing.startDate);
  if (affectedFrom) {
    db.findAll('obligationOccurrences', userId).filter(item => item.obligationId === existing.id && item.date >= affectedFrom && !obligations.paymentTransactions(db, userId, item.id).length && item.status !== 'cancelled' && !obligations.activeResolution(db, userId, item.id)).forEach(item => {
      if (!hasHistory && !obligations.isScheduledOn(updated, item.date)) {
        db.update('obligationOccurrences', item.id, { status: 'cancelled' }, userId);
        return;
      }
      if (hasHistory && scheduleChanged && !obligations.isScheduledOn(updated, item.date)) {
        db.update('obligationOccurrences', item.id, { status: 'cancelled' }, userId);
        return;
      }
      const occurrenceChanges = {};
      occurrenceChanges.currencyCode = updated.currencyCode;
      occurrenceChanges.estimatedAmount = updated.estimatedAmount;
      occurrenceChanges.dueAmountMinor = ledger.toMinorUnits(updated.estimatedAmount, updated.currencyCode);
      occurrenceChanges.title = updated.title;
      occurrenceChanges.categoryId = updated.categoryId;
      occurrenceChanges.accountId = updated.accountId;
      occurrenceChanges.paymentMethod = updated.paymentMethod || '';
      occurrenceChanges.paymentMethodId = updated.paymentMethodId || null;
      db.update('obligationOccurrences', item.id, occurrenceChanges, userId);
    });
  }
  res.json(responseFor(db, userId, updated));
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const obligation = db.findById('obligations', req.params.id, userId);
  if (!obligation) return res.status(404).json({ error: 'Obligación no encontrada' });
  db.update('obligations', obligation.id, { status: 'cancelled' }, userId);
  db.findAll('obligationOccurrences', userId).filter(item => item.obligationId === obligation.id && !obligations.paymentTransactions(db, userId, item.id).length && !obligations.activeResolution(db, userId, item.id)).forEach(item => {
    db.update('obligationOccurrences', item.id, { status: 'cancelled' }, userId);
  });
  res.json({ ok: true });
});

router.post('/:id/occurrences/:occurrenceId/confirm', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const obligation = db.findById('obligations', req.params.id, userId);
  const occurrence = db.findById('obligationOccurrences', req.params.occurrenceId, userId);
  if (!obligation || !occurrence || occurrence.obligationId !== obligation.id) return res.status(404).json({ error: 'Ocurrencia no encontrada' });
  if (occurrence.status === 'cancelled') return res.status(409).json({ error: 'La ocurrencia está cancelada' });
  if (obligations.paymentTransactions(db, userId, occurrence.id).length) return res.status(409).json({ error: 'La ocurrencia ya tiene pagos' });
  const updated = db.update('obligationOccurrences', occurrence.id, { status: 'confirmed', confirmedAt: new Date().toISOString() }, userId);
  res.json(obligations.occurrenceView(db, userId, updated, ledger.localDateForUser(db, userId)));
});

router.post('/:id/occurrences/:occurrenceId/cancel', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const obligation = db.findById('obligations', req.params.id, userId);
  const occurrence = db.findById('obligationOccurrences', req.params.occurrenceId, userId);
  if (!obligation || !occurrence || occurrence.obligationId !== obligation.id) return res.status(404).json({ error: 'Ocurrencia no encontrada' });
  if (obligations.paymentTransactions(db, userId, occurrence.id).length) return res.status(409).json({ error: 'Una ocurrencia con pagos no se puede cancelar' });
  if (obligations.activeResolution(db, userId, occurrence.id)) return res.status(409).json({ error: 'Una ocurrencia con resolución activa no se puede cancelar' });
  const updated = db.update('obligationOccurrences', occurrence.id, { status: 'cancelled', cancelledAt: new Date().toISOString() }, userId);
  res.json(obligations.occurrenceView(db, userId, updated, ledger.localDateForUser(db, userId)));
});

router.put('/:id/occurrences/:occurrenceId', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const obligation = db.findById('obligations', req.params.id, userId);
  const occurrence = db.findById('obligationOccurrences', req.params.occurrenceId, userId);
  if (!obligation || !occurrence || occurrence.obligationId !== obligation.id) return res.status(404).json({ error: 'Ocurrencia no encontrada' });
  const result = obligations.updateOccurrence(db, userId, obligation, occurrence, req.body || {}, req.body.scope || 'this');
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json(obligations.occurrenceView(db, userId, result.occurrence, ledger.localDateForUser(db, userId)));
});

router.post('/:id/occurrences/:occurrenceId/resolution', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const obligation = db.findById('obligations', req.params.id, userId);
  const occurrence = db.findById('obligationOccurrences', req.params.occurrenceId, userId);
  if (!obligation || !occurrence || occurrence.obligationId !== obligation.id) return res.status(404).json({ error: 'Ocurrencia no encontrada' });
  const result = obligations.createResolution(db, userId, obligation, occurrence, req.body || {});
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.locals.activityMeta = activityLog.obligationMeta(db, userId, obligation, occurrence, {
    amount: ledger.fromMinorUnits(result.resolution.amountMinor, result.resolution.currencyCode), currencyCode: result.resolution.currencyCode, tenantIds: [result.resolution.tenantEntityId],
    undo: { type: 'obligation.resolution', obligationId: obligation.id, occurrenceId: occurrence.id, resolutionId: result.resolution.id }
  });
  res.status(201).json({ resolution: result.resolution, occurrence: obligations.occurrenceView(db, userId, occurrence, ledger.localDateForUser(db, userId)) });
});

router.delete('/:id/occurrences/:occurrenceId/resolution', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const obligation = db.findById('obligations', req.params.id, userId);
  const occurrence = db.findById('obligationOccurrences', req.params.occurrenceId, userId);
  if (!obligation || !occurrence || occurrence.obligationId !== obligation.id) return res.status(404).json({ error: 'Ocurrencia no encontrada' });
  const result = obligations.voidResolution(db, userId, occurrence, (req.body || {}).reason);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.locals.activityNote = result.resolution.voidReason;
  res.locals.activityMeta = activityLog.obligationMeta(db, userId, obligation, occurrence, {
    amount: ledger.fromMinorUnits(result.resolution.amountMinor, result.resolution.currencyCode), currencyCode: result.resolution.currencyCode, tenantIds: [result.resolution.tenantEntityId]
  });
  res.json({ resolution: result.resolution, occurrence: obligations.occurrenceView(db, userId, occurrence, ledger.localDateForUser(db, userId)) });
});

router.get('/:id/occurrences/:occurrenceId/payment-context', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const obligation = db.findById('obligations', req.params.id, userId);
  const occurrence = db.findById('obligationOccurrences', req.params.occurrenceId, userId);
  if (!obligation || !occurrence || occurrence.obligationId !== obligation.id) return res.status(404).json({ error: 'Ocurrencia no encontrada' });
  res.json(obligations.paymentContext(db, userId, obligation, occurrence));
});

router.post('/:id/occurrences/:occurrenceId/payments', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const obligation = db.findById('obligations', req.params.id, userId);
  const occurrence = db.findById('obligationOccurrences', req.params.occurrenceId, userId);
  if (!obligation || !occurrence || occurrence.obligationId !== obligation.id) return res.status(404).json({ error: 'Ocurrencia no encontrada' });
  // Same validation and record as the transaction form's payment path (services/obligation-payments).
  const result = obligationPayments.register(db, userId, { obligation, occurrence, input: req.body || {} });
  if (result.error) return res.status(result.status).json({ error: result.error });
  const view = obligations.occurrenceView(db, userId, occurrence, ledger.localDateForUser(db, userId));
  if (result.replayed) return res.json({ transaction: result.transaction, occurrence: view, replayed: true });
  res.locals.activityMeta = obligationPayments.activityMeta(db, userId, obligation, occurrence, result);
  res.status(201).json({ transaction: result.transaction, occurrence: view });
});

// One payment of an occurrence: what the confirmation dialog of "Revertir pago" shows, plus whether it can be reverted.
function paymentOf(req) {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const obligation = db.findById('obligations', req.params.id, userId);
  const occurrence = db.findById('obligationOccurrences', req.params.occurrenceId, userId);
  if (!obligation || !occurrence || occurrence.obligationId !== obligation.id) return { status: 404, error: 'Ocurrencia no encontrada' };
  const transaction = db.findById('transactions', req.params.paymentId, userId);
  if (!transaction || transaction.obligationOccurrenceId !== occurrence.id) {
    const reverted = paymentReversal.reversalOf(db, userId, { transactionId: req.params.paymentId });
    if (reverted && reverted.occurrenceId === occurrence.id) return { status: 409, error: paymentReversal.ALREADY_REVERTED };
    return { status: 404, error: 'Pago no encontrado' };
  }
  return { db, userId, obligation, occurrence, transaction };
}

router.get('/:id/occurrences/:occurrenceId/payments/:paymentId', (req, res) => {
  const found = paymentOf(req);
  if (found.error) return res.status(found.status).json({ error: found.error });
  res.json(paymentReversal.paymentDetail(found.db, found.userId, found.obligation, found.occurrence, found.transaction));
});

router.post('/:id/occurrences/:occurrenceId/payments/:paymentId/revert', (req, res) => {
  const found = paymentOf(req);
  if (found.error) return res.status(found.status).json({ error: found.error });
  const { db, userId, obligation, occurrence, transaction } = found;
  const result = paymentReversal.revert(db, userId, { obligation, occurrence, transaction, reason: (req.body || {}).reason });
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  if (result.reversal.reason) res.locals.activityNote = result.reversal.reason;
  res.locals.activityMeta = activityLog.obligationMeta(db, userId, obligation, occurrence, { amount: transaction.monto, currencyCode: transaction.currencyCode, accountId: transaction.accountId, categoryId: transaction.categoryId });
  res.json({
    reversal: result.reversal, reconciliationReset: result.reconciliationReset,
    occurrence: obligations.occurrenceView(db, userId, db.findById('obligationOccurrences', occurrence.id, userId), ledger.localDateForUser(db, userId))
  });
});

module.exports = router;
