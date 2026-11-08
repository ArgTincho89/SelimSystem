import { Page, expect, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

export class ProfilePage extends BasePage {
  readonly selectors = {
    navbar: '#navbar',
    logoutButton: 'button:has-text("Cerrar sesión")',
    accountActionsButton: 'button:has-text("Acciones de cuenta")',
    changeEmailOption: '#account-action-change-email',
    changePasswordOption: '#account-action-change-password',
    deleteAccountOption: '#account-action-delete',
    confirmInput: '#delete-account-confirm',
    confirmDeleteButton: '.modal-overlay button:has-text("Eliminar mi cuenta")',
    loginForm: '#login-form',
    emailValue: '.profile-info-value',
  };

  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await this.goto('/profile');
    await this.page.waitForSelector(this.selectors.navbar, { state: 'visible' });
  }

  async logout(): Promise<void> {
    const logoutButton = this.page.locator(this.selectors.logoutButton);
    await logoutButton.waitFor({ state: 'visible' });
    await logoutButton.click();
    await this.waitForUrlHash('/login');
    await this.page.waitForSelector(this.selectors.loginForm, { state: 'visible' });
  }

  async deleteAccount(): Promise<void> {
    await this.openAccountActions();
    await this.page.click(this.selectors.deleteAccountOption);
    await this.page.fill(this.selectors.confirmInput, 'ELIMINAR');
    await this.page.click(this.selectors.confirmDeleteButton);
    await this.page.waitForSelector(this.selectors.loginForm, { state: 'visible' });
  }

  async expectLoggedOut(): Promise<void> {
    await expect(this.page.locator(this.selectors.loginForm)).toBeVisible();
  }

  async getEmail(): Promise<string> {
    const emailRow = this.page.locator('.profile-info-row').filter({ hasText: 'Email' });
    return emailRow.locator(this.selectors.emailValue).innerText();
  }

  private get modal(): Locator {
    return this.page.locator('.modal-overlay');
  }

  private async openAccountActions(): Promise<void> {
    await this.page.click(this.selectors.accountActionsButton);
    await this.page.waitForSelector('.modal-overlay', { state: 'visible' });
  }

  async changeEmail(newEmail: string, password: string): Promise<void> {
    await this.openAccountActions();
    await this.page.click(this.selectors.changeEmailOption);
    await expect(this.modal).toBeVisible();
    await this.modal.locator('#new-email').fill(newEmail);
    await this.modal.locator('#confirm-pw-email').fill(password);
    await this.modal.locator('button.btn-primary:has-text("Guardar")').click();
    await this.page.waitForSelector('.modal-overlay', { state: 'hidden', timeout: 10000 });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.openAccountActions();
    await this.page.click(this.selectors.changePasswordOption);
    await expect(this.modal).toBeVisible();
    await this.modal.locator('#current-pw').fill(currentPassword);
    await this.modal.locator('#new-pw').fill(newPassword);
    await this.modal.locator('#repeat-pw').fill(newPassword);
    await this.modal.locator('button.btn-primary:has-text("Guardar")').click();
    await this.page.waitForSelector('.modal-overlay', { state: 'hidden', timeout: 10000 });
  }
}
