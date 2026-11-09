const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ledger = require('../services/account-ledger');
const installments = require('../services/credit-card-installments');

const router = express.Router();
router.use(requireAuth);

function loadPlan(req, res) {
  const plan = req.app.locals.db.findById(installments.PLANS, req.params.id, req.session.userId);
  if (!plan) res.status(404).json({ error: 'Plan de cuotas no encontrado' });
  return plan;
}

function loadOccurrence(req, res, plan) {
  const occurrence = req.app.locals.db.findById(installments.OCCURRENCES, req.params.occurrenceId, req.session.userId);
  if (!occurrence || occurrence.planId !== plan.id) {
    res.status(404).json({ error: 'Cuota no encontrada' });
    return null;
  }
  return occurrence;
}

router.get('/plans', (req, res) => {
  res.json(installments.listPlans(req.app.locals.db, req.session.userId));
});

router.post('/plans', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  ledger.ensureSetup(db, userId);
  const result = installments.createPlan(db, userId, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json({ ...result.plan, occurrences: result.occurrences });
});

// Scheduled (unposted) installments due in a month. Read-only; never part of transaction totals.
router.get('/occurrences', (req, res) => {
  const month = req.query.month;
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'Parámetro month requerido (YYYY-MM)' });
  res.json(installments.scheduledForMonth(req.app.locals.db, req.session.userId, month));
});

router.get('/plans/:id', (req, res) => {
  const plan = loadPlan(req, res);
  if (!plan) return;
  const db = req.app.locals.db;
  res.json({ ...installments.getPlan(db, req.session.userId, plan.id), occurrences: installments.occurrencesOf(db, req.session.userId, plan.id) });
});

router.patch('/plans/:id', (req, res) => {
  const plan = loadPlan(req, res);
  if (!plan) return;
  const result = installments.updatePlan(req.app.locals.db, req.session.userId, plan, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.plan);
});

router.post('/plans/:id/cancel', (req, res) => {
  const plan = loadPlan(req, res);
  if (!plan) return;
  const result = installments.cancelPlan(req.app.locals.db, req.session.userId, plan);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json(result.plan);
});

router.get('/plans/:id/occurrences', (req, res) => {
  const plan = loadPlan(req, res);
  if (!plan) return;
  res.json(installments.occurrencesOf(req.app.locals.db, req.session.userId, plan.id));
});

router.post('/plans/:id/occurrences/:occurrenceId/post', (req, res) => {
  const plan = loadPlan(req, res);
  if (!plan) return;
  const occurrence = loadOccurrence(req, res, plan);
  if (!occurrence) return;
  const db = req.app.locals.db;
  const result = installments.postOccurrence(db, req.session.userId, plan, occurrence, req.body || {});
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  ledger.refreshAlerts(db, req.session.userId);
  res.status(201).json({ occurrence: result.occurrence, transaction: result.transaction, plan: result.plan });
});

router.post('/plans/:id/occurrences/:occurrenceId/cancel', (req, res) => {
  const plan = loadPlan(req, res);
  if (!plan) return;
  const occurrence = loadOccurrence(req, res, plan);
  if (!occurrence) return;
  const result = installments.cancelOccurrence(req.app.locals.db, req.session.userId, plan, occurrence);
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json({ occurrence: result.occurrence, plan: result.plan });
});

module.exports = router;
