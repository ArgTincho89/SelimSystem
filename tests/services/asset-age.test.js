const { ageFor, completedYears, isValidDay } = require('../../src/services/asset-age');

describe('asset age', () => {
  const imm = extra => ({ type: 'immovable', ...extra });

  it('computes completed years from the construction date', () => {
    expect(ageFor(imm({ constructionDate: '2010-03-15' }), '2026-11-09')).toEqual({ years: 16, source: 'constructionDate' });
    expect(ageFor(imm({ constructionDate: '2010-12-01' }), '2026-11-09')).toEqual({ years: 15, source: 'constructionDate' });
  });

  it('counts a leap-day birthday on 03-01 in common years', () => {
    expect(completedYears('2012-02-29', '2025-02-28')).toBe(12);
    expect(completedYears('2012-02-29', '2025-03-01')).toBe(13);
    expect(completedYears('2012-02-29', '2028-02-29')).toBe(16);
  });

  it('uses the legacy value only when there is no date', () => {
    expect(ageFor(imm({ ageYears: 20 }), '2026-11-09')).toEqual({ years: 20, source: 'legacy' });
    expect(ageFor(imm({ ageYears: 20, constructionDate: '2020-01-01' }), '2026-11-09').source).toBe('constructionDate');
  });

  it('returns null for unknown ages and non-immovables', () => {
    expect(ageFor(imm({}), '2026-11-09')).toEqual({ years: null, source: null });
    expect(ageFor({ type: 'movable', constructionDate: '2010-01-01' }, '2026-11-09')).toEqual({ years: null, source: null });
    expect(ageFor(null, '2026-11-09').source).toBeNull();
  });

  it('never goes negative and validates day strings', () => {
    expect(completedYears('2030-01-01', '2026-11-09')).toBe(0);
    expect(isValidDay('2026-02-30')).toBe(false);
    expect(isValidDay('nope')).toBe(false);
    expect(isValidDay('2026-02-28')).toBe(true);
  });
});
