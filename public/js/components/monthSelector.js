// Month navigator: "<" / ">" buttons around the month label. The month name and the year inside the label are
// clickable (role="button" spans, so the only <button>s stay the arrows) and open a month or a year picker.
const MONTH_PICKER_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Splits a formatted label ("Noviembre de 2026", "Noviembre 2026") into month text, separator and year.
function splitMonthLabel(label, year) {
  const index = label.lastIndexOf(year);
  if (index < 0) return null;
  const before = label.slice(0, index);
  const monthText = before.replace(/(\s+de)?\s*$/, '');
  return { monthText, separator: before.slice(monthText.length), year, after: label.slice(index + year.length) };
}

// Years offered by the year picker: a window around the selected year, never past the current year
// unless future months are allowed.
function monthPickerYears(selectedYear, currentYear, allowFuture) {
  const last = allowFuture ? Math.max(selectedYear, currentYear) + 2 : currentYear;
  const first = Math.min(selectedYear, currentYear) - 6;
  const years = [];
  for (let year = last; year >= first; year -= 1) years.push(year);
  return years;
}

function openMonthPicker(currentMonth, onChange, options, part) {
  const [year, month] = currentMonth.split('-').map(Number);
  const today = getCurrentMonth();
  const isFuture = value => !options.allowFuture && value > today;
  const grid = create('div', { className: 'month-picker-grid', role: 'listbox', 'aria-label': part === 'month' ? 'Mes' : 'Año' });
  const choose = value => { Modal.hide(); if (value !== currentMonth) onChange(value); };
  if (part === 'month') {
    MONTH_PICKER_NAMES.forEach((name, index) => {
      const value = `${year}-${String(index + 1).padStart(2, '0')}`;
      grid.appendChild(create('button', {
        type: 'button', className: `btn btn-secondary month-picker-option${index + 1 === month ? ' selected' : ''}`,
        role: 'option', 'aria-selected': String(index + 1 === month), textContent: name, disabled: isFuture(value), onClick: () => choose(value)
      }));
    });
  } else {
    monthPickerYears(year, Number(today.slice(0, 4)), options.allowFuture).forEach(option => {
      // Keep the month when changing the year; clamp to the current month when the future is not allowed.
      let value = `${option}-${String(month).padStart(2, '0')}`;
      if (isFuture(value)) value = today;
      grid.appendChild(create('button', {
        type: 'button', className: `btn btn-secondary month-picker-option${option === year ? ' selected' : ''}`,
        role: 'option', 'aria-selected': String(option === year), textContent: String(option), onClick: () => choose(value)
      }));
    });
  }
  Modal.show(part === 'month' ? 'Elegir mes' : 'Elegir año', grid, { width: '360px' });
}

function createMonthSelector(currentMonth, onChange, options = {}) {
  const container = create('div', { className: 'month-nav' });

  const btnPrev = create('button', { innerHTML: '&lt;', title: 'Mes anterior' });
  const label = (options.formatMonthLabel || formatMonth)(currentMonth);
  const monthLabel = create('h2', {});
  const parts = splitMonthLabel(label, currentMonth.slice(0, 4));
  const pickerPart = (text, part, ariaLabel) => {
    const span = create('span', { className: 'month-nav-part', role: 'button', tabindex: '0', 'aria-label': ariaLabel, title: ariaLabel, textContent: text, dataset: { part } });
    const open = () => openMonthPicker(currentMonth, onChange, options, part);
    on(span, 'click', open);
    on(span, 'keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
    return span;
  };
  if (parts) {
    monthLabel.appendChild(pickerPart(parts.monthText, 'month', 'Elegir mes'));
    if (parts.separator) monthLabel.appendChild(document.createTextNode(parts.separator));
    monthLabel.appendChild(pickerPart(parts.year, 'year', 'Elegir año'));
    if (parts.after) monthLabel.appendChild(document.createTextNode(parts.after));
  } else {
    monthLabel.textContent = label;
  }
  const btnNext = create('button', { innerHTML: '&gt;', title: 'Mes siguiente' });

  if (!options.allowFuture) {
    const today = getCurrentMonth();
    btnNext.style.visibility = currentMonth >= today ? 'hidden' : 'visible';
  }

  on(btnPrev, 'click', () => onChange(addMonths(currentMonth, -1)));
  on(btnNext, 'click', () => onChange(addMonths(currentMonth, 1)));

  container.appendChild(btnPrev);
  container.appendChild(monthLabel);
  container.appendChild(btnNext);

  return container;
}

if (typeof module !== 'undefined') module.exports = { splitMonthLabel, monthPickerYears };
