import { Page, expect, Locator } from '@playwright/test';

export type TransactionType = 'expense' | 'income' | 'refund';
export type ExpenseClasificacion = 'fijo' | 'variable';
export type IncomeClasificacion = 'A' | 'B' | 'Mixto';

export interface TransactionFormData {
  tipo?: TransactionType;
  categoryName?: string;
  titulo?: string;
  monto: number;
  fecha?: string;
  clasificacion?: ExpenseClasificacion | IncomeClasificacion;
  montoA?: number;
  montoB?: number;
  ivaPorcentaje?: number;
  comments?: string;
  accountName?: string;
  recurrent?: boolean;
  frecuencia?: 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual';
  indeterminado?: boolean;
  fechaFin?: string;
}

export class TransactionForm {
  constructor(private page: Page) {}

  private get modal(): Locator {
    return this.page.locator('.modal-overlay');
  }

  async waitForOpen(): Promise<void> {
    await expect(this.modal.locator('h3')).toBeVisible();
  }

  async selectType(type: TransactionType): Promise<void> {
    const btn = this.modal.locator(`.type-btn[data-type="${type}"]`);
    await btn.waitFor({ state: 'visible' });
    const isActive = await btn.evaluate((el) => el.classList.contains('active')).catch(() => false);
    if (!isActive) {
      await btn.click();
    }
  }

  async selectCategory(categoryName: string): Promise<void> {
    const categorySelect = this.modal.locator('#transaction-category');
    await categorySelect.waitFor({ state: 'visible' });
    await categorySelect.selectOption({ label: categoryName });
  }

  async selectAccount(accountName: string): Promise<void> {
    await this.modal.locator('#transaction-account').selectOption({ label: accountName });
  }

  async fillTitle(title: string): Promise<void> {
    const input = this.modal.locator('#transaction-title');
    await input.fill(title);
  }

  async fillAmount(amount: number): Promise<void> {
    // The main amount is a money input (text, es-AR); "12.5" and "211392" are accepted.
    await this.modal.locator('#transaction-amount').fill(String(amount));
  }

  async fillDate(date: string): Promise<void> {
    await this.modal.locator('input.form-control[type="date"]').first().fill(date);
  }

  async fillComments(comments: string): Promise<void> {
    await this.modal.locator('#transaction-comments').fill(comments);
  }

  async selectClasificacion(value: ExpenseClasificacion | IncomeClasificacion): Promise<void> {
    const labelMap: Record<string, string> = {
      A: 'A',
      B: 'B',
      Mixto: 'Mixto',
      fijo: 'Fijo',
      variable: 'Variable',
    };
    const labelText = labelMap[value];
    const label = this.modal.locator('.classification-options label').filter({ hasText: new RegExp(`^\\s*${labelText}\\s*$`) });
    await label.locator('input[type="checkbox"]').check();
  }

  async fillMixto(montoA: number, montoB: number): Promise<void> {
    const splitInputs = this.modal.locator('.form-group').filter({ hasText: 'Desglose Mixto' }).locator('[data-money-input]');
    await splitInputs.nth(0).fill(String(montoA));
    await splitInputs.nth(1).fill(String(montoB));
  }

  async fillIva(iva: number): Promise<void> {
    const ivaGroup = this.modal.locator('.form-group').filter({ hasText: 'IVA (%)' });
    await ivaGroup.locator('input[type="number"]').fill(String(iva));
  }

  async setRecurringMonthly(): Promise<void> {
    const recurringGroup = this.modal.locator('.recurring-section');
    const recurrentCheckbox = recurringGroup.locator('label').filter({ hasText: 'Recurrente' }).locator('input[type="checkbox"]');
    await recurrentCheckbox.check();
    const freqSelect = recurringGroup.locator('select.form-control');
    await freqSelect.waitFor({ state: 'visible' });
    await freqSelect.selectOption({ value: 'monthly' });
    // Use indeterminate end date for simplicity.
    const indeterminado = recurringGroup.locator('label').filter({ hasText: 'Indeterminado' }).locator('input[type="checkbox"]');
    await indeterminado.check();
  }

  async save(): Promise<void> {
    const saveButton = this.modal.locator('button.btn-primary:has-text("Guardar")');
    await saveButton.waitFor({ state: 'visible' });
    await saveButton.click();
    await this.page.waitForSelector('.modal-overlay', { state: 'hidden', timeout: 10000 });
  }

  async fill(data: TransactionFormData): Promise<void> {
    if (data.tipo) {
      await this.selectType(data.tipo);
    }
    if (data.accountName) {
      await this.selectAccount(data.accountName);
    }
    if (data.categoryName) {
      await this.selectCategory(data.categoryName);
    }
    if (data.titulo !== undefined) {
      await this.fillTitle(data.titulo);
    }
    await this.fillAmount(data.monto);
    if (data.fecha) {
      await this.fillDate(data.fecha);
    }
    if (data.comments !== undefined) {
      await this.fillComments(data.comments);
    }
    if (data.clasificacion) {
      await this.selectClasificacion(data.clasificacion);
    }
    if (data.montoA !== undefined && data.montoB !== undefined) {
      await this.fillMixto(data.montoA, data.montoB);
    }
    if (data.ivaPorcentaje !== undefined) {
      await this.fillIva(data.ivaPorcentaje);
    }
    if (data.recurrent) {
      await this.setRecurringMonthly();
    }
  }

  async submit(data: TransactionFormData): Promise<void> {
    await this.waitForOpen();
    await this.fill(data);
    await this.save();
  }
}
