const { addDaysDateOnly, dateOnlyDaysBetween } = require('../utils/recurring');
const ledger = require('./account-ledger');
const rentals = require('./rentals');
const alerts = require('./alerts');
const declarations = require('./rental-declarations');
const assetHistory = require('./asset-history');
const economicOverview = require('./economic-overview');

/**
 * Read models of one rental (declaration). Everything is built over `alerts.readOnlyView`, so generated
 * occurrences stay in memory (`virtual:` ids) and no GET ever writes. `periods` is the single builder
 * behind the Períodos tab, the Resumen progress and the ficha rental summary.
 */
const ENDING_SOON_DAYS = 30;
const MODALITY_LABEL = { locacion: 'Locación', comodato: 'Comodato', mutuo: 'Mutuo' };
const isVirtual = id => String(id).startsWith('virtual:');

function plusMonths(date, months) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 10);
}

function addMonthsKeepingDay(date, months, day) {
  const base = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
  base.setUTCMonth(base.getUTCMonth() + months);
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  return `${base.toISOString().slice(0, 8)}${String(Math.min(day, last)).padStart(2, '0')}`;
}

function yearRange(year) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function grossAmount(contract, minor) {
  return ledger.fromMinorUnits(minor, contract.currencyCode);
}

/** Occurrence views of every contract of the rental (superseded and draft ones are dropped), through `to`. */
function occurrenceViews(view, userId, contracts, today, to) {
  return contracts.filter(contract => contract.status !== 'draft').flatMap(contract => {
    if (contract.status === 'cancelled') {
      return view.findAll('rentOccurrences', userId).filter(item => item.contractId === contract.id).map(item => rentals.occurrenceView(view, userId, item, today));
    }
    const through = contract.status === 'ended' && contract.endDate && contract.endDate < to ? contract.endDate : to;
    return rentals.generateOccurrences(view, userId, contract, through);
  }).filter(item => !(item.cancelled && item.supersededByConditionId));
}

function partState(part) {
  return part.status === 'partially_collected' ? 'partial' : part.status;
}

/** Consolidated month state: collected only when every live modality is collected. */
function periodState(parts, dueDate, today) {
  const live = parts.filter(part => part.status !== 'cancelled');
  if (!live.length) return 'cancelled';
  if (live.every(part => part.status === 'collected')) return 'collected';
  if (live.some(part => part.paidMinor > 0)) return 'partial';
  return dueDate < today ? 'overdue' : 'pending';
}

/**
 * One period per month of the rental (`YYYY-MM`), with every modality part. Months with parts of different
 * due days still appear once. Returns an array ordered by due date.
 */
function rentPeriods(db, userId, declaration, { from, to, today, view = alerts.readOnlyView(db) }) {
  const contracts = declarations.contractsOf(db, userId, declaration.id);
  const contractsById = new Map(contracts.map(contract => [contract.id, contract]));
  const byPeriod = new Map();
  occurrenceViews(view, userId, contracts, today, to).filter(item => item.date >= from && item.date <= to).forEach(item => {
    if (!byPeriod.has(item.period)) byPeriod.set(item.period, []);
    byPeriod.get(item.period).push(item);
  });
  return [...byPeriod].map(([period, items]) => {
    items.sort((a, b) => rentals.MODALITIES.indexOf(a.modality) - rentals.MODALITIES.indexOf(b.modality) || a.date.localeCompare(b.date));
    const dueDate = items.map(item => item.date).sort()[0];
    const state = periodState(items, dueDate, today);
    const totals = new Map();
    items.filter(item => item.status !== 'cancelled').forEach(item => {
      const row = totals.get(item.currencyCode) || { currencyCode: item.currencyCode, expectedMinor: 0, collectedMinor: 0, remainingMinor: 0 };
      row.expectedMinor += item.rentMinor; row.collectedMinor += item.paidMinor; row.remainingMinor += item.remainingMinor;
      totals.set(item.currencyCode, row);
    });
    const monthKeys = [...new Set(items.filter(item => item.status !== 'cancelled').map(item => `${declaration.id}|${item.date}`))];
    return {
      period, dueDate, state, overdue: state === 'overdue' || (state === 'partial' && dueDate < today),
      monthKey: monthKeys[0] || null, monthKeys,
      parts: items.map(item => ({
        modality: item.modality, modalityLabel: MODALITY_LABEL[item.modality] || item.modality, contractId: item.contractId,
        occurrenceId: item.id, date: item.date, currencyCode: item.currencyCode, state: partState(item),
        expected: item.rentAmount, collected: item.paidAmount, remaining: item.remainingAmount,
        classification: item.modality === 'locacion' ? 'A' : 'B', ivaPercent: item.ivaPercent ?? null,
        actionable: !isVirtual(item.id) && contractsById.get(item.contractId)?.status === 'active' && item.status !== 'cancelled',
        collectionIds: [...new Set(item.allocations.map(entry => entry.collectionId).filter(Boolean))]
      })),
      totals: [...totals.values()].map(row => ({
        currencyCode: row.currencyCode, expected: ledger.fromMinorUnits(row.expectedMinor, row.currencyCode),
        collected: ledger.fromMinorUnits(row.collectedMinor, row.currencyCode), remaining: ledger.fromMinorUnits(row.remainingMinor, row.currencyCode)
      }))
    };
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function sumByCurrency(rows, field) {
  const map = new Map();
  rows.forEach(row => row.totals.forEach(total => map.set(total.currencyCode, Math.round(((map.get(total.currencyCode) || 0) + total[field]) * 100) / 100)));
  return [...map].map(([currencyCode, amount]) => ({ currencyCode, amount }));
}

function headerStatus(contracts, today) {
  const active = contracts.filter(contract => contract.status === 'active');
  if (!active.length) return 'ended';
  const ends = active.map(contract => contract.endDate);
  const end = ends.every(Boolean) ? [...ends].sort().pop() : null;
  if (end && end < today) return 'ended';
  if (active.every(contract => contract.startDate > today)) return 'upcoming';
  if (end && dateOnlyDaysBetween(today, end) <= ENDING_SOON_DAYS) return 'ending-soon';
  return 'active';
}

/** Next adjustment of a modality: a scheduled condition, else the next due date by adjustment frequency. */
function nextAdjustment(db, userId, contract, today) {
  const scheduled = rentals.conditionsFor(db, userId, contract.id).find(item => item.effectiveDate >= today);
  if (scheduled) return scheduled.effectiveDate;
  const frequency = contract.adjustmentFrequencyMonths;
  if (!frequency || contract.status !== 'active') return null;
  const day = Number(contract.startDate.slice(8, 10));
  for (let count = 1; count < 600; count += 1) {
    const date = addMonthsKeepingDay(contract.startDate, count * frequency, day);
    if (contract.endDate && date > contract.endDate) return null;
    if (date >= today) return date;
  }
  return null;
}

function modalityCards(db, userId, view, contracts, today) {
  const through = plusMonths(today, 12);
  return contracts.filter(contract => contract.status !== 'draft').map(contract => {
    const live = contract.status === 'cancelled' ? [] : rentals.generateOccurrences(view, userId, contract, contract.status === 'ended' && contract.endDate && contract.endDate < through ? contract.endDate : through)
      .filter(item => !item.cancelled && item.status !== 'cancelled');
    const current = [...live].reverse().find(item => item.date <= today) || live[0] || null;
    const originalMinor = rentals.grossMinor(contract.initialRentMinor, contract.ivaPercent);
    return {
      contractId: contract.id, modality: rentals.modalityOf(contract), modalityLabel: MODALITY_LABEL[rentals.modalityOf(contract)], status: contract.status,
      from: contract.startDate, to: contract.endDate || null, currencyCode: contract.currencyCode,
      originalAmount: grossAmount(contract, originalMinor), currentAmount: current ? current.rentAmount : grossAmount(contract, originalMinor),
      classification: rentals.modalityOf(contract) === 'locacion' ? 'A' : 'B', ivaPercent: contract.ivaPercent ?? null,
      adjustmentFrequencyMonths: contract.adjustmentFrequencyMonths ?? null, adjustmentCriterion: contract.adjustmentCriterion ?? null,
      nextAdjustmentDate: nextAdjustment(db, userId, contract, today),
      futureDueDates: live.filter(item => item.date >= today).map(item => item.date)
    };
  });
}

const ALERT_ACTIONS = {
  rent_due: 'collect', obligation_overdue: 'pay', obligation_due: 'pay', partial_payment: 'pay', tenant_obligation_pending: 'resolve',
  document_pending: 'attach-receipt', contract_expiry: 'edit', rent_adjustment_due: 'update'
};
const RENTAL_ALERT_TYPES = new Set(Object.keys(ALERT_ACTIONS));

function rentalAlerts(db, userId, declaration, contractIds) {
  return alerts.list(db, userId, { assetId: declaration.assetId, limit: 1000 })
    .filter(alert => RENTAL_ALERT_TYPES.has(alert.type))
    .filter(alert => (alert.type === 'rent_due' ? alert.declarationId === declaration.id
      : ['contract_expiry', 'rent_adjustment_due'].includes(alert.type) ? contractIds.has(alert.contractId) : true))
    .map(alert => ({
      id: alert.id, type: alert.type, date: alert.date, status: alert.status, message: alert.message, title: alert.title,
      action: ALERT_ACTIONS[alert.type], refs: { obligationId: alert.obligationId || null, occurrenceId: alert.occurrenceId || null, monthKey: alert.monthKey || null, contractId: alert.contractId || null, assetId: alert.assetId || null }
    }));
}

/**
 * Header, modality cards, collection progress and alerts of one rental. `options.year` (YYYY) scopes the
 * progress; it defaults to the current year.
 */
function overview(db, userId, declaration, options = {}) {
  const today = ledger.localDateForUser(db, userId);
  const year = options.year === undefined || options.year === '' ? today.slice(0, 4) : String(options.year);
  if (!/^\d{4}$/.test(year)) return { error: 'El año no es válido', status: 400 };
  const view = alerts.readOnlyView(db);
  const contracts = declarations.contractsOf(db, userId, declaration.id);
  const range = yearRange(year);
  const periods = rentPeriods(db, userId, declaration, { ...range, today, view });
  const live = contracts.filter(contract => contract.status !== 'draft');
  const starts = live.map(contract => contract.startDate).sort();
  const ends = live.map(contract => contract.endDate);
  const cards = modalityCards(db, userId, view, contracts, today);
  const activeCards = cards.filter(card => card.status === 'active');
  const monthlyTotals = new Map();
  activeCards.forEach(card => monthlyTotals.set(card.currencyCode, Math.round(((monthlyTotals.get(card.currencyCode) || 0) + card.currentAmount) * 100) / 100));
  // Period list over the next 12 months (not the selected year) for the next collection and the pending total.
  const upcoming = rentPeriods(db, userId, declaration, { from: '1900-01-01', to: plusMonths(today, 12), today, view }).filter(period => period.state !== 'cancelled');
  const nextCollection = upcoming.find(period => period.dueDate >= today && ['pending', 'partial'].includes(period.state)) || null;
  const pending = upcoming.filter(period => period.dueDate <= today && ['overdue', 'partial', 'pending'].includes(period.state));
  const contractIds = new Set(contracts.map(contract => contract.id));
  const alertItems = rentalAlerts(db, userId, declaration, contractIds);
  const nextDue = alertItems.filter(alert => alert.date >= today && !['rent_due', 'contract_expiry', 'rent_adjustment_due'].includes(alert.type)).map(alert => alert.date).sort()[0] || null;
  const adjustments = activeCards.map(card => card.nextAdjustmentDate).filter(Boolean).sort();
  const counts = { expected: 0, collected: 0, partial: 0, overdue: 0, pending: 0, cancelled: 0 };
  const byModality = new Map();
  const total = new Map();
  periods.forEach(period => {
    if (period.state === 'cancelled') counts.cancelled += 1;
    else {
      counts.expected += 1;
      counts[period.state] += 1;
    }
    period.parts.filter(part => part.state !== 'cancelled').forEach(part => {
      const entry = byModality.get(part.modality) || { modality: part.modality, modalityLabel: part.modalityLabel, expected: 0, collected: 0, currencyCode: part.currencyCode };
      entry.expected += 1;
      if (part.state === 'collected') entry.collected += 1;
      byModality.set(part.modality, entry);
      const row = total.get(part.currencyCode) || { currencyCode: part.currencyCode, expected: 0, collected: 0 };
      row.expected = Math.round((row.expected + part.expected) * 100) / 100;
      row.collected = Math.round((row.collected + part.collected) * 100) / 100;
      total.set(part.currencyCode, row);
    });
  });
  const currentMonth = today.slice(0, 7);
  const monthAlerts = alertItems.filter(alert => alert.date.slice(0, 7) === currentMonth);
  const side = types => monthAlerts.filter(alert => types.includes(alert.type));
  return {
    value: {
      declarationId: declaration.id, assetId: declaration.assetId, year,
      header: {
        status: headerStatus(contracts, today),
        assetName: db.findById('assets', declaration.assetId, userId)?.name || '',
        tenants: (declaration.tenantIds || []).map(id => db.findById('legalOwners', id, userId)).filter(Boolean).map(tenant => ({ id: tenant.id, name: tenant.name })),
        from: starts[0] || null, to: ends.length && ends.every(Boolean) ? [...ends].sort().pop() : null,
        monthlyTotals: [...monthlyTotals].map(([currencyCode, amount]) => ({ currencyCode, amount })),
        nextCollection: nextCollection ? { date: nextCollection.dueDate, period: nextCollection.period, totals: nextCollection.totals.map(row => ({ currencyCode: row.currencyCode, amount: row.remaining })) } : null,
        nextDue, pendingTotals: sumByCurrency(pending, 'remaining'), nextAdjustment: adjustments[0] || null,
        currentPeriodObligations: {
          owner: { pending: side(['obligation_due', 'partial_payment']).length, overdue: side(['obligation_overdue']).length },
          tenant: { pending: side(['tenant_obligation_pending']).length }
        }
      },
      modalities: cards,
      progress: { byModality: [...byModality.values()], total: [...total.values()], counts },
      alerts: alertItems
    }
  };
}

const MAX_PERIOD_MONTHS = 36;

/** Validates the `from`/`to` months (YYYY-MM) of the periods query; defaults to the current year. */
function resolvePeriodRange(query, today) {
  const year = today.slice(0, 4);
  const from = query.from === undefined || query.from === '' ? `${year}-01` : query.from;
  const to = query.to === undefined || query.to === '' ? `${year}-12` : query.to;
  if (!economicOverview.validMonth(from) || !economicOverview.validMonth(to)) return { error: 'Los meses deben tener formato YYYY-MM', status: 400 };
  if (from > to) return { error: 'El mes inicial no puede ser posterior al mes final', status: 400 };
  if (economicOverview.monthsBetween(`${from}-01`, `${to}-01`).length > MAX_PERIOD_MONTHS) return { error: `El rango no puede superar los ${MAX_PERIOD_MONTHS} meses`, status: 400 };
  return { value: { from, to } };
}

/**
 * The unified monthly table of a rental: one period per month with every modality part, the owner and tenant
 * obligation occurrences of the asset in that month (payments, reversals, resolution, receipts), registered
 * collections, receipts, notes, unapplied balances and the actions available. Read-only.
 */
function periods(db, userId, declaration, query = {}) {
  const ctx = assetHistory.makeContext(db, userId);
  const { today, view } = ctx;
  const resolved = resolvePeriodRange(query, today);
  if (resolved.error) return resolved;
  const { from, to } = resolved.value;
  const range = { fromDate: `${from}-01`, toDate: economicOverview.monthRange(to).to };
  const rent = rentPeriods(db, userId, declaration, { from: range.fromDate, to: range.toDate, today, view });
  const obligationRows = db.findAll('obligations', userId).filter(obligation => obligation.assetId === declaration.assetId)
    .flatMap(obligation => assetHistory.buildObligationRows(ctx, obligation, range));
  const collectionsById = new Map(db.findAll('rentCollections', userId).filter(collection => !collection.reversedAt).map(collection => [collection.id, collection]));
  const activeContracts = new Set(declarations.contractsOf(db, userId, declaration.id).filter(contract => contract.status === 'active').map(contract => contract.id));
  const value = rent.map(period => {
    const collectionIds = [...new Set(period.parts.flatMap(part => part.collectionIds))].filter(id => collectionsById.has(id));
    const collections = collectionIds.map(id => collectionsById.get(id));
    const transactionIds = new Set(collections.map(collection => collection.transactionId).filter(Boolean));
    const occurrenceIds = new Set(period.parts.map(part => part.occurrenceId));
    const unapplied = collections.map(collection => ({ collection, view: rentals.collectionView(db, userId, collection) })).filter(item => item.view.unappliedMinor > 0)
      .map(item => ({ collectionId: item.collection.id, amount: item.view.unappliedAmount, currencyCode: item.collection.currencyCode, date: item.collection.date }));
    const live = period.parts.filter(part => part.state !== 'cancelled');
    const canAct = live.some(part => part.actionable);
    const actions = [];
    if (period.state !== 'collected' && period.state !== 'cancelled' && live.some(part => part.actionable && part.remaining > 0)) actions.push('collect');
    if (collections.length) actions.push('undo-collect');
    if (!collections.length && canAct && period.state !== 'cancelled') actions.push('cancel-period');
    return {
      ...period,
      obligations: obligationRows.filter(row => row.date.slice(0, 7) === period.period),
      collections: collections.map(collection => ({
        id: collection.id, groupId: collection.groupId || null, date: collection.date, amount: ledger.fromMinorUnits(collection.amountMinor, collection.currencyCode), currencyCode: collection.currencyCode,
        accountName: db.findById('accounts', collection.accountId, userId)?.nombre || '', paymentMethod: collection.method || '', modality: collection.modality || null, classification: collection.clasificacion || null
      })),
      unapplied,
      documents: ctx.documents.filter(doc => transactionIds.has(doc.transactionId) || occurrenceIds.has(doc.rentOccurrenceId)).map(assetHistory.documentView),
      notes: ctx.notes.filter(note => (note.targetType === 'rentOccurrence' && occurrenceIds.has(note.targetId)) || (note.targetType === 'rentCollection' && collectionIds.includes(note.targetId))).map(assetHistory.noteView),
      actions, activeModalities: period.parts.filter(part => activeContracts.has(part.contractId)).length
    };
  });
  return { value };
}

module.exports = { overview, periods, resolvePeriodRange, rentPeriods, modalityCards, headerStatus, nextAdjustment, ENDING_SOON_DAYS, MODALITY_LABEL };
