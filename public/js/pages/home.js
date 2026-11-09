const HomePage = {
  currentMonth: null,
  chartResizeObserver: null,
  statFitObserver: null,
  favorite: null,
  desktopStatsRow: null,
  desktopAnalyticsRoot: null,

  async render(params) {
    const content = $('#page-content');
    const navbar = $('#navbar');
    const desktop = App.isDesktop();
    navbar.style.display = '';
    content.style.paddingBottom = '';

    this.currentMonth = params?.month || getCurrentMonth();

    if (params?.month) {
      content.classList.remove('visible');
      await new Promise(r => setTimeout(r, 120));
    }

    content.classList.add('page-content-fade');
    content.innerHTML = '<div class="loading">Cargando...</div>';

    try {
      const trendsFrom = addMonths(this.currentMonth, -5);
      const [summary, transactions, categories, accounts, trends, overview] = await Promise.all([
        API.summary.get(this.currentMonth),
        API.transactions.list(this.currentMonth),
        API.categories.list(),
        API.accounts.list(),
        API.trends.get(trendsFrom, this.currentMonth, null).catch(() => null),
        API.finance.overview(this.currentMonth)
      ]);

      localStorage.setItem('pate_app_currency', summary.activeCurrency || 'ARS');
      this.renderContent(content, summary, transactions, categories, { desktop, accounts, trends, overview });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          content.classList.add('visible');
        });
      });
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
      content.classList.add('visible');
    }
  },

  renderContent(content, summary, transactions, categories, options = {}) {
    this.statFitObserver?.disconnect();
    if (options.desktop) {
      this.renderDesktopContent(content, summary, transactions, categories, options);
      return;
    }

    const catMap = {};
    categories.forEach(c => catMap[c.id] = c);

    content.innerHTML = '';

    let transactionPane = content;

    const monthNav = createMonthSelector(this.currentMonth, (newMonth) => {
      this.currentMonth = newMonth;
      Router.navigate(`/home?month=${newMonth}`);
    }, { allowFuture: true });
    transactionPane.appendChild(monthNav);

    const incomeHidden = localStorage.getItem('pate_hide_income') === 'true';

    const statsRow = create('div', { className: 'stats-row home-stats' });

    const overview = options.overview || { currencies: [], movements: [], transfers: [], pending: { obligations: [], rents: [] } };
    const incomeCard = this.createStat('Ingresos', this.overviewMetricCurrencyRows(overview, 'income'), 'var(--income-color)');
    this.attachEconomicDrilldown(incomeCard, overview, 'income');
    statsRow.appendChild(incomeCard);
    const expenseCard = this.createStat('Gastos', this.overviewMetricCurrencyRows(overview, 'netExpenses'), 'var(--expense-color)');
    this.attachEconomicDrilldown(expenseCard, overview, 'net-expense');
    statsRow.appendChild(expenseCard);
    const activeSavings = overview.currencies?.find(total => total.currency === overview.activeCurrency)?.savings || 0;
    const savingsColor = activeSavings >= 0 ? 'var(--success)' : 'var(--danger)';
    const savingsCard = this.createStat('Ahorro', this.overviewMetricCurrencyRows(overview, 'savings'), savingsColor);
    this.attachEconomicDrilldown(savingsCard, overview, 'savings');
    statsRow.appendChild(savingsCard);

    const sensitiveValues = $$('.stat-value', statsRow);
    if (incomeHidden) {
      sensitiveValues.forEach(value => value.classList.add('income-blurred'));
    }

    if (!options.desktop) transactionPane.appendChild(statsRow);
    if (!options.desktop) transactionPane.appendChild(this.renderEconomicContext(overview));
    if (!options.desktop) transactionPane.appendChild(this.renderAccountCards(options.accounts || []));
    if (!options.desktop) {
      const analytics = create('section', { className: 'home-analytics', 'aria-label': 'Analítica' });
      analytics.appendChild(create('h2', { className: 'page-title', textContent: 'Analítica' }));
      const analyticsContent = create('div', { className: 'home-analytics-content' });
      SummaryPage.renderContent(analyticsContent, summary, [], null, {
        suppressStats: true,
        analyticsOnly: true,
        categoryDisclosure: true
      });
      analyticsContent.appendChild(SummaryPage.renderIvaChart(options.trends));
      analytics.appendChild(analyticsContent);
      transactionPane.appendChild(analytics);
    }
    if (!options.desktop) {
      this.observeStatRow(statsRow);
      requestAnimationFrame(() => this.fitStatValues(statsRow));
    }

    if (transactions.length > 0 || this.hasActiveFilters()) {
      const txSection = create('div');

      const txHeader = create('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } });
      txHeader.appendChild(create('h3', {
        textContent: 'Transacciones',
        style: { fontSize: 'var(--font-md)', margin: 0 }
      }));

      const txActions = create('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } });

      const SVG_EYE_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
      const SVG_EYE_CLOSED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

      const eyeBtn = create('button', {
        className: 'eye-toggle-btn',
        innerHTML: incomeHidden ? SVG_EYE_CLOSED : SVG_EYE_OPEN,
        title: incomeHidden ? 'Mostrar ingresos' : 'Ocultar ingresos'
      });
      on(eyeBtn, 'click', () => {
        const nowHidden = localStorage.getItem('pate_hide_income') !== 'true';
        this.applyPrivacy(nowHidden);
        sensitiveValues.forEach(value => value.classList.toggle('income-blurred', nowHidden));
        eyeBtn.innerHTML = nowHidden ? SVG_EYE_CLOSED : SVG_EYE_OPEN;
        eyeBtn.title = nowHidden ? 'Mostrar ingresos' : 'Ocultar ingresos';
      });
      txActions.appendChild(eyeBtn);

      const filterBtn = create('button', {
        className: 'btn btn-sm btn-ghost btn-filter',
        textContent: this.hasActiveFilters() ? 'Filtrando' : 'Filtrar'
      });
      if (this.hasActiveFilters()) filterBtn.style.color = 'var(--accent)';
      on(filterBtn, 'click', () => this.showFilterModal(categories, transactions));
      txActions.appendChild(filterBtn);
      txHeader.appendChild(txActions);
      txSection.appendChild(txHeader);

      const filtered = this.applyFilters(transactions);

      if (filtered.length === 0) {
        txSection.appendChild(create('div', {
          className: 'empty-state',
          innerHTML: '<p class="empty-state-text">No hay transacciones con estos filtros</p>'
        }));
      } else {
        const grouped = groupTransactionsByDate(filtered);
        grouped.forEach(group => {
          const dayHeader = create('div', { className: 'day-header', textContent: formatFechaLarga(group.fecha) });
          txSection.appendChild(dayHeader);

          group.items.forEach(tx => {
            const cat = catMap[tx.categoryId];
            const publicLabel = `${tx.titulo}, ${tx.isTransfer ? `${formatearMoneda(tx.monto, tx.fromCurrency)} a ${formatearMoneda(tx.receivedAmount, tx.toCurrency)}` : formatearMoneda(tx.monto, tx.currencyCode || 'EUR')}`;
            const privateLabel = `${tx.titulo}, importe oculto`;
            const item = create('div', {
              className: 'transaction-item', role: 'button', tabindex: '0',
              'aria-label': localStorage.getItem('pate_hide_income') === 'true' ? privateLabel : publicLabel
            });
            item.dataset.publicAriaLabel = publicLabel;
            item.dataset.privateAriaLabel = privateLabel;

            const colors = { expense: 'var(--expense-color)', income: 'var(--income-color)', refund: 'var(--refund-color)', transfer: 'var(--accent)' };
            const icons = { expense: '💸', income: '💰', refund: '↩️', transfer: '↔️' };

            const iconBg = colors[tx.tipo] || 'var(--text-muted)';
            const icon = create('div', {
              className: 'transaction-icon',
              style: { background: `${iconBg}22`, color: iconBg },
              textContent: icons[tx.tipo]
            });

            const info = create('div', { className: 'transaction-info' });
            info.appendChild(create('div', { className: 'transaction-title', textContent: tx.titulo }));

             const catName = tx.isTransfer ? `${tx.status === 'posted' ? 'Contabilizada' : 'Programada'} · ${tx.accountName}` : tx.tipo === 'income' ? `Ingreso${tx.clasificacion ? ` (${tx.clasificacion})` : ''}` : (tx.tipo === 'refund' ? 'Reembolso' : (cat ? cat.nombre : 'Sin categoría'));
            info.appendChild(create('div', { className: 'transaction-category', textContent: catName }));

            const sign = tx.tipo === 'expense' ? '-' : '+';
            const amountClass = tx.tipo;
            const displayedAmount = tx.isTransfer
              ? `${formatearMoneda(tx.monto, tx.fromCurrency)} → ${formatearMoneda(tx.receivedAmount, tx.toCurrency)}`
              : `${sign}${formatearMoneda(tx.monto, tx.currencyCode || 'EUR')}`;
            const amount = create('div', {
              className: `transaction-amount ${amountClass}`,
              textContent: displayedAmount
            });
            this.markSensitive(amount);

            item.appendChild(icon);
            item.appendChild(info);
            item.appendChild(amount);

            item.style.cursor = 'pointer';
            on(item, 'click', () => this.showTransactionOptions(tx, catMap));
            on(item, 'keydown', event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this.showTransactionOptions(tx, catMap);
              }
            });

            txSection.appendChild(item);
          });
        });
      }

      transactionPane.appendChild(txSection);
    } else {
      transactionPane.appendChild(create('div', {
        className: 'empty-state',
        innerHTML: '<div class="empty-state-icon">📊</div><p class="empty-state-text">No hay transacciones este mes</p>'
      }));
    }

    const fab = create('button', {
      className: 'fab',
      textContent: '+',
      title: 'Agregar transacción'
    });
    on(fab, 'click', () => TransactionForm.show(
      () => this.render({ month: this.currentMonth })
    ));
    content.appendChild(fab);
  },

  renderDesktopContent(content, summary, transactions, categories, options) {
    this.chartResizeObserver?.disconnect();
    this.favorite = this.readDesktopFavorite();
    content.innerHTML = '';
    content.appendChild(create('h1', { className: 'visually-hidden', textContent: 'Inicio' }));

    let hidden = localStorage.getItem('pate_hide_income') === 'true';
    const overview = options.overview || { currencies: [], movements: [], transfers: [], pending: { obligations: [], rents: [] } };
    const activeSavings = overview.currencies?.find(total => total.currency === overview.activeCurrency)?.savings || 0;
    const values = {
      ingresos: this.overviewMetricCurrencyRows(overview, 'income'),
      gastosNetos: this.overviewMetricCurrencyRows(overview, 'netExpenses'),
      ahorro: this.overviewMetricCurrencyRows(overview, 'savings')
    };

    const statsRow = create('div', { className: 'stats-row desktop-home-stats home-stats', 'aria-label': 'Resumen del mes' });
    this.desktopStatsRow = statsRow;
    const descriptors = [
      { id: 'ingresos', label: 'Ingresos', color: 'var(--income-color)', type: 'income' },
      { id: 'gastosNetos', label: 'Gastos', color: 'var(--expense-color)', type: 'net-expense' },
      { id: 'ahorro', label: 'Ahorro', color: activeSavings > 0 ? 'var(--success)' : activeSavings < 0 ? 'var(--danger)' : 'var(--text-primary)', type: 'savings' }
    ];

    this.renderDesktopStats(statsRow, descriptors, values, hidden, overview);
    content.appendChild(statsRow);
    content.appendChild(this.renderEconomicContext(overview));
    content.appendChild(this.renderAccountCards(options.accounts || []));

    const controls = create('div', { className: 'desktop-home-controls', 'aria-label': 'Controles de inicio' });
    const controlActions = create('div', { className: 'desktop-control-actions' });
    const newTransaction = create('button', {
      className: 'btn btn-primary desktop-new-transaction',
      type: 'button',
      innerHTML: '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg><span>Nueva transacción</span>'
    });
    on(newTransaction, 'click', () => TransactionForm.show(() => this.render({ month: this.currentMonth })));
    controlActions.appendChild(newTransaction);

    const eyeOpen = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const eyeClosed = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    const eyeButton = create('button', {
      className: 'eye-toggle-btn desktop-eye-toggle',
      type: 'button',
      innerHTML: hidden ? eyeClosed : eyeOpen,
      title: hidden ? 'Mostrar métricas principales' : 'Ocultar métricas principales',
      'aria-label': hidden ? 'Métricas principales ocultas' : 'Métricas principales visibles',
      'aria-pressed': String(hidden)
    });
    on(eyeButton, 'click', () => {
      const shouldHide = localStorage.getItem('pate_hide_income') !== 'true';
      this.applyPrivacy(shouldHide);
      hidden = shouldHide;
      eyeButton.innerHTML = shouldHide ? eyeClosed : eyeOpen;
      eyeButton.title = shouldHide ? 'Mostrar métricas principales' : 'Ocultar métricas principales';
      eyeButton.setAttribute('aria-label', shouldHide ? 'Métricas principales ocultas' : 'Métricas principales visibles');
      eyeButton.setAttribute('aria-pressed', String(shouldHide));
      this.renderDesktopStats(statsRow, descriptors, values, shouldHide, overview);
      this.renderFavoriteSlot();
    });
    controlActions.appendChild(eyeButton);

    const filterButton = create('button', {
      className: `btn btn-sm btn-ghost btn-filter desktop-filter-btn${this.hasActiveFilters() ? ' active' : ''}`,
      type: 'button',
      textContent: 'Filtro',
      'aria-pressed': String(this.hasActiveFilters())
    });
    on(filterButton, 'click', () => this.showFilterModal(categories, transactions));
    controlActions.appendChild(filterButton);

    const monthSelector = createMonthSelector(this.currentMonth, (newMonth) => {
      this.currentMonth = newMonth;
      Router.navigate(`/home?month=${newMonth}`);
    }, { allowFuture: true, formatMonthLabel });
    monthSelector.classList.add('desktop-month-selector');
    monthSelector.setAttribute('aria-label', 'Seleccionar mes');
    monthSelector.querySelectorAll('button')[0].setAttribute('aria-label', 'Mes anterior');
    monthSelector.querySelectorAll('button')[1].setAttribute('aria-label', 'Mes siguiente');
    controls.appendChild(controlActions);
    controls.appendChild(monthSelector);
    content.appendChild(controls);

    const workspace = create('div', { className: 'desktop-home-workspace' });
    const transactionsPanel = create('section', { className: 'desktop-home-transactions', 'aria-label': 'Transacciones' });
    const transactionHeading = create('h2', { className: 'page-title desktop-home-title', textContent: 'Transacciones' });
    transactionsPanel.appendChild(transactionHeading);
    const transactionList = create('div', { className: 'desktop-home-transaction-scroll' });
    this.renderDesktopTransactions(transactionList, transactions, categories);
    transactionsPanel.appendChild(transactionList);

    const analyticsPanel = create('section', { className: 'desktop-home-analytics', 'aria-label': 'Analítica' });
    analyticsPanel.appendChild(create('h2', { className: 'page-title desktop-analytics-title', textContent: 'Analítica' }));
    const analyticsContent = create('div', { className: 'desktop-home-analytics-scroll' });
    this.desktopAnalyticsRoot = analyticsContent;
    SummaryPage.renderContent(analyticsContent, summary, [], null, {
      suppressStats: true,
      analyticsOnly: true,
      categoryDisclosure: true
    });
    analyticsContent.appendChild(SummaryPage.renderIvaChart(options.trends));
    this.refreshFavoriteSources(analyticsContent);
    this.renderFavoriteSlot();
    requestAnimationFrame(() => this.renderFavoriteSlot());

    analyticsPanel.appendChild(analyticsContent);
    workspace.appendChild(transactionsPanel);
    workspace.appendChild(analyticsPanel);
    content.appendChild(workspace);
    this.chartResizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        Charts.redraw(analyticsContent);
        Charts.redraw(statsRow);
      });
    });
    this.chartResizeObserver.observe(analyticsPanel);
    requestAnimationFrame(() => Charts.redraw(analyticsContent));
  },

  renderDesktopStats(container, descriptors, values, hidden, overview) {
    container.replaceChildren();
    const metricIcons = {
      ingresos: '<path d="M12 19V5M5 12l7-7 7 7"/>',
      gastos: '<path d="M12 5v14m-7-7 7 7 7-7"/>',
      gastosNetos: '<path d="M4 7h16M4 12h10M4 17h6"/>',
      ahorro: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c0-1.1-1.3-2-3-2s-3 .9-3 2 1.3 2 3 2 3 .9 3 2-1.3 2-3 2-3-.9-3-2M12 6v12"/>'
    };
    descriptors.forEach(({ id, label, color, type }) => {
      const card = create('article', { className: `stat-card desktop-stat-card desktop-stat-${id}` });
      if (type) {
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Ver movimientos: ${label}`);
        on(card, 'click', () => this.showEconomicMovements(overview, type));
        on(card, 'keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.showEconomicMovements(overview, type);
          }
        });
      }
      const labelRow = create('div', { className: 'desktop-stat-label-row' });
      const heading = create('span', { className: 'desktop-stat-heading' });
      heading.appendChild(create('span', {
        className: 'desktop-stat-icon',
        dataset: { metricIcon: id },
        'aria-hidden': 'true',
        style: { color },
        innerHTML: `<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${metricIcons[id]}</svg>`
      }));
      heading.appendChild(create('div', { className: 'stat-label', textContent: label }));
      labelRow.appendChild(heading);
      card.appendChild(labelRow);
      const value = create('div', { className: `stat-value${hidden ? ' income-blurred' : ''}` });
      value.style.color = color;
      if (hidden) value.textContent = '••••••';
      else this.fillStatValue(value, values[id]);
      card.appendChild(value);
      container.appendChild(card);
    });
    this.observeStatRow(container);
    requestAnimationFrame(() => this.fitStatValues(container));
  },

  readDesktopFavorite() {
    const storageKey = 'pate_home_favorite';
    const saved = localStorage.getItem(storageKey);
    if (!saved) return null;
    try {
      const favorite = JSON.parse(saved);
      if (favorite?.type === 'category-breakdown' || favorite?.key === 'category-breakdown') {
        localStorage.removeItem(storageKey);
        return null;
      }
      const allowedFavorites = new Set([
        'category-chart:expense-distribution',
        'expense-split:fixed-variable',
        'income-split:income-ab',
        'trend-iva:trend-iva'
      ]);
      if (allowedFavorites.has(`${favorite?.type}:${favorite?.key}`)
        || favorite?.type === 'income-split' && String(favorite?.key || '').startsWith('income-ab:')) return favorite;
    } catch {
      // Legacy metric-only favorites are intentionally discarded.
    }
    localStorage.removeItem(storageKey);
    return null;
  },

  refreshFavoriteSources(root) {
    if (!root) return;
    root.querySelectorAll('[data-favorite-type][data-favorite-key]').forEach(source => {
      source.classList.add('desktop-favorite-source');
      const label = source.dataset.favoriteLabel || source.querySelector('.chart-title, .goal-progress-label, summary, h3')?.textContent?.trim() || 'Analítica';
      source.dataset.favoriteLabel = label;
      let button = source.querySelector(':scope > .analytics-favorite-toggle');
      if (!button) {
        button = create('button', { className: 'analytics-favorite-toggle', type: 'button' });
        on(button, 'click', () => this.toggleDesktopFavorite(source, button));
        source.appendChild(button);
      }
      this.updateFavoriteToggle(source, button);
    });
  },

  updateFavoriteToggle(source, button) {
    const selected = this.favorite?.type === source.dataset.favoriteType
      && this.favorite?.key === source.dataset.favoriteKey;
    const label = source.dataset.favoriteLabel || 'Analítica';
    button.classList.toggle('selected', selected);
    button.textContent = selected ? '★' : '☆';
    button.setAttribute('aria-label', selected ? `Quitar ${label} de favoritos` : `Marcar ${label} como favorito`);
    button.setAttribute('title', selected ? `Quitar ${label} de favoritos` : `Marcar ${label} como favorito`);
    button.setAttribute('aria-pressed', String(selected));
  },

  toggleDesktopFavorite(source, button) {
    const selected = this.favorite?.type === source.dataset.favoriteType
      && this.favorite?.key === source.dataset.favoriteKey;
    this.favorite = selected ? null : {
      type: source.dataset.favoriteType,
      key: source.dataset.favoriteKey,
      label: source.dataset.favoriteLabel
    };
    if (this.favorite) localStorage.setItem('pate_home_favorite', JSON.stringify(this.favorite));
    else localStorage.removeItem('pate_home_favorite');
    this.refreshFavoriteSources(this.desktopAnalyticsRoot);
    this.renderFavoriteSlot();
    button.focus();
  },

  renderFavoriteSlot() {
    if (!this.desktopStatsRow) return;
    this.desktopStatsRow.querySelector('.desktop-favorite-card')?.remove();
    if (!this.favorite) return;

    const source = Array.from(this.desktopAnalyticsRoot?.querySelectorAll('[data-favorite-type][data-favorite-key]') || [])
      .find(node => node.dataset.favoriteType === this.favorite.type && node.dataset.favoriteKey === this.favorite.key);
    const favoriteCard = source ? source.cloneNode(true) : create('article', { className: 'desktop-favorite-card desktop-favorite-replica' });
    favoriteCard.classList.add('desktop-favorite-card', 'desktop-favorite-replica');
    favoriteCard.classList.remove('desktop-favorite-source');
    favoriteCard.setAttribute('aria-label', `Favorito: ${this.favorite.label || 'Analítica'}`);
    favoriteCard.setAttribute('tabindex', '0');
    favoriteCard.querySelectorAll('.analytics-favorite-toggle, .chart-tooltip').forEach(node => node.remove());
    favoriteCard.querySelectorAll('.chart-title').forEach(node => node.remove());

    const favoriteLayouts = {
      'category-chart': 'donut',
      'expense-split': 'donut',
      'income-split': 'donut',
      'trend-iva': 'bar',
    };
    const layout = favoriteLayouts[this.favorite.type];
    if (layout) favoriteCard.classList.add(`desktop-favorite-${layout}`);

    favoriteCard.querySelectorAll('canvas').forEach(canvas => {
      canvas.parentElement?.classList.add('desktop-favorite-chart-wrap');
    });

    const legend = Array.from(favoriteCard.children).find(child =>
      child.matches('.fv-legend, .burn-legend') || child.querySelector('.category-badge')
    );
    if (legend) {
      legend.classList.add('desktop-favorite-legend');
      const entries = Array.from(legend.children);
      const visibleEntryLimit = 2;
      if (entries.length > visibleEntryLimit) {
        entries.slice(visibleEntryLimit).forEach(entry => entry.remove());
        legend.appendChild(create('span', {
          className: 'desktop-favorite-legend-more',
          textContent: `+${entries.length - visibleEntryLimit} más`,
          title: 'Explora el gráfico con el teclado para ver todos los valores',
          'aria-label': 'Explora el gráfico con el teclado para ver todos los valores'
        }));
      }
    }

    if (this.favorite.type === 'month-overview' && legend) {
      Array.from(favoriteCard.children)
        .filter(child => child !== legend && child.classList.contains('category-badge'))
        .forEach(child => child.remove());
    }

    if (favoriteCard.classList.contains('goal-progress-card')) {
      favoriteCard.classList.add('desktop-favorite-goal');
    }
    favoriteCard.querySelector('.goal-progress-label')?.setAttribute('aria-hidden', 'true');
    favoriteCard.prepend(create('div', {
      className: 'desktop-favorite-replica-heading',
      textContent: `Favorito · ${this.favorite.label || 'Analítica'}`
    }));
    this.desktopStatsRow.appendChild(favoriteCard);

    if (source) {
      const sourceCanvases = source.querySelectorAll('canvas');
      const replicaCanvases = favoriteCard.querySelectorAll('canvas');
      sourceCanvases.forEach((canvas, index) => Charts.copyCanvas(canvas, replicaCanvases[index]));
      if (sourceCanvases.length && Array.from(sourceCanvases).some(canvas => !canvas.__chartRender)) {
        requestAnimationFrame(() => {
          if (this.favorite?.type === source.dataset.favoriteType && this.favorite?.key === source.dataset.favoriteKey) {
            this.renderFavoriteSlot();
          }
        });
      }
    } else {
      favoriteCard.appendChild(create('p', { className: 'desktop-favorite-unavailable', textContent: 'Este análisis no tiene datos en el período actual.' }));
    }
  },

  renderDesktopTransactions(container, transactions, categories) {
    const catMap = Object.fromEntries(categories.map(category => [category.id, category]));
    const filtered = this.applyFilters(transactions);
    if (!filtered.length) {
      container.appendChild(create('div', {
        className: 'empty-state desktop-transactions-empty',
        textContent: this.hasActiveFilters() ? 'No hay transacciones con estos filtros.' : 'No hay transacciones este mes.'
      }));
      return;
    }

    groupTransactionsByDate(filtered).forEach(group => {
      container.appendChild(create('div', { className: 'day-header', textContent: formatFechaLarga(group.fecha) }));
      group.items.forEach(tx => {
        const category = catMap[tx.categoryId];
        const colors = { expense: 'var(--expense-color)', income: 'var(--income-color)', refund: 'var(--refund-color)', transfer: 'var(--accent)' };
        const labels = { expense: 'Gasto', income: 'Ingreso', refund: 'Reembolso', transfer: 'Transferencia' };
        const iconMarkup = tx.tipo === 'expense'
          ? '<path d="M12 5v14M19 12l-7 7-7-7"/>'
          : tx.tipo === 'income'
            ? '<path d="M12 19V5M5 12l7-7 7 7"/>'
          : tx.tipo === 'refund'
            ? '<path d="M9 14l-4-4 4-4M5 10h9a5 5 0 010 10h-2"/>'
            : '<path d="M4 7h15m0 0-4-4m4 4-4 4M20 17H5m0 0 4-4m-4 4 4 4"/>';
        const publicLabel = `${labels[tx.tipo]}: ${tx.titulo}, ${tx.isTransfer ? `${formatearMoneda(tx.monto, tx.fromCurrency)} a ${formatearMoneda(tx.receivedAmount, tx.toCurrency)}` : formatearMoneda(tx.monto, tx.currencyCode || 'EUR')}. Abrir acciones`;
        const privateLabel = `${labels[tx.tipo]}: ${tx.titulo}, importe oculto. Abrir acciones`;
        const item = create('div', {
          className: 'transaction-item desktop-transaction-item',
          role: 'button',
          tabindex: '0',
          'aria-label': localStorage.getItem('pate_hide_income') === 'true' ? privateLabel : publicLabel
        });
        item.dataset.publicAriaLabel = publicLabel;
        item.dataset.privateAriaLabel = privateLabel;
        if (typeof tx.comments === 'string' && tx.comments.length > 0) {
          item.title = `Comentarios: ${tx.comments}`;
        }
        const icon = create('span', {
          className: 'transaction-icon desktop-transaction-icon',
          style: { background: `color-mix(in srgb, ${colors[tx.tipo]} 14%, transparent)`, color: colors[tx.tipo] },
          innerHTML: `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconMarkup}</svg>`
        });
        const info = create('span', { className: 'transaction-info' });
        info.appendChild(create('span', { className: 'transaction-title', textContent: tx.titulo }));
        const categoryName = tx.isTransfer ? `${tx.status === 'posted' ? 'Contabilizada' : 'Programada'} · ${tx.accountName}` : tx.tipo === 'income'
          ? `Ingreso${tx.clasificacion ? ` (${tx.clasificacion})` : ''}`
          : tx.tipo === 'refund' ? 'Reembolso' : (category ? category.nombre : 'Sin categoría');
        info.appendChild(create('span', { className: 'transaction-category', textContent: `${categoryName}${tx.isRecurringInstance ? (tx.occurrenceStatus === 'posted' ? ' · Contabilizada' : tx.occurrenceStatus === 'skipped' ? ' · Omitida' : ' · Programada') : ''}` }));
        const amount = create('span', {
          className: `transaction-amount ${tx.tipo}`,
          textContent: tx.isTransfer
            ? `${formatearMoneda(tx.monto, tx.fromCurrency)} → ${formatearMoneda(tx.receivedAmount, tx.toCurrency)}`
            : `${tx.tipo === 'expense' ? '−' : '+'}${formatearMoneda(tx.monto, tx.currencyCode || 'EUR')}`
        });
        this.markSensitive(amount);
        item.appendChild(icon);
        item.appendChild(info);
        item.appendChild(amount);
        const openOptions = () => this.showTransactionOptions(tx, catMap);
        on(item, 'click', openOptions);
        on(item, 'keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openOptions();
          }
        });
        container.appendChild(item);
      });
    });
  },

  createStat(label, rows, color) {
    const card = create('div', { className: 'stat-card' });
    card.appendChild(create('div', { className: 'stat-label', textContent: label }));
    const val = create('div', { className: 'stat-value' });
    val.style.color = color;
    this.fillStatValue(val, rows);
    card.appendChild(val);
    return card;
  },

  overviewMetricCurrencyRows(overview, metric) {
    const active = overview?.activeCurrency || 'ARS';
    const values = { income: 'income', expenses: 'expenses', refunds: 'refunds', netExpenses: 'netExpenses', savings: 'savings' };
    let rows = (overview?.currencies || []).map(total => ({ currency: total.currency, amount: total[values[metric]] || 0 }))
      .filter(row => row.currency && Number.isFinite(row.amount));
    if (!rows.length) rows = [{ currency: active, amount: 0 }];
    return rows.sort((a, b) => a.currency === active ? -1 : b.currency === active ? 1 : a.currency.localeCompare(b.currency))
      .map(row => ({ ...row, positivePrefix: metric === 'savings' && rows.length === 1 && row.amount > 0 }));
  },

  attachEconomicDrilldown(card, overview, type) {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `Ver movimientos: ${card.querySelector('.stat-label')?.textContent || 'Resumen'}`);
    card.style.cursor = 'pointer';
    on(card, 'click', () => this.showEconomicMovements(overview, type));
    on(card, 'keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.showEconomicMovements(overview, type);
      }
    });
  },

  showEconomicMovements(overview, type = null) {
    const rows = type === 'transfer'
      ? (overview?.transfers || [])
      : (overview?.movements || []).filter(item => type === 'savings' || !type || item.type === type || type === 'net-expense' && ['expense', 'refund'].includes(item.type));
    const body = create('div', { style: { maxHeight: '60vh', overflowY: 'auto', display: 'grid', gap: '8px' } });
    body.appendChild(create('p', { className: 'text-muted', textContent: `Movimientos reales de ${overview?.month || ''}. Las monedas se muestran por separado, sin conversión.` }));
    if (!rows.length) body.appendChild(create('div', { className: 'empty-state', textContent: 'No hay movimientos para este detalle.' }));
    rows.forEach(item => {
      const line = create('article', { className: 'card', style: { padding: '10px' } });
      if (item.type === 'transfer') {
        line.appendChild(create('strong', { textContent: `${item.date} · ${item.concept}` }));
        line.appendChild(create('p', { textContent: `${item.fromAccount}: ${formatearMonedaConCodigo(item.sentAmount, item.fromCurrency)} → ${item.toAccount}: ${formatearMonedaConCodigo(item.receivedAmount, item.toCurrency)}` }));
        if (item.feeAmount) line.appendChild(create('small', { textContent: `Comisión contabilizada como gasto: ${formatearMonedaConCodigo(item.feeAmount, item.fromCurrency)}` }));
      } else {
        const sign = item.type === 'expense' ? '−' : '+';
        line.appendChild(create('strong', { textContent: `${item.date} · ${item.concept}` }));
        line.appendChild(create('p', { textContent: `${item.type === 'income' ? 'Ingreso' : item.type === 'expense' ? 'Gasto' : 'Reembolso'} · ${sign}${formatearMonedaConCodigo(item.amount, item.currency)} · ${item.accountName}` }));
        if (item.refundSourceId) line.appendChild(create('small', { textContent: `Reembolso de: ${item.refundSourceConcept || 'gasto de origen'}` }));
      }
      body.appendChild(line);
    });
    Modal.show('Detalle del resumen económico', body, { footer: create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() })]) });
  },

  renderEconomicContext(overview) {
    const section = create('section', { className: 'card', style: { margin: '0 0 14px' } });
    section.appendChild(create('h3', { textContent: `Movimientos entre cuentas · ${overview?.month || ''}` }));
    section.appendChild(create('p', { className: 'text-muted', textContent: 'Las transferencias no se consideran ingresos ni gastos; cada importe conserva su moneda y no se convierten entre sí.' }));
    const transfers = overview?.transfers || [];
    if (!transfers.length) section.appendChild(create('small', { textContent: 'No hay transferencias contabilizadas en este mes.' }));
    else {
      (overview.currencies || []).filter(total => total.transferIn || total.transferOut).forEach(total => {
        section.appendChild(create('p', { textContent: `${total.currency} · Entradas: ${formatearMonedaConCodigo(total.transferIn, total.currency)} · Salidas: ${formatearMonedaConCodigo(total.transferOut, total.currency)}` }));
      });
      section.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Ver transferencias', onClick: () => this.showEconomicMovements(overview, 'transfer') }));
    }
    const pending = overview?.pending || { obligations: [], rents: [] };
    section.appendChild(create('h4', { textContent: 'Pendiente, fuera de los importes reales', style: { marginTop: '12px' } }));
    const showPending = (label, items) => {
      section.appendChild(create('strong', { textContent: `${label} (${items.length})` }));
      if (!items.length) section.appendChild(create('small', { style: { display: 'block' }, textContent: 'Sin importes pendientes en este mes.' }));
      items.slice(0, 5).forEach(item => section.appendChild(create('p', { style: { margin: '4px 0' }, textContent: `${item.date} · ${item.concept} · ${formatearMonedaConCodigo(item.amount, item.currency)} · ${item.status}` })));
      if (items.length > 5) section.appendChild(create('small', { textContent: `Y ${items.length - 5} elementos más.` }));
    };
    showPending('Obligaciones', pending.obligations || []);
    showPending('Alquileres esperados', pending.rents || []);
    return section;
  },

  // Builds the per-currency rows shown inside a metric card. Currencies with a
  // zero value are omitted, so a card only lists the currencies that actually
  // contribute to that metric. The active currency always comes first.
  metricCurrencyRows(summary, metric, fallback = 0) {
    const active = summary?.activeCurrency || localStorage.getItem('pate_app_currency') || 'ARS';
    const totals = Array.isArray(summary?.currencyTotals) ? summary.currencyTotals : [];
    const amountFor = total => {
      if (metric === 'expenses') return (total.expenses || 0) - (total.refunds || 0);
      if (metric === 'savings') {
        return Number.isFinite(total.savings)
          ? total.savings
          : (total.income || 0) - ((total.expenses || 0) - (total.refunds || 0));
      }
      return total.income || 0;
    };
    let rows = totals
      .filter(total => total && total.currency)
      .map(total => ({ currency: total.currency, amount: amountFor(total) }))
      .filter(row => Number.isFinite(row.amount));
    const nonZero = rows.filter(row => Math.abs(row.amount) >= 0.005);
    if (nonZero.length) {
      rows = nonZero;
    } else {
      const activeRow = rows.find(row => row.currency === active);
      rows = activeRow ? [activeRow] : rows;
    }
    if (!rows.length) rows = [{ currency: active, amount: Number(fallback) || 0 }];
    return rows.sort((a, b) => {
      if (a.currency === active) return -1;
      if (b.currency === active) return 1;
      return a.currency.localeCompare(b.currency);
    }).map(row => ({
      ...row,
      positivePrefix: metric === 'savings' && rows.length === 1 && row.amount > 0
    }));
  },

  fillStatValue(element, rows) {
    const list = Array.isArray(rows) && rows.length ? rows : [];
    element.replaceChildren();
    element.classList.toggle('stat-value-multi', list.length > 1);
    list.forEach((row, index) => {
      if (index > 0) element.appendChild(create('span', { className: 'stat-currency-sep', 'aria-hidden': 'true', textContent: '/' }));
      element.appendChild(create('span', {
        className: 'stat-currency-amount',
        textContent: `${row.positivePrefix ? '+' : ''}${formatearMonedaConCodigo(row.amount, row.currency)}`
      }));
    });
  },

  // Shrinks the metric value until it fits the card width. The base size is
  // read from CSS every time so viewport or layout changes can restore it.
  fitStatValues(row) {
    if (!row) return;
    $$('.stat-value', row).forEach(value => {
      value.classList.remove('stat-value-wrapped');
      value.style.fontSize = '';
      const base = parseFloat(getComputedStyle(value).fontSize);
      if (!Number.isFinite(base) || base <= 0) return;
      const available = value.clientWidth;
      if (!available) return;
      let size = base;
      value.style.fontSize = `${size}px`;
      let guard = 0;
      while (size > 9 && value.scrollWidth > available + 1 && guard < 120) {
        size = Math.max(9, size - 0.5);
        value.style.fontSize = `${size}px`;
        guard += 1;
      }
      if (value.scrollWidth > available + 1) value.classList.add('stat-value-wrapped');
    });
  },

  observeStatRow(row) {
    if (!row || typeof ResizeObserver === 'undefined') return;
    if (!this.statFitObserver) {
      this.statFitObserver = new ResizeObserver(entries => {
        entries.forEach(entry => this.fitStatValues(entry.target));
      });
    }
    this.statFitObserver.observe(row);
  },

  renderAccountCards(accounts) {
    const section = create('section', { className: 'home-accounts', 'aria-label': 'Cuentas y saldos' });
    const heading = create('div', { className: 'account-card-heading' });
    heading.appendChild(create('h2', { textContent: 'Cuentas', style: { fontSize: 'var(--font-md)', margin: 0 } }));
    const privacyButton = create('button', {
      className: 'btn btn-sm btn-ghost account-privacy-toggle', type: 'button',
      textContent: localStorage.getItem('pate_hide_income') === 'true' ? 'Mostrar importes' : 'Ocultar importes',
      'aria-pressed': String(localStorage.getItem('pate_hide_income') === 'true'),
      'aria-label': localStorage.getItem('pate_hide_income') === 'true' ? 'Importes ocultos' : 'Importes visibles'
    });
    on(privacyButton, 'click', () => {
      const hidden = localStorage.getItem('pate_hide_income') !== 'true';
      this.applyPrivacy(hidden);
      privacyButton.textContent = hidden ? 'Mostrar importes' : 'Ocultar importes';
      privacyButton.setAttribute('aria-pressed', String(hidden));
      privacyButton.setAttribute('aria-label', hidden ? 'Importes ocultos' : 'Importes visibles');
    });
    heading.appendChild(privacyButton);
    section.appendChild(heading);
    const grid = create('div', {
      className: `account-card-grid${accounts.length === 1 ? ' is-single' : accounts.length === 2 ? ' is-duo' : ''}`
    });
    accounts.forEach(account => {
      const card = create('article', { className: `account-card account-card-${account.presentation || 'default'}` });
      const cardHeader = create('div', { className: 'account-card-heading' });
      cardHeader.appendChild(create('span', { className: 'account-card-name', textContent: `${account.nombre}${account.primary ? ' · Principal' : ''}` }));
      cardHeader.appendChild(create('span', { className: 'account-card-currency', textContent: account.currency }));
      card.appendChild(cardHeader);
      const balance = create('p', { className: 'account-card-balance sensitive-value' });
      if (account.balanceStatus === 'verified') {
        this.markSensitive(balance, formatearMoneda(account.balance, account.currency));
      } else {
        this.markSensitive(balance, '—');
        balance.title = 'Saldo sin conciliar';
      }
      card.appendChild(balance);
      const open = create('button', { className: 'btn btn-sm btn-ghost', type: 'button', textContent: 'Ver cuenta' });
      on(open, 'click', () => Router.navigate('/settings?section=accounts'));
      card.appendChild(open);
      grid.appendChild(card);
    });
    section.appendChild(grid);
    return section;
  },

  markSensitive(element, value = element.textContent) {
    element.classList.add('sensitive-value');
    element.dataset.publicValue = value;
    element.textContent = localStorage.getItem('pate_hide_income') === 'true' ? '••••••' : value;
  },

  applyPrivacy(hidden) {
    localStorage.setItem('pate_hide_income', String(hidden));
    $$('[data-public-value]').forEach(element => {
      element.textContent = hidden ? '••••••' : element.dataset.publicValue;
    });
    $$('[data-private-aria-label]').forEach(element => {
      element.setAttribute('aria-label', hidden ? element.dataset.privateAriaLabel : element.dataset.publicAriaLabel);
    });
    $$('.stat-value').forEach(value => value.classList.toggle('income-blurred', hidden));
  },

  showTransactionOptions(tx, catMap) {
    if (tx.isTransfer) return this.showTransferDetails(tx);
    const footer = create('div', { style: { display: 'flex', gap: '8px' } });
    footer.appendChild(create('button', {
      className: 'btn btn-ghost',
      textContent: 'Cancelar',
      onClick: () => Modal.hide()
    }));
    if (tx.isRecurringInstance && tx.occurrenceStatus !== 'posted' && tx.occurrenceStatus !== 'skipped' && tx.fecha <= getToday()) {
      footer.appendChild(create('button', {
        className: 'btn btn-primary', type: 'button', textContent: 'Contabilizar ocurrencia',
        onClick: async () => {
          try {
            await API.transactions.postOccurrence(tx.originalId, tx.fecha);
            Modal.hide();
            await this.render({ month: this.currentMonth });
          } catch (error) { showToast(error.message, 'error'); }
        }
      }));
    }
    footer.appendChild(create('button', {
      className: 'btn btn-primary',
      textContent: 'Editar',
      onClick: () => {
        Modal.hide();
        TransactionForm.show(() => this.render({ month: this.currentMonth }), tx);
      }
    }));
    footer.appendChild(create('button', {
      className: 'btn btn-danger',
      textContent: tx.isRecurringInstance ? 'Omitir ocurrencia' : 'Eliminar',
      disabled: tx.isRecurringInstance && tx.occurrenceStatus === 'posted'
    }));

    on(footer.lastChild, 'click', async () => {
      try {
        if (tx.isRecurringInstance) await API.transactions.skipOccurrence(tx.originalId, tx.fecha);
        else await API.transactions.delete(tx.id);
        Modal.hide();
        showToast('Transacción eliminada');
        this.render({ month: this.currentMonth });
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    const catName = tx.tipo === 'income' ? 'Ingreso' : (tx.tipo === 'refund' ? 'Reembolso' : (catMap[tx.categoryId]?.nombre || ''));
    const details = create('div');
    details.appendChild(create('p', {}, [create('strong', { textContent: tx.titulo })]));
    const categoryDetails = create('p', {
      style: { color: 'var(--text-secondary)', margin: '8px 0' }
    });
    categoryDetails.appendChild(document.createTextNode(catName));
    if (tx.tipo === 'expense') {
      categoryDetails.appendChild(document.createTextNode(' '));
      categoryDetails.appendChild(create('span', {
        textContent: tx.clasificacion === 'fijo' ? 'Fijo' : 'Variable',
        style: { fontSize: 'var(--font-xs)', padding: '2px 6px', borderRadius: '10px', background: 'var(--bg-hover)', color: 'var(--text-muted)' }
      }));
    }
    categoryDetails.appendChild(document.createTextNode(` - ${formatFechaCorta(tx.fecha)}`));
    if (tx.accountName) categoryDetails.appendChild(document.createTextNode(` · ${tx.accountName} (${tx.currencyCode || 'EUR'})`));
    details.appendChild(categoryDetails);
    const amountDetail = create('p', {
      textContent: `${tx.tipo === 'expense' ? '-' : '+'}${formatearMoneda(tx.monto, tx.currencyCode || 'EUR')}`,
      style: { fontSize: 'var(--font-xl)', fontWeight: '700', color: `var(--${tx.tipo === 'expense' ? 'expense' : tx.tipo === 'income' ? 'income' : 'refund'}-color)` }
    });
    this.markSensitive(amountDetail);
    details.appendChild(amountDetail);
    if (typeof tx.comments === 'string' && tx.comments.length > 0) {
      const comments = create('p', {
        className: 'transaction-comments',
        style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
      });
      comments.appendChild(create('strong', { textContent: 'Comentarios: ' }));
      comments.appendChild(document.createTextNode(tx.comments));
      details.appendChild(comments);
    }
    Modal.show('Transacción', details, { footer });
  },

  async showTransferDetails(tx) {
    const details = create('div');
    details.appendChild(create('p', { textContent: tx.accountName }));
    details.appendChild(create('p', { textContent: `${tx.fecha} · ${tx.status === 'posted' ? 'Contabilizada' : 'Programada'}` }));
    const value = create('p', { className: 'sensitive-value' });
    this.markSensitive(value, `${formatearMoneda(tx.monto, tx.fromCurrency)} → ${formatearMoneda(tx.receivedAmount, tx.toCurrency)}`);
    details.appendChild(value);
    const totalDebit = create('p', { className: 'sensitive-value' });
    this.markSensitive(totalDebit, `Débito total: ${formatearMoneda(tx.totalDebit, tx.fromCurrency)} · Tasa efectiva: ${formatearMoneda(tx.receivedAmount, tx.toCurrency)} por ${formatearMoneda(tx.monto, tx.fromCurrency)}`);
    details.appendChild(totalDebit);
    if (tx.feeAmount) {
      const fee = create('p', { className: 'sensitive-value' });
      this.markSensitive(fee, `Comisión: ${formatearMoneda(tx.feeAmount, tx.fromCurrency)}`);
      details.appendChild(fee);
    }
    const footer = create('div', { style: { display: 'flex', gap: '8px' } });
    footer.appendChild(create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() }));
    const settingsButton = create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Administrar transferencias' });
    on(settingsButton, 'click', () => {
      Modal.hide();
      Router.navigate('/settings?section=accounts');
    });
    footer.appendChild(settingsButton);
    Modal.show('Transferencia o conversión', details, { footer });
  },

  filters: {
    tipo: '',
    accountId: '',
    categoryId: '',
    clasificacion: '',
    texto: '',
    montoMin: '',
    montoMax: '',
    fechaDesde: '',
    fechaHasta: ''
  },

  hasActiveFilters() {
    return Object.values(this.filters).some(v => v !== '');
  },

  applyFilters(transactions) {
    return transactions.filter(tx => {
      if (this.filters.tipo && tx.tipo !== this.filters.tipo) return false;
      if (this.filters.accountId && tx.accountId !== this.filters.accountId && !tx.accountIds?.includes(this.filters.accountId)) return false;
      if (this.filters.categoryId && tx.categoryId !== this.filters.categoryId) return false;
      if (this.filters.clasificacion && tx.clasificacion !== this.filters.clasificacion) return false;
      const filteredAmount = tx.isTransfer && this.filters.accountId === tx.toAccountId ? tx.receivedAmount : tx.monto;
      if (this.filters.texto) {
        const q = this.filters.texto.toLowerCase();
        if (!tx.titulo.toLowerCase().includes(q)) return false;
      }
      if (this.filters.montoMin && filteredAmount < parseFloat(this.filters.montoMin)) return false;
      if (this.filters.montoMax && filteredAmount > parseFloat(this.filters.montoMax)) return false;
      if (this.filters.fechaDesde && tx.fecha < this.filters.fechaDesde) return false;
      if (this.filters.fechaHasta && tx.fecha > this.filters.fechaHasta) return false;
      return true;
    });
  },

  showFilterModal(categories, transactions) {
    const form = create('div');

    const tipoGroup = create('div', { className: 'form-group' });
    tipoGroup.appendChild(create('label', { textContent: 'Tipo' }));
    const tipoSelect = create('select', { className: 'form-control' });
    tipoSelect.appendChild(create('option', { value: '', textContent: 'Todos' }));
    tipoSelect.appendChild(create('option', { value: 'expense', textContent: 'Gasto' }));
    tipoSelect.appendChild(create('option', { value: 'income', textContent: 'Ingreso' }));
    tipoSelect.appendChild(create('option', { value: 'refund', textContent: 'Reembolso' }));
    tipoSelect.appendChild(create('option', { value: 'transfer', textContent: 'Transferencia o conversión' }));
    tipoSelect.value = this.filters.tipo;
    tipoGroup.appendChild(tipoSelect);
    form.appendChild(tipoGroup);

    const knownAccountMap = new Map();
    transactions.forEach(tx => {
      if (tx.accountId) knownAccountMap.set(tx.accountId, { id: tx.accountId, name: tx.isTransfer ? tx.fromAccountName : tx.accountName, currency: tx.currencyCode });
      if (tx.isTransfer) knownAccountMap.set(tx.toAccountId, { id: tx.toAccountId, name: tx.toAccountName, currency: tx.toCurrency });
    });
    const knownAccounts = Array.from(knownAccountMap.values());
    const accountGroup = create('div', { className: 'form-group' });
    accountGroup.appendChild(create('label', { textContent: 'Cuenta y moneda' }));
    const accountSelect = create('select', { className: 'form-control' });
    accountSelect.appendChild(create('option', { value: '', textContent: 'Todas las cuentas' }));
    knownAccounts.forEach(account => accountSelect.appendChild(create('option', { value: account.id, textContent: `${account.name} (${account.currency})` })));
    accountSelect.value = this.filters.accountId;
    accountGroup.appendChild(accountSelect);
    form.appendChild(accountGroup);

    const catGroup = create('div', { className: 'form-group' });
    catGroup.appendChild(create('label', { textContent: 'Categoría' }));
    const catSelect = create('select', { className: 'form-control' });
    catSelect.appendChild(create('option', { value: '', textContent: 'Todas' }));
    const parents = categories.filter(c => !c.parentId);
    const childrenMap = {};
    categories.forEach(c => {
      if (c.parentId) {
        if (!childrenMap[c.parentId]) childrenMap[c.parentId] = [];
        childrenMap[c.parentId].push(c);
      }
    });
    parents.forEach(cat => {
      catSelect.appendChild(create('option', { value: cat.id, textContent: cat.nombre }));
      (childrenMap[cat.id] || []).forEach(child => {
        catSelect.appendChild(create('option', { value: child.id, textContent: `  └ ${child.nombre}` }));
      });
    });
    catSelect.value = this.filters.categoryId;
    catGroup.appendChild(catSelect);
    form.appendChild(catGroup);

    const clasifGroup = create('div', { className: 'form-group' });
    clasifGroup.appendChild(create('label', { textContent: 'Clasificación' }));
    const clasifSelect = create('select', { className: 'form-control' });
    clasifSelect.appendChild(create('option', { value: '', textContent: 'Todas' }));
    clasifSelect.appendChild(create('option', { value: 'fijo', textContent: 'Fijo' }));
    clasifSelect.appendChild(create('option', { value: 'variable', textContent: 'Variable' }));
    clasifSelect.value = this.filters.clasificacion;
    clasifGroup.appendChild(clasifSelect);
    form.appendChild(clasifGroup);

    const textGroup = create('div', { className: 'form-group' });
    textGroup.appendChild(create('label', { textContent: 'Buscar por título' }));
    const textInput = create('input', {
      className: 'form-control',
      type: 'text',
      placeholder: 'Texto a buscar...',
      value: this.filters.texto
    });
    textGroup.appendChild(textInput);
    form.appendChild(textGroup);

    const montoRow = create('div', { style: { display: 'flex', gap: '8px' } });
    const minGroup = create('div', { className: 'form-group', style: { flex: 1 } });
    minGroup.appendChild(create('label', { textContent: 'Monto mínimo' }));
    const minInput = create('input', {
      className: 'form-control',
      type: 'number',
      step: '0.01',
      min: '0',
      placeholder: '0',
      value: this.filters.montoMin
    });
    minGroup.appendChild(minInput);
    montoRow.appendChild(minGroup);
    const maxGroup = create('div', { className: 'form-group', style: { flex: 1 } });
    maxGroup.appendChild(create('label', { textContent: 'Monto máximo' }));
    const maxInput = create('input', {
      className: 'form-control',
      type: 'number',
      step: '0.01',
      min: '0',
      placeholder: 'Sin límite',
      value: this.filters.montoMax
    });
    maxGroup.appendChild(maxInput);
    montoRow.appendChild(maxGroup);
    form.appendChild(montoRow);

    const fechaRow = create('div', { style: { display: 'flex', gap: '8px' } });
    const fdGroup = create('div', { className: 'form-group', style: { flex: 1 } });
    fdGroup.appendChild(create('label', { textContent: 'Desde' }));
    const fdInput = create('input', {
      className: 'form-control',
      type: 'date',
      value: this.filters.fechaDesde
    });
    fdGroup.appendChild(fdInput);
    fechaRow.appendChild(fdGroup);
    const fhGroup = create('div', { className: 'form-group', style: { flex: 1 } });
    fhGroup.appendChild(create('label', { textContent: 'Hasta' }));
    const fhInput = create('input', {
      className: 'form-control',
      type: 'date',
      value: this.filters.fechaHasta
    });
    fhGroup.appendChild(fhInput);
    fechaRow.appendChild(fhGroup);
    form.appendChild(fechaRow);

    const footer = create('div', { style: { display: 'flex', gap: '8px' } });
    footer.appendChild(create('button', {
      className: 'btn btn-ghost',
      textContent: 'Limpiar',
      onClick: () => {
        this.filters = { tipo: '', accountId: '', categoryId: '', clasificacion: '', texto: '', montoMin: '', montoMax: '', fechaDesde: '', fechaHasta: '' };
        Modal.hide();
        this.render({ month: this.currentMonth });
      }
    }));
    footer.appendChild(create('button', {
      className: 'btn btn-primary',
      textContent: 'Aplicar',
      onClick: () => {
        if ((minInput.value || maxInput.value) && !accountSelect.value && new Set(knownAccounts.map(account => account.currency)).size > 1) {
          showToast('Elegí una cuenta para filtrar importes de una sola moneda', 'error');
          return;
        }
        this.filters.tipo = tipoSelect.value;
        this.filters.accountId = accountSelect.value;
        this.filters.categoryId = catSelect.value;
        this.filters.clasificacion = clasifSelect.value;
        this.filters.texto = textInput.value.trim();
        this.filters.montoMin = minInput.value;
        this.filters.montoMax = maxInput.value;
        this.filters.fechaDesde = fdInput.value;
        this.filters.fechaHasta = fhInput.value;
        Modal.hide();
        this.render({ month: this.currentMonth });
      }
    }));

    Modal.show('Filtrar transacciones', form, { footer });
  }
};
