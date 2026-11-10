function formatearEuro(cantidad) {
  const currency = localStorage.getItem('pate_app_currency') || 'ARS';
  return formatearMoneda(cantidad, currency);
}

function formatearMoneda(cantidad, currency = 'ARS', locale = null) {
  const language = locale || localStorage.getItem('pate_locale') || 'es-AR';
  try {
    const zeroDecimalCurrencies = ['JPY', 'KRW', 'CLP', 'PYG', 'BIF', 'DJF', 'GNF', 'KMF', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];
    return new Intl.NumberFormat(language, { style: 'currency', currency, maximumFractionDigits: zeroDecimalCurrencies.includes(currency) ? 0 : 2 }).format(cantidad);
  } catch {
    return `${currency} ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(cantidad)}`;
  }
}

// Formats an amount as "<CODE> <number>", e.g. "EUR 2.500,00". Used where
// several currencies are shown together and a symbol would be ambiguous.
function formatearMonedaConCodigo(cantidad, currency = 'ARS', locale = null) {
  const language = locale || localStorage.getItem('pate_locale') || 'es-AR';
  const zeroDecimalCurrencies = ['JPY', 'KRW', 'CLP', 'PYG', 'BIF', 'DJF', 'GNF', 'KMF', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];
  const digits = zeroDecimalCurrencies.includes(currency) ? 0 : 2;
  try {
    const amount = new Intl.NumberFormat(language, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(cantidad);
    return `${currency} ${amount}`;
  } catch {
    return `${currency} ${cantidad}`;
  }
}

function parseFecha(fechaStr) {
  const [year, month, day] = fechaStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatFechaLarga(fechaStr) {
  const date = parseFecha(fechaStr);
  return date.toLocaleDateString(localStorage.getItem('pate_locale') || 'es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

function formatFechaCorta(fechaStr) {
  const date = parseFecha(fechaStr);
  return date.toLocaleDateString(localStorage.getItem('pate_locale') || 'es-ES', {
    day: 'numeric',
    month: 'short'
  });
}

function formatMonth(monthStr) {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  const raw = date.toLocaleDateString(localStorage.getItem('pate_locale') || 'es-ES', { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatMonthLabel(monthStr) {
  const [year, month] = monthStr.split('-');
  const rawMonth = new Date(parseInt(year), parseInt(month) - 1)
    .toLocaleDateString(localStorage.getItem('pate_locale') || 'es-ES', { month: 'long' });
  const monthLabel = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);
  return `${monthLabel} ${year}`;
}

function getCurrentMonth() {
  return getToday().slice(0, 7);
}

function getToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: localStorage.getItem('pate_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// "dd/mm/aaaa hh:mm" in the user's timezone (24 hours).
function formatLogDateTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: localStorage.getItem('pate_timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone,
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

function addMonths(monthStr, delta) {
  const [year, month] = monthStr.split('-').map(Number);
  const date = new Date(year, month - 1 + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function groupTransactionsByDate(transactions) {
  const groups = {};
  transactions.forEach(t => {
    if (!groups[t.fecha]) groups[t.fecha] = [];
    groups[t.fecha].push(t);
  });
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([fecha, items]) => ({ fecha, items }));
}

const ZERO_DECIMAL_CURRENCIES = ['JPY', 'KRW', 'CLP', 'PYG', 'BIF', 'DJF', 'GNF', 'KMF', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];

// Number of fraction digits used for a currency (0 for zero-decimal currencies).
function currencyDigits(code) {
  return ZERO_DECIMAL_CURRENCIES.includes(String(code || '').toUpperCase()) ? 0 : 2;
}

const STATUS_LABELS = {
  pending: 'Pendiente',
  overdue: 'Vencido',
  partially_collected: 'Parcial',
  partial: 'Parcial',
  collected: 'Cobrado',
  paid: 'Pagado',
  resolved: 'Resuelto',
  cancelled: 'Cancelado',
  expected: 'Esperado',
  confirmed: 'Confirmado',
  posted: 'Contabilizado',
  active: 'Activo',
  ended: 'Finalizado',
  draft: 'Borrador',
  expiring: 'Por vencer',
  scheduled: 'Programado',
  reversed: 'Anulado'
};

// Spanish label for a status code. Unknown or empty values never leak the raw code.
function statusLabel(status) {
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, status) ? STATUS_LABELS[status] : 'Sin estado';
}

// Spanish label for a rental modality code ("" when absent, never the raw code).
const MODALITY_LABELS = { locacion: 'Locación', comodato: 'Comodato', mutuo: 'Mutuo' };
function modalityLabel(modality) {
  return Object.prototype.hasOwnProperty.call(MODALITY_LABELS, modality) ? MODALITY_LABELS[modality] : '';
}

// Total of a net amount plus an IVA percentage, rounded to the currency precision.
function totalWithIva(amount, ivaPercent, currency = 'ARS') {
  const net = Number(amount);
  if (!Number.isFinite(net)) return null;
  const factor = 10 ** currencyDigits(currency);
  return Math.round(net * (100 + (Number(ivaPercent) || 0)) / 100 * factor) / factor;
}

// Orders accounts parent first, then its children. Returns [{ account, label, depth }];
// top-level labels are unchanged and children are prefixed with an arrow.
function orderAccountsAsTree(accounts, labelFn = account => account.name) {
  const list = accounts || [];
  const ids = new Set(list.map(account => account.id));
  const childrenOf = new Map();
  const roots = [];
  list.forEach(account => {
    if (account.parentId && ids.has(account.parentId)) {
      if (!childrenOf.has(account.parentId)) childrenOf.set(account.parentId, []);
      childrenOf.get(account.parentId).push(account);
    } else {
      roots.push(account);
    }
  });
  const result = [];
  roots.forEach(root => {
    result.push({ account: root, label: labelFn(root), depth: 0 });
    (childrenOf.get(root.id) || []).forEach(child => {
      result.push({ account: child, label: `↳ ${labelFn(child)}`, depth: 1 });
    });
  });
  return result;
}

// Account options as a tree: parent, then its sub-accounts prefixed with an arrow; every label shows the currency.
function accountTreeOptions(accounts) {
  return orderAccountsAsTree(accounts, account => `${account.nombre || account.name} (${account.currency})`);
}
