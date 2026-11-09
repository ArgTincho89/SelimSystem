const { generateRecurringInstances, addDaysDateOnly, dateOnlyDaysBetween } = require('../utils/recurring');

const CURRENCIES = new Set(['EUR', 'USD', 'ARS', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'BRL', 'CLP', 'MXN', 'CNY', 'UYU', 'PYG', 'COP', 'PEN', 'BOB', 'CRC', 'DOP', 'PLN', 'SEK', 'NOK', 'DKK', 'NZD', 'INR', 'ZAR', 'KRW']);
const SELECTABLE_CURRENCIES = new Set(['ARS', 'EUR', 'USD']);
const FREQUENCIES = new Set(['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual']);
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'CLP', 'PYG', 'BIF', 'DJF', 'GNF', 'KMF', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);

function currencyPrecision(currency) {
  return ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toMinorUnits(amount, currency) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null;
  const precision = currencyPrecision(currency);
  const match = String(amount).match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match) return null;
  const negative = match[1] === '-';
  const integer = match[2];
  const fraction = match[3] || '';
  const exponent = Number(match[4] || 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) return null;
  const digits = `${integer}${fraction}`.replace(/^0+(?=\d)/, '');
  const shift = exponent - fraction.length + precision;
  let minor = BigInt(digits || '0');
  if (shift >= 0) minor *= 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    const remainder = minor % divisor;
    minor /= divisor;
    if (remainder * 2n >= divisor) minor += 1n;
  }
  if (negative) minor = -minor;
  const result = Number(minor);
  return Number.isSafeInteger(result) ? result : null;
}

function mulDivFloor(left, right, divisor) {
  return Number((BigInt(left) * BigInt(right)) / BigInt(divisor));
}

function mulDivRound(left, right, divisor) {
  const product = BigInt(left) * BigInt(right);
  const denominator = BigInt(divisor);
  return Number((product + denominator / 2n) / denominator);
}

function fromMinorUnits(amount, currency) {
  return amount / (10 ** currencyPrecision(currency));
}

function moneyInput(amount, currency, allowZero = false) {
  const minor = toMinorUnits(amount, currency);
  if (minor === null || minor < (allowZero ? 0 : 1)) return null;
  return minor;
}

function getSettings(db, userId, initialize = true) {
  let settings = db.findAll('accountSettings', userId)[0] || null;
  if (!settings && initialize) {
    settings = db.create('accountSettings', {
      appCurrency: 'ARS', locale: 'es-AR', timezone: 'Europe/Madrid',
      alertLeadDays: 5, forecastHorizonDays: 30, dailyReview: true
    }, userId);
  }
  return settings;
}

function localDateForUser(db, userId, now = new Date()) {
  const timezone = getSettings(db, userId, false)?.timezone || 'Europe/Madrid';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getLegacyAccount(db, userId, initialize = true) {
  const accounts = db.findAll('accounts', userId);
  let legacyAccount = accounts.find(account => account.legacyPrimary) || null;
  if (!legacyAccount && initialize) {
    const now = new Date().toISOString();
    legacyAccount = db.create('accounts', {
      nombre: 'Cuenta principal', currency: 'ARS', primary: true, legacyPrimary: true,
      activo: true, archivedAt: null, order: 0, openingBalanceMinor: null,
      openingDate: null, reconciled: false, presentation: 'default', createdAt: now
    }, userId);
    const settings = getSettings(db, userId);
    db.update('accountSettings', settings.id, { legacyAccountId: legacyAccount.id }, userId);
  }
  return legacyAccount;
}

function ensureSetup(db, userId) {
  let existing = db.findAll('migrationBackups', userId).find(item => item.id === 'account-configuration-v1');
  if (!existing) {
    const backup = {
      id: 'account-configuration-v1', createdAt: new Date().toISOString(),
      version: 1,
      state: 'active',
      collections: {
        transactions: db.findAll('transactions', userId),
        categories: db.findAll('categories', userId),
        goals: db.findAll('goals', userId)
      },
      transactionCount: db.findAll('transactions', userId).length,
      checksum: null
    };
    const crypto = require('crypto');
    backup.checksum = crypto.createHash('sha256').update(JSON.stringify(backup.collections)).digest('hex');
    db.create('migrationBackups', backup, userId);
    existing = backup;
  }
  const crypto = require('crypto');
  const actualChecksum = crypto.createHash('sha256').update(JSON.stringify(existing.collections)).digest('hex');
  if (actualChecksum !== existing.checksum || existing.transactionCount !== existing.collections.transactions.length) {
    throw new Error('La copia de seguridad de migración no supera la validación; no se aplicaron cambios de cuentas');
  }
  if (existing.state === 'rolled_back' || existing.state === 'rolling_back') throw new Error('La configuración de cuentas fue revertida; reaplicala desde Configuración para continuar');
  const legacyAccount = getLegacyAccount(db, userId, true);
  const settings = getSettings(db, userId, true);
  if (!settings.legacyAccountId) db.update('accountSettings', settings.id, { legacyAccountId: legacyAccount.id }, userId);
  return { settings: getSettings(db, userId), accounts: db.findAll('accounts', userId), backup: existing };
}

function rollbackSetup(db, userId) {
  const backup = db.findById('migrationBackups', 'account-configuration-v1', userId);
  if (!backup || backup.transactionCount !== backup.collections?.transactions?.length) return { error: 'No hay una copia de seguridad validada para revertir' };
  const crypto = require('crypto');
  const checksum = crypto.createHash('sha256').update(JSON.stringify(backup.collections)).digest('hex');
  if (checksum !== backup.checksum) return { error: 'La copia de seguridad no supera la validación; no se modificó información' };
  if (backup.state === 'rolled_back') return { backup, rolledBack: true };
  if (backup.state !== 'rolling_back') {
    const accounts = db.findAll('accounts', userId);
    const settings = db.findAll('accountSettings', userId);
    const featureCollections = ['transfers', 'recurringOccurrences', 'recurrenceRevisions', 'accountAlerts'];
    if (accounts.length !== 1 || settings.length !== 1 || featureCollections.some(name => db.findAll(name, userId).length > 0)) {
      return { error: 'No se puede revertir: la configuración ya tiene cuentas, transferencias, ocurrencias o avisos en uso' };
    }
    const account = accounts[0];
    const preferences = settings[0];
    if (!account.legacyPrimary || !account.primary || !account.activo || account.nombre !== 'Cuenta principal' || !['EUR', 'ARS'].includes(account.currency) || preferences.appCurrency !== account.currency || account.presentation !== 'default' || account.order !== 0 || account.reconciled || account.openingBalanceMinor !== null ||
        preferences.legacyAccountId !== account.id ||
        preferences.locale !== 'es-AR' || preferences.timezone !== 'Europe/Madrid' ||
        preferences.alertLeadDays !== 5 || preferences.forecastHorizonDays !== 30 || preferences.dailyReview !== true) {
      return { error: 'No se puede revertir: hay preferencias o conciliaciones personalizadas que primero deben resolverse' };
    }
    const transactions = db.findAll('transactions', userId);
    if (transactions.some(tx => tx.accountId || tx.currencyCode || tx.amountMinor !== undefined)) {
      return { error: 'No se puede revertir: hay movimientos vinculados a cuentas; los registros originales se conservaron' };
    }
    db.update('migrationBackups', backup.id, { state: 'rolling_back', rollbackStartedAt: new Date().toISOString() }, userId);
  }
  db.replace('accounts', userId, []);
  db.findAll('accountSettings', userId).forEach(item => db.remove('accountSettings', item.id, userId));
  const updated = db.update('migrationBackups', backup.id, { state: 'rolled_back', rolledBackAt: new Date().toISOString() }, userId);
  return { backup: updated, rolledBack: true };
}

function reapplySetup(db, userId) {
  const backup = db.findById('migrationBackups', 'account-configuration-v1', userId);
  if (!backup) return { error: 'No hay una copia de seguridad validada para reaplicar' };
  const crypto = require('crypto');
  const checksum = crypto.createHash('sha256').update(JSON.stringify(backup.collections)).digest('hex');
  if (checksum !== backup.checksum || backup.transactionCount !== backup.collections?.transactions?.length) return { error: 'La copia de seguridad no supera la validación' };
  if (backup.state !== 'rolled_back') return { error: 'La configuración de cuentas ya está activa' };
  db.update('migrationBackups', backup.id, { state: 'active', reappliedAt: new Date().toISOString() }, userId);
  return ensureSetup(db, userId);
}

function accountsForUser(db, userId, includeArchived = true) {
  return db.findAll('accounts', userId)
    .filter(account => includeArchived || account.activo)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.createdAt.localeCompare(b.createdAt));
}

function accountForMovement(db, userId, movement) {
  const settings = getSettings(db, userId, false);
  const fallbackId = settings?.legacyAccountId || db.findAll('accounts', userId).find(account => account.legacyPrimary)?.id;
  const account = db.findById('accounts', movement.accountId || fallbackId, userId);
  return account || null;
}

function hasMovement(db, userId, accountId) {
  const transactions = db.findAll('transactions', userId);
  if (transactions.some(tx => tx.accountId === accountId || (!tx.accountId && accountForMovement(db, userId, tx)?.id === accountId))) return true;
  if (db.findAll('recurrenceRevisions', userId).some(item => item.template?.accountId === accountId)) return true;
  if (db.findAll('recurringOccurrences', userId).some(item => item.overrides?.accountId === accountId)) return true;
  return db.findAll('transfers', userId).some(item => item.fromAccountId === accountId || item.toAccountId === accountId);
}

function recurringVersions(db, userId, template) {
  const revisions = db.findAll('recurrenceRevisions', userId)
    .filter(item => item.templateId === template.id)
    .map(item => ({
      template: item.template,
      effectiveFromDate: item.effectiveFromDate || item.template.fecha,
      effectiveUntilDate: item.effectiveUntilDate || null
    }));
  const current = {
    template,
    effectiveFromDate: template.effectiveFromDate || template.fecha,
    effectiveUntilDate: null
  };
  return [...revisions, current].sort((a, b) => a.effectiveFromDate.localeCompare(b.effectiveFromDate));
}

function recurringVersionForDate(db, userId, template, date) {
  const versions = recurringVersions(db, userId, template).filter(version =>
    version.effectiveFromDate <= date && (!version.effectiveUntilDate || date <= version.effectiveUntilDate)
  );
  return versions.length ? versions[versions.length - 1].template : null;
}

function postedDate(movement) {
  return movement.postedAt || movement.fecha || movement.date;
}

function getAccountBalances(db, userId, atDate = localDateForUser(db, userId)) {
  const accounts = accountsForUser(db, userId);
  const transactions = db.findAll('transactions', userId);
  const transfers = db.findAll('transfers', userId);
  return accounts.map(account => {
    let balanceMinor = account.openingBalanceMinor;
    if (balanceMinor === null || balanceMinor === undefined || !account.reconciled) {
      return { ...account, hasMovement: hasMovement(db, userId, account.id), balanceMinor: null, balance: null, balanceStatus: 'needs_reconciliation' };
    }
    const included = new Set(account.includedMovementIds || []);
    transactions.forEach(tx => {
      const effective = tx.recurrente || db.findAll('recurrenceRevisions', userId).some(item => item.templateId === tx.id)
        ? (recurringVersionForDate(db, userId, tx, tx.fecha) || tx)
        : tx;
      const txAccount = accountForMovement(db, userId, effective);
      if (!txAccount || txAccount.id !== account.id || included.has(tx.id) || !effective.fecha || effective.fecha < account.openingDate || effective.fecha > atDate) return;
      const amount = Number.isSafeInteger(effective.amountMinor) ? effective.amountMinor : (toMinorUnits(effective.monto, effective.currencyCode || account.currency) || 0);
      if (effective.tipo === 'income' || effective.tipo === 'refund') balanceMinor += amount;
      else if (effective.tipo === 'expense') balanceMinor -= amount;
    });
    db.findAll('recurringOccurrences', userId).filter(item => item.status === 'posted' && (item.postedAt || item.date).slice(0, 10) >= account.openingDate && (item.postedAt || item.date).slice(0, 10) <= atDate).forEach(item => {
      const template = transactions.find(tx => tx.id === item.templateId);
      if (!template) return;
      const scheduledVersion = recurringVersionForDate(db, userId, template, item.date) || template;
      const effective = { ...scheduledVersion, ...(item.overrides || {}) };
      if (accountForMovement(db, userId, effective)?.id !== account.id) return;
      const amount = Number.isSafeInteger(item.amountMinor) ? item.amountMinor : (toMinorUnits(effective.monto, account.currency) || 0);
      if (effective.tipo === 'income' || effective.tipo === 'refund') balanceMinor += amount;
      else if (effective.tipo === 'expense') balanceMinor -= amount;
    });
    transfers.forEach(transfer => {
      if (transfer.status !== 'posted' || !postedDate(transfer) || postedDate(transfer) > atDate) return;
      if (transfer.fromAccountId === account.id) balanceMinor -= transfer.sentMinor + (transfer.feeMinor || 0);
      if (transfer.toAccountId === account.id) balanceMinor += transfer.receivedMinor;
    });
    return { ...account, hasMovement: hasMovement(db, userId, account.id), balanceMinor, balance: fromMinorUnits(balanceMinor, account.currency), balanceStatus: 'verified' };
  });
}

function createTransferRecord(db, userId, input, accounts) {
  const source = db.findById('accounts', input.fromAccountId, userId);
  const destination = db.findById('accounts', input.toAccountId, userId);
  if (!source || !destination || source.id === destination.id || !source.activo || !destination.activo) return { error: 'Seleccioná dos cuentas activas distintas' };
  if (!isValidDate(input.fecha)) return { error: 'La fecha debe tener formato YYYY-MM-DD' };
  const status = input.status || 'posted';
  if (!['posted', 'scheduled'].includes(status)) return { error: 'Estado de transferencia inválido' };
  if (status === 'posted' && input.fecha > localDateForUser(db, userId)) return { error: 'Una transferencia futura debe quedar programada hasta su contabilización' };
  const sentMinor = moneyInput(input.sentAmount, source.currency);
  const receivedAmount = input.receivedAmount === undefined && source.currency === destination.currency ? input.sentAmount : input.receivedAmount;
  const receivedMinor = moneyInput(receivedAmount, destination.currency);
  if (sentMinor === null || receivedMinor === null) return { error: 'Los importes deben ser positivos y válidos para cada moneda' };
  if (source.currency === destination.currency && sentMinor !== receivedMinor) return { error: 'Entre cuentas de la misma moneda, los importes deben coincidir' };
  if (source.currency !== destination.currency && input.receivedAmount === undefined) return { error: 'Indicá el importe real recibido para una conversión' };
  const feeMinor = input.feeAmount === undefined || input.feeAmount === null ? 0 : toMinorUnits(input.feeAmount, source.currency);
  if (feeMinor === null) return { error: 'La comisión debe ser un importe positivo válido' };
  const record = {
    type: 'transfer', fromAccountId: source.id, toAccountId: destination.id,
    fromCurrency: source.currency, toCurrency: destination.currency,
    sentMinor, receivedMinor, feeMinor, feeCategoryId: input.feeCategoryId || null,
    fecha: input.fecha, status, postedAt: status === 'posted' ? (input.postedAt || input.fecha) : null,
    reference: input.reference || '', normalizationAllocations: [],
    pendingAllocations: status === 'scheduled' ? (input.allocations || []) : [],
    rateNumerator: receivedMinor, rateDenominator: sentMinor,
    rateDirection: `${source.currency}->${destination.currency}`
  };
  if (feeMinor && (!record.feeCategoryId || !db.findById('categories', record.feeCategoryId, userId))) return { error: 'La comisión requiere una categoría válida' };
  if (status === 'posted' && input.allocations !== undefined) {
    const allocationResult = validateAllocations(db, userId, record, input.allocations, input.id);
    if (allocationResult.error) return allocationResult;
    record.normalizationAllocations = allocationResult.allocations;
  }
  if (input.allocations !== undefined && !Array.isArray(input.allocations)) return { error: 'Las asignaciones deben ser una lista' };
  return { record, accounts };
}

function validateAllocations(db, userId, transfer, allocations, ignoreTransferId) {
  if (!Array.isArray(allocations)) return { error: 'Las asignaciones deben ser una lista' };
  const allTransfers = db.findAll('transfers', userId).filter(item => item.id !== ignoreTransferId);
  const transactions = db.findAll('transactions', userId);
  const normalized = [];
  const pendingSourceAmounts = new Map();
  const pendingLineageAmounts = new Map();
  let allocatedSource = 0;
  allocations.forEach(allocation => {
    const sourceMinor = moneyInput(allocation.amount, transfer.fromCurrency);
    if (!sourceMinor || sourceMinor < 1) return;
    const sourceType = allocation.sourceType || 'income';
    let sourceId = allocation.sourceId || allocation.incomeId;
    let originalIncomeId = allocation.originalIncomeId || null;
    let sourceDate = null;
    let lineage = [];
    if (sourceType === 'income') {
      const income = transactions.find(tx => tx.id === sourceId && tx.tipo === 'income');
      if (!income || accountForMovement(db, userId, income)?.currency !== transfer.fromCurrency) return;
      sourceDate = income.fecha;
      originalIncomeId = income.id;
      lineage = [{ originalIncomeId: income.id, sourceMinor }];
      const already = allTransfers.flatMap(item => item.normalizationAllocations || [])
        .filter(item => item.sourceType === 'income' && item.sourceId === income.id)
        .reduce((sum, item) => sum + item.sourceMinor, 0);
      const key = `${sourceType}:${income.id}`;
      const pending = pendingSourceAmounts.get(key) || 0;
      if (already + pending + sourceMinor > toMinorUnits(income.monto, transfer.fromCurrency)) return;
      pendingSourceAmounts.set(key, pending + sourceMinor);
    } else if (sourceType === 'transfer') {
      const prior = allTransfers.find(item => item.id === sourceId && item.status === 'posted');
      if (!prior || prior.toAccountId !== transfer.fromAccountId) return;
      sourceDate = prior.fecha;
      originalIncomeId = originalIncomeId || prior.normalizationAllocations?.[0]?.originalIncomeId || null;
      const already = allTransfers.flatMap(item => item.normalizationAllocations || [])
        .filter(item => item.sourceType === 'transfer' && item.sourceId === prior.id)
        .reduce((sum, item) => sum + item.sourceMinor, 0);
      const contributions = new Map();
      prior.normalizationAllocations.forEach(item => {
        const parts = item.lineage?.length
          ? item.lineage
          : item.originalIncomeId ? [{ originalIncomeId: item.originalIncomeId, receivedMinor: item.receivedMinor }] : [];
        parts.forEach(part => contributions.set(part.originalIncomeId, (contributions.get(part.originalIncomeId) || 0) + part.receivedMinor));
      });
      const available = Array.from(contributions.values()).reduce((sum, amount) => sum + amount, 0);
      const key = `${sourceType}:${prior.id}`;
      const pending = pendingSourceAmounts.get(key) || 0;
      if (!available || already + pending + sourceMinor > available) return;
      pendingSourceAmounts.set(key, pending + sourceMinor);
      let remaining = sourceMinor;
      contributions.forEach((contributed, incomeId) => {
        if (!remaining || !incomeId) return;
        const used = allTransfers.flatMap(transferItem => transferItem.normalizationAllocations || [])
          .filter(candidate => candidate.sourceType === 'transfer' && candidate.sourceId === prior.id)
          .reduce((sum, candidate) => sum + (candidate.lineage || []).filter(part => part.originalIncomeId === incomeId).reduce((partSum, part) => partSum + part.sourceMinor, 0), 0);
        const lineageKey = `${prior.id}:${incomeId}`;
        const pendingLineage = pendingLineageAmounts.get(lineageKey) || 0;
        const amount = Math.min(remaining, Math.max(0, contributed - used - pendingLineage));
        if (amount) lineage.push({ originalIncomeId: incomeId, sourceMinor: amount });
        pendingLineageAmounts.set(lineageKey, pendingLineage + amount);
        remaining -= amount;
      });
      if (remaining > 0) return;
    } else return;
    allocatedSource += sourceMinor;
    normalized.push({ sourceType, sourceId, sourceMinor, originalIncomeId, sourceDate, lineage });
  });
  if (normalized.length !== allocations.length) return { error: 'Una asignación no tiene origen disponible, moneda compatible o trazabilidad válida' };
  if (allocatedSource > transfer.sentMinor) return { error: 'No se puede asignar más ingreso que el importe enviado' };
  const allocatedReceived = mulDivRound(transfer.receivedMinor, allocatedSource, transfer.sentMinor);
  let assignedReceived = 0;
  normalized.forEach((allocation, index) => {
    const outputMinor = index === normalized.length - 1
      ? allocatedReceived - assignedReceived
      : mulDivFloor(transfer.receivedMinor, allocation.sourceMinor, transfer.sentMinor);
    allocation.receivedMinor = outputMinor;
    let assignedLineage = 0;
    allocation.lineage.forEach((part, partIndex) => {
      const receivedMinor = partIndex === allocation.lineage.length - 1
        ? outputMinor - assignedLineage
        : mulDivFloor(outputMinor, part.sourceMinor, allocation.sourceMinor);
      part.receivedMinor = receivedMinor;
      assignedLineage += receivedMinor;
    });
    assignedReceived += outputMinor;
  });
  return { allocations: normalized };
}

function incomeByCurrency(db, userId, transactions, month) {
  const transfers = db.findAll('transfers', userId).filter(item => item.status === 'posted');
  const today = localDateForUser(db, userId);
  const monthMovements = getMonthMovements(db, userId, transactions, month).filter(tx =>
    (!tx.isRecurringInstance || tx.occurrenceStatus === 'posted') && (!tx.recurrente || tx.fecha <= today)
  );
  const totals = {};
  const add = (currency, key, amount) => {
    if (!totals[currency]) totals[currency] = { currency, originalIncomeMinor: 0, normalizedIncomeMinor: 0, incomeMinor: 0, expensesMinor: 0, refundsMinor: 0, savingsMinor: 0 };
    totals[currency][key] += amount;
  };
  monthMovements.forEach(tx => {
    if (!tx.fecha?.startsWith(month)) return;
    const account = accountForMovement(db, userId, tx);
    if (!account) return;
    const amount = Number.isSafeInteger(tx.amountMinor) ? tx.amountMinor : (toMinorUnits(tx.monto, tx.currencyCode || account.currency) || 0);
    if (tx.tipo === 'income') add(account.currency, 'originalIncomeMinor', amount);
    if (tx.tipo === 'expense') add(account.currency, 'expensesMinor', amount);
    if (tx.tipo === 'refund') add(account.currency, 'refundsMinor', amount);
  });
  const allocations = [];
  transfers.forEach(transfer => (transfer.normalizationAllocations || []).forEach(allocation => {
    const lineage = allocation.lineage || (allocation.originalIncomeId ? [{ originalIncomeId: allocation.originalIncomeId, sourceMinor: allocation.sourceMinor, receivedMinor: allocation.receivedMinor }] : []);
    lineage.forEach(part => {
      const sourceTx = transactions.find(tx => tx.id === part.originalIncomeId);
      if (!sourceTx || !sourceTx.fecha?.startsWith(month)) return;
      allocations.push({ part, transfer });
    });
  }));
  const sourceReductions = {};
  allocations.forEach(({ part, transfer }) => {
    const sourceCurrency = transfer.fromCurrency;
    const destinationCurrency = transfer.toCurrency;
    sourceReductions[sourceCurrency] = (sourceReductions[sourceCurrency] || 0) - part.sourceMinor;
    add(destinationCurrency, 'normalizedIncomeMinor', part.receivedMinor);
  });
  Object.entries(sourceReductions).forEach(([currency, amount]) => add(currency, 'normalizedIncomeMinor', amount));
  transfers.forEach(transfer => {
    if (transfer.status !== 'posted' || !(transfer.postedAt || transfer.fecha)?.startsWith(month) || !transfer.feeMinor) return;
    add(transfer.fromCurrency, 'expensesMinor', transfer.feeMinor);
  });
  Object.values(totals).forEach(total => {
    total.incomeMinor = total.originalIncomeMinor + total.normalizedIncomeMinor;
    total.savingsMinor = total.incomeMinor - (total.expensesMinor - total.refundsMinor);
  });
  return totals;
}

function forecastAccount(db, userId, account, today = localDateForUser(db, userId)) {
  const balance = getAccountBalances(db, userId, today).find(item => item.id === account.id);
  const currentBalanceMinor = balance?.balanceMinor;
  if (currentBalanceMinor === null || currentBalanceMinor === undefined) return { accountId: account.id, currency: account.currency, reconciled: false, events: [], alerts: [] };
  const settings = getSettings(db, userId, false);
  const horizon = settings?.forecastHorizonDays || 30;
  const lead = settings?.alertLeadDays || 5;
  const endDate = addDaysDateOnly(today, horizon);
  const events = [];
  const transactions = db.findAll('transactions', userId);
  const occurrences = db.findAll('recurringOccurrences', userId);
  transactions.filter(tx => tx.tipo === 'expense' && (tx.recurrente && tx.frecuencia || db.findAll('recurrenceRevisions', userId).some(item => item.templateId === tx.id))).forEach(tx => {
    for (let candidate = today; candidate <= endDate; candidate = addDaysDateOnly(candidate, 1)) {
      const month = candidate.slice(0, 7);
      const scheduledVersion = recurringVersionForDate(db, userId, tx, candidate);
      const occurrence = scheduledVersion ? generateRecurringInstances(scheduledVersion, month)[0] : null;
      const state = occurrences.find(item => item.templateId === tx.id && item.date === candidate);
      const effective = state ? { ...occurrence, ...(state.overrides || {}) } : occurrence;
      if (effective?.fecha === candidate && accountForMovement(db, userId, effective)?.id === account.id && candidate >= today && state?.status !== 'posted' && state?.status !== 'skipped' && (!scheduledVersion.fechaFin || candidate <= scheduledVersion.fechaFin)) {
        events.push({ id: `${tx.id}-${candidate}`, type: 'expense', amountMinor: toMinorUnits(effective.monto, account.currency), date: candidate, title: effective.titulo, sourceId: tx.id, recurring: true });
      }
    }
  });
  db.findAll('transfers', userId).filter(item => item.status === 'scheduled' && item.fecha >= today).forEach(item => {
    if (item.fromAccountId === account.id) events.push({ id: `${item.id}-out`, type: 'expense', amountMinor: item.sentMinor + (item.feeMinor || 0), date: item.fecha, title: item.reference || 'Transferencia planificada', sourceId: item.id, plannedTransfer: true });
    if (item.toAccountId === account.id) events.push({ id: `${item.id}-in`, type: 'income', amountMinor: item.receivedMinor, date: item.fecha, title: item.reference || 'Transferencia planificada', sourceId: item.id, plannedTransfer: true });
  });
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? a.id.localeCompare(b.id) : a.type === 'income' ? -1 : 1));
  let projected = currentBalanceMinor;
  let projectedWithoutTransfers = currentBalanceMinor;
  let minimumMinor = projected;
  const alerts = [];
  const plannedCredits = [];
  events.forEach(event => {
    if (event.type === 'income') {
      projected += event.amountMinor;
      if (event.plannedTransfer) plannedCredits.push({ itemId: event.sourceId, date: event.date, title: event.title, amountMinor: event.amountMinor });
      else projectedWithoutTransfers += event.amountMinor;
    } else {
      projected -= event.amountMinor;
      projectedWithoutTransfers -= event.amountMinor;
    }
    minimumMinor = Math.min(minimumMinor, projected);
    const daysAway = dateOnlyDaysBetween(today, event.date);
    if (event.type === 'expense' && daysAway <= lead && projectedWithoutTransfers < 0) {
      const covered = projected >= 0;
      alerts.push({
        id: `${account.id}:${event.id}`, accountId: account.id, currency: account.currency,
        date: event.date, title: event.title,
        neededMinor: covered ? -projectedWithoutTransfers : -projected,
        plannedTransfer: plannedCredits.length > 0,
        coverageTransfers: plannedCredits,
        itemId: event.sourceId, status: covered ? 'covered' : 'open'
      });
    }
  });
  return { accountId: account.id, currency: account.currency, reconciled: true, currentBalanceMinor, minimumMinor, minimumAmount: fromMinorUnits(minimumMinor, account.currency), nextPayment: events.find(event => event.type === 'expense') || null, events, alerts, horizonDays: horizon };
}

function getMonthMovements(db, userId, transactions, month) {
  const recurring = db.findAll('recurringOccurrences', userId);
  const monthRows = transactions.filter(transaction => transaction.fecha?.startsWith(month)).map(transaction => {
    if (!transaction.recurrente && !db.findAll('recurrenceRevisions', userId).some(item => item.templateId === transaction.id)) return transaction;
    const template = recurringVersionForDate(db, userId, transaction, transaction.fecha) || transaction;
    return { ...transaction, ...template, id: transaction.id, createdAt: transaction.createdAt };
  });
  const generated = [];
  transactions.filter(transaction => transaction.recurrente || db.findAll('recurrenceRevisions', userId).some(item => item.templateId === transaction.id)).forEach(template => {
    recurringVersions(db, userId, template).forEach(version => {
      if (!version.template.recurrente || !version.template.frecuencia) return;
      const instance = generateRecurringInstances(version.template, month)[0];
      if (!instance || instance.fecha < version.effectiveFromDate || (version.effectiveUntilDate && instance.fecha > version.effectiveUntilDate)) return;
      if (monthRows.some(row => row.id === template.id && row.fecha === instance.fecha)) return;
      generated.push({ ...instance, originalId: template.id, originalDate: template.fecha });
    });
  });
  return [...monthRows, ...generated].map(transaction => {
    if (!transaction.isRecurringInstance) return transaction;
    const template = transactions.find(item => item.id === transaction.originalId);
    const occurrence = recurring.find(item => item.templateId === transaction.originalId && item.date === transaction.fecha);
    const effective = {
      ...transaction,
      originalDate: template?.fecha || transaction.fecha,
      ...(occurrence?.overrides || {}),
      occurrenceStatus: occurrence?.status || 'scheduled',
      occurrenceId: occurrence?.id || null,
      amountMinor: occurrence?.amountMinor ?? transaction.amountMinor,
      isRecurringInstance: true,
      originalId: transaction.originalId,
      fecha: occurrence?.date || transaction.fecha
    };
    if (occurrence?.status === 'posted' && Number.isSafeInteger(occurrence.amountMinor)) effective.monto = fromMinorUnits(occurrence.amountMinor, effective.currencyCode || 'EUR');
    return effective;
  });
}

function refreshAlerts(db, userId, today = localDateForUser(db, userId)) {
  const forecasts = accountsForUser(db, userId, false).map(account => forecastAccount(db, userId, account, today));
  const active = forecasts.flatMap(item => item.alerts);
  const existing = db.findAll('accountAlerts', userId);
  const byId = new Map(existing.map(item => [item.id, item]));
  const activeIds = new Set(active.map(alert => alert.id));
  const next = active.map(alert => ({ ...byId.get(alert.id), ...alert, updatedAt: new Date().toISOString() }));
  existing.filter(item => !active.some(alert => alert.id === item.id) && item.status !== 'resolved').forEach(item => next.push({ ...item, status: 'resolved', resolvedAt: new Date().toISOString() }));
  existing.filter(item => item.status === 'resolved' && !activeIds.has(item.id)).forEach(item => next.push(item));
  db.replace('accountAlerts', userId, next);
  return next.filter(item => item.status === 'open' || item.status === 'covered');
}

function reviewDueAlerts(db, now = new Date()) {
  const users = db.findAll('users');
  users.forEach(user => {
    const settings = getSettings(db, user.id, false);
    if (!settings?.dailyReview) return;
    let parts;
    try {
      parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: settings.timezone || 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
    } catch { return; }
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    if (settings.lastAlertReviewDate === today) return;
    refreshAlerts(db, user.id, today);
    db.update('accountSettings', settings.id, { lastAlertReviewDate: today }, user.id);
  });
}

module.exports = {
  CURRENCIES, SELECTABLE_CURRENCIES, FREQUENCIES, currencyPrecision, toMinorUnits, fromMinorUnits, moneyInput, mulDivFloor, mulDivRound,
  getSettings, getLegacyAccount, ensureSetup, rollbackSetup, reapplySetup, accountsForUser, accountForMovement,
  localDateForUser, hasMovement, getAccountBalances, getMonthMovements, createTransferRecord, validateAllocations,
  incomeByCurrency, forecastAccount, refreshAlerts, reviewDueAlerts
};
