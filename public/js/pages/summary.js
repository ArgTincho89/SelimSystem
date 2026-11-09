const SummaryPage = {
  currentMonth: null,

  async render(params) {
    const content = $('#page-content');
    const navbar = $('#navbar');
    navbar.style.display = '';
    content.style.paddingBottom = '';

    this.currentMonth = params?.month || getCurrentMonth();
    content.innerHTML = '<div class="loading">Cargando...</div>';

    try {
      const [summary, goals, burnRate] = await Promise.all([
        API.summary.get(this.currentMonth),
        API.goals.list(this.currentMonth).catch(() => []),
        API.summary.burnRate(this.currentMonth, 1).catch(() => null)
      ]);
      this.renderContent(content, summary, goals, burnRate);
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
    }
  },

  renderContent(content, summary, goals, burnRate, options = {}) {
    content.innerHTML = '';

    if (!options.hideMonthNav && !options.analyticsOnly) {
      const monthNav = createMonthSelector(this.currentMonth, (newMonth) => {
        this.currentMonth = newMonth;
        Router.navigate(`/home?month=${newMonth}`);
      }, { allowFuture: true });
      content.appendChild(monthNav);
    }

    if (!options.suppressStats) {
      const statsRow = create('div', { className: 'stats-row' });
      const savingsColor = summary.ahorro >= 0 ? 'var(--success)' : 'var(--danger)';
      const savingsSign = summary.ahorro >= 0 ? '+' : '';

      const currency = summary.activeCurrency || 'ARS';
      statsRow.appendChild(this.createStat('Ingresos', formatearMoneda(summary.ingresos, currency), 'var(--income-color)'));
      statsRow.appendChild(this.createStat('Gastos', formatearMoneda(summary.gastosNetos, currency), 'var(--expense-color)'));
      statsRow.appendChild(this.createStat('Ahorro', `${savingsSign}${formatearMoneda(summary.ahorro, currency)}`, savingsColor));
      content.appendChild(statsRow);
    }

    if (!options.analyticsOnly && summary.currencyTotals?.length) {
      const totalsCard = create('section', { className: 'settings-card currency-totals', 'aria-label': 'Totales mensuales separados por moneda' });
      const totalsHeading = create('div', { className: 'settings-section-heading' });
      totalsHeading.appendChild(create('h3', { textContent: 'Totales por moneda' }));
      const privacyButton = create('button', {
        className: 'btn btn-sm btn-ghost', type: 'button',
        textContent: localStorage.getItem('pate_hide_income') === 'true' ? 'Mostrar importes' : 'Ocultar importes'
      });
      on(privacyButton, 'click', () => {
        const hidden = localStorage.getItem('pate_hide_income') !== 'true';
        localStorage.setItem('pate_hide_income', String(hidden));
        $$('.currency-totals [data-public-value]').forEach(value => { value.textContent = hidden ? '••••••' : value.dataset.publicValue; });
        privacyButton.textContent = hidden ? 'Mostrar importes' : 'Ocultar importes';
      });
      totalsHeading.appendChild(privacyButton);
      totalsCard.appendChild(totalsHeading);
      summary.currencyTotals.forEach(total => {
        const row = create('div', { className: 'account-alert-row' });
        row.appendChild(create('strong', { textContent: total.currency }));
        const values = create('span', { className: 'sensitive-value' });
        const value = `Original ${formatearMoneda(total.originalIncome, total.currency)} · Normalización ${formatearMoneda(total.normalizedIncome, total.currency)} · Representado ${formatearMoneda(total.income, total.currency)} · Gastos ${formatearMoneda(total.expenses, total.currency)} · Ahorro ${formatearMoneda(total.savings, total.currency)}`;
        values.dataset.publicValue = value;
        values.textContent = localStorage.getItem('pate_hide_income') === 'true' ? '••••••' : value;
        row.appendChild(values);
        totalsCard.appendChild(row);
      });
      content.appendChild(totalsCard);
    }

    if (!options.analyticsOnly && goals && goals.length > 0) {
      goals.forEach(goal => {
        const goalCard = this.renderGoalProgress(goal, summary);
        goalCard.dataset.favoriteType = 'goal';
        goalCard.dataset.favoriteKey = String(goal.id ?? `${goal.tipo}:${goal.categoryId ?? goal.modo ?? 'general'}`);
        goalCard.dataset.favoriteLabel = goalCard.querySelector('.goal-progress-label')?.textContent || 'Meta';
        content.appendChild(goalCard);
      });
    }

    if (!options.analyticsOnly && burnRate && burnRate.currentMonth && burnRate.currentMonth.length > 0) {
      const burnCard = this.renderBurnRate(burnRate);
      burnCard.dataset.favoriteType = 'burn-rate';
      burnCard.dataset.favoriteKey = 'burn-rate';
      burnCard.dataset.favoriteLabel = 'Ritmo de gasto';
      content.appendChild(burnCard);
    }

    const chartCats = summary.porCategoria.filter(c => !c.parentId && c.neto > 0);

    if (chartCats.length > 0) {
      const chartCard = create('div', { className: 'chart-container' });
      chartCard.dataset.favoriteType = 'category-chart';
      chartCard.dataset.favoriteKey = 'expense-distribution';
      chartCard.dataset.favoriteLabel = 'Distribución de gastos';
      chartCard.appendChild(create('div', { className: 'chart-title', textContent: 'Distribución de gastos' }));

      const chartWrapper = create('div', { style: { display: 'flex', justifyContent: 'center' } });
      const canvas = create('canvas', { className: 'chart-canvas', role: 'img', 'aria-label': 'Gráfico de distribución de gastos por categoría' });
      chartWrapper.appendChild(canvas);
      chartCard.appendChild(chartWrapper);

      const legend = create('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '16px', justifyContent: 'center' } });
      chartCats.forEach(cat => {
        const item = create('div', { className: 'category-badge' });
        item.appendChild(create('span', {
          className: 'category-dot',
          style: { background: cat.color || '#6c6c7c' }
        }));
        item.appendChild(document.createTextNode(`${cat.nombre} (${formatearMoneda(cat.neto, summary.activeCurrency || 'ARS')})`));
        legend.appendChild(item);
      });
      chartCard.appendChild(legend);
      content.appendChild(chartCard);

      const segments = chartCats.map(cat => ({
        value: cat.neto,
        color: cat.color || '#6c6c7c',
        label: cat.nombre
      }));
      requestAnimationFrame(() => {
        Charts.drawDonut(canvas, segments, 200);
      });
    }

    const catSection = create('div', { className: 'summary-section' });
    let breakdownContent = catSection;
    if (options.categoryDisclosure) {
      const details = create('details', { className: 'desktop-category-disclosure' });
        details.appendChild(create('summary', { textContent: 'Gastos por categoría' }));
      breakdownContent = create('div', { className: 'desktop-category-breakdown-scroll' });
      details.appendChild(breakdownContent);
      catSection.appendChild(details);
    } else {
      catSection.appendChild(create('h3', {
        textContent: 'Gastos por categoría',
        style: { marginBottom: '16px' }
      }));
    }

    const flatCats = summary.porCategoria.filter(c => c.neto > 0);
    if (flatCats.length === 0) {
      breakdownContent.appendChild(create('p', {
        textContent: 'No hay gastos este mes',
        className: 'text-muted text-center'
      }));
    } else {
      const maxNeto = Math.max(...flatCats.map(c => c.neto), 1);

      const renderBreakdown = (cat, depth) => {
        const pct = summary.gastosNetos > 0 ? ((cat.neto / summary.gastosNetos) * 100).toFixed(1) : '0.0';
        const barWidth = (cat.neto / maxNeto) * 100;

        const row = create('div', { style: { marginBottom: '12px', paddingLeft: `${depth * 16}px` } });
        row.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span class="category-badge">
              <span class="category-dot" style="background:${cat.color || '#6c6c7c'}"></span>
              ${cat.nombre}
            </span>
             <span style="font-weight:600;">${formatearMoneda(cat.neto, summary.activeCurrency || 'ARS')} <span style="color:var(--text-muted); font-weight:400; font-size:var(--font-sm);">(${pct}%)</span></span>
          </div>
          <div class="category-bar-track">
            <div class="category-bar-fill" style="width:${barWidth}%; background:${cat.color || '#6c6c7c'};"></div>
          </div>
        `;
        breakdownContent.appendChild(row);

        (cat.children || []).forEach(child => renderBreakdown(child, depth + 1));
      };

      summary.porCategoria.forEach(cat => renderBreakdown(cat, 0));
    }

    content.appendChild(catSection);

    if (summary.fijos > 0 || summary.variables > 0) {
      const fvCard = create('div', { className: 'chart-container' });
      fvCard.dataset.favoriteType = 'expense-split';
      fvCard.dataset.favoriteKey = 'fixed-variable';
      fvCard.dataset.favoriteLabel = 'Fijo vs Variable';
      fvCard.appendChild(create('div', { className: 'chart-title', textContent: 'Fijo vs Variable' }));

      const fvWrapper = create('div', { style: { display: 'flex', justifyContent: 'center' } });
      const fvCanvas = create('canvas', { className: 'chart-canvas', role: 'img', 'aria-label': 'Gráfico de gastos fijos y variables' });
      fvWrapper.appendChild(fvCanvas);
      fvCard.appendChild(fvWrapper);

      const fvTotal = summary.fijos + summary.variables;
      const fijoPct = fvTotal > 0 ? ((summary.fijos / fvTotal) * 100).toFixed(1) : '0.0';
      const varPct = fvTotal > 0 ? ((summary.variables / fvTotal) * 100).toFixed(1) : '0.0';

      const fvLegend = create('div', { className: 'fv-legend' });
      if (summary.fijos > 0) {
        const fijoItem = create('div', { className: 'fv-legend-item' });
        fijoItem.appendChild(create('div', { className: 'category-badge', innerHTML: `<span class="category-dot" style="background:#FF6B6B"></span>Fijo: ${formatearMoneda(summary.fijos, summary.activeCurrency || 'ARS')}` }));
        fijoItem.appendChild(create('div', { className: 'fv-legend-pct', textContent: `${fijoPct}%` }));
        fvLegend.appendChild(fijoItem);
      }
      if (summary.variables > 0) {
        const varItem = create('div', { className: 'fv-legend-item' });
        varItem.appendChild(create('div', { className: 'category-badge', innerHTML: `<span class="category-dot" style="background:#4ECDC4"></span>Variable: ${formatearMoneda(summary.variables, summary.activeCurrency || 'ARS')}` }));
        varItem.appendChild(create('div', { className: 'fv-legend-pct', textContent: `${varPct}%` }));
        fvLegend.appendChild(varItem);
      }
      fvCard.appendChild(fvLegend);
      content.appendChild(fvCard);

      const fvSegments = [];
      if (summary.fijos > 0) fvSegments.push({ value: summary.fijos, color: '#FF6B6B', label: 'Fijo' });
      if (summary.variables > 0) fvSegments.push({ value: summary.variables, color: '#4ECDC4', label: 'Variable' });
      requestAnimationFrame(() => {
        Charts.drawDonut(fvCanvas, fvSegments, 200);
      });
    }

    const holderIncome = summary.incomeBreakdownByHolder || [];
    holderIncome.filter(item => item.A + item.B > 0).forEach(item => {
      const card = create('div', { className: 'chart-container' });
      card.dataset.favoriteType = 'income-split';
      card.dataset.favoriteKey = `income-ab:${item.ownerId || 'unassigned'}:${item.currency}`;
      card.dataset.favoriteLabel = `Ingresos A vs B · ${item.ownerName} · ${item.currency}`;
      card.appendChild(create('div', { className: 'chart-title', textContent: `Ingresos A vs B · ${item.ownerName} (${item.currency})` }));
      const wrapper = create('div', { style: { display: 'flex', justifyContent: 'center' } });
      const canvas = create('canvas', { className: 'chart-canvas', role: 'img', 'aria-label': `Gráfico de ingresos A y B para ${item.ownerName} en ${item.currency}` });
      wrapper.appendChild(canvas);
      card.appendChild(wrapper);
      const legend = create('div', { className: 'fv-legend' });
      [['A', item.A, item.porcentajeA, '#4ECDC4'], ['B', item.B, item.porcentajeB, '#FF6B6B']].forEach(([label, value, pct, color]) => {
        const row = create('div', { className: 'fv-legend-item' });
        row.appendChild(create('div', { className: 'category-badge' }, [
          create('span', { className: 'category-dot', style: { background: color } }),
          document.createTextNode(`${label}: ${formatearMoneda(value, item.currency)}`)
        ]));
        row.appendChild(create('div', { className: 'fv-legend-pct', textContent: `${pct}%` }));
        legend.appendChild(row);
      });
      card.appendChild(legend);
      content.appendChild(card);
      requestAnimationFrame(() => Charts.drawDonut(canvas, [
        { value: item.A, color: '#4ECDC4', label: 'A' },
        { value: item.B, color: '#FF6B6B', label: 'B' }
      ], 200));
    });
    if (summary.normalizedIncome) {
      content.appendChild(create('p', { className: 'account-status-note', textContent: 'La clasificación A/B corresponde a los ingresos originales; las normalizaciones se muestran por moneda.' }));
    }

    if (!options.analyticsOnly) {
      const ivaBadge = this.createIvaBadge(summary);
      ivaBadge.dataset.favoriteType = 'iva-summary';
      ivaBadge.dataset.favoriteKey = 'iva-summary';
      ivaBadge.dataset.favoriteLabel = 'IVA acumulado';
      content.appendChild(ivaBadge);
    }
  },

  renderIvaChart(trends) {
    const card = create('div', { className: 'chart-container' });
    card.dataset.favoriteType = 'trend-iva';
    card.dataset.favoriteKey = 'trend-iva';
    card.dataset.favoriteLabel = 'IVA mensual por titular';
    card.appendChild(create('div', { className: 'chart-title', textContent: 'IVA mensual por titular' }));

    const monthlyData = trends?.monthlyData || [];
    if (monthlyData.length === 0) {
      card.appendChild(create('p', {
        className: 'text-muted text-center',
        textContent: 'No se pudieron cargar los totales mensuales de IVA.'
      }));
      return card;
    }
    monthlyData.forEach(item => {
      const monthCard = create('section', { className: 'account-alert-row', 'aria-label': `IVA ${item.month}` });
      const [year, month] = item.month.split('-');
      const label = new Date(Number(year), Number(month) - 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      monthCard.appendChild(create('strong', { textContent: label }));
      const totals = item.ivaByHolder || [];
      if (!totals.length) {
        monthCard.appendChild(create('span', { className: 'text-muted', textContent: 'Sin ingresos con IVA registrado.' }));
      } else {
        const ownerRows = create('div', { style: { display: 'grid', gap: '4px', marginTop: '6px' } });
        totals.forEach(total => ownerRows.appendChild(create('div', {
          textContent: `${total.ownerName} · ${total.currency}: ${formatearMoneda(total.amount, total.currency)}`
        })));
        monthCard.appendChild(ownerRows);
      }
      card.appendChild(monthCard);
    });

    return card;
  },

  renderGoalProgress(goal, summary) {
    if (goal.tipo === 'gasto_categoria') {
      return this.renderSpendingLimitGoal(goal, summary);
    }
    if (goal.tipo === 'gasto_general') {
      return this.renderGeneralSpendingGoal(goal, summary);
    }
    return this.renderSavingsGoal(goal, summary);
  },

  renderSavingsGoal(goal, summary) {
    const card = create('div', { className: 'goal-progress-card' });
    const header = create('div', { className: 'goal-progress-header' });
    header.appendChild(create('span', { className: 'goal-progress-label', textContent: 'Meta de ahorro' }));

    let goalAmount = 0;
    if (goal.modo === 'monto_fijo') {
      goalAmount = goal.montoFijo;
    } else if (goal.modo === 'porcentaje_salario') {
      goalAmount = (goal.salarioEstimado * goal.porcentaje) / 100;
    } else if (goal.modo === 'porcentaje_ingresos_dinamico') {
      goalAmount = (summary.ingresos * goal.porcentaje) / 100;
    }

    const currentSavings = summary.ahorro;
    const percentage = goalAmount > 0 ? Math.min(Math.round((currentSavings / goalAmount) * 100), 100) : 0;
    const isComplete = currentSavings >= goalAmount;

    header.appendChild(create('span', {
      className: `goal-progress-pct ${isComplete ? 'complete' : ''}`,
      textContent: `${percentage}%`
    }));
    card.appendChild(header);

    const track = create('div', { className: 'goal-progress-track' });
    const fill = create('div', {
      className: `goal-progress-fill ${isComplete ? 'complete' : ''}`,
      style: { width: `${Math.min(percentage, 100)}%` }
    });
    track.appendChild(fill);
    card.appendChild(track);

    const details = create('div', { className: 'goal-progress-details' });
    details.appendChild(create('span', {
      className: isComplete ? 'text-success' : 'text-muted',
      textContent: isComplete ? '¡Meta alcanzada!' : `Objetivo: ${formatearEuro(goalAmount)}`
    }));
    card.appendChild(details);

    return card;
  },

  renderSpendingLimitGoal(goal, summary) {
    const card = create('div', { className: 'goal-progress-card' });
    const header = create('div', { className: 'goal-progress-header' });

    const catLabel = (goal.categoryName || 'Categoría').replace(/^\s*[└─]\s*/, '');
    header.appendChild(create('span', { className: 'goal-progress-label', textContent: `Meta: Límite de gastos por categoría: ${catLabel}` }));

    let goalAmount = 0;
    if (goal.modo === 'monto_fijo') {
      goalAmount = goal.montoFijo;
    } else if (goal.modo === 'porcentaje_salario') {
      goalAmount = (goal.salarioEstimado * goal.porcentaje) / 100;
    } else if (goal.modo === 'porcentaje_ingresos_dinamico') {
      goalAmount = (summary.ingresos * goal.porcentaje) / 100;
    }

    let categorySpend = 0;
    if (summary.porCategoria) {
      let found = false;
      for (const parent of summary.porCategoria) {
        if (parent.categoryId === goal.categoryId) {
          categorySpend = parent.neto;
          found = true;
          break;
        }
        for (const child of (parent.children || [])) {
          if (child.categoryId === goal.categoryId) {
            categorySpend = child.neto;
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    const percentage = goalAmount > 0 ? Math.round((categorySpend / goalAmount) * 100) : 0;
    const isOverLimit = percentage > 100;

    header.appendChild(create('span', {
      className: `goal-progress-pct ${isOverLimit ? 'over-limit' : ''}`,
      textContent: `${percentage}%`
    }));
    card.appendChild(header);

    const track = create('div', { className: 'goal-progress-track' });
    const fill = create('div', {
      className: `goal-progress-fill ${isOverLimit ? 'over-limit' : ''}`,
      style: { width: `${Math.min(percentage, 100)}%` }
    });
    track.appendChild(fill);
    card.appendChild(track);

    const details = create('div', { className: 'goal-progress-details' });
    if (!isOverLimit) {
      details.appendChild(create('span', {
        className: 'text-muted',
        textContent: `${percentage}% consumido (${formatearEuro(categorySpend)} de ${formatearEuro(goalAmount)})`
      }));
    } else {
      const exceso = categorySpend - goalAmount;
      const excesoPct = percentage - 100;

      const infoBlock = create('div', { className: 'goal-progress-exceeded' });
      infoBlock.appendChild(create('div', {
        className: 'goal-exceeded-line',
        innerHTML: `<span class="text-muted">Límite establecido:</span> <strong>${formatearEuro(goalAmount)}</strong>`
      }));
      infoBlock.appendChild(create('div', {
        className: 'goal-exceeded-line',
        innerHTML: `<span class="text-muted">Gasto actual:</span> <strong>${formatearEuro(categorySpend)}</strong>`
      }));
      infoBlock.appendChild(create('div', {
        className: 'goal-exceeded-line goal-exceeded-over',
        innerHTML: `<span>Excedente:</span> <strong>${formatearEuro(exceso)} (+${excesoPct}%)</strong>`
      }));
      details.appendChild(infoBlock);
    }
    card.appendChild(details);

    return card;
  },

  renderGeneralSpendingGoal(goal, summary) {
    const card = create('div', { className: 'goal-progress-card' });
    const header = create('div', { className: 'goal-progress-header' });
    header.appendChild(create('span', { className: 'goal-progress-label', textContent: 'Meta: Límite de gasto general' }));

    let goalAmount = 0;
    if (goal.modo === 'monto_fijo') {
      goalAmount = goal.montoFijo;
    } else if (goal.modo === 'porcentaje_salario') {
      goalAmount = (goal.salarioEstimado * goal.porcentaje) / 100;
    } else if (goal.modo === 'porcentaje_ingresos_dinamico') {
      goalAmount = (summary.ingresos * goal.porcentaje) / 100;
    }

    const currentSpend = summary.gastosNetos;
    const percentage = goalAmount > 0 ? Math.round((currentSpend / goalAmount) * 100) : 0;
    const isOverLimit = percentage >= 100;

    let zoneClass = 'zone-green';
    if (percentage >= 100) zoneClass = 'zone-red';
    else if (percentage >= 76) zoneClass = 'zone-orange';
    else if (percentage >= 50) zoneClass = 'zone-yellow';

    header.appendChild(create('span', {
      className: `goal-progress-pct ${isOverLimit ? 'over-limit' : ''}`,
      textContent: `${percentage}%`
    }));
    card.appendChild(header);

    const track = create('div', { className: 'goal-progress-track' });
    const fill = create('div', {
      className: `goal-progress-fill ${zoneClass}`,
      style: { width: `${Math.min(percentage, 100)}%` }
    });
    track.appendChild(fill);
    card.appendChild(track);

    const details = create('div', { className: 'goal-progress-details' });
    if (!isOverLimit) {
      details.appendChild(create('span', {
        className: 'text-muted',
        textContent: `${percentage}% consumido (${formatearEuro(currentSpend)} de ${formatearEuro(goalAmount)})`
      }));
    } else {
      const exceso = currentSpend - goalAmount;
      const excesoPct = percentage - 100;

      const infoBlock = create('div', { className: 'goal-progress-exceeded' });
      infoBlock.appendChild(create('div', {
        className: 'goal-exceeded-line',
        innerHTML: `<span class="text-muted">Límite establecido:</span> <strong>${formatearEuro(goalAmount)}</strong>`
      }));
      infoBlock.appendChild(create('div', {
        className: 'goal-exceeded-line',
        innerHTML: `<span class="text-muted">Gasto actual:</span> <strong>${formatearEuro(currentSpend)}</strong>`
      }));
      infoBlock.appendChild(create('div', {
        className: 'goal-exceeded-line goal-exceeded-over',
        innerHTML: `<span>Excedente:</span> <strong>${formatearEuro(exceso)} (+${excesoPct}%)</strong>`
      }));
      details.appendChild(infoBlock);
    }
    card.appendChild(details);

    return card;
  },

  renderBurnRate(burnRate) {
    const card = create('div', { className: 'chart-container' });

    const header = create('div', { className: 'chart-title' });
    header.textContent = 'Ritmo de gasto';
    card.appendChild(header);

    const indicator = create('div', { className: `burn-indicator burn-indicator-${burnRate.indicator.direction}` });
    indicator.appendChild(create('span', { className: 'burn-indicator-text', textContent: burnRate.indicator.text }));
    card.appendChild(indicator);

    const legend = create('div', { className: 'burn-legend' });
    legend.appendChild(create('span', { className: 'burn-legend-item', innerHTML: '<span class="burn-legend-dot burn-legend-dot-current"></span>Este mes' }));
    if (burnRate.historical && burnRate.historical.length > 0) {
      legend.appendChild(create('span', { className: 'burn-legend-item', innerHTML: '<span class="burn-legend-dot burn-legend-dot-historical"></span>Promedio' }));
    }
    card.appendChild(legend);

    const wrapper = create('div', { style: { display: 'flex', justifyContent: 'center' } });
    const canvas = create('canvas', { className: 'chart-canvas', role: 'img', 'aria-label': 'Gráfico del ritmo de gasto del mes y su promedio' });
    wrapper.appendChild(canvas);
    card.appendChild(wrapper);

    requestAnimationFrame(() => {
      this.drawBurnRateChart(canvas, burnRate);
    });

    return card;
  },

  drawBurnRateChart(canvas, burnRate) {
    canvas.__chartRender = target => this.drawBurnRateChart(target, burnRate);
    canvas.__chartDraw = () => this.drawBurnRateChart(canvas, burnRate);
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const compact = Boolean(canvas.closest('.desktop-favorite-replica'));
    const w = canvas.parentElement.clientWidth - (compact ? 16 : 48);
    const h = compact ? 46 : 200;
    if (w <= 0) return;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    const padding = compact
      ? { top: 3, right: 4, bottom: 12, left: 30 }
      : { top: 10, right: 10, bottom: 30, left: 60 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const maxDay = Math.max(
      burnRate.currentMonth.length > 0 ? burnRate.currentMonth[burnRate.currentMonth.length - 1].day : 0,
      burnRate.historical && burnRate.historical.length > 0 ? burnRate.historical[burnRate.historical.length - 1].day : 0,
      1
    );

    const allCumulative = [
      ...burnRate.currentMonth.map(d => d.cumulative),
      ...(burnRate.historical || []).map(d => d.cumulative)
    ];
    const maxVal = Math.max(...allCumulative, 1);

    ctx.strokeStyle = '#2a2a4a';
    ctx.lineWidth = 1;
    const gridSteps = compact ? 2 : 4;
    for (let i = 0; i <= gridSteps; i++) {
      const y = padding.top + (chartH / gridSteps) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      const val = maxVal - (maxVal / gridSteps) * i;
      ctx.fillStyle = '#6c6c7c';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = compact ? '8px -apple-system, sans-serif' : '10px -apple-system, sans-serif';
      ctx.fillText(formatearEuro(val), padding.left - (compact ? 5 : 8), y);
    }

    const drawLine = (data, color) => {
      if (!data || data.length === 0) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = padding.left + ((d.day - 1) / (maxDay - 1 || 1)) * chartW;
        const y = padding.top + chartH - (d.cumulative / maxVal) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      data.forEach(d => {
        const x = padding.left + ((d.day - 1) / (maxDay - 1 || 1)) * chartW;
        const y = padding.top + chartH - (d.cumulative / maxVal) * chartH;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, compact ? 2 : 3, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    let averageByDay = [];
    if (burnRate.historical && burnRate.historical.length > 0) {
      const grouped = {};
      burnRate.historical.forEach(d => {
        if (!grouped[d.day]) grouped[d.day] = [];
        grouped[d.day].push(d.cumulative);
      });
      const avgData = Object.entries(grouped).map(([day, vals]) => ({
        day: parseInt(day),
        cumulative: vals.reduce((a, b) => a + b, 0) / vals.length
      })).sort((a, b) => a.day - b.day);
      drawLine(avgData, '#6c6c7c');
      averageByDay = avgData;
    }

    drawLine(burnRate.currentMonth, '#4ECDC4');

    const today = burnRate.currentDay;
    const todayX = padding.left + ((today - 1) / (maxDay - 1 || 1)) * chartW;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#FF6B6B';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(todayX, padding.top);
    ctx.lineTo(todayX, padding.top + chartH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#FF6B6B';
    ctx.font = '9px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Hoy', todayX, padding.top + chartH + (compact ? 7 : 12));

    const series = [
      ...averageByDay.map(point => ({ ...point, label: 'Promedio' })),
      ...burnRate.currentMonth.map(point => ({ ...point, label: 'Este mes' }))
    ];
    const pointAt = point => ({
      x: padding.left + ((point.day - 1) / (maxDay - 1 || 1)) * chartW,
      y: padding.top + chartH - (point.cumulative / maxVal) * chartH,
      text: `${point.label} · Día ${point.day}: ${formatearEuro(point.cumulative)}`
    });
    const accessiblePoints = series.map(pointAt);
    Charts.bindTooltip(canvas, (x, y) => {
      let nearest = null;
      let distance = Infinity;
      series.forEach(point => {
        const candidate = pointAt(point);
        const candidateDistance = Math.hypot(candidate.x - x, candidate.y - y);
        if (candidateDistance < distance) {
          distance = candidateDistance;
          nearest = candidate;
        }
      });
      return distance <= 12 ? nearest : null;
    }, accessiblePoints);
  },

  createStat(label, value, color) {
    const card = create('div', { className: 'stat-card' });
    card.appendChild(create('div', { className: 'stat-label', textContent: label }));
    const val = create('div', { className: 'stat-value', textContent: value });
    val.style.color = color;
    card.appendChild(val);
    return card;
  },

  createIvaBadge(summary) {
    const badge = create('div', { className: 'category-badge' });
    badge.style.justifyContent = 'center';
    badge.style.marginTop = '12px';
    badge.innerHTML = `<span class="category-dot" style="background:#FFE66D"></span>IVA acumulado: ${formatearEuro(summary.ivaAcumulado ?? 0)}`;
    return badge;
  }
};
