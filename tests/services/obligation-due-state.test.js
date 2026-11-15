const { dueStateFor } = require('../../src/services/obligations');

describe('dueStateFor', () => {
  it('is due-soon the day before and on the due day, in the current month', () => {
    expect(dueStateFor('expected', '2026-11-10', '2026-11-09')).toBe('due-soon');
    expect(dueStateFor('expected', '2026-11-10', '2026-11-10')).toBe('due-soon');
    expect(dueStateFor('confirmed', '2026-11-28', '2026-11-01')).toBe('due-soon');
  });

  it('is overdue once the status says so (the day after the due day)', () => {
    expect(dueStateFor('overdue', '2026-11-10', '2026-11-11')).toBe('overdue');
    expect(dueStateFor('overdue', '2026-09-10', '2026-11-11')).toBe('overdue');
  });

  it('is pending for a later month', () => {
    expect(dueStateFor('expected', '2026-12-10', '2026-11-30')).toBe('pending');
    expect(dueStateFor('partial', '2027-01-10', '2026-11-30')).toBe('pending');
  });

  it('treats partial as due-soon in the current month', () => {
    expect(dueStateFor('partial', '2026-11-20', '2026-11-05')).toBe('due-soon');
  });

  it('maps paid, resolved and cancelled regardless of dates', () => {
    expect(dueStateFor('paid', '2026-10-10', '2026-11-11')).toBe('paid');
    expect(dueStateFor('resolved', '2026-11-10', '2026-11-11')).toBe('paid');
    expect(dueStateFor('cancelled', '2026-11-10', '2026-11-05')).toBe('cancelled');
  });

  it('uses the user local day at a month boundary', () => {
    // 2026-11-30 local is still November; the same instant in UTC may already be December.
    expect(dueStateFor('expected', '2026-11-30', '2026-11-30')).toBe('due-soon');
    expect(dueStateFor('expected', '2026-12-01', '2026-11-30')).toBe('pending');
  });
});
