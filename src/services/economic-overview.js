const ledger = require('./account-ledger');
const obligations = require('./obligations');
const rentals = require('./rentals');

function validMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function monthRange(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    from: `${month}-01`,
    to: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10)
  };
}

function monthsBetween(from, to) {
  const months = [];
  let cursor = `${from.slice(0, 7)}-01`;
  while (cursor.slice(0, 7) <= to.slice(0, 7) && months.length < 1200) {
    months.push(cursor.slice(0, 7));
    const date = new Date(`${cursor}T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    cursor = date.toISOString().slice(0, 10);
  }
  return months;
}

function amountMinor(transaction, currency) {
  return Number.isSafeInteger(transaction.amountMinor)
    ? transaction.amountMinor
    : ledger.toMinorUnits(transaction.monto, transaction.currencyCode || currency) || 0;
}

function transactionCurrency(transaction, db, userId) {
  return ledger.accountForMovement(db, userId, transaction)?.currency || transaction.currencyCode || 'EUR';
}

function postedMovements(db, userId, movements) {
  const recurringOccurrences = db.findAll('recurringOccurrences', userId);
  const recurringTemplateIds = new Set(db.findAll('recurrenceRevisions', userId).map(item => item.templateId));
  return movements.flatMap(transaction => {
    if (transaction.isRecurringInstance) return transaction.occurrenceStatus === 'posted' ? [transaction] : [];
    if (!transaction.recurrente && !recurringTemplateIds.has(transaction.id)) return [transaction];
    const occurrence = recurringOccurrences.find(item => item.templateId === transaction.id && item.date === transaction.fecha && item.status === 'posted');
    if (!occurrence) return [];
    const effective = {
      ...transaction, ...(occurrence.overrides || {}), id: transaction.id, fecha: occurrence.date,
      amountMinor: occurrence.amountMinor ?? transaction.amountMinor,
      isRecurringInstance: true, occurrenceStatus: 'posted'
    };
    if (Number.isSafeInteger(effective.amountMinor)) {
      effective.monto = ledger.fromMinorUnits(effective.amountMinor, transactionCurrency(effective, db, userId));
    }
    return [effective];
  });
}

function actualMovements(db, userId, from, to) {
  const transactions = db.findAll('transactions', userId);
  const seen = new Set();
  return postedMovements(db, userId, monthsBetween(from, to).flatMap(month => ledger.getMonthMovements(db, userId, transactions, month)))
    .filter(transaction => transaction.fecha >= from && transaction.fecha <= to)
    .filter(transaction => {
      const key = `${transaction.id}:${transaction.fecha}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function ensureTotal(totals, currency) {
  if (!totals[currency]) totals[currency] = {
    currency, incomeMinor: 0, expensesMinor: 0, refundsMinor: 0,
    netExpensesMinor: 0, savingsMinor: 0, transferInMinor: 0, transferOutMinor: 0
  };
  return totals[currency];
}

function publicAmount(minor, currency) {
  return ledger.fromMinorUnits(minor, currency);
}

function summarizeByCurrency(totals) {
  return Object.values(totals).map(total => {
    const currency = total.currency;
    const netExpensesMinor = total.expensesMinor - total.refundsMinor;
    return {
      currency,
      income: publicAmount(total.incomeMinor, currency),
      expenses: publicAmount(total.expensesMinor, currency),
      refunds: publicAmount(total.refundsMinor, currency),
      netExpenses: publicAmount(netExpensesMinor, currency),
      savings: publicAmount(total.incomeMinor - netExpensesMinor, currency),
      transferIn: publicAmount(total.transferInMinor, currency),
      transferOut: publicAmount(total.transferOutMinor, currency)
    };
  }).sort((a, b) => a.currency.localeCompare(b.currency));
}

function listTransfers(db, userId, from, to, totals) {
  const accounts = new Map(ledger.accountsForUser(db, userId).map(account => [account.id, account]));
  return db.findAll('transfers', userId).filter(transfer => {
    if (transfer.status !== 'posted') return false;
    const date = (transfer.postedAt || transfer.fecha || '').slice(0, 10);
    return date >= from && date <= to;
  }).map(transfer => {
    const date = (transfer.postedAt || transfer.fecha).slice(0, 10);
    const source = accounts.get(transfer.fromAccountId);
    const destination = accounts.get(transfer.toAccountId);
    ensureTotal(totals, transfer.fromCurrency).transferOutMinor += transfer.sentMinor;
    ensureTotal(totals, transfer.toCurrency).transferInMinor += transfer.receivedMinor;
    if (transfer.feeMinor) ensureTotal(totals, transfer.fromCurrency).expensesMinor += transfer.feeMinor;
    return {
      id: transfer.id, type: 'transfer', date, status: 'posted',
      concept: transfer.reference || (transfer.fromCurrency === transfer.toCurrency ? 'Transferencia' : 'Conversión'),
      fromAccount: source?.nombre || 'Cuenta archivada', toAccount: destination?.nombre || 'Cuenta archivada',
      fromAccountId: transfer.fromAccountId,
      fromCurrency: transfer.fromCurrency, toCurrency: transfer.toCurrency,
      sentAmount: publicAmount(transfer.sentMinor, transfer.fromCurrency),
      receivedAmount: publicAmount(transfer.receivedMinor, transfer.toCurrency),
      feeAmount: publicAmount(transfer.feeMinor || 0, transfer.fromCurrency),
      feeAmountMinor: transfer.feeMinor || 0
    };
  });
}

function pendingForRange(db, userId, from, to) {
  const today = ledger.localDateForUser(db, userId);
  const pendingObligations = [];
  db.findAll('obligations', userId).filter(item => item.status === 'active').forEach(obligation => {
    obligations.occurrencesFor(db, userId, obligation, { from, to })
      .filter(item => item.status !== 'cancelled' && item.remainingAmount > 0)
      .forEach(item => pendingObligations.push({
        id: item.id, obligationId: obligation.id, assetId: obligation.assetId || null,
        date: item.date, concept: item.title || obligation.title, status: item.status, kind: 'obligation',
        currency: item.currencyCode, amount: item.remainingAmount
      }));
  });
  const pendingRents = [];
  db.findAll('rentalContracts', userId).filter(item => item.status === 'active' || item.status === 'ended').forEach(contract => {
    const endedAt = contract.status === 'ended' ? (contract.endDate || today) : to;
    const until = endedAt < to ? endedAt : to;
    rentals.generateOccurrences(db, userId, contract, until)
      .filter(item => item.date >= from && item.date <= to && item.status !== 'cancelled' && item.remainingAmount > 0)
      .forEach(item => pendingRents.push({
        id: item.id, contractId: contract.id, assetId: contract.assetId,
        date: item.date, concept: 'Alquiler esperado', status: item.status, kind: 'rent',
        currency: item.currencyCode, amount: item.remainingAmount
      }));
  });
  return { obligations: pendingObligations, rents: pendingRents };
}

function globalOverview(db, userId, requestedMonth) {
  ledger.ensureSetup(db, userId);
  const today = ledger.localDateForUser(db, userId);
  const month = requestedMonth || today.slice(0, 7);
  if (!validMonth(month)) return { error: 'El mes debe tener formato YYYY-MM' };
  const { from, to } = monthRange(month);
  const totals = {};
  ledger.accountsForUser(db, userId).forEach(account => ensureTotal(totals, account.currency));
  const movements = actualMovements(db, userId, from, to).map(transaction => {
    const account = ledger.accountForMovement(db, userId, transaction);
    if (!account) return null;
    const currency = account.currency;
    const amount = amountMinor(transaction, currency);
    const total = ensureTotal(totals, currency);
    if (transaction.tipo === 'income') total.incomeMinor += amount;
    if (transaction.tipo === 'expense') total.expensesMinor += amount;
    if (transaction.tipo === 'refund') total.refundsMinor += amount;
    const source = transaction.tipo === 'refund' && transaction.refundSourceId
      ? db.findById('transactions', transaction.refundSourceId, userId)
      : null;
    return {
      id: transaction.id, transactionId: transaction.id, type: transaction.tipo,
      date: transaction.fecha, concept: transaction.titulo, currency,
      amount: publicAmount(amount, currency), amountMinor: amount,
      accountId: account.id, accountName: account.nombre, status: 'posted',
      refundSourceId: transaction.refundSourceId || null,
      refundSourceConcept: source?.titulo || null
    };
  }).filter(Boolean);
  const transfers = listTransfers(db, userId, from, to, totals);
  transfers.filter(transfer => transfer.feeAmountMinor > 0).forEach(transfer => {
    movements.push({
      id: `transfer:${transfer.id}:fee`, transactionId: null, transferId: transfer.id,
      type: 'expense', date: transfer.date, concept: 'Comisión de transferencia',
      currency: transfer.fromCurrency, amount: transfer.feeAmount, amountMinor: transfer.feeAmountMinor,
      accountId: transfer.fromAccountId, accountName: transfer.fromAccount, status: 'posted'
    });
  });
  const pending = pendingForRange(db, userId, from, to);
  const pendingTotals = {};
  [...pending.obligations, ...pending.rents].forEach(item => {
    const total = pendingTotals[item.currency] || (pendingTotals[item.currency] = { currency: item.currency, obligationsMinor: 0, rentsMinor: 0 });
    const key = item.kind === 'rent' ? 'rentsMinor' : 'obligationsMinor';
    total[key] += ledger.toMinorUnits(item.amount, item.currency) || 0;
  });
  return {
    month, period: { from, to }, activeCurrency: ledger.getSettings(db, userId).appCurrency || 'EUR',
    currencies: summarizeByCurrency(totals),
    movements: movements.sort((a, b) => a.date.localeCompare(b.date) || a.concept.localeCompare(b.concept)),
    transfers: transfers.sort((a, b) => a.date.localeCompare(b.date)),
    pending: {
      obligations: pending.obligations,
      rents: pending.rents,
      currencies: Object.values(pendingTotals).map(total => ({
        currency: total.currency,
        obligations: publicAmount(total.obligationsMinor, total.currency),
        rents: publicAmount(total.rentsMinor, total.currency)
      })).sort((a, b) => a.currency.localeCompare(b.currency))
    }
  };
}

/*
 * Asset attribution precedence is intentionally exclusive: any generic
 * movementAllocation rows win (including rows with no asset target), then
 * legacy obligation payment links, then rent collection allocation links,
 * then recovery claims. Refunds use their own generic allocations when present;
 * otherwise they inherit a currency-matched proportional share of the source
 * expense's attribution. Unallocated amounts remain unattributed, and no
 * relationship can add a second share for the same transaction portion.
 */
function allocationsForTransaction(db, userId, transaction) {
  const generic = db.findAll('movementAllocations', userId).filter(item => item.transactionId === transaction.id);
  const currency = transactionCurrency(transaction, db, userId);
  if (generic.length) {
    return generic.filter(item => item.assetId && Number.isSafeInteger(item.amountMinor) && item.amountMinor > 0 && (!item.currencyCode || item.currencyCode === currency))
      .map(item => ({ assetId: item.assetId, amountMinor: item.amountMinor, source: 'movementAllocation', obligationId: item.obligationId || null, contractId: item.contractId || null }));
  }

  const amount = amountMinor(transaction, currency);
  const linkedOccurrence = transaction.obligationOccurrenceId
    ? db.findById('obligationOccurrences', transaction.obligationOccurrenceId, userId)
    : null;
  if (transaction.obligationOccurrenceId && !linkedOccurrence) return [];
  if (linkedOccurrence && transaction.obligationId && linkedOccurrence.obligationId !== transaction.obligationId) return [];
  const obligationId = linkedOccurrence?.obligationId || transaction.obligationId;
  const obligation = obligationId ? db.findById('obligations', obligationId, userId) : null;
  if (obligationId) {
    if (!obligation?.assetId || obligation.currencyCode && obligation.currencyCode !== currency) return [];
    return [{ assetId: obligation.assetId, amountMinor: amount, source: 'obligation', obligationId, contractId: null }];
  }

  const collectionId = transaction.rentCollectionId;
  if (collectionId) {
    const collection = db.findById('rentCollections', collectionId, userId);
    if (!collection || collection.transactionId !== transaction.id || collection.currencyCode && collection.currencyCode !== currency) return [];
    const shares = db.findAll('rentCollectionAllocations', userId).filter(item => item.collectionId === collectionId);
    const byAsset = new Map();
    shares.forEach(share => {
      const occurrence = db.findById('rentOccurrences', share.occurrenceId, userId);
      const contract = occurrence && db.findById('rentalContracts', occurrence.contractId, userId);
      if (!contract?.assetId || occurrence.currencyCode !== currency || contract.currencyCode !== currency || share.currencyCode && share.currencyCode !== currency) return;
      const current = byAsset.get(contract.assetId) || { assetId: contract.assetId, amountMinor: 0, source: 'rentCollection', obligationId: null, contractId: contract.id };
      current.amountMinor += share.amountMinor;
      byAsset.set(contract.assetId, current);
    });
    return Array.from(byAsset.values());
  }

  const recovery = db.findAll('recoveries', userId).find(item => item.transactionId === transaction.id);
  const claimId = transaction.recoverableExpenseClaimId || transaction.recoverableClaimId || recovery?.claimId;
  const claim = claimId
    ? db.findById('recoverableExpenseClaims', claimId, userId)
    : db.findAll('recoverableExpenseClaims', userId).find(item => item.transactionId === transaction.id);
  if (claim?.assetId) {
    if (claim.currencyCode && claim.currencyCode !== currency) return [];
    const isRecovery = transaction.tipo === 'income'
      && (recovery?.claimId === claim.id || transaction.recoverableExpenseClaimId === claim.id);
    return [{
      assetId: claim.assetId,
      amountMinor: isRecovery ? amount : Math.min(amount, claim.recoverableMinor),
      source: 'recoveryClaim', obligationId: null, contractId: claim.contractId || null
    }];
  }

  return [];
}

function refundAllocations(db, userId, transaction, sourceTransaction) {
  const explicit = db.findAll('movementAllocations', userId).some(item => item.transactionId === transaction.id);
  if (explicit || !sourceTransaction) return allocationsForTransaction(db, userId, transaction);
  const refundCurrency = transactionCurrency(transaction, db, userId);
  const sourceCurrency = transactionCurrency(sourceTransaction, db, userId);
  if (refundCurrency !== sourceCurrency) return [];
  const refundMinor = amountMinor(transaction, refundCurrency);
  const sourceMinor = amountMinor(sourceTransaction, sourceCurrency);
  if (sourceMinor <= 0 || refundMinor <= 0) return [];
  const shares = allocationsForTransaction(db, userId, sourceTransaction).filter(item => item.amountMinor > 0);
  const assigned = shares.reduce((sum, item) => sum + item.amountMinor, 0);
  if (!assigned) return [];
  const attributedRefund = Math.min(assigned, ledger.mulDivRound(refundMinor, assigned, sourceMinor));
  let remaining = attributedRefund;
  return shares.map((share, index) => {
    const shareAmount = index === shares.length - 1
      ? remaining
      : Math.min(share.amountMinor, ledger.mulDivFloor(refundMinor, share.amountMinor, sourceMinor));
    remaining -= shareAmount;
    return { ...share, amountMinor: shareAmount, source: 'refundSource', refundSourceId: sourceTransaction.id };
  }).filter(item => item.amountMinor > 0);
}

function movementAttributions(db, userId, transaction) {
  if (transaction.tipo === 'refund') {
    const source = transaction.refundSourceId ? db.findById('transactions', transaction.refundSourceId, userId) : null;
    return refundAllocations(db, userId, transaction, source);
  }
  return allocationsForTransaction(db, userId, transaction);
}

function periodForAsset(db, userId, asset, options = {}) {
  const today = ledger.localDateForUser(db, userId);
  const contracts = db.findAll('rentalContracts', userId).filter(item => item.assetId === asset.id);
  const managementStart = asset.acquisitionDate || (asset.createdAt || today).slice(0, 10);
  const activeContracts = contracts.filter(item => item.status === 'active');
  const mode = options.period || 'acquisition';
  if (mode === 'month') {
    if (!validMonth(options.month)) return { error: 'El mes debe tener formato YYYY-MM' };
    return { ...monthRange(options.month), mode, month: options.month };
  }
  if (mode === 'year') {
    if (!/^\d{4}$/.test(options.year || '')) return { error: 'El año debe tener formato YYYY' };
    return { from: `${options.year}-01-01`, to: `${options.year}-12-31`, mode, year: options.year };
  }
  if (mode === 'custom') {
    if (!rentals.validDate(options.from) || !rentals.validDate(options.to) || options.from > options.to) return { error: 'El rango de fechas no es válido' };
    return { from: options.from, to: options.to, mode };
  }
  if (mode === 'contract') {
    const starts = activeContracts.map(item => item.startDate).sort();
    return { from: starts[0] || managementStart, to: today, mode };
  }
  if (mode === 'acquisition' || mode === 'until-today') return { from: managementStart, to: today, mode };
  return { error: 'El período seleccionado no es válido' };
}

function documentsForMovement(db, userId, assetId, attribution) {
  const obligationIds = new Set(attribution.filter(item => item.obligationId).map(item => item.obligationId));
  const contractIds = new Set(attribution.filter(item => item.contractId).map(item => item.contractId));
  return db.findAll('documents', userId).filter(item => item.assetId === assetId || obligationIds.has(item.obligationId) || contractIds.has(item.contractId))
    .map(item => ({ id: item.id, title: item.title, fileName: item.fileName, contentType: item.contentType, uploadedAt: item.uploadedAt }));
}

function assetEconomics(db, userId, asset, options = {}) {
  const period = periodForAsset(db, userId, asset, options);
  if (period.error) return period;
  const periodMonths = (Number(period.to.slice(0, 4)) - Number(period.from.slice(0, 4))) * 12
    + Number(period.to.slice(5, 7)) - Number(period.from.slice(5, 7)) + 1;
  if (period.from > period.to) return { error: 'La fecha inicial no puede ser posterior a la fecha final' };
  if (periodMonths > 1200) return { error: 'El período no puede superar los 100 años' };
  const allTransactions = db.findAll('transactions', userId);
  const candidates = monthsBetween(period.from, period.to)
    .flatMap(month => ledger.getMonthMovements(db, userId, allTransactions, month));
  const posted = postedMovements(db, userId, candidates);
  const seen = new Set();
  const totals = {};
  const evolution = new Map();
  const movements = [];
  posted.filter(transaction => transaction.fecha >= period.from && transaction.fecha <= period.to).forEach(transaction => {
    const key = `${transaction.id}:${transaction.fecha}`;
    if (seen.has(key)) return;
    seen.add(key);
    const currency = transactionCurrency(transaction, db, userId);
    const shares = movementAttributions(db, userId, transaction).filter(item => item.assetId === asset.id && item.amountMinor > 0);
    if (!shares.length) return;
    const amount = shares.reduce((sum, item) => sum + item.amountMinor, 0);
    const total = ensureTotal(totals, currency);
    const bucketKey = `${transaction.fecha.slice(0, 7)}:${currency}`;
    if (!evolution.has(bucketKey)) evolution.set(bucketKey, { month: transaction.fecha.slice(0, 7), currency, incomeMinor: 0, expensesMinor: 0, refundsMinor: 0 });
    const bucket = evolution.get(bucketKey);
    if (transaction.tipo === 'income') { total.incomeMinor += amount; bucket.incomeMinor += amount; }
    if (transaction.tipo === 'expense') { total.expensesMinor += amount; bucket.expensesMinor += amount; }
    if (transaction.tipo === 'refund') { total.refundsMinor += amount; bucket.refundsMinor += amount; }
    const account = ledger.accountForMovement(db, userId, transaction);
    const allocation = shares[0];
    const category = db.findById('categories', transaction.categoryId, userId);
    const method = transaction.paymentMethodId ? db.findById('paymentMethods', transaction.paymentMethodId, userId) : null;
    const contracts = Array.from(new Set(shares.map(item => item.contractId).filter(Boolean)))
      .map(id => db.findById('rentalContracts', id, userId)).filter(Boolean);
    const source = transaction.tipo === 'refund' && transaction.refundSourceId ? db.findById('transactions', transaction.refundSourceId, userId) : null;
    movements.push({
      id: transaction.id, transactionId: transaction.id, date: transaction.fecha,
      concept: transaction.titulo, type: transaction.tipo, status: 'posted', currency,
      amountMinor: amount, amount: publicAmount(amount, currency), account: account?.nombre || 'Cuenta archivada',
      category: category?.nombre || null, paymentMethod: method?.name || transaction.paymentMethod || null,
      contract: contracts.map(item => item.type || 'Contrato').join(', ') || (allocation.contractId ? 'Contrato de alquiler' : null),
      contractId: contracts.length === 1 ? contracts[0].id : null, refundSourceId: source?.id || null,
      refundSourceConcept: source?.titulo || null,
      documents: documentsForMovement(db, userId, asset.id, shares)
    });
  });
  const currencies = summarizeByCurrency(totals).map(total => ({
    ...total,
    grossExpenses: total.expenses,
    netResult: total.savings
  }));
  const monthKeys = monthsBetween(period.from, period.to);
  const currenciesInRange = new Set([...Object.keys(totals), ...Array.from(evolution.values(), item => item.currency)]);
  const cumulative = new Map(Array.from(currenciesInRange, currency => [currency, { incomeMinor: 0, expensesMinor: 0, refundsMinor: 0 }]));
  const monthlyEvolution = monthKeys.flatMap(month => Array.from(currenciesInRange).map(currency => {
    const bucket = evolution.get(`${month}:${currency}`) || { incomeMinor: 0, expensesMinor: 0, refundsMinor: 0 };
    const running = cumulative.get(currency);
    running.incomeMinor += bucket.incomeMinor;
    running.expensesMinor += bucket.expensesMinor;
    running.refundsMinor += bucket.refundsMinor;
    const netMinor = bucket.incomeMinor - bucket.expensesMinor + bucket.refundsMinor;
    return {
      month, currency,
      income: publicAmount(bucket.incomeMinor, currency), expenses: publicAmount(bucket.expensesMinor, currency),
      refunds: publicAmount(bucket.refundsMinor, currency), netResult: publicAmount(netMinor, currency),
      cumulativeResult: publicAmount(running.incomeMinor - running.expensesMinor + running.refundsMinor, currency)
    };
  }));
  const pending = pendingForRange(db, userId, period.from, period.to);
  const pendingObligations = pending.obligations.filter(item => item.assetId === asset.id);
  const pendingRents = pending.rents.filter(item => item.assetId === asset.id);
  return {
    assetId: asset.id, period: { mode: period.mode, from: period.from, to: period.to }, currencies,
    evolution: monthlyEvolution,
    movements: movements.sort((a, b) => a.date.localeCompare(b.date) || a.concept.localeCompare(b.concept)),
    pending: { obligations: pendingObligations, rents: pendingRents }
  };
}

module.exports = {
  validMonth, monthRange, monthsBetween, postedMovements, actualMovements, globalOverview, allocationsForTransaction,
  movementAttributions, refundAllocations, periodForAsset, assetEconomics
};
