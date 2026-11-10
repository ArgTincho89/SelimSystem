const activityLog = require('../services/activity-log');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Records one audit entry per authenticated write request on 'finish'. It never alters the response:
// every failure is swallowed and reported to the console only. Bodies, queries and headers are never read.
function activityLogMiddleware(req, res, next) {
  try {
    const userId = req.session && req.session.userId;
    if (!WRITE_METHODS.has(req.method) || !userId || !req.originalUrl.startsWith('/api/')) return next();
    const path = activityLog.normalizePath(req.originalUrl);
    if (activityLog.isSkipped(req.method, path)) return next();
    const db = req.app.locals.db;
    const context = activityLog.resolveContext(db, userId, req.method, path);
    let createdId = null;
    const originalJson = res.json.bind(res);
    res.json = body => {
      if (body && typeof body.id === 'string') createdId = body.id;
      return originalJson(body);
    };
    res.on('finish', () => {
      try {
        const outcome = res.statusCode < 400 ? 'success' : 'failure';
        const entityId = context.entityId || (outcome === 'success' ? createdId : null);
        let label = context.entityLabel || (entityId ? activityLog.labelFor(db, userId, context.route && context.route.entityType, entityId) : '');
        let route = context.route;
        if (outcome === 'success' && !context.entityId) {
          const refined = activityLog.refineRoute(db, userId, route, entityId);
          if (refined.label) { route = refined.route; label = refined.label; }
        }
        activityLog.append(db, userId, {
          method: req.method, route: route ? route.pattern : `/${path.split('/')[1] || ''}`, action: route ? route.action : 'generic',
          entityType: route ? route.entityType : null, entityId, entityLabel: label, outcome, statusCode: res.statusCode,
          message: activityLog.buildMessage({ route, label, path, outcome })
        });
      } catch (err) {
        console.error('[ACTIVITY-LOG]', err.message);
      }
    });
  } catch (err) {
    console.error('[ACTIVITY-LOG]', err.message);
  }
  next();
}

module.exports = activityLogMiddleware;
