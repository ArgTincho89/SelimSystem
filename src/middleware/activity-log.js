const activityLog = require('../services/activity-log');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Records one audit entry per authenticated write request on 'finish'. It never alters the response:
// every failure is swallowed and reported to the console only. Bodies, queries and headers are never read:
// routes pass structured context through res.locals.activityMeta instead.
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
        // Structured context (success only): derived from the entity, refined by what the route knows via res.locals.activityMeta.
        const meta = { assetId: null, ownerIds: [], tenantIds: [], categoryId: null, undo: null };
        if (outcome === 'success') {
          const known = context.derived || {};
          const later = activityLog.deriveMeta(db, userId, context.route && context.route.entityType, entityId);
          const given = res.locals && res.locals.activityMeta && typeof res.locals.activityMeta === 'object' ? res.locals.activityMeta : {};
          ['assetId', 'categoryId'].forEach(key => { meta[key] = given[key] || known[key] || later[key] || null; });
          ['ownerIds', 'tenantIds'].forEach(key => { meta[key] = [given[key], known[key], later[key]].find(value => Array.isArray(value) && value.length) || []; });
          meta.undo = given.undo || null;
          if (given.facts && context.route) label = activityLog.describe(context.route, given.facts, label);
        }
        // A route may attach one short, user-written note (the reason of a payment reversal) to its entry.
        const note = outcome === 'success' && res.locals && typeof res.locals.activityNote === 'string' ? res.locals.activityNote.trim().slice(0, 120) : '';
        if (note) label = `${label}${label ? ', ' : ''}motivo: ${note}`;
        let route = context.route;
        // A route may pick a more precise wording of the same request (e.g. a partial rent collection).
        const chosen = outcome === 'success' && res.locals && res.locals.activityMeta && typeof res.locals.activityMeta.action === 'string'
          ? activityLog.ROUTES.find(item => item.action === res.locals.activityMeta.action && route && item.pattern === route.pattern) : null;
        if (chosen) route = chosen;
        if (outcome === 'success' && !context.entityId && !chosen) {
          const refined = activityLog.refineRoute(db, userId, route, entityId);
          if (refined.label) { route = refined.route; label = refined.label; }
        }
        activityLog.append(db, userId, {
          method: req.method, route: route ? route.pattern : `/${path.split('/')[1] || ''}`, action: route ? route.action : 'generic',
          entityType: route ? route.entityType : null, entityId, entityLabel: label, outcome, statusCode: res.statusCode,
          message: activityLog.buildMessage({ route, label, path, outcome }), ...meta
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
