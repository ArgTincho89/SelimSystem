import { Page, expect, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class GoalsPage extends BasePage {
  readonly selectors = {
    navbar: '#navbar',
    createButton: 'button:has-text("Crear nueva meta")',
    goalCard: '.goal-card',
  };

  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await this.goto('/goals');
    await this.page.waitForSelector(this.selectors.navbar, { state: 'visible' });
    await this.page.waitForLoadState('networkidle');
  }

  private get modal(): Locator {
    return this.page.locator('.modal-overlay');
  }

  async openCreateModal(): Promise<void> {
    await this.page.click(this.selectors.createButton);
    await expect(this.modal).toBeVisible();
  }

  async selectTipo(tipo: 'ahorro_mensual' | 'gasto_categoria' | 'gasto_general'): Promise<void> {
    const labelMap = {
      ahorro_mensual: 'Meta de ahorro mensual',
      gasto_categoria: 'Límite de gasto por categoría',
      gasto_general: 'Límite de gasto general',
    };
    await this.modal.locator('#goal-tipo').selectOption({ label: labelMap[tipo] });
  }

  async selectModo(modo: 'monto_fijo' | 'porcentaje_salario' | 'porcentaje_ingresos_dinamico'): Promise<void> {
    const labelMap = {
      monto_fijo: 'Monto fijo por mes',
      porcentaje_salario: 'Porcentaje del salario',
      porcentaje_ingresos_dinamico: 'Porcentaje de ingresos (dinámico)',
    };
    await this.modal.locator('#goal-modo').selectOption({ label: labelMap[modo] });
  }

  async selectCategory(categoryName: string): Promise<void> {
    const select = this.modal.locator('#goal-category');
    await select.waitFor({ state: 'visible' });
    await select.selectOption({ label: categoryName });
  }

  async fillMonto(monto: number): Promise<void> {
    await this.modal.locator('#goal-monto').fill(String(monto));
  }

  async fillPeriod(month: string): Promise<void> {
    await this.modal.locator('#goal-month-single').fill(month);
  }

  async saveGoal(): Promise<void> {
    await this.modal.locator('button:has-text("Guardar meta")').click();
    await this.page.waitForSelector('.modal-overlay', { state: 'hidden', timeout: 10000 });
  }

  async createSavingsGoal(monto: number, month: string): Promise<void> {
    await this.openCreateModal();
    await this.selectTipo('ahorro_mensual');
    await this.selectModo('monto_fijo');
    await this.fillMonto(monto);
    await this.fillPeriod(month);
    await this.saveGoal();
  }

  async createSpendingLimitGoal(categoryName: string, monto: number, month: string): Promise<void> {
    await this.openCreateModal();
    await this.selectTipo('gasto_categoria');
    await this.selectCategory(categoryName);
    await this.selectModo('monto_fijo');
    await this.fillMonto(monto);
    await this.fillPeriod(month);
    await this.saveGoal();
  }

  async expectGoalVisible(title: string): Promise<void> {
    await expect(this.page.locator(this.selectors.goalCard).filter({ hasText: title })).toBeVisible();
  }

  async expectGoalNotVisible(title: string): Promise<void> {
    await expect(this.page.locator(this.selectors.goalCard).filter({ hasText: title })).toHaveCount(0);
  }

  async deleteGoal(title: string): Promise<void> {
    const card = this.page.locator(this.selectors.goalCard).filter({ hasText: title });
    this.page.once('dialog', (dialog) => dialog.accept());
    await card.locator('button[title="Eliminar meta"]').click();
    await this.page.waitForLoadState('networkidle');
  }
}
