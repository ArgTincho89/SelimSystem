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

// Years offered by the year list: a wide window (YEAR_PICKER_SPAN years each way) around the selected year,
// never past the current year unless future months are allowed. Ascending, so scrolling down goes forward in time.
const YEAR_PICKER_SPAN = 50;

function monthPickerYears(selectedYear, currentYear, allowFuture, span = YEAR_PICKER_SPAN) {
  const last = allowFuture ? Math.max(selectedYear, currentYear) + span : Math.max(selectedYear, currentYear);
  const first = Math.min(selectedYear, currentYear) - span;
  const years = [];
  for (let year = first; year <= last; year += 1) years.push(year);
  return years;
}

// Scroll offset that centers the option at `index` inside a list of fixed-height rows.
function centeredScrollTop(index, rowHeight, viewportHeight) {
  return Math.max(0, Math.round(index * rowHeight - (viewportHeight - rowHeight) / 2));
}

function openMonthPicker(currentMonth, onChange, options, part) {
  const [year, month] = currentMonth.split('-').map(Number);
  const today = getCurrentMonth();
  const isFuture = value => !options.allowFuture && value > today;
  const choose = value => { Modal.hide(); if (value !== currentMonth) onChange(value); };
  if (part === 'year') return openYearList(year, month, today, isFuture, options, choose);
  const grid = create('div', { className: 'month-picker-grid', role: 'listbox', 'aria-label': 'Mes' });
  MONTH_PICKER_NAMES.forEach((name, index) => {
    const value = `${year}-${String(index + 1).padStart(2, '0')}`;
    grid.appendChild(create('button', {
      type: 'button', className: `btn btn-secondary month-picker-option${index + 1 === month ? ' selected' : ''}`,
      role: 'option', 'aria-selected': String(index + 1 === month), textContent: name, disabled: isFuture(value), onClick: () => choose(value)
    }));
  });
  // Wide enough for "Septiembre" in three columns: nothing truncates and there is no horizontal scroll.
  Modal.show('Elegir mes', grid, { width: '440px' });
}

// Year picker: a scrollable drop-down list opened on the selected year, free to scroll up or down to any year.
function openYearList(year, month, today, isFuture, options, choose) {
  const ROW_HEIGHT = 44;
  const list = create('div', { className: 'year-picker-list', role: 'listbox', 'aria-label': 'Año', tabindex: '0' });
  let selected = null;
  const years = monthPickerYears(year, Number(today.slice(0, 4)), options.allowFuture);
  years.forEach(option => {
    // Keep the month when changing the year; clamp to the current month when the future is not allowed.
    let value = `${option}-${String(month).padStart(2, '0')}`;
    if (isFuture(value)) value = today;
    const button = create('button', {
      type: 'button', className: `year-picker-option${option === year ? ' selected' : ''}`, dataset: { year: String(option) },
      role: 'option', 'aria-selected': String(option === year), textContent: String(option), onClick: () => choose(value)
    });
    if (option === year) selected = button;
    list.appendChild(button);
  });
  Modal.show('Elegir año', list, { width: '320px' });
  const center = () => {
    list.scrollTop = centeredScrollTop(years.indexOf(year), selected?.offsetHeight || ROW_HEIGHT, list.clientHeight || ROW_HEIGHT * 7);
    if (selected && typeof selected.focus === 'function') selected.focus({ preventScroll: true });
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(center); else center();
  return list;
}

function createMonthSelector(currentMonth, onChange, options = {}) {
  const container = create('div', { className: 'month-nav' });

  const btnPrev = create('button', { innerHTML: '&lt;', title: 'Mes anterior', dataset: { repeatable: '' } });
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
  const btnNext = create('button', { innerHTML: '&gt;', title: 'Mes siguiente', dataset: { repeatable: '' } });

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

if (typeof module !== 'undefined') module.exports = { splitMonthLabel, monthPickerYears, centeredScrollTop, YEAR_PICKER_SPAN };
