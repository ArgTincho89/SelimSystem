const fs = require('fs');
const path = require('path');
const { splitMonthLabel, monthPickerYears, centeredScrollTop, YEAR_PICKER_SPAN } = require('../../public/js/components/monthSelector');

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
    expect(years[years.length - 1]).toBe(2026);
    expect(years[0]).toBe(2026 - YEAR_PICKER_SPAN);
  });

  it('scrolls forward and backward around the selected year when the future is allowed', () => {
    const years = monthPickerYears(2026, 2026, true);
    expect(years[0]).toBe(1976);
    expect(years[years.length - 1]).toBe(2076);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });

  it('always includes the selected year', () => {
    expect(monthPickerYears(2010, 2026, false)).toContain(2010);
    expect(monthPickerYears(1950, 2026, false)[0]).toBe(1900);
  });

  it('centers the selected year inside the list viewport', () => {
    expect(centeredScrollTop(50, 40, 280)).toBe(1880);
    expect(centeredScrollTop(1, 40, 280)).toBe(0);
  });
});

describe('Month navigator wiring', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../public/js/components/monthSelector.js'), 'utf8');
  it('keeps the arrows as the only buttons and opens the pickers from the label', () => {
    expect(source).toContain("create('span', { className: 'month-nav-part', role: 'button'");
    expect(source).toContain("'Elegir mes'");
    expect(source).toContain("'Elegir año'");
  });

  it('renders the year picker as a scrollable list instead of the month grid', () => {
    expect(source).toContain("className: 'year-picker-list', role: 'listbox'");
    expect(source).toContain("Modal.show('Elegir mes', grid, { width: '440px' })");
    const css = fs.readFileSync(path.join(__dirname, '../../public/css/components.css'), 'utf8');
    expect(css).toMatch(/\.year-picker-list \{[^}]*overflow-y: auto/);
    expect(css).toMatch(/\.month-picker-grid \.month-picker-option \{[^}]*white-space: normal/);
  });
});
