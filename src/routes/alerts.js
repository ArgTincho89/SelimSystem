const express = require('express');
const { requireAuth } = require('../middleware/auth');
const alerts = require('../services/alerts');
const rentals = require('../services/rentals');
const alertConfig = require('../services/alert-config');

const router = express.Router();
router.use(requireAuth);

function single(value) {
  return Array.isArray(value) || (value !== undefined && typeof value !== 'string') ? null : value;
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const filters = {};
  for (const key of ['from', 'to', 'type', 'responsibility', 'assetId', 'holderId', 'limit']) {
    const value = single(req.query[key]);
    if (value === null) return res.status(400).json({ error: 'Los filtros no son válidos' });
    if (value !== undefined && value !== '') filters[key] = value;
  }
  if ((filters.from && !rentals.validDate(filters.from)) || (filters.to && !rentals.validDate(filters.to)) || (filters.from && filters.to && filters.from > filters.to)) {
    return res.status(400).json({ error: 'El período de consulta no es válido' });
  }
  if (filters.type && !alerts.ALERT_TYPES.includes(filters.type)) return res.status(400).json({ error: 'El tipo de aviso no es válido' });
  if (filters.responsibility && !alerts.RESPONSIBILITIES.includes(filters.responsibility)) return res.status(400).json({ error: 'El responsable no es válido' });
  if (filters.assetId && !db.findById('assets', filters.assetId, userId)) return res.status(400).json({ error: 'El bien no es válido' });
  if (filters.holderId && !db.findById('legalOwners', filters.holderId, userId)) return res.status(400).json({ error: 'El titular no es válido' });
  if (filters.limit !== undefined) {
    const limit = /^\d+$/.test(filters.limit) ? Number(filters.limit) : NaN;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return res.status(400).json({ error: 'El límite debe estar entre 1 y 1000' });
    filters.limit = limit;
  }
  res.json(alerts.list(db, userId, filters));
});

// Lead-time configuration: catalog, the user's defaults and overrides, and the names for the override pickers.
router.get('/settings', (req, res) => {
  res.json(alertConfig.describe(req.app.locals.db, req.session.userId));
});

router.put('/settings', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const parsed = alertConfig.validateSettings(db, userId, req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const current = alertConfig.readSettings(db, userId, { persist: true });
  alertConfig.saveSettings(db, userId, {
    defaults: req.body.defaults !== undefined ? parsed.settings.defaults : current.defaults,
    overrides: req.body.overrides !== undefined ? parsed.settings.overrides : current.overrides
  });
  res.json(alertConfig.describe(db, userId));
});

module.exports = router;
