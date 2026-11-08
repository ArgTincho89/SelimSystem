import { Page, expect, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class CategoriesPage extends BasePage {
  readonly selectors = {
    navbar: '#navbar',
    newCategoryButton: '.page-header button:has-text("Nueva")',
    categoryList: '.category-list',
    categoryItem: '.category-item',
  };

  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await this.goto('/categories');
    await this.page.waitForSelector(this.selectors.navbar, { state: 'visible' });
    await this.page.waitForLoadState('networkidle');
  }

  private get modal(): Locator {
    return this.page.locator('.modal-overlay');
  }

  async openCreateModal(): Promise<void> {
    await this.page.click(this.selectors.newCategoryButton);
    await expect(this.modal).toBeVisible();
  }

  async fillCategoryName(name: string): Promise<void> {
    const input = this.modal.locator('input[type="text"]');
    await input.fill(name);
  }

  async selectParent(parentName: string): Promise<void> {
    const select = this.modal.locator('select.form-control');
    await select.selectOption({ label: parentName });
  }

  async saveCategory(): Promise<void> {
    await this.modal.locator('button.btn-primary:has-text("Crear")').click();
    await this.page.waitForSelector('.modal-overlay', { state: 'hidden', timeout: 10000 });
  }

  async saveEdit(): Promise<void> {
    await this.modal.locator('button.btn-primary:has-text("Guardar")').click();
    await this.page.waitForSelector('.modal-overlay', { state: 'hidden', timeout: 10000 });
  }

  async createCategory(name: string): Promise<void> {
    await this.openCreateModal();
    await this.fillCategoryName(name);
    await this.saveCategory();
  }

  async createChildCategory(parentName: string, childName: string): Promise<void> {
    const parentItem = this.page.locator(this.selectors.categoryItem).filter({ hasText: parentName });
    await parentItem.locator('button[title="Agregar subcategoría"]').click();
    await expect(this.modal).toBeVisible();
    await this.fillCategoryName(childName);
    await this.saveCategory();
  }

  async editCategory(oldName: string, newName: string): Promise<void> {
    const item = this.page.locator(this.selectors.categoryItem).filter({ hasText: new RegExp(`^${oldName}`) });
    await item.locator('button[title="Editar"]').click();
    await expect(this.modal).toBeVisible();
    await this.fillCategoryName(newName);
    await this.saveEdit();
  }

  async deleteCategory(name: string): Promise<void> {
    const item = this.page.locator(this.selectors.categoryItem).filter({ hasText: new RegExp(`^${name}`) });
    await item.locator('button[title="Eliminar"]').click();
    await expect(this.modal).toBeVisible();
    await this.modal.locator('button.btn-danger:has-text("Eliminar")').click();
    await this.page.waitForSelector('.modal-overlay', { state: 'hidden', timeout: 10000 });
  }

  async expectCategoryVisible(name: string): Promise<void> {
    await expect(this.page.locator(this.selectors.categoryItem).filter({ hasText: new RegExp(`^${name}`) })).toBeVisible();
  }

  async expectCategoryNotVisible(name: string): Promise<void> {
    await expect(this.page.locator(this.selectors.categoryItem).filter({ hasText: new RegExp(`^${name}`) })).toHaveCount(0);
  }
}
