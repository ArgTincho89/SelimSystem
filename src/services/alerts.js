const { addDaysDateOnly, dateOnlyDaysBetween } = require('../utils/recurring');
const ledger = require('./account-ledger');
const obligations = require('./obligations');
const rentals = require('./rentals');
const installments = require('./credit-card-installments');

const ALERT_TYPES = [
  'obligation_due', 'obligation_overdue', 'partial_payment', 'tenant_obligation_pending', 'rent_due',
  'contract_expiry', 'rent_adjustment_due', 'card_installment_due', 'account_forecast', 'document_pending'
];
const DEFAULT_HORIZON_DAYS = 90;
const DEFAULT_LIMIT = 200;
const DOCUMENT_LOOKBACK_DAYS = 60;

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const SYMBOLS = { ARS: '$', EUR: '€', USD: 'US$' };

function longDate(date) {
  return `${Number(date.slice(8, 10))} de ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
}

function monthName(period) {
  return MONTHS[Number(period.slice(5, 7)) - 1];
}

function money(amount, currencyCode) {
  if (typeof amount !== 'number') return '';
  const text = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(amount);
  return SYMBOLS[currencyCode] ? `${SYMBOLS[currencyCode]}${text}` : `${text} ${currencyCode || ''}`.trim();
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function countdown(daysAway) {
  if (daysAway === 0) return 'Vence hoy.';
  if (daysAway === 1) return 'Falta 1 día.';
  return `Faltan ${daysAway} días.`;
}

/**
 * Read-only view over a JsonDB: reads go through, but records the services would lazily generate
 * (obligation and rent occurrences) are kept in memory only. Generated records get a `virtual:` id.
 */
function readOnlyView(db) {
  const staged = new Map();
  const key = (collection, userId) => `${collection}:${userId || ''}`;
  const rows = (collection, userId) => [...db.findAll(collection, userId), ...(staged.get(key(collection, userId)) || [])];
  return {
    findAll(collection, userId, filter) {
      const all = rows(collection, userId);
      return filter ? all.filter(item => Object.entries(filter).every(([name, value]) => item[name] === value)) : all;
    },
    findById(collection, id, userId) {
      return db.findById(collection, id, userId) || (staged.get(key(collection, userId)) || []).find(item => item.id === id) || null;
    },
    query(collection, userId, predicate) {
      return rows(collection, userId).filter(predicate).map(item => ({ ...item }));
    },
    create(collection, item, userId) {
      const record = { id: `virtual:${item.generationKey || `${collection}:${staged.size}`}`, ...item, createdAt: new Date().toISOString() };
      const bucket = staged.get(key(collection, userId)) || [];
      bucket.push(record);
      staged.set(key(collection, userId), bucket);
      return { ...record };
    },
    update() { return null; },
    remove() { return false; },
    replace() {},
    clearCache() {}
  };
}

const isVirtual = id => String(id).startsWith('virtual:');

const RENT_MODALITY = { locacion: 'Locación', comodato: 'Comodato', mutuo: 'Mutuo' };

function build(db, userId, today, filters) {
  const view = readOnlyView(db);
  const settings = ledger.getSettings(db, userId, false);
  const items = [];
  const assetName = id => (id ? db.findById('assets', id, userId)?.name || null : null);
  const ownerName = id => (id ? db.findById('legalOwners', id, userId)?.name || null : null);
  const documents = db.findAll('documents', userId);
  const contracts = db.findAll('rentalContracts', userId);

  const push = (alert, holders = []) => {
    const assetLabel = alert.assetName === undefined ? assetName(alert.assetId) : alert.assetName;
    items.push({ ...alert, assetId: alert.assetId || null, assetName: assetLabel, _holders: holders.filter(Boolean) });
  };

  db.findAll(obligations.COLLECTION, userId).filter(item => item.status === 'active').forEach(obligation => {
    const lead = obligation.reminderLeadDays ?? 7;
    const horizon = addDaysDateOnly(today, lead);
    let occurrences;
    try {
      occurrences = obligations.occurrencesFor(view, userId, obligation, { to: horizon });
    } catch {
      return;
    }
    const asset = assetName(obligation.assetId);
    const where = asset ? ` de ${asset}` : '';
    const contract = (obligation.rentalContractId && contracts.find(item => item.id === obligation.rentalContractId))
      || contracts.find(item => item.assetId === obligation.assetId && item.status === 'active');
    const tenantId = contract?.tenantIds?.[0] || null;
    const holders = [obligation.providerEntityId, obligation.responsibleEntityId, obligation.responsibleThirdEntityId, ...(contract?.tenantIds || [])];
    const common = occurrence => ({
      assetId: obligation.assetId, obligationId: obligation.id, occurrenceId: isVirtual(occurrence.id) ? null : occurrence.id,
      currencyCode: occurrence.currencyCode, reminderLeadDays: lead, title: occurrence.title
    });
    const inWindow = occurrence => occurrence.date < today || occurrence.date <= horizon;

    occurrences.filter(occurrence => !['cancelled', 'resolved'].includes(occurrence.status) && inWindow(occurrence)).forEach(occurrence => {
      const daysAway = dateOnlyDaysBetween(today, occurrence.date);
      const overdue = occurrence.date < today;
      const paid = occurrence.totalPaid > 0;
      if (obligations.responsibilityFor(obligation, occurrence).responsibilityType !== 'none' && occurrence.status !== 'paid' && occurrence.remainingAmount > 0) {
        const amountText = money(occurrence.remainingAmount, occurrence.currencyCode);
        if (paid) {
          push({
            ...common(occurrence), id: `partial:${obligation.id}:${occurrence.date}`, type: 'partial_payment', date: occurrence.date, status: overdue ? 'overdue' : 'partial',
            amount: occurrence.remainingAmount,
            message: `${occurrence.title}${where}: pago parcial. Pagado ${money(occurrence.totalPaid, occurrence.currencyCode)}, pendiente ${amountText}. ${overdue ? `Venció el ${longDate(occurrence.date)}.` : `Vence el ${longDate(occurrence.date)}. ${countdown(daysAway)}`}`
          }, holders);
        } else if (overdue) {
          push({
            ...common(occurrence), id: `overdue:${obligation.id}:${occurrence.date}`, type: 'obligation_overdue', date: occurrence.date, status: 'overdue',
            amount: occurrence.remainingAmount,
            message: `${occurrence.title}${where} venció el ${longDate(occurrence.date)}. Importe pendiente: ${amountText}. Hace ${plural(-daysAway, 'día', 'días')}.`
          }, holders);
        } else {
          push({
            ...common(occurrence), id: `due:${obligation.id}:${occurrence.date}`, type: 'obligation_due', date: occurrence.date, status: occurrence.status,
            amount: occurrence.remainingAmount,
            message: `${occurrence.title}${where} vence el ${longDate(occurrence.date)}. Importe estimado: ${amountText}. ${countdown(daysAway)}`
          }, holders);
        }
      }
      // The tenant portion is only chased once the owner portion is settled; a resolution closes it.
      if (occurrence.tenantDueAmount !== undefined && !occurrence.resolution && occurrence.remainingAmount === 0) {
        const tenantName = ownerName(tenantId) || 'El inquilino';
        const who = tenantId ? `El inquilino ${tenantName}` : 'El inquilino';
        push({
          ...common(occurrence), id: `tenant:${obligation.id}:${occurrence.date}`, type: 'tenant_obligation_pending', date: occurrence.date,
          status: overdue ? 'overdue' : 'pending', tenantEntityId: tenantId, amount: occurrence.tenantRemainingAmount,
          message: `${who} debe enviar el comprobante de pago de ${occurrence.title}${where}. ${overdue ? 'Venció' : 'Vence'} el ${longDate(occurrence.date)}.`
        }, holders);
      }
    });

    // Paid owner occurrences without any receipt attached (recent ones only).
    const since = addDaysDateOnly(today, -DOCUMENT_LOOKBACK_DAYS);
    occurrences.filter(occurrence => occurrence.status === 'paid' && !isVirtual(occurrence.id) && occurrence.date >= since && occurrence.date <= today).forEach(occurrence => {
      const hasReceipt = documents.some(document => document.occurrenceId === occurrence.id || (document.transactionId && (occurrence.paymentIds || []).includes(document.transactionId)));
      if (hasReceipt) return;
      push({
        ...common(occurrence), id: `doc:${obligation.id}:${occurrence.date}`, type: 'document_pending', date: occurrence.date, status: 'pending',
        message: `Falta adjuntar el comprobante de pago de ${occurrence.title} de ${monthName(occurrence.date)}${asset ? ` correspondiente a ${asset}` : ''}.`
      }, holders);
    });
  });

  const rentLead = settings?.alertLeadDays || 5;
  rentals.rentAlerts(view, userId, { today, leadDays: rentLead, expiryDays: 30, adjustmentDays: 30 }).forEach(raw => {
    const { tenantIds, ...alert } = raw;
    const asset = assetName(alert.assetId);
    const daysAway = dateOnlyDaysBetween(today, alert.date);
    const tenant = tenantIds[0] || null;
    if (alert.type === 'rent_due') {
      const overdue = alert.status === 'overdue';
      alert.title = `Alquiler de ${monthName(alert.period)}${asset ? ` · ${asset}` : ''}`;
      const open = (alert.parts || []).filter(part => part.remainingAmount > 0);
      const split = (alert.parts || []).length > 1
        ? `Importe pendiente: ${(alert.totals || []).filter(item => item.remainingAmount > 0).map(item => money(item.remainingAmount, item.currencyCode)).join(' + ')} (${open.map(part => `${RENT_MODALITY[part.modality] || 'Alquiler'} ${money(part.remainingAmount, part.currencyCode)}`).join(', ')}).`
        : `Importe esperado: ${money(alert.amount, alert.currencyCode)}.`;
      alert.message = `Falta cobrar el alquiler de ${monthName(alert.period)}${asset ? ` del ${asset}` : ''}. ${split} ${overdue ? `Venció el ${longDate(alert.date)}.` : countdown(daysAway)}`;
    } else if (alert.type === 'contract_expiry') {
      alert.title = `Vence el contrato${asset ? ` · ${asset}` : ''}`;
      alert.message = `El contrato de alquiler${asset ? ` del ${asset}` : ''} vence el ${longDate(alert.date)}. ${countdown(daysAway)}`;
    } else {
      alert.title = `Ajuste de alquiler${asset ? ` · ${asset}` : ''}`;
      alert.message = `El ${longDate(alert.date)} se aplica un ajuste de alquiler${asset ? ` en ${asset}` : ''}. Nuevo importe: ${money(alert.amount, alert.currencyCode)}. ${countdown(daysAway)}`;
    }
    push({ ...alert, tenantEntityId: tenant }, tenantIds);
  });

  const plans = new Map(db.findAll(installments.PLANS, userId).filter(plan => plan.status === 'active').map(plan => [plan.id, plan]));
  db.findAll(installments.OCCURRENCES, userId).filter(occurrence => occurrence.status === 'scheduled' && plans.has(occurrence.planId)).forEach(occurrence => {
    const plan = plans.get(occurrence.planId);
    const lead = plan.reminderLeadDays ?? 5;
    if (occurrence.dueDate >= today && occurrence.dueDate > addDaysDateOnly(today, lead)) return;
    const overdue = occurrence.dueDate < today;
    const daysAway = dateOnlyDaysBetween(today, occurrence.dueDate);
    const amount = ledger.fromMinorUnits(occurrence.amountMinor, occurrence.currencyCode);
    const when = overdue ? `La cuota venció el ${longDate(occurrence.dueDate)}.` : daysAway === 0 ? 'Vence hoy.' : `En ${plural(daysAway, 'día', 'días')} vence.`;
    push({
      id: `installment:${occurrence.id}`, type: 'card_installment_due', date: occurrence.dueDate, status: overdue ? 'overdue' : 'scheduled',
      title: `Cuota ${occurrence.installmentNumber} de ${plan.installmentsCount} · ${plan.title}`,
      message: `${when} Cuota ${occurrence.installmentNumber} de ${plan.installmentsCount} de ${plan.title}, comprado el ${longDate(plan.purchaseDate)}. Importe: ${money(amount, occurrence.currencyCode)}.`,
      assetId: plan.assetId || null, planId: plan.id, occurrenceId: occurrence.id, installmentNumber: occurrence.installmentNumber,
      amount, currencyCode: occurrence.currencyCode, reminderLeadDays: lead
    }, [db.findById('accounts', plan.accountId, userId)?.ownerId]);
  });

  ledger.accountsForUser(db, userId, false).forEach(account => {
    ledger.forecastAccount(db, userId, account, today).alerts.filter(alert => ['open', 'covered'].includes(alert.status)).forEach(alert => {
      const amount = ledger.fromMinorUnits(alert.neededMinor, account.currency);
      push({
        id: `forecast:${alert.id}`, type: 'account_forecast', date: alert.date, status: alert.status,
        title: `Saldo insuficiente · ${account.nombre}`,
        message: `La cuenta ${account.nombre} no alcanza para ${alert.title} el ${longDate(alert.date)}. Faltan ${money(amount, account.currency)}${alert.status === 'covered' ? ', cubiertos por una transferencia planificada' : ''}.`,
        assetId: null, accountId: account.id, amount, currencyCode: account.currency
      }, [account.ownerId]);
    });
  });
  return items;
}

/**
 * Unified, read-only list of everything that needs attention. Never writes to the database.
 */
function list(db, userId, filters = {}) {
  const today = ledger.localDateForUser(db, userId);
  const to = filters.to || addDaysDateOnly(today, DEFAULT_HORIZON_DAYS);
  const limit = filters.limit || DEFAULT_LIMIT;
  const seen = new Set();
  return build(db, userId, today, filters)
    .filter(alert => !seen.has(alert.id) && seen.add(alert.id))
    .filter(alert => (!filters.type || alert.type === filters.type)
      && (!filters.assetId || alert.assetId === filters.assetId)
      && (!filters.holderId || alert._holders.includes(filters.holderId))
      && (!filters.from || alert.date >= filters.from)
      && alert.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(({ _holders, ...alert }) => ({ ...alert, daysUntil: dateOnlyDaysBetween(today, alert.date) }));
}

module.exports = { ALERT_TYPES, DEFAULT_HORIZON_DAYS, DEFAULT_LIMIT, list, readOnlyView };
