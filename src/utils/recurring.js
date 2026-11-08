function parseDateOnly(value) {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

function daysInMonth(year, month) {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function formatDateOnly(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysDateOnly(value, days) {
  const date = parseDateOnly(value);
  if (!date || !Number.isInteger(days)) return null;
  let { year, month, day } = date;
  let remaining = days;
  while (remaining > 0) {
    if (day < daysInMonth(year, month)) day += 1;
    else {
      day = 1;
      if (month === 12) { month = 1; year += 1; }
      else month += 1;
    }
    remaining -= 1;
  }
  while (remaining < 0) {
    if (day > 1) day -= 1;
    else {
      if (month === 1) { month = 12; year -= 1; }
      else month -= 1;
      day = daysInMonth(year, month);
    }
    remaining += 1;
  }
  return formatDateOnly(year, month, day);
}

function dateOnlyOrdinal(value) {
  const date = parseDateOnly(value);
  if (!date) return null;
  const previousYear = date.year - 1;
  let ordinal = 365 * previousYear + Math.floor(previousYear / 4) - Math.floor(previousYear / 100) + Math.floor(previousYear / 400);
  for (let month = 1; month < date.month; month += 1) ordinal += daysInMonth(date.year, month);
  return ordinal + date.day - 1;
}

function dateOnlyDaysBetween(from, to) {
  const fromOrdinal = dateOnlyOrdinal(from);
  const toOrdinal = dateOnlyOrdinal(to);
  return fromOrdinal === null || toOrdinal === null ? null : toOrdinal - fromOrdinal;
}

function generateRecurringInstances(tx, month) {
  if (!tx.recurrente || !tx.frecuencia) return [];

  const startDate = parseDateOnly(tx.fecha);
  const targetMatch = /^([0-9]{4})-([0-9]{2})$/.exec(month || '');
  if (!startDate || !targetMatch) return [];
  const targetYear = Number(targetMatch[1]);
  const targetMonth = Number(targetMatch[2]);
  if (targetMonth < 1 || targetMonth > 12) return [];
  const occurrenceDay = Math.min(startDate.day, daysInMonth(targetYear, targetMonth));
  const occurrenceDate = formatDateOnly(targetYear, targetMonth, occurrenceDay);

  if (occurrenceDate < tx.fecha) return [];

  if (tx.fechaFin && parseDateOnly(tx.fechaFin) && occurrenceDate > tx.fechaFin) return [];

  let match = false;
  const diffMonths = (targetYear - startDate.year) * 12 + targetMonth - startDate.month;

  if (tx.frecuencia === 'monthly') {
    match = diffMonths >= 0;
  } else if (tx.frecuencia === 'bimonthly') {
    match = diffMonths >= 0 && diffMonths % 2 === 0;
  } else if (tx.frecuencia === 'quarterly') {
    match = diffMonths >= 0 && diffMonths % 3 === 0;
  } else if (tx.frecuencia === 'semiannual') {
    match = diffMonths >= 0 && diffMonths % 6 === 0;
  } else if (tx.frecuencia === 'annual') {
    match = diffMonths >= 0 && diffMonths % 12 === 0;
  }

  if (!match) return [];

  return [{
    ...tx,
    fecha: occurrenceDate,
    isRecurringInstance: true,
    originalId: tx.id,
    id: `${tx.id}-${month}`
  }];
}

function getMonthTransactions(transactions, month) {
  const result = [];
  transactions.forEach(tx => {
    if (tx.fecha && tx.fecha.startsWith(month)) {
      result.push(tx);
    }
    if (tx.recurrente && tx.frecuencia) {
      const instances = generateRecurringInstances(tx, month);
      instances.forEach(inst => {
        if (!result.find(f => f.id === inst.id || f.id === inst.originalId)) {
          result.push(inst);
        }
      });
    }
  });
  return result;
}

module.exports = { generateRecurringInstances, getMonthTransactions, addDaysDateOnly, dateOnlyDaysBetween };
