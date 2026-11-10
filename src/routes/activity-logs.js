const express = require('express');
const { requireAuth } = require('../middleware/auth');
const activityLog = require('../services/activity-log');

const router = express.Router();
router.use(requireAuth);

// Own entries only, newest first. Any userId query parameter is ignored.
router.get('/', (req, res) => {
  res.json(activityLog.list(req.app.locals.db, req.session.userId, { limit: req.query.limit, before: req.query.before }));
});

module.exports = router;
