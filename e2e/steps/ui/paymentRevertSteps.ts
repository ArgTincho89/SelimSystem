import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { AssetsPage } from '../../pages/AssetsPage';

const isoDate = (offsetDays: number): string => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

Given('que el inmueble {string} tiene la obligación {string} de {int} pagada hoy', async function (this: SelimSystemWorld, asset: string, title: string, amount: number) {
  const account = await this.api!.post('/api/accounts', { data: { name: 'Cuenta pagos', currency: 'ARS', initialBalance: 1000000 } });
  expect(account.status()).toBe(201);
  const category = await this.api!.post('/api/categories', { data: { nombre: 'Impuestos' } });
  expect(category.status()).toBe(201);
  const created = await this.api!.post('/api/assets', { data: { type: 'immovable', name: asset, propertyType: 'Apartment', usageStatus: 'vacant' } });
  expect(created.status()).toBe(201);
  const obligation = await this.api!.post('/api/obligations', {
    data: {
      title, type: 'tax', currencyCode: 'ARS', estimatedAmount: amount, startDate: isoDate(0), reminderLeadDays: 5,
      accountId: (await account.json()).id, categoryId: (await category.json()).id, assetId: (await created.json()).id,
    },
  });
  expect(obligation.status()).toBe(201);
  const body = await obligation.json();
  const paid = await this.api!.post(`/api/obligations/${body.id}/occurrences/${body.occurrences[0].id}/payments`, { data: { amount, idempotencyKey: `e2e-revert-${Date.now()}` } });
  expect(paid.status()).toBe(201);
});

When('abro el historial del inmueble {string}', async function (this: SelimSystemWorld, asset: string) {
  const assets = new AssetsPage(this.page!);
  await assets.navigate();
  await assets.openHistory(asset);
});

When('reverto el pago de la obligación {string} con el motivo {string}', async function (this: SelimSystemWorld, title: string, reason: string) {
  await new AssetsPage(this.page!).revertPaymentFromHistory(title, reason);
});

When('elijo el año actual y todo el año en el historial', async function (this: SelimSystemWorld) {
  await new AssetsPage(this.page!).chooseHistoryCurrentYearAll();
});

Then('el historial del inmueble muestra {string} como {string}', async function (this: SelimSystemWorld, title: string, state: string) {
  await new AssetsPage(this.page!).expectHistoryRowState(title, state);
});

Then('el historial indica {string}', async function (this: SelimSystemWorld, text: string) {
  await new AssetsPage(this.page!).expectHistoryText(text);
});
