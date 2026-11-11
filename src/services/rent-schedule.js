const ledger = require('./account-ledger');
const rentals = require('./rentals');
const obligations = require('./obligations');

/**
 * Current collection period rule: from day 01 to day 10 of a month the current period is that same
 * month; from day 11 on it is the next month (that is the rent and the obligations collected/paid now).
 */
function currentPeriod(today) {
  const [year, month, day] = today.split('-').map(Number);
  if (day <= 10) return today.slice(0, 7);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

function lastDayOf(period) {
  const [year, month] = period.split('-').map(Number);
  return `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
}

/**
 * Bucket of an unpaid item: "upcoming" when it belongs to the current period (or is not due yet in an
 * earlier month), "overdue" when it belongs to a previous month and is already due, null for later periods.
 */
function bucketOf(date, period, today) {
  const month = date.slice(0, 7);
  if (month > period) return null;
  if (month === period || date >= today) return 'upcoming';
  return 'overdue';
}

function rentItems(db, userId, asset, period, today) {
  const through = lastDayOf(period);
  const views = db.findAll('rentalContracts', userId)
    .filter(contract => contract.assetId === asset.id && ['active', 'ended'].includes(contract.status))
    .flatMap(contract => rentals.generateOccurrences(db, userId, contract, contract.status === 'ended' ? (contract.endDate || today) : through));
  return rentals.monthViews(views, today).flatMap(month => {
    const open = month.parts.filter(part => part.remainingMinor > 0);
    const bucket = open.length && month.status !== 'collected' ? bucketOf(month.date, period, today) : null;
    if (!bucket) return [];
    return [{
      bucket, kind: 'rent', id: `rent:${month.key}`, monthKey: month.key, declarationId: month.declarationId, date: month.date, period: month.period,
      status: month.date < today ? 'overdue' : month.status, title: 'Alquiler',
      parts: open.map(part => ({ occurrenceId: part.occurrenceId, modality: part.modality, currencyCode: part.currencyCode, rentAmount: part.rentAmount, remainingAmount: part.remainingAmount, ivaPercent: part.ivaPercent })),
      totals: month.totals.filter(row => row.remainingMinor > 0).map(row => ({ currencyCode: row.currencyCode, remainingAmount: row.remainingAmount }))
    }];
  });
}

function obligationItems(db, userId, asset, period, today) {
  const through = lastDayOf(period);
  return db.findAll(obligations.COLLECTION, userId).filter(item => item.assetId === asset.id && item.status === 'active').flatMap(obligation =>
    obligations.occurrencesFor(db, userId, obligation, { to: through })
      // Only what the owner still has to pay (tenant portions are settled with "Resolver").
      .filter(item => !['paid', 'resolved', 'cancelled'].includes(item.status) && item.remainingAmount > 0)
      .flatMap(item => {
        const bucket = bucketOf(item.date, period, today);
        return bucket ? [{
          bucket, kind: 'obligation', id: `obligation:${item.id}`, obligationId: obligation.id, occurrenceId: item.id, date: item.date,
          period: item.date.slice(0, 7), status: item.status, title: item.title || obligation.title, amount: item.remainingAmount, currencyCode: item.currencyCode,
          responsibilityType: obligation.responsibilityType || 'owner'
        }] : [];
      }));
}

/** "Próximos vencimientos" (current period) and "Pagos atrasados" (previous months) of one property. */
function build(db, userId, asset) {
  const today = ledger.localDateForUser(db, userId);
  const period = currentPeriod(today);
  const items = [...rentItems(db, userId, asset, period, today), ...obligationItems(db, userId, asset, period, today)]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const pick = bucket => items.filter(item => item.bucket === bucket).map(({ bucket: _bucket, ...item }) => item);
  return { assetId: asset.id, today, period, upcoming: pick('upcoming'), overdue: pick('overdue') };
}

module.exports = { build, currentPeriod, bucketOf, lastDayOf };
