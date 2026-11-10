import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class AlertsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get modal(): Locator {
    return this.page.locator('.modal-overlay');
  }

  private get rentAlerts(): Locator {
    return this.page.locator('[data-alert-group="rent_due"] article');
  }

  async navigate(): Promise<void> {
    await this.goto('/avisos');
    await this.page.getByRole('heading', { name: 'Avisos', exact: true }).waitFor({ state: 'visible' });
  }

  async expectRentAlertCount(count: number): Promise<void> {
    await expect(this.rentAlerts).toHaveCount(count);
  }

  async expectFirstRentAlertParts(labels: string[]): Promise<void> {
    for (const label of labels) await expect(this.rentAlerts.first()).toContainText(label);
  }

  /** Collects every modality of the first rent month with the dialog defaults. */
  async collectFirstRentAlert(accountName: string): Promise<void> {
    await this.rentAlerts.first().getByRole('button', { name: 'Registrar cobro' }).click();
    await expect(this.modal.getByText('Cobro en ARS')).toBeVisible();
    await this.modal.getByLabel('Cuenta (ARS)').selectOption({ label: accountName });
    await this.modal.getByRole('button', { name: 'Registrar cobro' }).click();
    await this.page.waitForSelector('.modal-overlay', { state: 'hidden', timeout: 10000 });
  }
}
