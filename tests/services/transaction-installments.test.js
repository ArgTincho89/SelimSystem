const installments = require('../../src/services/transaction-installments');
const { isPostedTransaction, isPendingTransaction } = require('../../src/utils/transaction-status');

describe('transaction installments (cheque and credit)', () => {
  it('splits evenly in minor units with the remainder on the last part', () => {
    expect(installments.splitEvenly(100000, 3)).toEqual([33333, 33333, 33334]);
    expect(installments.splitEvenly(10, 4)).toEqual([2, 2, 2, 4]);
    expect(installments.splitEvenly(500, 1)).toEqual([500]);
  });

  it('adds months keeping the day and clamping to the end of the month', () => {
    expect(installments.addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(installments.addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(installments.addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30');
    expect(installments.addMonthsClamped('2026-11-15', 2)).toBe('2027-01-15');
    expect(installments.addMonthsClamped('2026-12-31', 12)).toBe('2027-12-31');
  });

  it('accepts cheque rows whose amounts add up to the total', () => {
    const result = installments.chequeSchedule([
      { dueDate: '2026-12-01', amount: 333.33, chequeNumber: ' 0001-23456789 ' },
      { dueDate: '2027-01-01', amount: 333.33, chequeNumber: 'A12' },
      { dueDate: '2027-02-01', amount: 333.34, chequeNumber: '99' }
    ], 100000, 'ARS');
    expect(result.rows).toEqual([
      { number: 1, total: 3, dueDate: '2026-12-01', amountMinor: 33333, chequeNumber: '0001-23456789' },
      { number: 2, total: 3, dueDate: '2027-01-01', amountMinor: 33333, chequeNumber: 'A12' },
      { number: 3, total: 3, dueDate: '2027-02-01', amountMinor: 33334, chequeNumber: '99' }
    ]);
  });

  it('rejects invalid cheque rows', () => {
    const row = (extra = {}) => ({ dueDate: '2026-12-01', amount: 1000, chequeNumber: '123', ...extra });
    const error = (rows, total = 100000) => installments.chequeSchedule(rows, total, 'ARS').error;
    expect(error([])).toMatch(/entre 1 y 24/);
    expect(error(Array.from({ length: 25 }, () => row()))).toMatch(/entre 1 y 24/);
    expect(error('x')).toMatch(/entre 1 y 24/);
    expect(error([null])).toMatch(/vencimiento, monto y número/);
    expect(error([row({ dueDate: '' })])).toMatch(/vencimiento de la cuota Nº 1/);
    expect(error([row({ dueDate: '2026-02-30' })])).toMatch(/vencimiento/);
    expect(error([row({ amount: 0 })])).toMatch(/mayor a cero/);
    expect(error([row({ chequeNumber: '' })])).toMatch(/Nº de cheque/);
    expect(error([row({ chequeNumber: '   ' })])).toMatch(/Nº de cheque/);
    expect(error([row({ chequeNumber: 'x'.repeat(31) })])).toMatch(/hasta 30/);
    expect(error([row({ chequeNumber: '12/34' })])).toMatch(/Nº de cheque/);
    expect(error([row({ chequeNumber: 42 })])).toMatch(/Nº de cheque/);
    expect(error([row(), row({ amount: 500 })])).toMatch(/suma de las cuotas/);
    expect(installments.validChequeNumber('x'.repeat(30))).toBe(true);
  });

  it('applies the total interest and splits it evenly (last installment absorbs rounding)', () => {
    const plan = installments.creditSchedule({ baseMinor: 100000, count: 3, interestPercent: 10, purchaseDate: '2026-01-31' });
    expect(plan.totalMinor).toBe(110000);
    expect(plan.rows).toEqual([
      { number: 1, total: 3, amountMinor: 36666, date: '2026-02-28' },
      { number: 2, total: 3, amountMinor: 36666, date: '2026-03-31' },
      { number: 3, total: 3, amountMinor: 36668, date: '2026-04-30' }
    ]);
    expect(installments.totalWithInterest(100000, 12.5)).toBe(112500);
    expect(installments.totalWithInterest(99999, 0)).toBe(99999);
  });

  it('keeps a single credit installment on the purchase date with the interest applied', () => {
    const plan = installments.creditSchedule({ baseMinor: 50000, count: 1, interestPercent: 5, purchaseDate: '2026-11-20' });
    expect(plan.rows).toEqual([{ number: 1, total: 1, amountMinor: 52500, date: '2026-11-20' }]);
  });

  it('rejects invalid credit plans', () => {
    const error = input => installments.creditSchedule({ baseMinor: 1000, count: 2, interestPercent: 0, purchaseDate: '2026-11-20', ...input }).error;
    expect(error({ count: 0 })).toMatch(/entre 1 y 36/);
    expect(error({ count: 37 })).toMatch(/entre 1 y 36/);
    expect(error({ count: 2.5 })).toMatch(/entre 1 y 36/);
    expect(error({ interestPercent: -1 })).toMatch(/interés/);
    expect(error({ interestPercent: '3' })).toMatch(/interés/);
    expect(error({ purchaseDate: 'nope' })).toMatch(/fecha/);
  });

  it('offers Crédito only for expenses and Cheque for expenses and income', () => {
    expect(installments.methodAllowed('Crédito', 'expense')).toBe(true);
    expect(installments.methodAllowed('Crédito', 'income')).toBe(false);
    expect(installments.methodAllowed('Cheque', 'income')).toBe(true);
    expect(installments.methodAllowed('Cheque', 'refund')).toBe(false);
    expect(installments.methodAllowed('', 'refund')).toBe(true);
    expect(installments.methodAllowed('Bitcoin', 'expense')).toBe(false);
    expect(installments.PAYMENT_METHODS).toEqual(['Transferencia', 'Efectivo', 'Débito', 'Crédito', 'Cheque']);
  });

  it('treats only status "pending" as outside the totals', () => {
    expect(isPostedTransaction({})).toBe(true);
    expect(isPostedTransaction({ status: 'posted' })).toBe(true);
    expect(isPostedTransaction({ status: 'pending' })).toBe(false);
    expect(isPostedTransaction(null)).toBe(false);
    expect(isPendingTransaction({ status: 'pending' })).toBe(true);
    expect(isPendingTransaction(undefined)).toBe(false);
  });
});
