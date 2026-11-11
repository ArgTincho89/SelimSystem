const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const ledger = require('../services/account-ledger');
const obligations = require('../services/obligations');

const router = express.Router();
router.use(requireAuth);

function listOptions(query) {
  return { from: query.from || undefined, to: query.to || undefined };
}

function responseFor(db, userId, obligation, options) {
  const occurrences = obligations.occurrencesFor(db, userId, obligation, options);
  const today = ledger.localDateForUser(db, userId);
  const actionable = occurrences.filter(item => item.status !== 'cancelled' && item.remainingAmount > 0);
  return {
    ...obligation,
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
  res.status(201).json({ resolution: result.resolution, occurrence: obligations.occurrenceView(db, userId, occurrence, ledger.localDateForUser(db, userId)) });
});

router.delete('/:id/occurrences/:occurrenceId/resolution', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const obligation = db.findById('obligations', req.params.id, userId);
  const occurrence = db.findById('obligationOccurrences', req.params.occurrenceId, userId);
  if (!obligation || !occurrence || occurrence.obligationId !== obligation.id) return res.status(404).json({ error: 'Ocurrencia no encontrada' });
  const result = obligations.voidResolution(db, userId, occurrence);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
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
  if (occurrence.status === 'cancelled') return res.status(409).json({ error: 'La ocurrencia está cancelada' });
  const { amount, accountId, categoryId, idempotencyKey, paymentMethodId, paymentMethod } = req.body || {};
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 120) return res.status(400).json({ error: 'Se requiere una clave de idempotencia válida' });
  const keyHash = obligations.idempotencyDigest(idempotencyKey);
  const fingerprint = obligations.idempotencyDigest(JSON.stringify({ amount, accountId: accountId || null, categoryId: categoryId || null, date: req.body.date || null, paymentMethodId: paymentMethodId || null, paymentMethod: paymentMethod || null }));
  const existing = db.findAll('transactions', userId).find(tx => tx.obligationIdempotencyKey === keyHash);
  if (existing) {
    if (existing.obligationOccurrenceId !== occurrence.id || existing.obligationPaymentFingerprint !== fingerprint) return res.status(409).json({ error: 'La clave de idempotencia ya fue utilizada para otro pago' });
    return res.json({ transaction: existing, occurrence: obligations.occurrenceView(db, userId, occurrence, ledger.localDateForUser(db, userId)), replayed: true });
  }
  const selectedAccountId = accountId || occurrence.accountId || obligation.accountId;
  const account = db.findById('accounts', selectedAccountId, userId);
  if (!account || !account.activo) return res.status(400).json({ error: 'Seleccioná una cuenta activa' });
  if (account.currency !== occurrence.currencyCode) return res.status(400).json({ error: 'La moneda de la cuenta no coincide con la obligación' });
  const selectedCategoryId = obligations.categoryChain(db, userId, obligation, occurrence, categoryId);
  const category = db.findById('categories', selectedCategoryId, userId);
  if (!category) return res.status(400).json({ error: 'Seleccioná una categoría válida' });
  if (paymentMethodId && !db.findById('paymentMethods', paymentMethodId, userId)) return res.status(400).json({ error: 'El medio de pago no es válido' });
  if (paymentMethod !== undefined && paymentMethod !== null && (typeof paymentMethod !== 'string' || paymentMethod.length > 120)) return res.status(400).json({ error: 'El medio de pago no es válido' });
  const amountMinor = ledger.moneyInput(amount, account.currency);
  if (amountMinor === null) return res.status(400).json({ error: 'El importe pagado debe ser positivo y válido para la moneda' });
  const today = ledger.localDateForUser(db, userId);
  const paymentDate = req.body.date || today;
  if (!obligations.validDate(paymentDate) || paymentDate > today) return res.status(400).json({ error: 'La fecha de pago debe ser válida y no futura' });
  const current = obligations.occurrenceView(db, userId, occurrence, today);
  if (amountMinor > ledger.toMinorUnits(current.remainingAmount, account.currency)) return res.status(400).json({ error: 'El pago supera el importe pendiente' });
  const paymentId = uuidv4();
  let transaction;
  try {
    transaction = db.create('transactions', {
      userId, tipo: 'expense', monto: ledger.fromMinorUnits(amountMinor, account.currency), amountMinor,
      accountId: account.id, currencyCode: account.currency, titulo: occurrence.title || obligation.title,
      categoryId: category.id, fecha: paymentDate, recurrente: false, frecuencia: null, fechaFin: null,
      clasificacion: 'variable', obligationId: obligation.id, obligationOccurrenceId: occurrence.id,
      obligationIdempotencyKey: keyHash, obligationPaymentFingerprint: fingerprint,
      // The payment method is chosen when paying; legacy obligation values are not copied.
      paymentMethod: paymentMethod || '', paymentMethodId: paymentMethodId || null, paymentId
    }, userId);
  } catch {
    db.clearCache();
    return res.status(500).json({ error: 'No se pudo registrar el pago' });
  }
  res.status(201).json({ transaction, occurrence: obligations.occurrenceView(db, userId, occurrence, ledger.localDateForUser(db, userId)) });
});

module.exports = router;
