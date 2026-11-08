import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class StatisticsPage extends BasePage {
  readonly selectors = {
    navbar: '#navbar',
    periodSelector: '.period-selector',
    filterContainer: '.trend-filters',
    chartTitle: '.chart-title',
  };

  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await this.goto('/estadisticas');
    await this.page.waitForSelector(this.selectors.navbar, { state: 'visible' });
    await this.page.waitForLoadState('networkidle');
  }

  async selectPeriod(period: '3m' | '6m' | '12m'): Promise<void> {
    const labelMap = { '3m': '3 meses', '6m': '6 meses', '12m': '12 meses' };
    const label = labelMap[period];
    await this.page.locator('.period-btn').filter({ hasText: label }).click();
    await this.page.waitForLoadState('networkidle');
    await expect(this.page.locator('.period-btn.active').filter({ hasText: label })).toBeVisible();
  }

  async selectCategoryFilter(categoryName: string): Promise<void> {
    await this.page.locator('.trend-filter-btn').filter({ hasText: categoryName }).click();
    await this.page.waitForLoadState('networkidle');
    await expect(this.page.locator('.trend-filter-btn.active').filter({ hasText: categoryName })).toBeVisible();
  }

  async expectChartTitle(title: string): Promise<void> {
    await expect(this.page.locator(this.selectors.chartTitle).filter({ hasText: title })).toBeVisible();
  }

  async expectCanvasPresent(): Promise<void> {
    await expect(this.page.locator('canvas').first()).toBeVisible();
  }
}
