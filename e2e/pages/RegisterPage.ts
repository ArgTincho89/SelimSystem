import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { TestUser } from '../fixtures/userFactory';

export class RegisterPage extends BasePage {
  readonly selectors = {
    tabRegister: '[data-tab="register"]',
    registerForm: '#register-form',
    registerNombre: '#register-nombre',
    registerEmail: '#register-email',
    registerPassword: '#register-password',
    submitRegister: '#register-form button[type="submit"]',
  };

  constructor(page: Page) {
    super(page);
  }

  async navigate(): Promise<void> {
    await this.goto('/login');
    await this.page.waitForSelector('#login-form.active', { state: 'visible' });

    // Activamos el tab y form de registro directamente para evitar problemas de timing.
    await this.page.evaluate(() => {
      document.querySelectorAll('.login-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.login-form').forEach((f) => f.classList.remove('active'));
      const registerTab = document.querySelector('.login-tab[data-tab="register"]') as HTMLElement;
      const registerForm = document.querySelector('#register-form') as HTMLElement;
      if (registerTab) registerTab.classList.add('active');
      if (registerForm) registerForm.classList.add('active');
    });

    await this.page.waitForSelector('#register-form.active', { state: 'visible' });
  }

  async register(user: TestUser): Promise<void> {
    await this.page.fill(this.selectors.registerNombre, user.nombre);
    await this.page.fill(this.selectors.registerEmail, user.email);
    await this.page.fill(this.selectors.registerPassword, user.password);
    await this.page.click(this.selectors.submitRegister);
  }

  async expectRegistered(): Promise<void> {
    await this.page.waitForSelector('#navbar', { state: 'visible' });
    await this.waitForUrlHash('/home');
  }
}
