import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { TestUser } from '../fixtures/userFactory';

export class LoginPage extends BasePage {
  readonly selectors = {
    tabLogin: '[data-tab="login"]',
    tabRegister: '[data-tab="register"]',
    loginForm: '#login-form',
    registerForm: '#register-form',
    loginNombre: '#login-nombre',
    loginPassword: '#login-password',
    registerNombre: '#register-nombre',
    registerEmail: '#register-email',
    registerPassword: '#register-password',
    submitLogin: '#login-form button[type="submit"]',
    submitRegister: '#register-form button[type="submit"]',
  };

  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await this.goto('/login');
    await this.page.waitForSelector(this.selectors.loginForm, { state: 'visible' });
    // Recarga limpia para evitar que el service worker/cache de otros tests interfiera con el submit.
    await this.page.reload();
    await this.page.waitForSelector('#login-form.active', { state: 'visible' });
  }

  async login(user: TestUser): Promise<void> {
    await this.page.waitForSelector('#login-form.active', { state: 'visible' });
    await this.page.fill(this.selectors.loginNombre, user.nombre);
    await this.page.fill(this.selectors.loginPassword, user.password);

    const submitButton = this.page.locator(this.selectors.submitLogin);
    await submitButton.waitFor({ state: 'visible' });
    await submitButton.click();

    await this.page.waitForSelector('#navbar', { state: 'visible', timeout: 15000 });
  }

  async register(user: TestUser): Promise<void> {
    await this.page.click(this.selectors.tabRegister);
    await this.page.fill(this.selectors.registerNombre, user.nombre);
    await this.page.fill(this.selectors.registerEmail, user.email);
    await this.page.fill(this.selectors.registerPassword, user.password);
    await this.page.click(this.selectors.submitRegister);
  }

  async expectLoggedIn(): Promise<void> {
    await this.page.waitForSelector('#navbar', { state: 'visible', timeout: 10000 });
  }

  async expectVisible(): Promise<void> {
    await expect(this.page.locator(this.selectors.loginForm)).toBeVisible();
  }

  async attemptLogin(user: TestUser): Promise<void> {
    await this.page.waitForSelector('#login-form.active', { state: 'visible' });
    await this.page.fill(this.selectors.loginNombre, user.nombre);
    await this.page.fill(this.selectors.loginPassword, user.password);
    await this.page.click(this.selectors.submitLogin);
  }

  async attemptLoginWithPassword(nombre: string, password: string): Promise<void> {
    await this.page.waitForSelector('#login-form.active', { state: 'visible' });
    await this.page.fill(this.selectors.loginNombre, nombre);
    await this.page.fill(this.selectors.loginPassword, password);
    await this.page.click(this.selectors.submitLogin);
  }
}
