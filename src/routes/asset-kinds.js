const express = require('express');
const { requireAuth } = require('../middleware/auth');
const assetKinds = require('../services/asset-kinds');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(assetKinds.list(req.app.locals.db, req.session.userId));
});

router.post('/', (req, res) => {
  const result = assetKinds.create(req.app.locals.db, req.session.userId, (req.body || {}).name);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.status(201).json(result.value);
});

module.exports = router;
