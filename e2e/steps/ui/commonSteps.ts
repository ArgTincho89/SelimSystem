import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { buildTestUser } from '../../fixtures/userFactory';
import { registerUser, loginUser } from '../../fixtures/apiHelpers';
import { LoginPage } from '../../pages/LoginPage';
import { HomePage } from '../../pages/HomePage';
import { SummaryPage } from '../../pages/SummaryPage';
import { ProfilePage } from '../../pages/ProfilePage';
import { today } from '../../fixtures/test-data';

Given('que existe un usuario autenticado en el navegador', async function (this: SelimSystemWorld) {
  this.user = buildTestUser('ui');
  await registerUser(this.api!, this.user);
  await loginUser(this.api!, this.user);
  const cookies = await this.api!.storageState();
  await this.context!.addCookies(cookies.cookies);
  await this.page!.goto('/#/home');
  await this.page!.waitForSelector('#navbar', { state: 'visible' });
  await this.page!.waitForLoadState('networkidle');
});

Given('que existe una categoría {string} por API', async function (this: SelimSystemWorld, nombre: string) {
  const res = await this.api!.post('/api/categories', {
    data: { nombre, color: '#FF6B6B' },
  });
  expect(res.status()).toBe(201);
  const category = await res.json();
  this.createdCategories.set(nombre, category);
});

When('abro la página de login', async function (this: SelimSystemWorld) {
  const loginPage = new LoginPage(this.page!);
  await loginPage.navigate();
});

When('abro la página de inicio', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.navigate();
});

When('abro la página de resumen', async function (this: SelimSystemWorld) {
  const summaryPage = new SummaryPage(this.page!);
  await summaryPage.navigate();
});

Then('la sección retirada redirige a Inicio', async function (this: SelimSystemWorld) {
  await expect(this.page!).toHaveURL(/#\/home(?:\?|$)/);
  await expect(this.page!.locator('.desktop-home-analytics, .home-analytics')).toBeVisible();
  for (const route of ['/summary', '/goals', '/estadisticas']) {
    await expect(this.page!.locator(`.navbar-item[data-route="${route}"]`)).toHaveCount(0);
  }
  await expect(this.page!.locator('.goals-header, .period-selector, .trend-filters')).toHaveCount(0);
});

When('abro la página de perfil', async function (this: SelimSystemWorld) {
  const profilePage = new ProfilePage(this.page!);
  await profilePage.navigate();
});

When('inicio sesión con el usuario de prueba', async function (this: SelimSystemWorld) {
  const loginPage = new LoginPage(this.page!);
  await loginPage.login(this.user!);
});

When('creo un gasto en {string} llamado {string} por {float}', async function (this: SelimSystemWorld, categoria: string, titulo: string, monto: number) {
  const homePage = new HomePage(this.page!);
  await homePage.createExpense(categoria, titulo, monto, today());
});

When('cierro sesión desde el perfil', async function (this: SelimSystemWorld) {
  const profilePage = new ProfilePage(this.page!);
  await profilePage.logout();
});

Then('veo el formulario de login', async function (this: SelimSystemWorld) {
  const loginPage = new LoginPage(this.page!);
  await loginPage.expectVisible();
});

Then('veo la barra de navegación', async function (this: SelimSystemWorld) {
  await this.page!.waitForSelector('#navbar', { state: 'visible' });
});

Then('no hay errores críticos en la consola', async function (this: SelimSystemWorld) {
  expect(this.consoleErrors).toHaveLength(0);
  expect(this.pageErrors).toHaveLength(0);
});

Then('veo la transacción {string}', async function (this: SelimSystemWorld, titulo: string) {
  const homePage = new HomePage(this.page!);
  await homePage.expectTransactionVisible(titulo);
});

Then('veo las tarjetas de ingresos, gastos y ahorro', async function (this: SelimSystemWorld) {
  const summaryPage = new SummaryPage(this.page!);
  await summaryPage.expectSummaryLoaded();
});
