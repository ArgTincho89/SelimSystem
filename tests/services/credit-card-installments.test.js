const svc = require('../../src/services/credit-card-installments');

describe('credit card installment math', () => {
  it('finances 1000 at 7% over 12 installments in minor units', () => {
    const financed = svc.financedTotalMinor(100000, 7);
    expect(financed).toBe(107000);
    const amounts = svc.installmentAmountsMinor(financed, 12);
    expect(amounts).toHaveLength(12);
    expect(amounts[0]).toBe(8916);
    expect(amounts[11]).toBe(107000 - 8916 * 11);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(107000);
  });

  it('handles fractional interest percentages with basis points', () => {
    expect(svc.interestBasisPoints(7.5)).toBe(750);
    expect(svc.financedTotalMinor(10000, 7.5)).toBe(10750);
    expect(svc.financedTotalMinor(10000, 0)).toBe(10000);
  });

  it('makes the last installment absorb the remainder', () => {
    expect(svc.installmentAmountsMinor(1000, 3)).toEqual([333, 333, 334]);
  });

  it('generates monthly dates starting on or after the purchase date', () => {
    expect(svc.installmentDates('2030-01-10', 15, 3)).toEqual(['2030-01-15', '2030-02-15', '2030-03-15']);
    expect(svc.installmentDates('2030-01-20', 15, 2)).toEqual(['2030-02-15', '2030-03-15']);
    expect(svc.installmentDates('2030-11-20', 5, 3)).toEqual(['2030-12-05', '2031-01-05', '2031-02-05']);
  });

  it('clamps day 31 to the last day of shorter months', () => {
    expect(svc.installmentDates('2030-01-01', 31, 4)).toEqual(['2030-01-31', '2030-02-28', '2030-03-31', '2030-04-30']);
  });

  it('uses February 29 in leap years', () => {
    expect(svc.installmentDates('2028-01-01', 30, 2)).toEqual(['2028-01-30', '2028-02-29']);
  });

  it('validates dates', () => {
    expect(svc.validDate('2030-02-30')).toBe(false);
    expect(svc.validDate('2030-02-28')).toBe(true);
    expect(svc.validDate(null)).toBe(false);
  });

  describe('validatePlan ranges', () => {
    const base = { title: 'TV', purchaseDate: '2030-01-10', totalAmount: 100, accountId: 'x', paymentMethodId: 'y', installmentsCount: 3, dueDay: 10 };
    const error = patch => svc.validatePlan({ findById: () => null }, 'u', { ...base, ...patch }).error;
    it('rejects invalid counts, days, interest and titles', () => {
      expect(error({ installmentsCount: 0 })).toMatch(/cuotas/);
      expect(error({ installmentsCount: 121 })).toMatch(/cuotas/);
      expect(error({ installmentsCount: 2.5 })).toMatch(/cuotas/);
      expect(error({ dueDay: 0 })).toMatch(/vencimiento/);
      expect(error({ dueDay: 32 })).toMatch(/vencimiento/);
      expect(error({ interestPercent: -1 })).toMatch(/interés/);
      expect(error({ interestPercent: 1001 })).toMatch(/interés/);
      expect(error({ title: '  ' })).toMatch(/concepto/);
      expect(error({ notes: 5 })).toMatch(/notas/);
      expect(error({ reminderLeadDays: 91 })).toMatch(/aviso/);
      expect(error({ purchaseDate: '2030-13-01' })).toMatch(/fecha/);
      expect(error({})).toMatch(/cuenta/);
    });
  });
});
