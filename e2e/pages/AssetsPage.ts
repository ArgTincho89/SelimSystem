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

  /** Opens "Ver alquiler", goes to the "Períodos" tab and undoes the collected rent month through the "Deshacer" dialog (required reason). */
  async undoCollectedMonth(assetName: string): Promise<void> {
    await this.page.locator('article.card', { hasText: assetName }).getByRole('button', { name: 'Ver alquiler', exact: true }).click();
    await this.modal.getByRole('tab', { name: 'Períodos' }).click();
    const month = this.modal.locator('[data-rent-month]', { hasText: 'Cobrado' }).first();
    await month.getByRole('button', { name: 'Deshacer cobro' }).click();
    await this.topModal.getByLabel('Motivo', { exact: true }).fill('Cobro cargado por error');
    await this.topModal.locator('[data-undo-confirm]').click();
    await expect(this.modal.locator('[data-rent-month]', { hasText: 'Cobrado' })).toHaveCount(0);
    await this.modal.getByLabel('Cerrar').click();
  }

  /** Opens "Ver alquiler" > "Contratos" and ends one modality with its date dialog and explicit confirmation. */
  async endModality(assetName: string, modality: string): Promise<void> {
    await this.page.locator('article.card', { hasText: assetName }).getByRole('button', { name: 'Ver alquiler', exact: true }).click();
    await this.modal.getByRole('tab', { name: 'Contratos' }).click();
    const card = this.modal.locator('[data-contract-card]', { hasText: modality }).first();
    await card.getByRole('button', { name: new RegExp('Finalizar contrato') }).click();
    await this.modal.getByRole('button', { name: 'Confirmar y finalizar contrato' }).click();
    await expect(this.modal.getByRole('button', { name: 'Confirmar y finalizar contrato' })).toHaveCount(0);
  }

  /** A finish date of today keeps the contract in force until then: its validity now ends today. */
  async expectModalityEndsToday(assetName: string, modality: string): Promise<void> {
    await this.modal.getByRole('tab', { name: 'Contratos' }).click();
    const today = await this.page.evaluate(() => (window as unknown as { getToday: () => string }).getToday());
    await expect(this.modal.locator('[data-contract-card]', { hasText: modality }).first()).toContainText(`— ${today}`);
  }

  private get topModal(): Locator {
    return this.page.locator('.modal-overlay').last();
  }

  /** Opens the typed history timeline of an asset from its ficha card. */
  async openHistory(assetName: string): Promise<void> {
    await this.page.locator('article.card', { hasText: assetName }).getByRole('button', { name: 'Ver historial', exact: true }).first().click();
    await this.page.locator('.asset-history').waitFor({ state: 'visible' });
  }

  /** History row > "Ver detalle" > "Deshacer" > dialog with the required "Motivo". */
  async revertPaymentFromHistory(concept: string, reason: string): Promise<void> {
    await this.page.locator('[data-history-row]', { hasText: concept }).first().getByRole('button', { name: 'Ver detalle' }).click();
    await this.topModal.locator('[data-history-action="undo"]').first().click();
    await this.topModal.getByLabel('Motivo', { exact: true }).fill(reason);
    await this.topModal.locator('[data-undo-confirm]').click();
    await expect(this.page.locator('[data-history-row]', { hasText: 'Pago revertido' }).first()).toBeVisible();
  }

  async chooseHistoryCurrentYearAll(): Promise<void> {
    const year = String(new Date().getFullYear());
    const history = this.page.locator('.asset-history');
    await history.getByLabel('Mes', { exact: true }).selectOption('all');
    await history.getByLabel('Año', { exact: true }).selectOption(year);
  }

  async expectHistoryRowState(concept: string, state: string): Promise<void> {
    await expect(this.page.locator('[data-history-row]', { hasText: concept }).filter({ hasText: state }).first()).toBeVisible();
  }

  async expectHistoryText(text: string): Promise<void> {
    await expect(this.page.locator('.asset-history')).toContainText(text);
  }

  /** Not exported as a step: kept for symmetry with the other page objects. */
  async expectModalityHidden(modality: RentalModality): Promise<void> {
    await expect(this.fieldset(modality)).toBeHidden();
  }
}
