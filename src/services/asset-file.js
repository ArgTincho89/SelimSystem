const { addDaysDateOnly, dateOnlyDaysBetween } = require('../utils/recurring');
const ledger = require('./account-ledger');
const alerts = require('./alerts');
const obligations = require('./obligations');
const economic = require('./economic-overview');

const DEFAULT_HORIZON_DAYS = 90;
const MAX_HORIZON_DAYS = 365;
const PENDING_ALERT_TYPES = new Set(['obligation_overdue', 'partial_payment', 'tenant_obligation_pending', 'document_pending']);
const TARGET_FIELDS = ['assetId', 'obligationId', 'occurrenceId', 'contractId', 'rentOccurrenceId', 'transactionId', 'tenantEntityId'];

function parseHorizon(value) {
  if (value === undefined || value === '') return { value: DEFAULT_HORIZON_DAYS };
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > MAX_HORIZON_DAYS) return { error: 'horizonDays debe ser un entero entre 1 y 365' };
  return { value: days };
}

function responsibleParty(db, userId, obligation, tenantIds) {
  const type = obligation.responsibilityType || 'owner';
  const name = id => (id ? db.findById('legalOwners', id, userId)?.name || null : null);
  const parties = { owner: name(obligation.responsibleEntityId), third: name(obligation.responsibleThirdEntityId), tenant: name(tenantIds[0]) };
  if (type === 'third') return { type, name: parties.third };
  if (type === 'tenant') return { type, name: parties.tenant };
  if (type === 'shared') return { type, name: [parties.owner, parties.tenant].filter(Boolean).join(' / ') || null };
  return { type, name: type === 'none' ? null : parties.owner };
}

// Who settled the occurrence: the tenant when resolved, the third party / owner when paid.
function settlingParty(obligation, occurrence) {
  if (occurrence.resolution && occurrence.status !== 'paid') return 'tenant';
  if (occurrence.status !== 'paid') return null;
  if (occurrence.resolution) return 'shared';
  return obligation.responsibilityType === 'third' ? 'third' : 'owner';
}

function resolutionStatus(occurrence) {
  if (!occurrence?.resolution) return 'none';
  const due = occurrence.tenantDueAmount;
  return due && occurrence.resolution.amountMinor < ledger.toMinorUnits(due, occurrence.currencyCode) ? 'partial' : 'resolved';
}

function documentsFor(db, userId, asset, ids) {
  const targets = {
    obligationId: ids.obligations, occurrenceId: ids.occurrences, contractId: ids.contracts,
    rentOccurrenceId: ids.rentOccurrences, transactionId: ids.transactions, tenantEntityId: ids.tenants
  };
  return db.findAll('documents', userId)
    .filter(doc => doc.assetId === asset.id || Object.entries(targets).some(([field, set]) => doc[field] && set.has(doc[field])))
    .map(doc => ({
      id: doc.id, title: doc.title, fileName: doc.fileName, contentType: doc.contentType, uploadedAt: doc.uploadedAt,
      targets: Object.fromEntries(TARGET_FIELDS.filter(field => doc[field]).map(field => [field, doc[field]]))
    }))
    .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
}

/**
 * Read-only consolidated asset file. Reuses alerts (upcoming/pending), obligations (occurrences and
 * resolutions) and the economic monthly view (cost and rent). Never writes to the database.
 */
function build(db, userId, asset, options = {}) {
  const horizon = options.horizonDays || DEFAULT_HORIZON_DAYS;
  const today = ledger.localDateForUser(db, userId);
  const to = addDaysDateOnly(today, horizon);
  const view = alerts.readOnlyView(db);
  const contracts = db.findAll('rentalContracts', userId).filter(contract => contract.assetId === asset.id);
  const activeContract = contracts.find(contract => contract.status === 'active') || null;
  const ids = {
    obligations: new Set(), occurrences: new Set(), contracts: new Set(contracts.map(item => item.id)),
    rentOccurrences: new Set(), transactions: new Set(), tenants: new Set(contracts.flatMap(item => item.tenantIds || []))
  };
  const notes = [];
  if (asset.notes) notes.push({ text: asset.notes, createdAt: asset.createdAt || null, source: 'asset' });

  const all = alerts.list(db, userId, { assetId: asset.id, to, limit: 1000 });
  const upcoming = all.filter(item => item.date >= today);
  const upcomingIds = new Set(upcoming.map(item => item.id));
  const rows = [];

  db.findAll(obligations.COLLECTION, userId).filter(item => item.assetId === asset.id).forEach(obligation => {
    ids.obligations.add(obligation.id);
    if (obligation.notes) notes.push({ text: `${obligation.title}: ${obligation.notes}`, source: 'obligation' });
    let occurrences = [];
    try {
      occurrences = obligations.occurrencesFor(view, userId, obligation, { from: addDaysDateOnly(today, -365), to })
        .filter(item => item.status !== 'cancelled');
    } catch { occurrences = []; }
    occurrences.forEach(item => {
      ids.occurrences.add(item.id);
      (item.paymentIds || []).forEach(id => ids.transactions.add(id));
      if (item.resolution?.notes) notes.push({ text: `${item.title || obligation.title}: ${item.resolution.notes}`, createdAt: item.resolution.resolvedAt || null, source: 'resolution' });
    });
    const open = occurrences.filter(item => !['paid', 'resolved'].includes(item.status));
    const next = open.find(item => item.date >= today) || null;
    const latest = [...occurrences].reverse().find(item => item.date <= today) || null;
    rows.push({
      obligationId: obligation.id, title: obligation.title, responsibilityType: obligation.responsibilityType || 'owner',
      responsibleParty: responsibleParty(db, userId, obligation, activeContract?.tenantIds || []),
      status: obligation.status, nextDueDate: next?.date || null, nextOccurrenceStatus: next?.status || null,
      resolutionStatus: resolutionStatus(next || latest), settledBy: latest ? settlingParty(obligation, latest) : null
    });
    if (obligation.status !== 'active') return;
    // Alerts only surface items inside the reminder lead; the file shows everything within the horizon.
    open.filter(item => item.date >= today && item.remainingAmount > 0).forEach(item => {
      const id = `due:${obligation.id}:${item.date}`;
      if (upcomingIds.has(id) || upcomingIds.has(`partial:${obligation.id}:${item.date}`)) return;
      upcomingIds.add(id);
      upcoming.push({
        id, type: 'obligation_due', date: item.date, status: item.status, title: item.title, message: item.title,
        assetId: asset.id, assetName: asset.name, obligationId: obligation.id, occurrenceId: String(item.id).startsWith('virtual:') ? null : item.id,
        amount: item.remainingAmount, currencyCode: item.currencyCode, reminderLeadDays: obligation.reminderLeadDays ?? 7,
        daysUntil: dateOnlyDaysBetween(today, item.date)
      });
    });
  });
  upcoming.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const pending = all
    .filter(alert => PENDING_ALERT_TYPES.has(alert.type) || (alert.type === 'rent_due' && alert.status === 'overdue'))
    .map(alert => ({
      type: alert.type, occurrenceId: alert.occurrenceId || undefined, rentOccurrenceId: alert.rentOccurrenceId || undefined,
      title: alert.title, amount: alert.amount, currencyCode: alert.currencyCode, dueDate: alert.date, message: alert.message
    }));

  const current = today.slice(0, 7);
  const cost = {};
  const rentCollected = {};
  (economic.monthlyView(view, userId, asset, {}).months || []).forEach(month => {
    Object.entries(month.expensesMinorByCurrency).forEach(([currency, minor]) => { cost[currency] = (cost[currency] || 0) + minor; });
    if (month.month === current) month.rentByCurrency.forEach(item => { if (item.collectedMinor) rentCollected[item.currencyCode] = item.collectedMinor; });
  });
  const contractIds = ids.contracts;
  db.findAll('rentOccurrences', userId).filter(item => contractIds.has(item.contractId)).forEach(item => ids.rentOccurrences.add(item.id));

  return {
    assetId: asset.id, generatedAt: new Date().toISOString(), horizonDays: horizon,
    owners: db.findAll('assetOwnerships', userId)
      .filter(item => item.assetId === asset.id && (!item.endDate || item.endDate >= today))
      .map(item => ({ ownerId: item.ownerId, name: db.findById('legalOwners', item.ownerId, userId)?.name || null, percentage: item.percentage ?? null })),
    currentContract: activeContract && {
      contractId: activeContract.id, startDate: activeContract.startDate, endDate: activeContract.endDate || null,
      tenantNames: (activeContract.tenantIds || []).map(id => db.findById('legalOwners', id, userId)?.name).filter(Boolean)
    },
    obligations: rows, upcoming, pending,
    documents: documentsFor(db, userId, asset, ids), notes,
    costLast12MonthsMinorByCurrency: cost, rentCollectedThisMonthMinorByCurrency: rentCollected
  };
}

module.exports = { build, parseHorizon, DEFAULT_HORIZON_DAYS, MAX_HORIZON_DAYS };
