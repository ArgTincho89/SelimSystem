const { addDaysDateOnly, dateOnlyDaysBetween } = require('../utils/recurring');
const ledger = require('./account-ledger');
const obligations = require('./obligations');
const rentals = require('./rentals');
const installments = require('./credit-card-installments');
const rentCollections = require('./rent-collections');
const alertConfig = require('./alert-config');
const { isPendingTransaction } = require('../utils/transaction-status');

const ALERT_TYPES = [
  'obligation_due', 'obligation_overdue', 'partial_payment', 'tenant_obligation_pending', 'rent_due',
  'contract_expiry', 'rent_adjustment_due', 'card_installment_due', 'account_forecast', 'document_pending', 'cheque_due',
  'transaction_cheque_due', 'credit_installment_upcoming'
];
// Alerts the tenant answers for (the rent side). Everything else affects the owner's own finances.
const TENANT_TYPES = new Set(['tenant_obligation_pending', 'rent_due', 'contract_expiry', 'rent_adjustment_due', 'cheque_due']);
// Default lead of rent cheques (the effective value comes from the alert configuration).
const CHEQUE_LEAD_DAYS = alertConfig.entryFor('cheque_due').defaultDays;
const RESPONSIBILITIES = ['owner', 'tenant'];
const DEFAULT_HORIZON_DAYS = 90;
const DEFAULT_LIMIT = 200;

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

function shortDate(date) {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
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
  const leadDaysFor = alertConfig.resolver(db, userId);
  const withinLead = (date, lead) => date < today || date <= addDaysDateOnly(today, lead);

  const push = (alert, holders = []) => {
    const assetLabel = alert.assetName === undefined ? assetName(alert.assetId) : alert.assetName;
    const responsibility = alert.responsibility || (TENANT_TYPES.has(alert.type) ? 'tenant' : 'owner');
    items.push({ ...alert, responsibility, assetId: alert.assetId || null, assetName: assetLabel, _holders: holders.filter(Boolean) });
  };

  db.findAll(obligations.COLLECTION, userId).filter(item => item.status === 'active').forEach(obligation => {
    const target = { assetId: obligation.assetId || null, obligationId: obligation.id };
    const lead = leadDaysFor('obligation_due', target);
    const tenantLead = leadDaysFor('tenant_obligation_pending', target);
    const horizon = addDaysDateOnly(today, Math.max(lead, tenantLead));
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
    const ownerWindow = occurrence => withinLead(occurrence.date, lead);

    occurrences.filter(occurrence => !['cancelled', 'resolved'].includes(occurrence.status) && inWindow(occurrence)).forEach(occurrence => {
      const daysAway = dateOnlyDaysBetween(today, occurrence.date);
      const overdue = occurrence.date < today;
      const paid = occurrence.totalPaid > 0;
      if (ownerWindow(occurrence) && obligations.responsibilityFor(obligation, occurrence).responsibilityType !== 'none' && occurrence.status !== 'paid' && occurrence.remainingAmount > 0) {
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
      if (withinLead(occurrence.date, tenantLead) && occurrence.tenantDueAmount !== undefined && !occurrence.resolution && occurrence.remainingAmount === 0) {
        const tenantName = ownerName(tenantId) || 'El inquilino';
        const who = tenantId ? `El inquilino ${tenantName}` : 'El inquilino';
        push({
          ...common(occurrence), reminderLeadDays: tenantLead, id: `tenant:${obligation.id}:${occurrence.date}`, type: 'tenant_obligation_pending', date: occurrence.date,
          status: overdue ? 'overdue' : 'pending', tenantEntityId: tenantId, amount: occurrence.tenantRemainingAmount,
          message: `${who} debe enviar el comprobante de pago de ${occurrence.title}${where}. ${overdue ? 'Venció' : 'Vence'} el ${longDate(occurrence.date)}.`
        }, holders);
      }
    });

    // Paid owner occurrences without any receipt attached (recent ones only).
    const since = addDaysDateOnly(today, -leadDaysFor('document_pending', target));
    occurrences.filter(occurrence => occurrence.status === 'paid' && !isVirtual(occurrence.id) && occurrence.date >= since && occurrence.date <= today).forEach(occurrence => {
      const hasReceipt = documents.some(document => document.occurrenceId === occurrence.id || (document.transactionId && (occurrence.paymentIds || []).includes(document.transactionId)));
      if (hasReceipt) return;
      push({
        ...common(occurrence), id: `doc:${obligation.id}:${occurrence.date}`, type: 'document_pending', date: occurrence.date, status: 'pending',
        responsibility: obligations.responsibilityFor(obligation, occurrence).responsibilityType === 'tenant' ? 'tenant' : 'owner',
        message: `Falta adjuntar el comprobante de pago de ${occurrence.title} de ${monthName(occurrence.date)}${asset ? ` correspondiente a ${asset}` : ''}.`
      }, holders);
    });
  });

  const rentWindow = { today, leadDays: leadDaysFor.max('rent_due'), expiryDays: leadDaysFor.max('contract_expiry'), adjustmentDays: leadDaysFor.max('rent_adjustment_due') };
  rentals.rentAlerts(view, userId, rentWindow).forEach(raw => {
    const { tenantIds, ...alert } = raw;
    if (!withinLead(alert.date, leadDaysFor(alert.type, { assetId: alert.assetId }))) return;
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

  // Rent cheques close to (or past) their collection date that are not marked as cashed yet.
  rentCollections.chequeAlerts(db, userId, { today, leadDays: leadDaysFor.max('cheque_due') }).forEach(item => {
    if (!withinLead(item.date, leadDaysFor('cheque_due', { assetId: item.assetId }))) return;
    const asset = assetName(item.assetId);
    const tenantNames = item.tenantIds.map(ownerName).filter(Boolean);
    const period = item.period ? `${monthName(item.period)} ${item.period.slice(0, 4)}` : '';
    const modality = item.modality && RENT_MODALITY[item.modality] ? ` (${RENT_MODALITY[item.modality]})` : '';
    const daysAway = dateOnlyDaysBetween(today, item.date);
    const when = item.overdue
      ? `debía cobrarse el ${longDate(item.date)}. Marcalo como cobrado cuando se acredite.`
      : `se cobra el ${longDate(item.date)}. ${daysAway === 0 ? 'Es hoy.' : countdown(daysAway)}`;
    push({
      id: `cheque:${item.collectionId}`, type: 'cheque_due', date: item.date, status: item.overdue ? 'overdue' : 'pending',
      title: `Cheque a cobrar${asset ? ` · ${asset}` : ''}`,
      message: `El cheque${tenantNames.length ? ` de ${tenantNames.join(', ')}` : ''} por ${money(item.amount, item.currencyCode)} del alquiler${period ? ` de ${period}` : ''}${modality}${asset ? ` del ${asset}` : ''} ${when}`,
      assetId: item.assetId, collectionId: item.collectionId, groupId: item.groupId, declarationId: item.declarationId,
      tenantEntityId: item.tenantIds[0] || null, tenantNames, period: item.period, modality: item.modality,
      amount: item.amount, currencyCode: item.currencyCode, receivedDate: item.receivedDate, chequeDays: item.days
    }, item.tenantIds);
  });

  const plans = new Map(db.findAll(installments.PLANS, userId).filter(plan => plan.status === 'active').map(plan => [plan.id, plan]));
  db.findAll(installments.OCCURRENCES, userId).filter(occurrence => occurrence.status === 'scheduled' && plans.has(occurrence.planId)).forEach(occurrence => {
    const plan = plans.get(occurrence.planId);
    const lead = leadDaysFor('card_installment_due', { assetId: plan.assetId || null, accountId: plan.accountId || null });
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

  transactionInstallmentAlerts(db, userId, today, leadDaysFor, contracts).forEach(({ holders, ...alert }) => push(alert, holders));

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

// Asset a transaction is attributed to (first movement allocation with an asset), or null.
function attributedAssetId(db, userId, transactionId) {
  return db.findAll('movementAllocations', userId).find(item => item.transactionId === transactionId && item.assetId)?.assetId || null;
}

// Pending cheque installments (to confirm) and upcoming credit installments created by the transaction form.
function transactionInstallmentAlerts(db, userId, today, leadDaysFor, contracts) {
  const alerts = [];
  db.findAll('transactions', userId).forEach(tx => {
    if (!tx.chequeInstallment && !tx.creditInstallment) return;
    const account = tx.accountId ? db.findById('accounts', tx.accountId, userId) : null;
    const assetId = attributedAssetId(db, userId, tx.id);
    const currencyCode = tx.currencyCode || account?.currency || null;
    const amountText = money(tx.monto, currencyCode);
    if (tx.chequeInstallment && isPendingTransaction(tx)) {
      const lead = leadDaysFor('transaction_cheque_due', { assetId, accountId: tx.accountId || null });
      if (tx.fecha >= today && tx.fecha > addDaysDateOnly(today, lead)) return;
      const { number, total, chequeNumber } = tx.chequeInstallment;
      const title = tx.chequeInstallment.baseTitle || tx.titulo;
      const contract = assetId ? contracts.find(item => item.assetId === assetId && item.status === 'active' && (item.tenantIds || []).length) : null;
      const responsibility = tx.tipo === 'income' && contract ? 'tenant' : 'owner';
      const overdue = tx.fecha < today;
      const prefix = chequeNumber ? `Cheque Nº ${chequeNumber} — cuota` : 'Cheque cuota';
      alerts.push({
        id: `txcheque:${tx.id}`, type: 'transaction_cheque_due', date: tx.fecha, status: overdue ? 'overdue' : 'pending', responsibility,
        title: `Cheque cuota ${number}/${total} · ${title}`,
        message: `${prefix} ${number}/${total} de «${title}» ${overdue ? 'venció' : 'vence'} el ${shortDate(tx.fecha)} — pendiente de confirmar (${amountText}).`,
        assetId, accountId: tx.accountId || null, transactionId: tx.id, chequeGroupId: tx.chequeGroupId || null, chequeNumber: chequeNumber || null,
        installmentNumber: number, installmentsCount: total, transactionType: tx.tipo, amount: tx.monto, currencyCode,
        reminderLeadDays: lead, tenantEntityId: responsibility === 'tenant' ? contract.tenantIds[0] : null,
        holders: [account?.ownerId, ...(responsibility === 'tenant' ? contract.tenantIds : [])]
      });
    }
    if (tx.creditInstallment && !isPendingTransaction(tx) && tx.fecha > today) {
      const lead = leadDaysFor('credit_installment_upcoming', { assetId, accountId: tx.accountId || null });
      if (tx.fecha > addDaysDateOnly(today, lead)) return;
      const { number, total, purchaseDate, purchaseTitle } = tx.creditInstallment;
      const title = purchaseTitle || tx.titulo;
      alerts.push({
        id: `txcredit:${tx.id}`, type: 'credit_installment_upcoming', date: tx.fecha, status: 'scheduled', responsibility: 'owner',
        title: `Cuota ${number}/${total} · ${title}`,
        message: `Ingresará el cobro de la cuota Nº ${number}/${total} del gasto «${title}» realizado el ${shortDate(purchaseDate || tx.fecha)} (${amountText}).`,
        assetId, accountId: tx.accountId || null, transactionId: tx.id, creditGroupId: tx.creditGroupId || null,
        installmentNumber: number, installmentsCount: total, amount: tx.monto, currencyCode,
        reminderLeadDays: lead, holders: [account?.ownerId]
      });
    }
  });
  return alerts;
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
      && (!filters.responsibility || alert.responsibility === filters.responsibility)
      && (!filters.assetId || alert.assetId === filters.assetId)
      && (!filters.holderId || alert._holders.includes(filters.holderId))
      && (!filters.from || alert.date >= filters.from)
      && alert.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(({ _holders, ...alert }) => ({ ...alert, daysUntil: dateOnlyDaysBetween(today, alert.date) }));
}

module.exports = { CHEQUE_LEAD_DAYS, ALERT_TYPES, RESPONSIBILITIES, DEFAULT_HORIZON_DAYS, DEFAULT_LIMIT, list, readOnlyView };
