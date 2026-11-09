import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { AccountSettingsPage } from '../../pages/AccountSettingsPage';
import { HomePage } from '../../pages/HomePage';

function businessDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {} as Record<string, string>);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addCalendarDays(date: string, count: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + count));
  return result.toISOString().slice(0, 10);
}

Given('que tengo cuentas EUR y USD conciliadas por API', async function (this: SelimSystemWorld) {
  const setupResponse = await this.api!.get('/api/accounts/setup');
  expect(setupResponse.status()).toBe(200);
  const setup = await setupResponse.json();
  const eur = setup.accounts.find((account: any) => account.primary);
  const usdResponse = await this.api!.post('/api/accounts', { data: { name: 'USD wallet', currency: 'USD' } });
  expect(usdResponse.status()).toBe(201);
  const usd = await usdResponse.json();
  const openingDate = businessDate();
  for (const [account, openingBalance] of [[eur, 1000], [usd, 1000]] as const) {
    const response = await this.api!.post(`/api/accounts/${account.id}/reconcile`, {
      data: { openingBalance, openingDate, includedMovementIds: [] }
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).balanceStatus).toBe('verified');
  }
  this.createdAccounts.set('EUR', eur);
  this.createdAccounts.set('USD', usd);
});

When('selecciono la experiencia {string} con ancho {int}', async function (this: SelimSystemWorld, experience: string, width: number) {
  const selected = experience.toLowerCase().includes('escritorio') ? 'desktop' : 'mobile';
  await this.page!.setViewportSize({ width, height: 900 });
  await this.page!.evaluate(value => localStorage.setItem('pate_experience', value), selected);
  await this.page!.reload();
  if (selected === 'desktop') await this.page!.waitForSelector('.desktop-home-workspace', { state: 'visible' });
  else await this.page!.waitForSelector('.fab', { state: 'visible' });
});

Then('el menú de Configuración y las tarjetas EUR y USD están disponibles', async function (this: SelimSystemWorld) {
  const settings = new AccountSettingsPage(this.page!);
  await settings.expectHomeAccountCards(['Cuenta principal', 'USD wallet']);
  await expect(this.page!.locator('.home-accounts .account-card')).toHaveCount(2);
  await expect(this.page!.locator('.home-accounts')).toContainText('ARS');
  await expect(this.page!.locator('.home-accounts')).toContainText('USD');
});

When('abro Cuentas desde Configuración', async function (this: SelimSystemWorld) {
  await new AccountSettingsPage(this.page!).openFromNavigation('Cuentas');
});

Then('Configuración muestra las dos cuentas conciliadas', async function (this: SelimSystemWorld) {
  const settings = new AccountSettingsPage(this.page!);
  await settings.expectAccountCard('Cuenta principal', 'ARS');
  await settings.expectAccountCard('USD wallet', 'USD');
});

When('vuelvo a Inicio desde la navegación', async function (this: SelimSystemWorld) {
  await this.page!.locator('#navbar [data-route="/home"]').click();
  await expect(this.page!.locator('.home-accounts')).toBeVisible();
});

When('registro el ingreso EUR {string} de {float}', async function (this: SelimSystemWorld, title: string, amount: number) {
  await new HomePage(this.page!).createIncome(title, amount, 'A', {
    fecha: businessDate(), accountName: 'Cuenta principal (ARS)'
  });
});

When('registro el gasto USD {string} de {float}', async function (this: SelimSystemWorld, title: string, amount: number) {
  await new HomePage(this.page!).createExpense('Account UI', title, amount, businessDate(), 'variable', undefined, 'USD wallet (USD)');
});

When('registro el reembolso USD {string} de {float}', async function (this: SelimSystemWorld, title: string, amount: number) {
  await new HomePage(this.page!).createRefund('Account UI', title, amount, businessDate(), 'USD wallet (USD)');
});

When('guardo los totales mensuales antes de transferir', async function (this: SelimSystemWorld) {
  const response = await this.api!.get(`/api/summary?month=${businessDate().slice(0, 7)}`);
  expect(response.status()).toBe(200);
  const summary = await response.json();
  this.accountTotalsBeforeTransfer = {
    ingresos: summary.ingresos,
    gastos: summary.gastos,
    reembolsos: summary.reembolsos,
    currencyTotals: summary.currencyTotals
  };
});

When('registro una conversión USD a EUR sin asignar ingresos', async function (this: SelimSystemWorld) {
  const settings = new AccountSettingsPage(this.page!);
  await settings.openFromNavigation('Cuentas');
  await settings.createTransfer('USD wallet (USD)', 'Cuenta principal (ARS)', 100, 90, businessDate());
});

Then('los saldos cambian y los totales de ingresos gastos y reembolsos no cambian', async function (this: SelimSystemWorld) {
  const response = await this.api!.get('/api/accounts');
  expect(response.status()).toBe(200);
  const accounts = await response.json();
  const eur = this.createdAccounts.get('EUR');
  const usd = this.createdAccounts.get('USD');
  expect(accounts.find((account: any) => account.id === eur.id).balance).toBe(3590);
  expect(accounts.find((account: any) => account.id === usd.id).balance).toBe(820);

  const summaryResponse = await this.api!.get(`/api/summary?month=${businessDate().slice(0, 7)}`);
  expect(summaryResponse.status()).toBe(200);
  const summary = await summaryResponse.json();
  const before = this.accountTotalsBeforeTransfer;
  if (!before) throw new Error('Monthly totals were not captured before transfer');
  expect(summary.ingresos).toBe(before.ingresos);
  expect(summary.gastos).toBe(before.gastos);
  expect(summary.reembolsos).toBe(before.reembolsos);
  expect(summary.currencyTotals).toEqual(before.currencyTotals);

  const settings = new AccountSettingsPage(this.page!);
  await settings.expectTransferBalances('3.590', '820');
});

When('programo un gasto recurrente USD de {float} para dentro de cinco días', async function (this: SelimSystemWorld, amount: number) {
  await new HomePage(this.page!).navigate();
  await new HomePage(this.page!).createRecurringExpense(
    'Account UI', 'Future USD rent', amount, addCalendarDays(businessDate(), 5), 'fijo', 'USD wallet (USD)'
  );
});

When('registro un gasto recurrente EUR de {float} para hoy', async function (this: SelimSystemWorld, amount: number) {
  await new HomePage(this.page!).navigate();
  await new HomePage(this.page!).createRecurringExpense(
    'Account UI', 'Due today EUR rent', amount, businessDate(), 'fijo', 'Cuenta principal (ARS)'
  );
});

Then('el gasto futuro no suma al total y el gasto de hoy sí se incluye', async function (this: SelimSystemWorld) {
  const response = await this.api!.get(`/api/summary?month=${businessDate().slice(0, 7)}`);
  expect(response.status()).toBe(200);
  const summary = await response.json();
  expect(summary.gastos).toBe(25);
  expect(summary.currencyTotals.find((item: any) => item.currency === 'USD').expenses).toBe(100);
  const category = this.createdCategories.get('Account UI');
  expect(summary.porCategoria.find((item: any) => item.categoryId === category.id).neto).toBe(25);
});

When('oculto los importes de las cuentas', async function (this: SelimSystemWorld) {
  await new HomePage(this.page!).navigate();
  await this.page!.locator('.account-privacy-toggle').click();
});

Then('los saldos de las tarjetas están ocultos', async function (this: SelimSystemWorld) {
  const values = this.page!.locator('.home-accounts .account-card-balance');
  await expect(values).toHaveCount(2);
  await expect(values).toHaveText(['••••••', '••••••']);
});

When('abro Avisos desde Configuración', async function (this: SelimSystemWorld) {
  await new AccountSettingsPage(this.page!).openFromNavigation('Avisos');
});

Then('el aviso USD aparece y su importe está oculto', async function (this: SelimSystemWorld) {
  await new AccountSettingsPage(this.page!).expectAccountAndAlertAmountsHidden('USD wallet');
  await expect(this.page!.locator('.account-alert-row')).toContainText('Future USD rent');
});

When('abro el detalle de la cuenta USD', async function (this: SelimSystemWorld) {
  const settings = new AccountSettingsPage(this.page!);
  await settings.openFromNavigation('Cuentas');
  await settings.openAccountDetails('USD wallet');
});

Then('los importes del detalle de la cuenta siguen ocultos', async function (this: SelimSystemWorld) {
  await new AccountSettingsPage(this.page!).expectAccountDetailsAmountsHidden();
});
