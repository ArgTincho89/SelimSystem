const ledger = require('./account-ledger');
const finance = require('./finance');

const PLANS = 'creditCardInstallmentPlans';
const OCCURRENCES = 'creditCardInstallmentOccurrences';

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

/** Interest percent -> basis points (7.5% -> 750). */
function interestBasisPoints(interestPercent) {
  return Math.round(interestPercent * 100);
}

function financedTotalMinor(totalMinor, interestPercent) {
  return totalMinor + ledger.mulDivRound(totalMinor, interestBasisPoints(interestPercent), 10000);
}

function installmentAmountsMinor(financedMinor, count) {
  const base = Math.floor(financedMinor / count);
  const amounts = Array(count).fill(base);
  amounts[count - 1] = financedMinor - base * (count - 1);
  return amounts;
}

/** Due dates, one per month, on the first date (day clamped to month end) on or after the purchase date. */
function installmentDates(purchaseDate, dueDay, count) {
  let year = Number(purchaseDate.slice(0, 4));
  let month = Number(purchaseDate.slice(5, 7));
  const dateFor = (y, m) => `${y}-${pad(m)}-${pad(Math.min(dueDay, daysInMonth(y, m)))}`;
  if (dateFor(year, month) < purchaseDate) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  const dates = [];
  for (let index = 0; index < count; index += 1) {
    dates.push(dateFor(year, month));
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return dates;
}

function validateEntry(body) {
  if (!Number.isInteger(body.installmentsCount) || body.installmentsCount < 1 || body.installmentsCount > 120) return 'La cantidad de cuotas debe ser un entero entre 1 y 120';
  if (!Number.isInteger(body.dueDay) || body.dueDay < 1 || body.dueDay > 31) return 'El día de vencimiento debe ser un entero entre 1 y 31';
  if (body.interestPercent !== undefined && body.interestPercent !== null
    && (typeof body.interestPercent !== 'number' || !Number.isFinite(body.interestPercent) || body.interestPercent < 0 || body.interestPercent > 1000)) return 'El interés debe ser un número entre 0 y 1000';
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 120) return 'El concepto debe tener entre 1 y 120 caracteres';
  if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 500)) return 'Las notas no son válidas';
  if (body.reminderLeadDays !== undefined && (!Number.isInteger(body.reminderLeadDays) || body.reminderLeadDays < 0 || body.reminderLeadDays > 90)) return 'Los días de aviso deben estar entre 0 y 90';
  return null;
}

/** Validates a plan request and returns the plan fields plus its generated occurrences (nothing is persisted). */
function validatePlan(db, userId, body) {
  const input = body || {};
  const entryError = validateEntry(input);
  if (entryError) return { error: entryError };
  if (!validDate(input.purchaseDate)) return { error: 'La fecha de compra no es válida' };
  const account = input.accountId ? db.findById('accounts', input.accountId, userId) : null;
  if (!account || !account.activo) return { error: 'Seleccioná una cuenta activa' };
  const currencyCode = input.currencyCode || account.currency;
  if (currencyCode !== account.currency) return { error: 'La moneda debe coincidir con la cuenta' };
  const method = input.paymentMethodId ? db.findById('paymentMethods', input.paymentMethodId, userId) : null;
  if (!method || method.type !== 'credit_card' || method.accountId !== account.id) return { error: 'El medio de pago debe ser una tarjeta de crédito vinculada a la cuenta' };
  const totalAmountMinor = ledger.moneyInput(input.totalAmount, currencyCode);
  if (totalAmountMinor === null) return { error: 'El importe total debe ser positivo y válido para la moneda' };
  if (input.assetId && !db.findById('assets', input.assetId, userId)) return { error: 'El bien no es válido' };
  if (input.categoryId && !db.findById('categories', input.categoryId, userId)) return { error: 'La categoría no es válida' };
  if (input.documentId && !db.findById('documents', input.documentId, userId)) return { error: 'El comprobante no es válido' };

  const interestPercent = input.interestPercent || 0;
  const financed = financedTotalMinor(totalAmountMinor, interestPercent);
  if (financed < input.installmentsCount) return { error: 'El importe es demasiado bajo para esa cantidad de cuotas' };
  const amounts = installmentAmountsMinor(financed, input.installmentsCount);
  const dates = installmentDates(input.purchaseDate, input.dueDay, input.installmentsCount);
  return {
    value: {
      plan: {
        accountId: account.id, paymentMethodId: method.id, assetId: input.assetId || null, categoryId: input.categoryId || null,
        title: input.title.trim(), purchaseDate: input.purchaseDate, currencyCode,
        totalAmount: ledger.fromMinorUnits(totalAmountMinor, currencyCode), totalAmountMinor,
        installmentsCount: input.installmentsCount, dueDay: input.dueDay, interestPercent,
        financedTotalMinor: financed, installmentAmountMinor: amounts[0],
        reminderLeadDays: input.reminderLeadDays === undefined ? 5 : input.reminderLeadDays,
        status: 'active', notes: (input.notes || '').trim(), documentId: input.documentId || null
      },
      occurrences: amounts.map((amountMinor, index) => ({
        installmentNumber: index + 1, dueDate: dates[index], amountMinor, currencyCode,
        status: 'scheduled', postedTransactionId: null, postedAt: null, notes: ''
      }))
    }
  };
}

function createPlan(db, userId, body) {
  const parsed = validatePlan(db, userId, body);
  if (parsed.error) return parsed;
  const plan = db.create(PLANS, { userId, ...parsed.value.plan }, userId);
  const occurrences = parsed.value.occurrences.map(item => db.create(OCCURRENCES, { ...item, planId: plan.id }, userId));
  return { plan, occurrences };
}

function occurrencesOf(db, userId, planId) {
  return db.findAll(OCCURRENCES, userId).filter(item => item.planId === planId).sort((a, b) => a.installmentNumber - b.installmentNumber);
}

function planView(db, userId, plan) {
  const occurrences = occurrencesOf(db, userId, plan.id);
  return {
    ...plan,
    postedCount: occurrences.filter(item => item.status === 'posted').length,
    scheduledCount: occurrences.filter(item => item.status === 'scheduled').length,
    nextDueDate: occurrences.find(item => item.status === 'scheduled')?.dueDate || null
  };
}

function listPlans(db, userId) {
  return db.findAll(PLANS, userId).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate)).map(plan => planView(db, userId, plan));
}

function getPlan(db, userId, id) {
  const plan = db.findById(PLANS, id, userId);
  return plan ? planView(db, userId, plan) : null;
}

function updatePlan(db, userId, plan, body) {
  const allowed = ['notes', 'reminderLeadDays', 'title'];
  const input = body || {};
  if (Object.keys(input).some(key => !allowed.includes(key))) return { error: 'Solo se pueden editar notas, días de aviso y concepto' };
  const merged = { ...plan, ...input };
  const error = validateEntry(merged);
  if (error) return { error };
  const updates = {};
  if (input.notes !== undefined) updates.notes = input.notes.trim();
  if (input.reminderLeadDays !== undefined) updates.reminderLeadDays = input.reminderLeadDays;
  if (input.title !== undefined) updates.title = input.title.trim();
  return { plan: db.update(PLANS, plan.id, updates, userId) };
}

/** A plan is completed when it has no scheduled occurrences left and at least one was posted. */
function refreshPlanStatus(db, userId, plan) {
  if (plan.status !== 'active') return plan;
  const occurrences = occurrencesOf(db, userId, plan.id);
  if (occurrences.some(item => item.status === 'scheduled')) return plan;
  return db.update(PLANS, plan.id, { status: occurrences.some(item => item.status === 'posted') ? 'completed' : 'cancelled' }, userId);
}

function cancelPlan(db, userId, plan) {
  if (plan.status === 'cancelled') return { error: 'El plan ya está cancelado', status: 409 };
  occurrencesOf(db, userId, plan.id).filter(item => item.status === 'scheduled')
    .forEach(item => db.update(OCCURRENCES, item.id, { status: 'cancelled' }, userId));
  return { plan: db.update(PLANS, plan.id, { status: 'cancelled' }, userId) };
}

function cancelOccurrence(db, userId, plan, occurrence) {
  if (occurrence.status === 'posted') return { error: 'Una cuota contabilizada no se puede cancelar', status: 409 };
  if (occurrence.status === 'cancelled') return { error: 'La cuota ya está cancelada', status: 409 };
  const updated = db.update(OCCURRENCES, occurrence.id, { status: 'cancelled' }, userId);
  return { occurrence: updated, plan: refreshPlanStatus(db, userId, plan) };
}

/**
 * Posts one scheduled occurrence as a single expense transaction. Amount override is optional and
 * defaults to the scheduled amount; an override must be a positive amount valid for the currency.
 */
function postOccurrence(db, userId, plan, occurrence, body = {}) {
  if (plan.status === 'cancelled') return { error: 'El plan está cancelado', status: 409 };
  if (occurrence.status === 'posted') return { error: 'La cuota ya fue contabilizada', status: 409 };
  if (occurrence.status === 'cancelled') return { error: 'La cuota está cancelada', status: 409 };
  const accountId = body.accountId || plan.accountId;
  const account = db.findById('accounts', accountId, userId);
  if (!account || !account.activo) return { error: 'Seleccioná una cuenta activa', status: 400 };
  if (account.currency !== occurrence.currencyCode) return { error: 'La moneda de la cuenta no coincide con la cuota', status: 400 };
  const categoryId = body.categoryId || plan.categoryId;
  if (!categoryId || !db.findById('categories', categoryId, userId)) return { error: 'Seleccioná una categoría válida', status: 400 };
  let amountMinor = occurrence.amountMinor;
  if (body.amount !== undefined && body.amount !== null) {
    amountMinor = ledger.moneyInput(body.amount, account.currency);
    if (amountMinor === null) return { error: 'El importe debe ser positivo y válido para la moneda', status: 400 };
  }
  const date = body.date || occurrence.dueDate;
  if (!validDate(date)) return { error: 'La fecha no es válida', status: 400 };

  let transaction;
  try {
    transaction = db.create('transactions', {
      userId, tipo: 'expense', monto: ledger.fromMinorUnits(amountMinor, account.currency), amountMinor,
      accountId: account.id, currencyCode: account.currency,
      titulo: `${plan.title} · Cuota ${occurrence.installmentNumber} de ${plan.installmentsCount}`,
      categoryId, fecha: date, recurrente: false, frecuencia: null, fechaFin: null, clasificacion: 'variable',
      paymentMethodId: plan.paymentMethodId, paymentMethod: db.findById('paymentMethods', plan.paymentMethodId, userId)?.name || '',
      installmentPlanId: plan.id, installmentOccurrenceId: occurrence.id
    }, userId);
    if (plan.assetId) {
      const parsed = finance.validateAllocations(db, userId, transaction, [{ assetId: plan.assetId, amountMinor }]);
      if (parsed.error) throw new Error(parsed.error);
      parsed.allocations.forEach(item => db.create('movementAllocations', { ...item, complete: true }, userId));
    }
  } catch (error) {
    db.clearCache();
    if (transaction) db.remove('transactions', transaction.id, userId);
    return { error: 'No se pudo contabilizar la cuota', status: 500 };
  }
  const posted = db.update(OCCURRENCES, occurrence.id, {
    status: 'posted', postedTransactionId: transaction.id, postedAt: new Date().toISOString(), amountMinor
  }, userId);
  return { occurrence: posted, transaction, plan: refreshPlanStatus(db, userId, plan) };
}

/** Scheduled occurrences due in a YYYY-MM month, labelled for the transactions page. Never counted in totals. */
function scheduledForMonth(db, userId, month) {
  const plans = new Map(db.findAll(PLANS, userId).filter(item => item.status === 'active').map(item => [item.id, item]));
  return db.findAll(OCCURRENCES, userId)
    .filter(item => item.status === 'scheduled' && plans.has(item.planId) && item.dueDate.startsWith(month))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.installmentNumber - b.installmentNumber)
    .map(item => {
      const plan = plans.get(item.planId);
      return {
        ...item, planTitle: plan.title, installmentsCount: plan.installmentsCount,
        categoryId: plan.categoryId, accountId: plan.accountId, assetId: plan.assetId,
        amount: ledger.fromMinorUnits(item.amountMinor, item.currencyCode),
        label: `Cuota ${item.installmentNumber} de ${plan.installmentsCount} · ${plan.title}`
      };
    });
}

module.exports = {
  PLANS, OCCURRENCES, validDate, interestBasisPoints, financedTotalMinor, installmentAmountsMinor, installmentDates,
  validatePlan, createPlan, occurrencesOf, listPlans, getPlan, updatePlan, cancelPlan, cancelOccurrence,
  postOccurrence, scheduledForMonth, refreshPlanStatus
};
