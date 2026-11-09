const { validateHolders } = require('../../src/services/asset-holders');

describe('validateHolders', () => {
  it('accepts a single titular without percentage', () => {
    expect(validateHolders([{ ownerId: 'a' }]).value).toEqual([{ ownerId: 'a', percentage: null }]);
  });

  it('rejects an invalid single percentage', () => {
    expect(validateHolders([{ ownerId: 'a', percentage: 0 }]).error).toBeTruthy();
  });

  it('requires a percentage for every titular when there are several', () => {
    expect(validateHolders([{ ownerId: 'a', percentage: 100 }, { ownerId: 'b' }]).error).toBeTruthy();
    expect(validateHolders([{ ownerId: 'a', percentage: 100 }, { ownerId: 'b', percentage: 0 }]).error).toBeTruthy();
  });

  it('rejects a sum different from 100', () => {
    expect(validateHolders([{ ownerId: 'a', percentage: 60 }, { ownerId: 'b', percentage: 30 }]).error).toMatch(/100/);
  });

  it('accepts a sum of 100', () => {
    expect(validateHolders([{ ownerId: 'a', percentage: 60 }, { ownerId: 'b', percentage: 40 }]).value).toHaveLength(2);
    expect(validateHolders([{ ownerId: 'a', percentage: 33.33 }, { ownerId: 'b', percentage: 66.67 }]).error).toBeUndefined();
  });

  it('rejects duplicates, empty and malformed lists', () => {
    expect(validateHolders([{ ownerId: 'a', percentage: 50 }, { ownerId: 'a', percentage: 50 }]).error).toBeTruthy();
    expect(validateHolders([]).error).toBeTruthy();
    expect(validateHolders(undefined).error).toBeTruthy();
    expect(validateHolders([{ percentage: 100 }]).error).toBeTruthy();
  });
});
