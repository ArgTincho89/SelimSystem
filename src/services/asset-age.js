/**
 * Age helpers for immovables. The age is derived on read from `constructionDate`;
 * the legacy `ageYears` number is only used when no date exists.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDay(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Completed whole years between two YYYY-MM-DD days (calendar compare, so a leap day counts on 03-01 in common years). */
function completedYears(from, to) {
  let years = Number(to.slice(0, 4)) - Number(from.slice(0, 4));
  if (to.slice(5) < from.slice(5)) years -= 1;
  return Math.max(0, years);
}

/** `{years, source}`; source is `constructionDate`, `legacy` or null. */
function ageFor(asset, today) {
  if (!asset || asset.type !== 'immovable') return { years: null, source: null };
  if (isValidDay(asset.constructionDate)) {
    return { years: completedYears(asset.constructionDate, today), source: 'constructionDate' };
  }
  if (Number.isInteger(asset.ageYears)) return { years: asset.ageYears, source: 'legacy' };
  return { years: null, source: null };
}

module.exports = { ageFor, completedYears, isValidDay };
