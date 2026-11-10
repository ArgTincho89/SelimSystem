import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export type RentalModality = 'locacion' | 'comodato' | 'mutuo';

const MODALITY_TITLES: Record<RentalModality, string> = {
  locacion: 'Contrato de locación',
  comodato: 'Comodato',
  mutuo: 'Mutuo',
};

export class AssetsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  private get modal(): Locator {
    return this.page.locator('.modal-overlay');
  }

  async navigate(): Promise<void> {
    await this.goto('/assets');
    await this.page.waitForSelector('article.card', { state: 'visible' });
  }

  async openDeclareRental(assetName: string): Promise<void> {
    await this.page.locator('article.card', { hasText: assetName }).getByRole('button', { name: 'Declarar alquiler' }).click();
    await expect(this.modal.getByText('Declaración de alquiler').first()).toBeVisible();
  }

  async selectTenant(name: string): Promise<void> {
    await this.modal.getByLabel('Inquilino', { exact: true }).selectOption({ label: name });
  }

  async checkModality(modality: RentalModality): Promise<void> {
    await this.modal.locator(`input[data-modality-check="${modality}"]`).check();
    await expect(this.fieldset(modality)).toBeVisible();
  }

  private fieldset(modality: RentalModality): Locator {
    return this.modal.locator(`fieldset[data-modality="${modality}"]`);
  }

  /** First money field of the fieldset: the "Monto original". */
  async fillOriginalAmount(modality: RentalModality, amount: string): Promise<void> {
    const field = this.fieldset(modality).locator('[data-money-input]').first();
    await field.fill(amount);
    await field.blur();
  }

  async fillIva(percent: number): Promise<void> {
    await this.fieldset('locacion').getByLabel('IVA (%)').fill(String(percent));
  }

  async fillStartDate(modality: RentalModality, date: string): Promise<void> {
    await this.fieldset(modality).locator('input[type="date"]').first().fill(date);
  }

  async expectOriginalAmount(modality: RentalModality, text: string): Promise<void> {
    await expect(this.fieldset(modality).locator('[data-money-input]').first()).toHaveValue(text);
  }

  async expectIvaTotal(text: string): Promise<void> {
    await expect(this.fieldset('locacion').locator('[data-total-with-iva]')).toHaveText(`Total con IVA: ${text}`);
  }

  async save(): Promise<void> {
    await this.modal.getByRole('button', { name: 'Guardar', exact: true }).click();
  }

  async expectInlineError(text: string): Promise<void> {
    await expect(this.modal.locator('[data-declaration-error]')).toHaveText(text);
  }

  async waitForSaved(): Promise<void> {
    await this.page.waitForSelector('.modal-overlay', { state: 'hidden', timeout: 10000 });
  }

  /** Not exported as a step: kept for symmetry with the other page objects. */
  async expectModalityHidden(modality: RentalModality): Promise<void> {
    await expect(this.fieldset(modality)).toBeHidden();
  }
}
