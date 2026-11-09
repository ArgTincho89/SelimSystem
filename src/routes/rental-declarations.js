const express = require('express');
const ledger = require('../services/account-ledger');
const declarations = require('../services/rental-declarations');

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

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const result = declarations.create(db, userId, req.body);
  if (result.error) return res.status(result.status).json({ error: result.error });
  respond(res, db, userId, result.value, 201);
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const declaration = db.findById('rentalDeclarations', req.params.id, userId);
  if (!declaration) return res.status(404).json({ error: 'Declaración de alquiler no encontrada' });
  const result = declarations.update(db, userId, declaration, req.body);
  if (result.error) return res.status(result.status).json({ error: result.error });
  respond(res, db, userId, result.value);
});

router.post('/:id/end', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const declaration = db.findById('rentalDeclarations', req.params.id, userId);
  if (!declaration) return res.status(404).json({ error: 'Declaración de alquiler no encontrada' });
  const result = declarations.end(db, userId, declaration);
  if (result.error) return res.status(result.status).json({ error: result.error });
  respond(res, db, userId, result.value);
});

module.exports = router;
