import { Page, expect, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class SummaryPage extends BasePage {
  readonly selectors = {
    navbar: '#navbar',
    summarySection: '.summary-section',
    statCard: '.stats-row .stat-card',
  };

  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await this.goto('/home');
    await this.page.waitForSelector(this.selectors.navbar, { state: 'visible' });
    await this.page.waitForLoadState('networkidle');
  }

  async expectSummaryLoaded(): Promise<void> {
    await expect(this.metricCard('Ingresos')).toBeVisible();
    await expect(this.metricCard('Gastos')).toBeVisible();
    await expect(this.metricCard('Ahorro')).toBeVisible();
  }

  private metricCard(label: string): Locator {
    return this.page.locator(this.selectors.statCard).filter({
      has: this.page.getByText(label, { exact: true }),
    }).first();
  }

  async expectIvaMonthlyCounters(): Promise<void> {
    const card = this.page.locator('.chart-container').filter({ hasText: 'IVA mensual por titular' });
    await expect(card).toBeVisible();
    await expect(card.locator('.account-alert-row')).not.toHaveCount(0);
  }

  async expectIvaBadge(amountText: string): Promise<void> {
    const badge = this.page.locator('.category-badge').filter({ hasText: 'IVA acumulado' });
    await expect(badge).toContainText(amountText);
  }

  async expectChartTitle(title: string): Promise<void> {
    await expect(this.page.locator('.chart-title').filter({ hasText: title })).toBeVisible();
  }

  async expectChartCanvas(title: string): Promise<void> {
    const card = this.page.locator('.chart-container').filter({ hasText: title });
    await expect(card.locator('canvas')).toBeVisible();
  }

  async expectFvLegendContains(text: string): Promise<void> {
    const analytics = await this.visibleAnalyticsContainer();
    const legend = analytics.locator('.chart-container')
      .filter({ hasText: 'Fijo vs Variable' })
      .locator('.fv-legend');
    await expect(legend).toContainText(text);
  }

  async expectIncomeABLegendContains(text: string): Promise<void> {
    const card = this.page.locator('.chart-container').filter({ hasText: 'Ingresos A vs B' });
    await expect(card.locator('.fv-legend')).toContainText(text);
  }

  async expectCategoryBar(categoryName: string, amountText: string): Promise<void> {
    const analytics = await this.visibleAnalyticsContainer();
    const section = analytics.locator('.summary-section');
    await section.locator('details').evaluate(details => { (details as HTMLDetailsElement).open = true; });
    const row = section.locator('.desktop-category-breakdown-scroll > div')
      .filter({ has: this.page.getByText(categoryName, { exact: true }) });
    await expect(row).toContainText(amountText);
    await expect(row.locator('.category-bar-track > .category-bar-fill')).toBeVisible();
  }

  private async visibleAnalyticsContainer(): Promise<Locator> {
    const selector = await this.page.locator('body').evaluate(body =>
      body.classList.contains('desktop-mode') ? '.desktop-home-analytics-scroll' : '.home-analytics-content'
    );
    return this.page.locator(selector);
  }

  async expectGoalProgressLabel(label: string): Promise<void> {
    await expect(this.page.locator('.goal-progress-card').filter({ hasText: label })).toBeVisible();
  }

  async expectGoalProgressPercentage(label: string, percentage: string): Promise<void> {
    const card = this.page.locator('.goal-progress-card').filter({ hasText: label });
    await expect(card.locator('.goal-progress-pct')).toContainText(percentage);
  }
}
