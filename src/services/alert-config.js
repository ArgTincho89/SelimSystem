// Centralized alert lead-time configuration: one catalog of alert types, the per-user defaults and the specific
// overrides (per asset, obligation or account). Every alert builder asks `leadDaysFor(type, context)`.
const COLLECTION = 'alertSettings';
const SCOPES = ['asset', 'obligation', 'account'];
const MAX_DAYS = 365;
// accountSettings.alertLeadDays shipped with 5 as its default; any other value is a user choice worth seeding.
const LEGACY_ALERT_LEAD_DEFAULT = 5;

// kind: 'lead' (days before the date), 'lookback' (days back that are still checked) or 'info' (always visible).
const CATALOG = [
  { key: 'obligation_due', label: 'Próximos vencimientos de obligaciones', description: 'Vencimientos de obligaciones a cargo del titular que todavía no se pagaron.', kind: 'lead', defaultDays: 7, scopes: ['asset', 'obligation'] },
  { key: 'obligation_overdue', label: 'Obligaciones vencidas', description: 'Una obligación vencida e impaga se muestra siempre hasta que se paga o se resuelve.', kind: 'info', defaultDays: null, scopes: [] },
  { key: 'partial_payment', label: 'Pagos parciales', description: 'Sigue la anticipación de los próximos vencimientos de obligaciones; vencido, se muestra siempre.', kind: 'info', defaultDays: null, scopes: [] },
  { key: 'tenant_obligation_pending', label: 'Comprobantes pendientes de inquilinos', description: 'Obligaciones a cargo del inquilino que esperan su comprobante de pago.', kind: 'lead', defaultDays: 7, scopes: ['asset', 'obligation'] },
  { key: 'document_pending', label: 'Documentos pendientes', description: 'Pagos de obligaciones sin comprobante adjunto: se revisan los pagos de los últimos días indicados.', kind: 'lookback', defaultDays: 60, scopes: ['asset', 'obligation'] },
  { key: 'rent_due', label: 'Alquileres pendientes de cobro', description: 'Alquileres del mes que todavía no se cobraron.', kind: 'lead', defaultDays: 5, scopes: ['asset'] },
  { key: 'contract_expiry', label: 'Contratos por vencer', description: 'Contratos de alquiler activos que llegan a su fecha de fin.', kind: 'lead', defaultDays: 30, scopes: ['asset'] },
  { key: 'rent_adjustment_due', label: 'Ajustes de alquiler', description: 'Ajustes de alquiler programados que entran en vigencia.', kind: 'lead', defaultDays: 30, scopes: ['asset'] },
  { key: 'cheque_due', label: 'Cheques de alquiler por cobrar', description: 'Cheques recibidos por alquileres que todavía no se marcaron como cobrados.', kind: 'lead', defaultDays: 7, scopes: ['asset'] },
  { key: 'transaction_cheque_due', label: 'Cuotas con cheque por confirmar', description: 'Cuotas pagadas o cobradas con cheque que esperan la confirmación de la imputación.', kind: 'lead', defaultDays: 7, scopes: ['asset', 'account'] },
  { key: 'credit_installment_upcoming', label: 'Próximas cuotas de crédito', description: 'Cuotas de compras con crédito que ingresan en los próximos días.', kind: 'lead', defaultDays: 5, scopes: ['account'] },
  { key: 'card_installment_due', label: 'Cuotas de tarjeta (planes anteriores)', description: 'Cuotas programadas de los planes de tarjeta creados antes de esta versión.', kind: 'lead', defaultDays: 5, scopes: ['asset', 'account'] },
  { key: 'account_forecast', label: 'Saldo insuficiente en cuentas', description: 'Pagos programados que la cuenta no alcanza a cubrir.', kind: 'lead', defaultDays: 5, scopes: ['account'] }
];
const BY_KEY = new Map(CATALOG.map(entry => [entry.key, entry]));

function entryFor(type) {
  return BY_KEY.get(type) || null;
}

function configurable(type) {
  const entry = entryFor(type);
  return Boolean(entry && entry.kind !== 'info');
}

function validDays(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_DAYS;
}

// Defaults seeded from the legacy accountSettings.alertLeadDays (rent and balance alerts used it).
function seededDefaults(db, userId) {
  const legacy = db.findAll('accountSettings', userId)[0]?.alertLeadDays;
  if (!validDays(legacy) || legacy === LEGACY_ALERT_LEAD_DEFAULT) return {};
  return { rent_due: legacy, account_forecast: legacy };
}

function normalize(row) {
  return {
    defaults: row && row.defaults && typeof row.defaults === 'object' ? { ...row.defaults } : {},
    overrides: Array.isArray(row?.overrides) ? row.overrides.map(item => ({ ...item })) : []
  };
}

/**
 * Stored settings of the user. Without a stored row the defaults are seeded from the legacy alertLeadDays;
 * `persist` stores that seed (first read from the settings screen) so later legacy changes no longer apply.
 */
function readSettings(db, userId, { persist = false } = {}) {
  const row = db.findAll(COLLECTION, userId)[0];
  if (row) return { id: row.id, ...normalize(row) };
  const seeded = { defaults: seededDefaults(db, userId), overrides: [] };
  if (!persist) return seeded;
  const created = db.create(COLLECTION, seeded, userId);
  return { id: created.id, ...normalize(created) };
}

/** Pure resolution: obligation override > asset override > account override > user default > catalog default. */
function resolveLeadDays(settings, type, { assetId = null, obligationId = null, accountId = null } = {}) {
  const entry = entryFor(type);
  if (!entry || entry.kind === 'info') return null;
  const overrides = (settings?.overrides || []).filter(item => item.type === type && entry.scopes.includes(item.scope) && validDays(item.days));
  const match = (scope, targetId) => (targetId ? overrides.find(item => item.scope === scope && item.targetId === targetId) : null);
  const override = match('obligation', obligationId) || match('asset', assetId) || match('account', accountId);
  if (override) return override.days;
  const userDefault = settings?.defaults?.[type];
  return validDays(userDefault) ? userDefault : entry.defaultDays;
}

/** Largest lead a type can resolve to (used to fetch candidates once, then filter per target). */
function maxLeadDays(settings, type) {
  const entry = entryFor(type);
  if (!entry || entry.kind === 'info') return 0;
  const values = [resolveLeadDays(settings, type), ...(settings?.overrides || []).filter(item => item.type === type && entry.scopes.includes(item.scope) && validDays(item.days)).map(item => item.days)];
  return Math.max(...values);
}

/** Resolver bound to the user's settings: `leadDaysFor(type, { assetId, obligationId, accountId })`. */
function resolver(db, userId) {
  const settings = readSettings(db, userId);
  const leadDaysFor = (type, context) => resolveLeadDays(settings, type, context);
  leadDaysFor.max = type => maxLeadDays(settings, type);
  leadDaysFor.settings = settings;
  return leadDaysFor;
}

function leadDaysFor(db, userId, type, context) {
  return resolveLeadDays(readSettings(db, userId), type, context);
}

const TARGETS = {
  asset: (db, userId, id) => db.findById('assets', id, userId),
  obligation: (db, userId, id) => db.findById('obligations', id, userId),
  account: (db, userId, id) => db.findById('accounts', id, userId)
};

/** Validates a PUT body ({ defaults, overrides }); returns { settings } or { error }. */
function validateSettings(db, userId, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'La configuración de avisos no es válida' };
  const defaults = {};
  if (input.defaults !== undefined) {
    if (!input.defaults || typeof input.defaults !== 'object' || Array.isArray(input.defaults)) return { error: 'Las anticipaciones por tipo no son válidas' };
    for (const [type, days] of Object.entries(input.defaults)) {
      if (!configurable(type)) return { error: 'El tipo de aviso no es válido' };
      if (!validDays(days)) return { error: 'Los días deben ser un número entero entre 0 y 365' };
      defaults[type] = days;
    }
  }
  const overrides = [];
  if (input.overrides !== undefined) {
    if (!Array.isArray(input.overrides) || input.overrides.length > 500) return { error: 'Las excepciones no son válidas' };
    const seen = new Map();
    for (const item of input.overrides) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: 'Las excepciones no son válidas' };
      const entry = entryFor(item.type);
      if (!entry || entry.kind === 'info') return { error: 'El tipo de aviso no es válido' };
      if (!SCOPES.includes(item.scope) || !entry.scopes.includes(item.scope)) return { error: 'El alcance no está permitido para este tipo de aviso' };
      if (typeof item.targetId !== 'string' || !TARGETS[item.scope](db, userId, item.targetId)) return { error: 'El elemento de la excepción no existe' };
      if (!validDays(item.days)) return { error: 'Los días deben ser un número entero entre 0 y 365' };
      const key = `${item.type}:${item.scope}:${item.targetId}`;
      const record = { id: key, type: item.type, scope: item.scope, targetId: item.targetId, days: item.days };
      if (seen.has(key)) overrides[seen.get(key)] = record;
      else { seen.set(key, overrides.length); overrides.push(record); }
    }
  }
  return { settings: { defaults, overrides } };
}

function saveSettings(db, userId, settings) {
  const current = readSettings(db, userId, { persist: true });
  const updated = db.update(COLLECTION, current.id, { defaults: settings.defaults, overrides: settings.overrides }, userId);
  return { id: updated.id, ...normalize(updated) };
}

/** Payload of GET /api/alerts/settings: catalog, stored settings and the names for the override pickers. */
function describe(db, userId) {
  const settings = readSettings(db, userId, { persist: true });
  const name = (scope, id) => {
    const target = TARGETS[scope](db, userId, id);
    if (!target) return null;
    return scope === 'obligation' ? target.title : scope === 'account' ? (target.nombre || target.name) : target.name;
  };
  return {
    catalog: CATALOG.map(entry => ({ ...entry, scopes: [...entry.scopes], days: entry.kind === 'info' ? null : resolveLeadDays(settings, entry.key) })),
    settings: {
      defaults: settings.defaults,
      overrides: settings.overrides.map(item => ({ ...item, targetName: name(item.scope, item.targetId) || 'Elemento eliminado' }))
    },
    targets: {
      asset: db.findAll('assets', userId).map(item => ({ id: item.id, name: item.name })),
      obligation: db.findAll('obligations', userId).filter(item => item.status !== 'deleted').map(item => ({ id: item.id, name: item.title, assetId: item.assetId || null })),
      account: db.findAll('accounts', userId).filter(item => item.activo !== false).map(item => ({ id: item.id, name: item.nombre || item.name }))
    }
  };
}

module.exports = {
  COLLECTION, CATALOG, SCOPES, MAX_DAYS, entryFor, configurable, readSettings, resolveLeadDays, maxLeadDays, resolver,
  leadDaysFor, validateSettings, saveSettings, describe
};
