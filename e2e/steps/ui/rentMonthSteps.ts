import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { AssetsPage } from '../../pages/AssetsPage';
import { AlertsPage } from '../../pages/AlertsPage';

const isoDate = (year: number, month: number, day: number): string => new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);

Given('que el inmueble {string} tiene un alquiler de locación {int} con IVA {int}, comodato {int} y mutuo {int} desde el mes pasado', async function (this: SelimSystemWorld, asset: string, locacion: number, iva: number, comodato: number, mutuo: number) {
  const now = new Date();
  const start = isoDate(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
  const end = isoDate(now.getUTCFullYear(), now.getUTCMonth() + 1, 0);
  const owner = await this.api!.post('/api/owners', { data: { name: 'Ana Inquilina', kind: 'person', roles: ['tenant'] } });
  expect(owner.status()).toBe(201);
  const account = await this.api!.post('/api/accounts', { data: { name: 'Cuenta alquileres', currency: 'ARS' } });
  expect(account.status()).toBe(201);
  const created = await this.api!.post('/api/assets', { data: { type: 'immovable', name: asset, propertyType: 'Apartment', usageStatus: 'vacant' } });
  expect(created.status()).toBe(201);
  const modality = (kind: string, amount: number, ivaPercent: number | null) => ({
    kind, startDate: start, endDate: end, amount, currencyCode: 'ARS', ivaPercent, adjustmentFrequencyMonths: null, adjustmentCriterion: null,
  });
  const declaration = await this.api!.post('/api/rentals/declarations', {
    data: { assetId: (await created.json()).id, tenantIds: [(await owner.json()).id], notes: '', modalities: [modality('locacion', locacion, iva), modality('comodato', comodato, null), modality('mutuo', mutuo, null)] },
  });
  expect(declaration.status()).toBe(201);
});

When('abro la página de avisos', async function (this: SelimSystemWorld) {
  await new AlertsPage(this.page!).navigate();
});

Then('hay {int} aviso(s) de alquiler pendientes', async function (this: SelimSystemWorld, count: number) {
  await new AlertsPage(this.page!).expectRentAlertCount(count);
});

Then('el primer aviso de alquiler detalla las modalidades {string}, {string} y {string}', async function (this: SelimSystemWorld, a: string, b: string, c: string) {
  await new AlertsPage(this.page!).expectFirstRentAlertParts([a, b, c]);
});

When('registro el cobro del primer aviso de alquiler en la cuenta {string}', async function (this: SelimSystemWorld, account: string) {
  await new AlertsPage(this.page!).collectFirstRentAlert(account);
});

When('deshago el cobro del mes cobrado desde el historial del inmueble {string}', async function (this: SelimSystemWorld, asset: string) {
  const assets = new AssetsPage(this.page!);
  await assets.navigate();
  await assets.undoCollectedMonth(asset);
});
