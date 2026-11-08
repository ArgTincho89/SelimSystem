const { generateRecurringInstances, addDaysDateOnly, dateOnlyDaysBetween } = require('../../src/utils/recurring');

describe('Recurring utilities', () => {
  const transaction = { id: 'quarterly', fecha: '2024-01-15', recurrente: true, frecuencia: 'quarterly' };

  it('generates quarterly instances every three months', () => {
    expect(generateRecurringInstances(transaction, '2024-04')).toHaveLength(1);
    expect(generateRecurringInstances(transaction, '2024-07')).toHaveLength(1);
    expect(generateRecurringInstances(transaction, '2024-02')).toHaveLength(0);
  });

  it('keeps bimonthly cadence at two months', () => {
    const bimonthly = { ...transaction, frecuencia: 'bimonthly' };
    expect(generateRecurringInstances(bimonthly, '2024-03')).toHaveLength(1);
    expect(generateRecurringInstances(bimonthly, '2024-04')).toHaveLength(0);
  });

  it('keeps date-only occurrences on the same calendar day across timezone settings', () => {
    const originalTimezone = process.env.TZ;
    const dateOnlyTransaction = { ...transaction, fecha: '2024-03-10', frecuencia: 'monthly' };

    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(generateRecurringInstances(dateOnlyTransaction, '2024-03')[0].fecha).toBe('2024-03-10');

      process.env.TZ = 'Pacific/Kiritimati';
      expect(generateRecurringInstances(dateOnlyTransaction, '2024-03')[0].fecha).toBe('2024-03-10');
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it('clamps month-end recurrence days using calendar-only date arithmetic', () => {
    const monthEnd = { ...transaction, fecha: '2023-01-31', frecuencia: 'monthly' };
    expect(generateRecurringInstances(monthEnd, '2024-02')[0].fecha).toBe('2024-02-29');
    expect(generateRecurringInstances(monthEnd, '2023-02')[0].fecha).toBe('2023-02-28');
  });

  it('adds and compares calendar days without timezone conversion', () => {
    expect(addDaysDateOnly('2024-03-10', 5)).toBe('2024-03-15');
    expect(addDaysDateOnly('2024-02-28', 1)).toBe('2024-02-29');
    expect(dateOnlyDaysBetween('2024-03-10', '2024-03-15')).toBe(5);
  });
});
