const { overlaps, validateOwnershipSet } = require('../../src/utils/ownership-overlap');

const p = (ownerId, startDate, endDate = null, percentage = null) => ({ ownerId, startDate, endDate, percentage });

describe('ownership overlap', () => {
  it('overlaps is inclusive and handles open ends', () => {
    expect(overlaps(p('a', '2024-01-01', '2024-06-30'), p('a', '2024-06-30'))).toBe(true);
    expect(overlaps(p('a', '2024-01-01', '2024-06-29'), p('a', '2024-06-30'))).toBe(false);
    expect(overlaps(p('a', '2024-01-01'), p('a', '2030-01-01'))).toBe(true);
  });

  it('accepts 50/50 co-owners', () => {
    expect(validateOwnershipSet([p('a', '2024-01-01', null, 50), p('b', '2024-01-01', null, 50)]).ok).toBe(true);
  });

  it('rejects same-holder overlap', () => {
    expect(validateOwnershipSet([p('a', '2024-01-01', '2024-12-31'), p('a', '2024-06-01', '2024-08-31')]).error).toBeTruthy();
  });

  it('accepts adjacent same-holder periods', () => {
    expect(validateOwnershipSet([p('a', '2024-01-01', '2024-12-31'), p('a', '2025-01-01')]).ok).toBe(true);
  });

  it('rejects same-holder open-ended overlap', () => {
    expect(validateOwnershipSet([p('a', '2024-01-01'), p('a', '2025-01-01')]).error).toBeTruthy();
  });

  it('rejects a shared boundary day', () => {
    expect(validateOwnershipSet([p('a', '2024-01-01', '2024-06-30'), p('a', '2024-06-30')]).error).toBeTruthy();
  });

  it('rejects concurrent percentages above 100', () => {
    expect(validateOwnershipSet([p('a', '2024-01-01', null, 60), p('b', '2024-06-01', null, 50)]).error).toBeTruthy();
  });

  it('accepts 100 then 100 after the first closes', () => {
    expect(validateOwnershipSet([p('a', '2024-01-01', '2024-12-31', 100), p('b', '2025-01-01', null, 100)]).ok).toBe(true);
  });

  it('ignores null percentages', () => {
    expect(validateOwnershipSet([p('a', '2024-01-01', null, 100), p('b', '2024-01-01', null, null)]).ok).toBe(true);
  });
});
