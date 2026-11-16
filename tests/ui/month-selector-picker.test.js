const fs = require('fs');
const path = require('path');
const { splitMonthLabel, monthPickerYears } = require('../../public/js/components/monthSelector');

describe('Month navigator label split', () => {
  it('splits "Noviembre de 2026" keeping the original text', () => {
    const parts = splitMonthLabel('Noviembre de 2026', '2026');
    expect(parts).toEqual({ monthText: 'Noviembre', separator: ' de ', year: '2026', after: '' });
    expect(parts.monthText + parts.separator + parts.year + parts.after).toBe('Noviembre de 2026');
  });

  it('splits "Noviembre 2026"', () => {
    expect(splitMonthLabel('Noviembre 2026', '2026')).toMatchObject({ monthText: 'Noviembre', separator: ' ' });
  });

  it('returns null when the year is not in the label', () => {
    expect(splitMonthLabel('Noviembre', '2026')).toBeNull();
  });
});

describe('Year picker range', () => {
  it('stops at the current year when the future is not allowed', () => {
    const years = monthPickerYears(2026, 2026, false);
    expect(years[0]).toBe(2026);
    expect(years).toContain(2020);
  });

  it('offers two future years when allowed', () => {
    expect(monthPickerYears(2026, 2026, true)[0]).toBe(2028);
  });

  it('always includes the selected year', () => {
    expect(monthPickerYears(2010, 2026, false)).toContain(2010);
  });
});

describe('Month navigator wiring', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../public/js/components/monthSelector.js'), 'utf8');
  it('keeps the arrows as the only buttons and opens the pickers from the label', () => {
    expect(source).toContain("create('span', { className: 'month-nav-part', role: 'button'");
    expect(source).toContain("'Elegir mes'");
    expect(source).toContain("'Elegir año'");
  });
});
