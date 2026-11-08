import { expect, Page } from '@playwright/test';

export class AccountSettingsPage {
  constructor(private readonly page: Page) {}

  async openFromNavigation(section: 'Cuentas' | 'Avisos' = 'Cuentas'): Promise<void> {
    await this.page.locator('#navbar [data-route="/settings"]').click();
    await expect(this.page.locator('#page-content h1')).toHaveText('Configuración');
    await this.page.getByRole('button', { name: section, exact: true }).click();
  }

  async expectAccountCard(name: string, currency: string): Promise<void> {
    const card = this.page.locator('.settings-account-list > .settings-card').filter({ hasText: name }).first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(currency);
  }

  async expectHomeAccountCards(names: string[]): Promise<void> {
    await expect(this.page.locator('#navbar [data-route="/settings"]')).toBeVisible();
    for (const name of names) {
      const card = this.page.locator('.home-accounts .account-card').filter({ hasText: name }).first();
      await expect(card).toBeVisible();
    }
  }

  async createTransfer(fromLabel: string, toLabel: string, sent: number, received: number, date: string): Promise<void> {
    await this.page.getByRole('button', { name: 'Nuevo movimiento entre cuentas' }).click();
    const modal = this.page.locator('.modal-overlay');
    await expect(modal.getByRole('heading', { name: 'Transferencia o conversión' })).toBeVisible();
    await modal.locator('#transfer-from').selectOption({ label: fromLabel });
    await modal.locator('#transfer-to').selectOption({ label: toLabel });
    await modal.locator('#transfer-sent').fill(String(sent));
    await modal.locator('#transfer-received').fill(String(received));
    await modal.locator('#transfer-date').fill(date);
    await modal.getByRole('button', { name: 'Guardar movimiento' }).click();
    await expect(modal).toBeHidden();
    await expect(this.page.locator('.settings-transfer-list')).toContainText(`${sent}`);
  }

  async expectTransferBalances(eurValue: string, usdValue: string): Promise<void> {
    const eurCard = this.page.locator('.settings-account-list > .settings-card').filter({ hasText: 'Cuenta principal' }).first();
    const usdCard = this.page.locator('.settings-account-list > .settings-card').filter({ hasText: 'USD wallet' }).first();
    await expect(eurCard.locator('.account-card-balance')).toContainText(eurValue);
    await expect(usdCard.locator('.account-card-balance')).toContainText(usdValue);
  }

  async hideSensitiveAmounts(): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Ocultar importes', exact: true });
    if (await button.count()) await button.click();
  }

  async expectAccountAndAlertAmountsHidden(accountName: string): Promise<void> {
    const alert = this.page.locator('.account-alert-row').filter({ hasText: accountName }).first();
    await expect(alert).toBeVisible();
    const alertValues = alert.locator('.sensitive-value');
    await expect(alertValues.first()).toHaveText('••••••');
    const allHidden = await alertValues.evaluateAll(elements => elements.every(element => (element as HTMLElement).innerText === '••••••'));
    expect(allHidden).toBe(true);
  }

  async openAccountDetails(accountName: string): Promise<void> {
    const card = this.page.locator('.settings-account-list > .settings-card').filter({ hasText: accountName }).first();
    await card.getByRole('button', { name: 'Ver movimientos' }).click();
    await expect(this.page.locator('.modal-overlay')).toBeVisible();
  }

  async expectAccountDetailsAmountsHidden(): Promise<void> {
    const values = this.page.locator('.modal-overlay [data-public-value]');
    await expect(values).not.toHaveCount(0);
    const allHidden = await values.evaluateAll(elements => elements.every(element => (element as HTMLElement).innerText === '••••••'));
    expect(allHidden).toBe(true);
  }
}
