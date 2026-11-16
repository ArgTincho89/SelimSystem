const express = require('express');
const ledger = require('../services/account-ledger');
const declarations = require('../services/rental-declarations');
const rentalPeriods = require('../services/rental-periods');

const router = express.Router();

function respond(res, db, userId, declaration, status = 200) {
  return res.status(status).json(declarations.view(db, userId, declaration));
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  if (req.query.assetId && !db.findById('assets', req.query.assetId, userId)) return res.status(400).json({ error: 'El inmueble no es válido' });
  ledger.ensureSetup(db, userId);
  declarations.backfillDeclarations(db, userId);
  const rows = db.findAll('rentalDeclarations', userId)
    .filter(item => !req.query.assetId || item.assetId === req.query.assetId)
    .map(item => declarations.view(db, userId, item));
  res.json(rows);
});

function findDeclaration(req, res) {
  const declaration = req.app.locals.db.findById('rentalDeclarations', req.params.id, req.session.userId);
  if (!declaration) res.status(404).json({ error: 'Declaración de alquiler no encontrada' });
  return declaration;
}

// The rental with its modalities (and the next 12 months of periods, as the list does).
router.get('/:id', (req, res) => {
  const declaration = findDeclaration(req, res);
  if (!declaration) return;
  respond(res, req.app.locals.db, req.session.userId, declaration);
});

// Header, modality cards, collection progress and alerts. Read-only: generated periods stay in memory.
router.get('/:id/overview', (req, res) => {
  const declaration = findDeclaration(req, res);
  if (!declaration) return;
  const result = rentalPeriods.overview(req.app.locals.db, req.session.userId, declaration, { year: req.query.year });
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json(result.value);
});

// One row per month: modalities, owner and tenant obligations, collections, receipts and notes. Read-only.
router.get('/:id/periods', (req, res) => {
  const declaration = findDeclaration(req, res);
  if (!declaration) return;
  const result = rentalPeriods.periods(req.app.locals.db, req.session.userId, declaration, { from: req.query.from, to: req.query.to });
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  res.json(result.value);
});

function failed(res, result) {
  return res.status(result.status).json({ error: result.error, ...(result.conflict ? { conflict: result.conflict } : {}) });
}

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const result = declarations.create(db, userId, req.body);
  if (result.error) return failed(res, result);
  respond(res, db, userId, result.value, 201);
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const declaration = db.findById('rentalDeclarations', req.params.id, userId);
  if (!declaration) return res.status(404).json({ error: 'Declaración de alquiler no encontrada' });
  const result = declarations.update(db, userId, declaration, req.body);
  if (result.error) return failed(res, result);
  respond(res, db, userId, result.value);
});

router.post('/:id/end', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const declaration = db.findById('rentalDeclarations', req.params.id, userId);
  if (!declaration) return res.status(404).json({ error: 'Declaración de alquiler no encontrada' });
  const result = declarations.end(db, userId, declaration, req.body || {});
  if (result.error) return failed(res, result);
  respond(res, db, userId, result.value);
});

module.exports = router;
