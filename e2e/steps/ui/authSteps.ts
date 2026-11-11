import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { buildTestUser } from '../../fixtures/userFactory';
import { RegisterPage } from '../../pages/RegisterPage';
import { LoginPage } from '../../pages/LoginPage';
import { ProfilePage } from '../../pages/ProfilePage';

Given('que no existe un usuario de prueba', async function (this: SelimSystemWorld) {
  this.user = buildTestUser('ui');
});

Then('la experiencia de escritorio está seleccionada por defecto', async function (this: SelimSystemWorld) {
  await expect(this.page!.locator('[data-experience="desktop"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(this.page!.locator('[data-experience="mobile"]')).toHaveAttribute('aria-pressed', 'false');
});

When('selecciono la experiencia de escritorio', async function (this: SelimSystemWorld) {
  await this.page!.click('[data-experience="desktop"]');
});

Then('la elección de escritorio queda guardada', async function (this: SelimSystemWorld) {
  await expect(this.page!.locator('[data-experience="desktop"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await this.page!.evaluate(() => localStorage.getItem('pate_experience'))).toBe('desktop');
});

Then('la preferencia de escritorio se conserva al recargar', async function (this: SelimSystemWorld) {
  await this.page!.reload();
  await expect(this.page!.locator('[data-experience="desktop"]')).toHaveAttribute('aria-pressed', 'true');
});

Then('el inicio muestra las áreas de transacciones y analítica', async function (this: SelimSystemWorld) {
  await expect(this.page!.locator('.desktop-home-workspace')).toBeVisible();
  await expect(this.page!.getByRole('heading', { name: 'Inicio' })).toBeVisible();
  await expect(this.page!.getByRole('heading', { name: 'Analítica' })).toBeVisible();
  await expect(this.page!.locator('.desktop-home-controls .month-nav')).toBeVisible();
});

When('abro la página de registro', async function (this: SelimSystemWorld) {
  const registerPage = new RegisterPage(this.page!);
  await registerPage.navigate();
});

When('me registro con un nuevo usuario', async function (this: SelimSystemWorld) {
  const registerPage = new RegisterPage(this.page!);
  await registerPage.register(this.user!);
  await registerPage.expectRegistered();
});

When('inicio sesión con contraseña {string}', async function (this: SelimSystemWorld, password: string) {
  const loginPage = new LoginPage(this.page!);
  await loginPage.attemptLoginWithPassword(this.user!.nombre, password);
});

When('inicio sesión con la contraseña {string}', async function (this: SelimSystemWorld, password: string) {
  const loginPage = new LoginPage(this.page!);
  await loginPage.attemptLoginWithPassword(this.user!.nombre, password);
  await loginPage.expectLoggedIn();
});

When('cambio la contraseña a {string}', async function (this: SelimSystemWorld, newPassword: string) {
  const profilePage = new ProfilePage(this.page!);
  await profilePage.changePassword(this.user!.password, newPassword);
  this.user!.password = newPassword;
});

When('elimino la cuenta', async function (this: SelimSystemWorld) {
  const profilePage = new ProfilePage(this.page!);
  await profilePage.deleteAccount();
});

When('intento iniciar sesión con las credenciales anteriores', async function (this: SelimSystemWorld) {
  const loginPage = new LoginPage(this.page!);
  await loginPage.attemptLogin(this.user!);
});
