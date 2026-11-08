const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ledger = require('../services/account-ledger');

const router = express.Router();
router.use(requireAuth);

router.post('/migration/rollback', (req, res) => {
  const result = ledger.rollbackSetup(req.app.locals.db, req.session.userId);
  if (result.error) return res.status(409).json({ error: result.error });
  res.json({ ok: true, backupId: result.backup.id, state: result.backup.state });
});

router.post('/migration/reapply', (req, res) => {
  const db = req.app.locals.db;
  const result = ledger.reapplySetup(db, req.session.userId);
  if (result.error) return res.status(409).json({ error: result.error });
  res.json({ ok: true, settings: result.settings, accounts: ledger.getAccountBalances(db, req.session.userId), backupId: result.backup.id });
});

router.get('/setup', (req, res) => {
  const db = req.app.locals.db;
  const result = ledger.ensureSetup(db, req.session.userId);
  const balances = ledger.getAccountBalances(db, req.session.userId);
  res.json({ settings: result.settings, accounts: balances, migration: { reversible: true, state: result.backup.state || 'active', backupId: result.backup.id, transactionCount: result.backup.transactionCount, checksum: result.backup.checksum } });
});

router.get('/settings', (req, res) => {
  const result = ledger.ensureSetup(req.app.locals.db, req.session.userId);
  res.json(result.settings);
});

router.patch('/settings', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  ledger.ensureSetup(db, userId);
  const current = ledger.getSettings(db, userId);
  const updates = {};
  const { appCurrency, locale, timezone, alertLeadDays, forecastHorizonDays, dailyReview } = req.body;
  if (appCurrency !== undefined) {
    if (!ledger.CURRENCIES.has(appCurrency)) return res.status(400).json({ error: 'Moneda principal no válida' });
    updates.appCurrency = appCurrency;
  }
  if (locale !== undefined) {
    if (typeof locale !== 'string' || locale.length > 20) return res.status(400).json({ error: 'Configuración regional no válida' });
    try { new Intl.NumberFormat(locale); }
    catch { return res.status(400).json({ error: 'Configuración regional no válida' }); }
    updates.locale = locale;
  }
  if (timezone !== undefined) {
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }); }
    catch { return res.status(400).json({ error: 'Zona horaria no válida' }); }
    updates.timezone = timezone;
  }
  if (alertLeadDays !== undefined) {
    if (!Number.isInteger(alertLeadDays) || alertLeadDays < 0 || alertLeadDays > 30) return res.status(400).json({ error: 'El aviso anticipado debe estar entre 0 y 30 días' });
    updates.alertLeadDays = alertLeadDays;
  }
  if (forecastHorizonDays !== undefined) {
    if (!Number.isInteger(forecastHorizonDays) || forecastHorizonDays < 1 || forecastHorizonDays > 365) return res.status(400).json({ error: 'El horizonte debe estar entre 1 y 365 días' });
    updates.forecastHorizonDays = forecastHorizonDays;
  }
  if (dailyReview !== undefined) {
    if (typeof dailyReview !== 'boolean') return res.status(400).json({ error: 'La revisión diaria debe ser verdadera o falsa' });
    updates.dailyReview = dailyReview;
  }
  const updated = db.update('accountSettings', current.id, updates, userId);
  ledger.refreshAlerts(db, userId);
  res.json(updated);
});

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  ledger.ensureSetup(db, userId);
  ledger.refreshAlerts(db, userId);
  res.json(ledger.getAccountBalances(db, userId));
});

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  ledger.ensureSetup(db, userId);
  const { name, nombre, primary, order, presentation } = req.body;
  const currency = req.body.currency || ledger.getSettings(db, userId).appCurrency || 'EUR';
  const accountName = (name || nombre || '').trim();
  if (!accountName || accountName.length > 80) return res.status(400).json({ error: 'El nombre debe tener entre 1 y 80 caracteres' });
  if (!ledger.CURRENCIES.has(currency)) return res.status(400).json({ error: 'Moneda no válida' });
  if (primary && db.findAll('accounts', userId).some(account => account.primary && account.activo)) return res.status(409).json({ error: 'Ya existe una cuenta principal activa' });
  const account = db.create('accounts', {
    nombre: accountName, currency, primary: primary === true, legacyPrimary: false,
    activo: true, archivedAt: null, order: Number.isInteger(order) ? order : db.findAll('accounts', userId).length,
    presentation: presentation || 'default', openingBalanceMinor: null, openingDate: null,
    reconciled: false, includedMovementIds: []
  }, userId);
  res.status(201).json({ ...account, balance: null, balanceMinor: null, balanceStatus: 'needs_reconciliation' });
});

router.patch('/order', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { orderedIds } = req.body;
  const accounts = ledger.accountsForUser(db, userId);
  if (!Array.isArray(orderedIds) || orderedIds.length !== accounts.length || new Set(orderedIds).size !== accounts.length || accounts.some(item => !orderedIds.includes(item.id))) return res.status(400).json({ error: 'El orden debe incluir todas las cuentas una sola vez' });
  const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
  const updated = accounts.map(account => ({ ...account, order: orderMap.get(account.id) }));
  db.replace('accounts', userId, updated);
  res.json(updated);
});

router.get('/alerts', (req, res) => {
  const alerts = ledger.refreshAlerts(req.app.locals.db, req.session.userId);
  res.json(alerts);
});

router.get('/:id/forecast', (req, res) => {
  const db = req.app.locals.db;
  const account = db.findById('accounts', req.params.id, req.session.userId);
  if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
  res.json(ledger.forecastAccount(db, req.session.userId, account));
});

router.post('/:id/reconcile', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const account = db.findById('accounts', req.params.id, userId);
  if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
  const { openingBalance, openingDate, includedMovementIds = [] } = req.body;
  const openingBalanceMinor = ledger.toMinorUnits(openingBalance, account.currency);
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(openingDate || '') ? new Date(`${openingDate}T00:00:00Z`) : null;
  if (openingBalanceMinor === null || !parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== openingDate || openingDate > ledger.localDateForUser(db, userId)) return res.status(400).json({ error: 'Indicá saldo de apertura y una fecha de referencia válida que no sea futura' });
  if (!Array.isArray(includedMovementIds) || new Set(includedMovementIds).size !== includedMovementIds.length) return res.status(400).json({ error: 'Los movimientos incluidos deben ser únicos' });
  const transactions = db.findAll('transactions', userId);
  const validIds = new Set(transactions.filter(tx => ledger.accountForMovement(db, userId, tx)?.id === account.id && tx.fecha < openingDate).map(tx => tx.id));
  if (includedMovementIds.some(id => !validIds.has(id))) return res.status(400).json({ error: 'Solo se pueden conciliar movimientos de esta cuenta anteriores a la fecha de apertura' });
  const updated = db.update('accounts', account.id, {
    openingBalanceMinor, openingDate, includedMovementIds,
    reconciled: true, reconciledAt: new Date().toISOString(),
    reconciliationEvidence: { importedMovementCount: includedMovementIds.length, referenceDate: openingDate }
  }, userId);
  ledger.refreshAlerts(db, userId);
  res.json(ledger.getAccountBalances(db, userId).find(item => item.id === updated.id));
});

router.get('/:id/reconciliation', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const account = db.findById('accounts', req.params.id, userId);
  if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
  const movements = db.findAll('transactions', userId)
    .filter(tx => ledger.accountForMovement(db, userId, tx)?.id === account.id)
    .map(tx => ({ id: tx.id, title: tx.titulo, type: tx.tipo, amount: tx.monto, currency: tx.currencyCode || account.currency, date: tx.fecha, accountId: account.id }));
  res.json({ accountId: account.id, currency: account.currency, movements });
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const account = db.findById('accounts', req.params.id, userId);
  if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
  const { name, nombre, currency, primary, presentation } = req.body;
  const updates = {};
  const accountName = name === undefined && nombre === undefined ? undefined : (name || nombre).trim();
  if (accountName !== undefined) {
    if (!accountName || accountName.length > 80) return res.status(400).json({ error: 'El nombre debe tener entre 1 y 80 caracteres' });
    updates.nombre = accountName;
  }
  if (currency !== undefined && currency !== account.currency) {
    if (!ledger.CURRENCIES.has(currency)) return res.status(400).json({ error: 'Moneda no válida' });
    if (ledger.hasMovement(db, userId, account.id) || account.reconciled || account.openingBalanceMinor !== null) return res.status(409).json({ error: 'La moneda no se puede cambiar después de registrar movimientos o conciliar un saldo de apertura' });
    updates.currency = currency;
  }
  if (primary === true && !account.primary) {
    if (!account.activo) return res.status(409).json({ error: 'Una cuenta archivada no puede ser principal' });
    const accounts = ledger.accountsForUser(db, userId);
    db.replace('accounts', userId, accounts.map(item => ({ ...item, primary: item.id === account.id })));
  } else if (primary === false && account.primary) {
    return res.status(409).json({ error: 'Debe existir exactamente una cuenta principal activa' });
  }
  if (presentation !== undefined) updates.presentation = ['default', 'compact', 'color'].includes(presentation) ? presentation : account.presentation;
  const updated = db.update('accounts', account.id, updates, userId);
  ledger.refreshAlerts(db, userId);
  res.json({ ...updated, ...ledger.getAccountBalances(db, userId).find(item => item.id === updated.id) });
});

router.post('/:id/archive', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const account = db.findById('accounts', req.params.id, userId);
  if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
  if (account.primary) return res.status(409).json({ error: 'La cuenta principal no se puede archivar' });
  const today = ledger.localDateForUser(db, userId);
  const hasRecurring = db.findAll('transactions', userId).some(tx => ledger.accountForMovement(db, userId, tx)?.id === account.id && tx.recurrente && tx.frecuencia)
    || db.findAll('recurrenceRevisions', userId).some(item => ledger.accountForMovement(db, userId, item.template)?.id === account.id && item.template?.recurrente && item.template?.frecuencia && (!item.effectiveUntilDate || item.effectiveUntilDate >= today));
  const hasScheduled = db.findAll('transfers', userId).some(item => item.status === 'scheduled' && (item.fromAccountId === account.id || item.toAccountId === account.id));
  if (hasRecurring || hasScheduled) return res.status(409).json({ error: 'Resuelve las recurrencias y movimientos programados antes de archivar esta cuenta' });
  const updated = db.update('accounts', account.id, { activo: false, archivedAt: new Date().toISOString() }, userId);
  ledger.refreshAlerts(db, userId);
  res.json({ ...updated, ...ledger.getAccountBalances(db, userId).find(item => item.id === updated.id) });
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const account = db.findById('accounts', req.params.id, userId);
  if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });
  if (account.primary || ledger.hasMovement(db, userId, account.id)) return res.status(409).json({ error: 'Solo se pueden eliminar físicamente cuentas no principales y sin movimientos' });
  db.remove('accounts', account.id, userId);
  res.json({ ok: true });
});

module.exports = router;
