// Payment methods of the transaction form and the two installment flows it offers:
//  - Cheque: N pending transactions (one per cheque), confirmed one by one when each cheque is credited/debited.
//  - Crédito: N posted expenses on the purchase day of each following month, with the total interest split evenly.
const ledger = require('./account-ledger');

const PAYMENT_METHODS = ['Transferencia', 'Efectivo', 'Débito', 'Crédito', 'Cheque'];
// Methods offered per transaction type ("Crédito" only for expenses, "Cheque" for expenses and income).
const METHODS_BY_TYPE = {
  expense: PAYMENT_METHODS,
  income: ['Transferencia', 'Efectivo', 'Débito', 'Cheque'],
  refund: ['Transferencia', 'Efectivo', 'Débito']
};
const CHEQUE_MAX_INSTALLMENTS = 24;
const CREDIT_MAX_INSTALLMENTS = 36;
const MAX_INTEREST_PERCENT = 1000;
const CHEQUE_NUMBER_MAX = 30;
const CHEQUE_NUMBER_PATTERN = /^[A-Za-z0-9-]+$/;

/** Even split in minor units; the last part absorbs the rounding remainder. */
function splitEvenly(totalMinor, count) {
  const base = Math.floor(totalMinor / count);
  return Array.from({ length: count }, (_, index) => (index === count - 1 ? totalMinor - base * (count - 1) : base));
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Same day of month `months` later, clamped to the last day of the target month (Jan 31 + 1 → Feb 28/29). */
function addMonthsClamped(date, months) {
  const [year, month, day] = date.split('-').map(Number);
  const targetIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(targetIndex / 12);
  const targetMonth = targetIndex % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function normalizeChequeNumber(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validChequeNumber(value) {
  const text = normalizeChequeNumber(value);
  return Boolean(text) && text.length <= CHEQUE_NUMBER_MAX && CHEQUE_NUMBER_PATTERN.test(text);
}

/**
 * Validates the cheque rows of a new transaction against its total (minor units of `currency`).
 * Returns { rows: [{ number, total, dueDate, amountMinor, chequeNumber }] } or { error }.
 */
function chequeSchedule(input, totalMinor, currency) {
  if (!Array.isArray(input) || input.length < 1 || input.length > CHEQUE_MAX_INSTALLMENTS) return { error: `Las cuotas con cheque deben ser entre 1 y ${CHEQUE_MAX_INSTALLMENTS}` };
  const rows = [];
  for (const [index, item] of input.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: 'Cada cuota con cheque debe tener vencimiento, monto y número de cheque' };
    if (!isValidDate(item.dueDate)) return { error: `Indicá el vencimiento de la cuota Nº ${index + 1}` };
    const amountMinor = ledger.moneyInput(item.amount, currency);
    if (amountMinor === null) return { error: `El monto de la cuota Nº ${index + 1} debe ser mayor a cero` };
    if (!validChequeNumber(item.chequeNumber)) return { error: `El Nº de cheque de la cuota Nº ${index + 1} es obligatorio (hasta ${CHEQUE_NUMBER_MAX} caracteres: letras, números y guiones)` };
    rows.push({ number: index + 1, total: input.length, dueDate: item.dueDate, amountMinor, chequeNumber: normalizeChequeNumber(item.chequeNumber) });
  }
  const sum = rows.reduce((total, row) => total + row.amountMinor, 0);
  if (sum !== totalMinor) return { error: 'La suma de las cuotas debe ser igual al monto de la transacción' };
  return { rows };
}

/** Total with the interest applied (percentage with up to two decimals), in minor units. */
function totalWithInterest(baseMinor, interestPercent) {
  const basisPoints = Math.round(interestPercent * 100);
  return ledger.mulDivRound(baseMinor, 10000 + basisPoints, 10000);
}

/**
 * Credit purchase plan: total = base × (1 + i/100), split evenly (last absorbs rounding). With more than one
 * installment, installment k is dated k months after the purchase (clamped to month end).
 * Returns { totalMinor, rows: [{ number, total, date, amountMinor }] } or { error }.
 */
function creditSchedule({ baseMinor, count, interestPercent = 0, purchaseDate }) {
  if (!Number.isInteger(count) || count < 1 || count > CREDIT_MAX_INSTALLMENTS) return { error: `Las cuotas de crédito deben ser entre 1 y ${CREDIT_MAX_INSTALLMENTS}` };
  if (typeof interestPercent !== 'number' || !Number.isFinite(interestPercent) || interestPercent < 0 || interestPercent > MAX_INTEREST_PERCENT) return { error: `El interés debe ser un número entre 0 y ${MAX_INTEREST_PERCENT}` };
  if (!isValidDate(purchaseDate)) return { error: 'La fecha de la compra no es válida' };
  const totalMinor = totalWithInterest(baseMinor, interestPercent);
  const parts = splitEvenly(totalMinor, count);
  return {
    totalMinor,
    rows: parts.map((amountMinor, index) => ({
      number: index + 1, total: count, amountMinor,
      date: count === 1 ? purchaseDate : addMonthsClamped(purchaseDate, index + 1)
    }))
  };
}

function methodAllowed(method, tipo) {
  return method === '' || (METHODS_BY_TYPE[tipo] || []).includes(method);
}

module.exports = {
  PAYMENT_METHODS, METHODS_BY_TYPE, CHEQUE_MAX_INSTALLMENTS, CREDIT_MAX_INSTALLMENTS, MAX_INTEREST_PERCENT, CHEQUE_NUMBER_MAX,
  splitEvenly, addMonthsClamped, validChequeNumber, chequeSchedule, totalWithInterest, creditSchedule, methodAllowed, isValidDate
};
