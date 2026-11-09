const express = require('express');
const { requireAuth } = require('../middleware/auth');
const alerts = require('../services/alerts');
const rentals = require('../services/rentals');

const router = express.Router();
router.use(requireAuth);

function single(value) {
  return Array.isArray(value) || (value !== undefined && typeof value !== 'string') ? null : value;
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const filters = {};
  for (const key of ['from', 'to', 'type', 'assetId', 'holderId', 'limit']) {
    const value = single(req.query[key]);
    if (value === null) return res.status(400).json({ error: 'Los filtros no son válidos' });
    if (value !== undefined && value !== '') filters[key] = value;
  }
  if ((filters.from && !rentals.validDate(filters.from)) || (filters.to && !rentals.validDate(filters.to)) || (filters.from && filters.to && filters.from > filters.to)) {
    return res.status(400).json({ error: 'El período de consulta no es válido' });
  }
  if (filters.type && !alerts.ALERT_TYPES.includes(filters.type)) return res.status(400).json({ error: 'El tipo de aviso no es válido' });
  if (filters.assetId && !db.findById('assets', filters.assetId, userId)) return res.status(400).json({ error: 'El bien no es válido' });
  if (filters.holderId && !db.findById('legalOwners', filters.holderId, userId)) return res.status(400).json({ error: 'El titular no es válido' });
  if (filters.limit !== undefined) {
    const limit = /^\d+$/.test(filters.limit) ? Number(filters.limit) : NaN;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return res.status(400).json({ error: 'El límite debe estar entre 1 y 1000' });
    filters.limit = limit;
  }
  res.json(alerts.list(db, userId, filters));
});

module.exports = router;
