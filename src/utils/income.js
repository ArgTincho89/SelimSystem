function roundCents(value) {
  const cents = toCents(value);
  return cents === null ? 0 : Number(cents) / 100;
}

function sumCents(...values) {
  let total = 0n;
  for (const value of values) {
    const cents = toCents(value);
    if (cents === null) return null;
    total += cents;
  }
  return fromCents(total);
}

function toCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const match = String(value).match(/^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if (!match) return null;
  const negative = match[1] === '-';
  const fraction = match[3] || '';
  const exponent = Number(match[4] || 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 100) return null;
  const digits = `${match[2]}${fraction}`.replace(/^0+(?=\d)/, '');
  const shift = exponent - fraction.length + 2;
  let cents = BigInt(digits || '0');
  if (shift >= 0) cents *= 10n ** BigInt(shift);
  else {
    const divisor = 10n ** BigInt(-shift);
    const remainder = cents % divisor;
    cents /= divisor;
    if (remainder * 2n >= divisor) cents += 1n;
  }
  return negative ? -cents : cents;
}

function fromCents(cents) {
  return Number(cents) / 100;
}

function divideRound(numerator, denominator) {
  const top = BigInt(numerator);
  const bottom = BigInt(denominator);
  return Number((top + bottom / 2n) / bottom);
}

function getIncomeBreakdown(transaction) {
  const totalCents = toCents(Number(transaction.monto) || 0) || 0n;
  const total = fromCents(totalCents);

  if (transaction.clasificacion === 'A') {
    return { a: total, b: 0 };
  }

  if (transaction.clasificacion === 'Mixto') {
    const a = Number(transaction.montoA);
    const b = Number(transaction.montoB);
    const aCents = toCents(a);
    const bCents = toCents(b);
    if (aCents !== null && bCents !== null && aCents + bCents === totalCents) {
      return { a: fromCents(aCents), b: fromCents(bCents) };
    }
  }

  // Older income records have no classification; keep them reportable as B.
  return { a: 0, b: total };
}

function getIncomePercentages(a, b) {
  const aCents = toCents(a) || 0n;
  const bCents = toCents(b) || 0n;
  const totalCents = aCents + bCents;
  if (totalCents === 0n) return { porcentajeA: 0, porcentajeB: 0 };
  return {
    porcentajeA: divideRound(aCents * 10000n, totalCents) / 100,
    porcentajeB: divideRound(bCents * 10000n, totalCents) / 100
  };
}

// VAT only applies to the A part: full monto for 'A', montoA for 'Mixto', none otherwise.
function getIncomeIva(transaction) {
  const breakdown = getIncomeBreakdown(transaction);
  const ivaPorcentaje = Number(transaction.ivaPorcentaje);
  if (!Number.isFinite(ivaPorcentaje) || ivaPorcentaje <= 0 || breakdown.a <= 0) {
    return 0;
  }
  const amountCents = toCents(breakdown.a) || 0n;
  const rateBasisPoints = toCents(ivaPorcentaje) || 0n;
  return fromCents(divideRound(amountCents * rateBasisPoints, 10000n));
}

function percentOf(amount, percentage) {
  const amountCents = toCents(amount);
  const percentageBasisPoints = toCents(percentage);
  if (amountCents === null || percentageBasisPoints === null) return 0;
  return fromCents(divideRound(amountCents * percentageBasisPoints, 10000n));
}

module.exports = { getIncomeBreakdown, getIncomePercentages, getIncomeIva, roundCents, sumCents, percentOf };
