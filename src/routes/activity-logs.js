const express = require('express');
const { requireAuth } = require('../middleware/auth');
const activityLog = require('../services/activity-log');
const ledger = require('../services/account-ledger');

const router = express.Router();
router.use(requireAuth);

// Own entries only, newest first. Any userId query parameter is ignored.
// Optional from/to (YYYY-MM-DD, inclusive) filter by day in `timezone` (IANA), or the user's configured timezone.
router.get('/', (req, res) => {
  const { limit, before, from, to, timezone } = req.query;
  if (from !== undefined && from !== '' && !activityLog.isIsoDate(from)) return res.status(400).json({ error: 'Fecha "desde" inválida' });
  if (to !== undefined && to !== '' && !activityLog.isIsoDate(to)) return res.status(400).json({ error: 'Fecha "hasta" inválida' });
  if (from && to && from > to) return res.status(400).json({ error: 'La fecha "desde" no puede ser posterior a "hasta"' });
  if (timezone !== undefined && timezone !== '' && !activityLog.isValidTimezone(timezone)) return res.status(400).json({ error: 'Zona horaria inválida' });
  const db = req.app.locals.db;
  const zone = timezone || ledger.getSettings(db, req.session.userId, false)?.timezone || 'Europe/Madrid';
  res.json(activityLog.list(db, req.session.userId, { limit, before, from: from || undefined, to: to || undefined, timezone: zone }));
});

module.exports = router;
