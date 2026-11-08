function createMonthSelector(currentMonth, onChange, options = {}) {
  const container = create('div', { className: 'month-nav' });

  const btnPrev = create('button', { innerHTML: '&lt;', title: 'Mes anterior' });
  const monthLabel = create('h2', { textContent: (options.formatMonthLabel || formatMonth)(currentMonth) });
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
