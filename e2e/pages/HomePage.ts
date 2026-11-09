import { Page, expect, Locator } from '@playwright/test';
import { BasePage } from './BasePage';
import { TransactionForm, TransactionFormData } from './TransactionForm';

export class HomePage extends BasePage {
  readonly selectors = {
    navbar: '#navbar',
    statsRow: '.stats-row',
    statCard: '.stat-card',
    fab: '.fab',
    modalOverlay: '.modal-overlay',
    modalTitle: '.modal-overlay h3',
    typeExpense: '[data-type="expense"]',
    saveButton: 'button:has-text("Guardar")',
    transactionItem: '.transaction-item',
    transactionTitle: '.transaction-title',
    emptyState: '.empty-state',
    emptyStateText: '.empty-state-text',
    eyeToggle: '.eye-toggle-btn',
    monthNav: '.month-nav',
    monthLabel: '.month-nav h2',
    desktopNewTransaction: '.desktop-new-transaction',
    controls: '.desktop-home-controls',
    favoriteToggle: '.analytics-favorite-toggle',
    favoriteCard: '.desktop-favorite-card',
    favoriteReplica: '.desktop-favorite-replica',
    chartTooltip: '.chart-tooltip',
  };

  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    const currentHash = new URL(this.page.url()).hash;
    if (/^#\/home(?:\?|$)/.test(currentHash)) await this.page.reload();
    else await this.goto('/home');
    await this.page.waitForSelector(this.selectors.navbar, { state: 'visible' });
    // Esperar a que el contenido principal de la home esté renderizado antes de interactuar.
    await Promise.race([
      this.page.waitForSelector(this.selectors.statsRow, { state: 'visible' }),
      this.page.waitForSelector(this.selectors.emptyState, { state: 'visible' }),
    ]);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.page.locator(this.selectors.statsRow)).toBeVisible();
  }

  async openNewTransaction(): Promise<TransactionForm> {
    const desktopButton = this.page.locator(this.selectors.desktopNewTransaction);
    const trigger = await desktopButton.count() ? desktopButton : this.page.locator(this.selectors.fab);
    await trigger.waitFor({ state: 'visible' });
    for (let attempt = 0; attempt < 3; attempt++) {
      await trigger.click();
      try {
        await expect(this.page.locator(this.selectors.modalTitle)).toContainText('Nueva transacción', { timeout: 2000 });
        return new TransactionForm(this.page);
      } catch {
        if (attempt === 2) throw new Error('El modal de nueva transacción no se abrió');
        await this.page.waitForTimeout(300);
      }
    }
    throw new Error('El modal de nueva transacción no se abrió');
  }

  async submitTransaction(data: TransactionFormData): Promise<void> {
    const form = await this.openNewTransaction();
    await form.submit(data);
  }

  async createExpense(categoryName: string, titulo: string, monto: number, fecha?: string, clasificacion: 'fijo' | 'variable' = 'variable', comments?: string, accountName?: string): Promise<void> {
    await this.submitTransaction({
      tipo: 'expense',
      categoryName,
      titulo,
      monto,
      fecha,
      clasificacion,
      comments,
      accountName,
    });
  }

  async expectTransactionVisible(titulo: string): Promise<void> {
    await expect(
      this.page.locator(this.selectors.transactionTitle).filter({ hasText: titulo }).first()
    ).toBeVisible();
  }

  async expectTransactionNotVisible(titulo: string): Promise<void> {
    await expect(
      this.page.locator(this.selectors.transactionTitle).filter({ hasText: titulo })
    ).toHaveCount(0);
  }

  private statCard(label: string): Locator {
    return this.page.locator('.stats-row .stat-card')
      .filter({ has: this.page.getByText(label, { exact: true }) })
      .first();
  }

  async getStatValue(label: string): Promise<string> {
    const value = this.statCard(label).locator('.stat-value');
    await expect(value).toBeVisible();
    return value.innerText();
  }

  async expectStatContains(label: string, text: string): Promise<void> {
    await expect(this.statCard(label).locator('.stat-value')).toContainText(text);
  }

  async toggleEye(): Promise<void> {
    const btn = this.page.locator(this.selectors.eyeToggle);
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  async expectValuesBlurred(): Promise<void> {
    await expect(this.statCard('Ingresos').locator('.stat-value')).toHaveClass(/income-blurred/);
    await expect(this.statCard('Ahorro').locator('.stat-value')).toHaveClass(/income-blurred/);
    if (await this.page.locator('body.desktop-mode').count()) {
      await expect(this.statCard('Gastos').locator('.stat-value')).toHaveClass(/income-blurred/);
    }
  }

  async expectValuesNotBlurred(): Promise<void> {
    await expect(this.statCard('Ingresos').locator('.stat-value')).not.toHaveClass(/income-blurred/);
    await expect(this.statCard('Ahorro').locator('.stat-value')).not.toHaveClass(/income-blurred/);
    if (await this.page.locator('body.desktop-mode').count()) {
      await expect(this.statCard('Gastos').locator('.stat-value')).not.toHaveClass(/income-blurred/);
    }
  }

  async selectAnalyticFavorite(label: string): Promise<void> {
    await this.page.getByRole('button', { name: `Marcar ${label} como favorito` }).click();
  }

  async clearAnalyticFavorite(label: string): Promise<void> {
    await this.page.getByRole('button', { name: `Quitar ${label} de favoritos` }).click();
  }

  async expectAnalyticFavorite(label: string): Promise<void> {
    await expect(this.page.locator(this.selectors.favoriteCard)).toContainText(`Favorito · ${label}`);
  }

  async expectCategoryBreakdownIsNotFavoritable(): Promise<void> {
    const breakdown = this.page.locator('.desktop-home-analytics-scroll .summary-section');
    await expect(breakdown).toContainText('Gastos por categoría');
    await expect(breakdown.locator('.analytics-favorite-toggle')).toHaveCount(0);
  }

  async expectAnalyticCanBeFavorited(label: string): Promise<void> {
    await expect(this.page.getByRole('button', { name: `Marcar ${label} como favorito` })).toBeVisible();
  }

  async expectNoPersistedCategoryBreakdownFavorite(): Promise<void> {
    await expect(this.page.locator(this.selectors.favoriteCard)).toHaveCount(0);
    await this.expectThreePrimaryCards();
    expect(await this.page.evaluate(() => localStorage.getItem('pate_home_favorite'))).toBeNull();
  }

  async expectFavoriteReplicaCompactWithoutScrolling(): Promise<void> {
    const replica = this.page.locator(this.selectors.favoriteReplica);
    await expect(replica).toBeVisible();
    await expect(replica).toHaveAttribute('tabindex', '0');
    await expect(replica.locator('.desktop-favorite-replica-heading')).toHaveCount(1);
    await expect(replica.locator('.chart-title')).toHaveCount(0);
    const metrics = await replica.evaluate(element => {
      const row = element.closest('.desktop-home-stats') as HTMLElement;
      const rect = element.getBoundingClientRect();
      const canvas = element.querySelector('canvas');
      const primaryCards = Array.from(row.querySelectorAll('.desktop-stat-card'), card => card.getBoundingClientRect());
      return {
        height: rect.height,
        rowHeight: row.getBoundingClientRect().height,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        overflowY: getComputedStyle(element).overflowY,
        overflowX: getComputedStyle(element).overflowX,
        canvasHeight: canvas?.getBoundingClientRect().height ?? 0,
        primaryCardHeights: primaryCards.map(card => card.height),
        slotIndex: Array.from(row.children).indexOf(element),
        savingsIndex: Array.from(row.children).findIndex(child => child.classList.contains('desktop-stat-ahorro')),
        savingsRight: row.querySelector('.desktop-stat-ahorro')!.getBoundingClientRect().right,
        favoriteLeft: rect.left,
      };
    });
    expect(metrics.height).toBeLessThanOrEqual(110);
    expect(metrics.rowHeight).toBeLessThanOrEqual(237);
    expect(metrics.slotIndex).toBe(3);
    expect(metrics.savingsIndex).toBe(2);
    expect(metrics.favoriteLeft).toBeGreaterThanOrEqual(metrics.savingsRight);
    expect(metrics.overflowY).toBe('visible');
    expect(metrics.overflowX).toBe('visible');
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight + 1);
    expect(metrics.canvasHeight).toBeLessThanOrEqual(66);
    expect(metrics.primaryCardHeights).toEqual([110, 110, 110]);
  }

  async expectFavoriteLegendContains(...values: string[]): Promise<void> {
    const legend = this.page.locator(`${this.selectors.favoriteReplica} .desktop-favorite-legend`);
    await expect(legend).toBeVisible();
    for (const value of values) await expect(legend).toContainText(value);
  }

  async expectCategoryBreakdownDisclosureKeyboardToggle(): Promise<void> {
    const details = this.page.locator('.desktop-home-analytics-scroll details.desktop-category-disclosure');
    const summary = details.locator('summary');
    await expect(details).toBeVisible();
    await expect(details).not.toHaveAttribute('open', '');
    await summary.focus();
    await summary.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    await summary.press('Space');
    await expect(details).not.toHaveAttribute('open', '');
  }

  async expectMonthLabelHasFullMonthAndYear(): Promise<void> {
    const label = await this.page.locator(this.selectors.monthLabel).innerText();
    expect(label).toMatch(/^(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre) \d{4}$/);
    expect(label).not.toContain(' de ');
  }

  async expectIvaFavoriteStarInsideChartCard(): Promise<void> {
    const source = this.page.locator('.desktop-favorite-source[data-favorite-type="trend-iva"]');
    await expect(source).toContainText('IVA mensual por titular');
    const star = source.locator('.analytics-favorite-toggle');
    await expect(star).toBeVisible();
    const metrics = await source.evaluate(element => {
      const button = element.querySelector('.analytics-favorite-toggle')!;
      const title = element.querySelector('.chart-title')!;
      const range = document.createRange();
      range.selectNodeContents(title);
      const textRects = Array.from(range.getClientRects());
      const card = element.getBoundingClientRect();
      const star = button.getBoundingClientRect();
      return {
        cardHeight: card.height,
        starInside: star.left >= card.left && star.right <= card.right && star.top >= card.top && star.bottom <= card.bottom,
        textAndStarSeparated: textRects.length > 0 && textRects.every(text =>
          star.right <= text.left || star.left >= text.right || star.bottom <= text.top || star.top >= text.bottom
        ),
      };
    });
    expect(metrics.cardHeight).toBeGreaterThanOrEqual(52);
    expect(metrics.starInside).toBe(true);
    expect(metrics.textAndStarSeparated).toBe(true);
  }

  async expectNoHorizontalPageOverflow(): Promise<void> {
    const overflow = await this.page.evaluate(() => ({
      document: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      body: document.body.scrollWidth > document.body.clientWidth,
    }));
    expect(overflow.document).toBe(false);
    expect(overflow.body).toBe(false);
  }

  async expectFavoriteUnavailable(): Promise<void> {
    await expect(this.page.locator(this.selectors.favoriteReplica)).toContainText('Este análisis no tiene datos en el período actual.');
  }

  async expectFavoriteReplicaChart(): Promise<void> {
    await expect(this.page.locator(this.selectors.favoriteReplica).locator('canvas')).toHaveCount(1);
    await expect(this.page.locator(this.selectors.favoriteReplica).locator('canvas')).toBeVisible();
  }

  async expectFixedMetricsHaveNoStars(): Promise<void> {
    await expect(this.page.locator('.desktop-home-stats > .desktop-stat-card .analytics-favorite-toggle')).toHaveCount(0);
    await this.expectThreePrimaryCards();
  }

  async expectThreePrimaryCards(): Promise<void> {
    const cards = this.page.locator('.desktop-home-stats > .desktop-stat-card:not(.desktop-favorite-card)');
    await expect(cards).toHaveCount(3);
    await expect(cards.locator('.stat-label')).toHaveText([
      'Ingresos',
      'Gastos',
      'Ahorro',
    ]);
  }

  async expectLegacyAnalyticsNavigationRemoved(): Promise<void> {
    for (const route of ['/summary', '/goals', '/estadisticas']) {
      await expect(this.page.locator(`.navbar-item[data-route="${route}"]`)).toHaveCount(0);
    }
    await expect(this.page.locator('[role="tablist"]')).toHaveCount(0);
    const analyticsSelector = await this.page.locator('body').evaluate(body =>
      body.classList.contains('desktop-mode') ? '.desktop-home-analytics' : '.home-analytics'
    );
    await expect(this.page.locator(analyticsSelector)).toBeVisible();
  }

  async expectMobileAnalyticsVisibleWithoutLegacyNavigation(): Promise<void> {
    for (const route of ['/summary', '/goals', '/estadisticas']) {
      await expect(this.page.locator(`.navbar-item[data-route="${route}"]`)).toHaveCount(0);
    }
    await expect(this.page.locator('.home-analytics')).toBeVisible();
  }

  async expectDesktopMonthCenteredAndLarger(): Promise<void> {
    const layout = await this.page.locator(this.selectors.controls).evaluate(controls => {
      const controlBounds = controls.getBoundingClientRect();
      const month = controls.querySelector('.desktop-month-selector')!;
      const monthBounds = month.getBoundingClientRect();
      const label = month.querySelector('h2')!;
      const actions = controls.querySelector('.desktop-control-actions')!;
      const actionBounds = actions.getBoundingClientRect();
      return {
        centered: Math.abs((monthBounds.left + monthBounds.right) / 2 - (controlBounds.left + controlBounds.right) / 2) < 2,
        larger: parseFloat(getComputedStyle(label).fontSize) > parseFloat(getComputedStyle(controls).fontSize),
        separated: monthBounds.left >= actionBounds.right || monthBounds.right <= actionBounds.left,
      };
    });
    expect(layout.centered).toBe(true);
    expect(layout.larger).toBe(true);
    expect(layout.separated).toBe(true);
  }

  async expectDesktopMonthArrowsVisibleAndSeparated(): Promise<void> {
    const layout = await this.page.locator('.desktop-month-selector').evaluate(selector => {
      const buttons = Array.from(selector.querySelectorAll('button'));
      const label = selector.querySelector('h2')!;
      const selectorBounds = selector.getBoundingClientRect();
      const previous = buttons[0].getBoundingClientRect();
      const month = label.getBoundingClientRect();
      const next = buttons[1].getBoundingClientRect();
      const pointHits = (button: Element, rect: DOMRect) => {
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit === button || button.contains(hit);
      };
      return {
        buttonsPresent: buttons.length === 2,
        buttonsVisible: buttons.every(button => {
          const bounds = button.getBoundingClientRect();
          return getComputedStyle(button).visibility === 'visible'
            && bounds.width >= 40
            && bounds.height >= 40
            && bounds.left >= selectorBounds.left
            && bounds.right <= selectorBounds.right;
        }),
        columnsSeparated: previous.right <= month.left && month.right <= next.left,
        buttonsClickable: pointHits(buttons[0], previous) && pointHits(buttons[1], next),
      };
    });
    expect(layout.buttonsPresent).toBe(true);
    expect(layout.buttonsVisible).toBe(true);
    expect(layout.columnsSeparated).toBe(true);
    expect(layout.buttonsClickable).toBe(true);
  }

  async persistCategoryBreakdownFavoriteAndReload(): Promise<void> {
    await this.page.evaluate(() => localStorage.setItem('pate_home_favorite', JSON.stringify({
      type: 'category-breakdown',
      key: 'category-breakdown',
      label: 'Gastos por categoría',
    })));
    await this.page.reload();
    await this.page.waitForSelector('.desktop-home-workspace', { state: 'visible' });
  }

  async hoverChartPoint(label: string): Promise<string> {
    const card = this.page.locator('[data-favorite-label]').filter({ hasText: label }).first();
    const canvas = card.locator('canvas').first();
    await expect(canvas).toBeVisible();
    await canvas.scrollIntoViewIfNeeded();
    await expect(canvas).toHaveAttribute('tabindex', '0');
    const point = await canvas.evaluate(element => {
      const chart = element as HTMLCanvasElement & { __chartHitTest?: (x: number, y: number) => unknown };
      const width = chart.clientWidth;
      const height = chart.clientHeight;
      if (!chart.__chartHitTest) throw new Error('El gráfico no tiene hit testing configurado');
      for (let y = 4; y < height; y += 4) {
        for (let x = 4; x < width; x += 4) {
          if (chart.__chartHitTest(x, y)) return { x, y };
        }
      }
      throw new Error('No se encontró un punto interactivo en el gráfico');
    });
    await canvas.hover({ position: point });
    const tooltip = card.locator(this.selectors.chartTooltip);
    await expect(tooltip).toBeVisible();
    const isFavorite = await card.evaluate(element => element.classList.contains('desktop-favorite-replica'));
    if (isFavorite) {
      const clipped = await tooltip.evaluate(element => {
        const favorite = element.closest('.desktop-favorite-replica');
        for (let parent = element.parentElement; parent && favorite?.contains(parent); parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          if ([style.overflowX, style.overflowY].some(value => value === 'hidden' || value === 'clip' || value === 'auto' || value === 'scroll')) return true;
        }
        return false;
      });
      expect(clipped).toBe(false);
    }
    return tooltip.innerText();
  }

  async expectChartTooltipKeyboard(label: string): Promise<void> {
    const card = this.page.locator('[data-favorite-label]').filter({ hasText: label }).first();
    const canvas = card.locator('canvas').first();
    await expect(canvas).toHaveAttribute('tabindex', '0');
    await canvas.focus();
    await canvas.press('Enter');
    await expect(card.locator(this.selectors.chartTooltip)).toBeVisible();
  }

  async expectDesktopControlOrder(): Promise<void> {
    const order = await this.page.locator(this.selectors.controls).locator(':scope > *').evaluateAll(nodes =>
      nodes.map(node => node.classList.contains('desktop-new-transaction')
        ? 'Nueva transacción'
        : node.classList.contains('desktop-control-actions')
          ? Array.from(node.children, child => child.classList.contains('desktop-new-transaction')
            ? 'Nueva transacción'
            : child.classList.contains('desktop-eye-toggle')
              ? 'Privacidad'
              : child.classList.contains('desktop-filter-btn') ? 'Filtro' : 'Otro').join(',')
          : node.classList.contains('desktop-month-selector') ? 'Mes' : 'Otro')
    );
    expect(order).toEqual(['Nueva transacción,Privacidad,Filtro', 'Mes']);
  }

  async expectThreePrimaryMetrics(): Promise<void> {
    await this.expectThreePrimaryCards();
  }

  async expectDesktopMetricIconsAndTransactionLabel(): Promise<void> {
    for (const id of ['ingresos', 'gastosNetos', 'ahorro']) {
      const icon = this.page.locator(`.desktop-stat-${id} .desktop-stat-icon svg`);
      await expect(icon).toHaveCount(1);
      await expect(icon).toHaveAttribute('aria-hidden', 'true');
    }

    const button = this.page.getByRole('button', { name: 'Nueva transacción', exact: true });
    await expect(button).toBeVisible();
    await expect(button).toHaveText('Nueva transacción');
  }

  async expectPrivacyState(hidden: boolean): Promise<void> {
    const eye = this.page.locator(this.selectors.eyeToggle);
    await expect(eye).toHaveAttribute('aria-pressed', String(hidden));
    await expect(eye).toHaveAttribute('aria-label', hidden ? 'Métricas principales ocultas' : 'Métricas principales visibles');
    const privateValues = this.page.locator('#page-content [data-public-value]');
    const displayedValues = await privateValues.allTextContents();
    if (hidden) {
      expect(displayedValues.length).toBeGreaterThan(0);
      expect(displayedValues.every(value => value === '••••••')).toBe(true);
    } else {
      const valuesMatch = await privateValues.evaluateAll(elements => elements.every(element => (element as HTMLElement).innerText === (element as HTMLElement).dataset.publicValue));
      expect(valuesMatch).toBe(true);
    }
  }

  async expectDesktopLayoutWithinViewport(): Promise<void> {
    const withinViewport = await this.page.locator('#page-content').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const cards = Array.from(element.querySelectorAll('.desktop-home-stats > *'), card => card.getBoundingClientRect());
      const controls = element.querySelector('.desktop-home-controls')!.getBoundingClientRect();
      const month = element.querySelector('.desktop-month-selector')!.getBoundingClientRect();
      const actions = element.querySelector('.desktop-control-actions')!.getBoundingClientRect();
      const overlap = month.left < actions.right && month.right > actions.left
        && month.top < actions.bottom && month.bottom > actions.top;
      const centered = Math.abs((month.left + month.right) / 2 - (controls.left + controls.right) / 2) < 2;
      return bounds.right <= window.innerWidth + 1
        && cards.every(card => card.width > 0 && card.right <= window.innerWidth + 1)
        && controls.right <= window.innerWidth + 1
        && !overlap
        && centered;
    });
    expect(withinViewport).toBe(true);
  }

  async navigateMonth(direction: 'prev' | 'next'): Promise<void> {
    const nav = this.page.locator(this.selectors.monthNav);
    await nav.waitFor({ state: 'visible' });
    const previousMonth = await nav.locator('h2').innerText();
    const button = nav.locator('button').nth(direction === 'prev' ? 0 : 1);
    await button.click();
    await expect(this.page.locator(this.selectors.monthLabel)).not.toHaveText(previousMonth);
  }

  async getMonthLabel(): Promise<string> {
    return this.page.locator(this.selectors.monthLabel).innerText();
  }

  async createIncome(titulo: string, monto: number, clasificacion: 'A' | 'B' | 'Mixto', options: { fecha?: string; montoA?: number; montoB?: number; ivaPorcentaje?: number; accountName?: string } = {}): Promise<void> {
    await this.submitTransaction({
      tipo: 'income',
      titulo,
      monto,
      fecha: options.fecha,
      clasificacion,
      montoA: options.montoA,
      montoB: options.montoB,
      ivaPorcentaje: options.ivaPorcentaje,
      accountName: options.accountName,
    });
  }

  async createRefund(categoryName: string, titulo: string, monto: number, fecha?: string, accountName?: string): Promise<void> {
    await this.submitTransaction({
      tipo: 'refund',
      categoryName,
      titulo,
      monto,
      fecha,
      accountName,
    });
  }

  async createRecurringExpense(categoryName: string, titulo: string, monto: number, fecha?: string, clasificacion: 'fijo' | 'variable' = 'fijo', accountName?: string): Promise<void> {
    await this.submitTransaction({
      tipo: 'expense',
      categoryName,
      titulo,
      monto,
      fecha,
      clasificacion,
      recurrent: true,
      frecuencia: 'monthly',
      indeterminado: true,
      accountName,
    });
  }

  private async openTransactionOptions(titulo: string): Promise<void> {
    const item = this.page.locator(this.selectors.transactionItem).filter({ hasText: titulo });
    await item.waitFor({ state: 'visible' });
    await item.click();
    await expect(this.page.locator('.modal-overlay h3')).toContainText('Transacción', { timeout: 5000 });
  }

  async editTransaction(titulo: string, nuevoTitulo: string, nuevoMonto?: number): Promise<void> {
    await this.openTransactionOptions(titulo);
    await this.page.locator('.modal-overlay button:has-text("Editar")').click();
    const form = new TransactionForm(this.page);
    await form.waitForOpen();
    if (nuevoTitulo) {
      await form.fillTitle(nuevoTitulo);
    }
    if (nuevoMonto !== undefined) {
      await form.fillAmount(nuevoMonto);
    }
    await form.save();
  }

  async editTransactionComments(titulo: string, comments: string): Promise<void> {
    await this.openTransactionOptions(titulo);
    await this.page.locator('.modal-overlay button:has-text("Editar")').click();
    const form = new TransactionForm(this.page);
    await form.waitForOpen();
    await form.fillComments(comments);
    await form.save();
  }

  async expectTransactionCommentsInDetailAndEdit(titulo: string, comments: string): Promise<void> {
    await this.openTransactionOptions(titulo);
    const details = this.page.locator('.modal-overlay .transaction-comments');
    await expect(details).toBeVisible();
    await expect(details).toContainText(comments);
    await expect(this.page.locator('.modal-overlay img')).toHaveCount(0);
    await this.page.locator('.modal-overlay button:has-text("Editar")').click();
    await expect(this.page.locator('#transaction-comments')).toHaveValue(comments);
    await this.page.locator('.modal-overlay button:has-text("Cancelar")').click();
  }

  async expectDesktopTransactionCommentsInTitle(titulo: string, comments: string): Promise<void> {
    const item = this.page.locator('.desktop-transaction-item').filter({ hasText: titulo });
    await expect(item).toHaveAttribute('title', `Comentarios: ${comments}`);
    await expect(item).not.toContainText(comments);
  }

  async deleteTransaction(titulo: string): Promise<void> {
    await this.openTransactionOptions(titulo);
    await this.page.locator('.modal-overlay button:has-text("Eliminar")').click();
    // Wait for the list to refresh and the item to disappear.
    await this.expectTransactionNotVisible(titulo);
  }
}
