import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { AssetsPage, RentalModality } from '../../pages/AssetsPage';

const modalityOf = (text: string): RentalModality => {
  const map: Record<string, RentalModality> = { 'locación': 'locacion', comodato: 'comodato', mutuo: 'mutuo' };
  return map[text.toLowerCase()];
};

Given('que existe un inquilino {string} y un inmueble {string} por API', async function (this: SelimSystemWorld, tenant: string, asset: string) {
  const owner = await this.api!.post('/api/owners', { data: { name: tenant, kind: 'person', roles: ['tenant'] } });
  expect(owner.status()).toBe(201);
  const created = await this.api!.post('/api/assets', { data: { type: 'immovable', name: asset, propertyType: 'Apartment', usageStatus: 'vacant' } });
  expect(created.status()).toBe(201);
  this.lastResponseBody = { assetId: (await created.json()).id };
});

When('abro la página de bienes', async function (this: SelimSystemWorld) {
  await new AssetsPage(this.page!).navigate();
});

When('abro la declaración de alquiler del inmueble {string} con el inquilino {string}', async function (this: SelimSystemWorld, asset: string, tenant: string) {
  const page = new AssetsPage(this.page!);
  await page.openDeclareRental(asset);
  await page.selectTenant(tenant);
});

When('marco la modalidad {string} con monto original {string} desde {string}', async function (this: SelimSystemWorld, modality: string, amount: string, start: string) {
  const page = new AssetsPage(this.page!);
  await page.checkModality(modalityOf(modality));
  await page.fillStartDate(modalityOf(modality), start);
  await page.fillOriginalAmount(modalityOf(modality), amount);
});

When('indico un IVA de {int} por ciento en la locación', async function (this: SelimSystemWorld, percent: number) {
  await new AssetsPage(this.page!).fillIva(percent);
});

When('guardo la declaración de alquiler', async function (this: SelimSystemWorld) {
  await new AssetsPage(this.page!).save();
});

Then('el monto original de la {string} muestra {string}', async function (this: SelimSystemWorld, modality: string, text: string) {
  await new AssetsPage(this.page!).expectOriginalAmount(modalityOf(modality), text);
});

Then('veo el total con IVA {string}', async function (this: SelimSystemWorld, text: string) {
  await new AssetsPage(this.page!).expectIvaTotal(text);
});

Then('veo el error de declaración {string}', async function (this: SelimSystemWorld, text: string) {
  await new AssetsPage(this.page!).expectInlineError(text);
});

Then('la declaración de alquiler queda guardada con {int} modalidad y total {int}', async function (this: SelimSystemWorld, count: number, total: number) {
  await new AssetsPage(this.page!).waitForSaved();
  const res = await this.api!.get(`/api/rentals/declarations?assetId=${this.lastResponseBody.assetId}`);
  expect(res.status()).toBe(200);
  const list = await res.json();
  expect(list).toHaveLength(1);
  expect(list[0].modalities).toHaveLength(count);
  expect(list[0].modalities[0].kind).toBe('locacion');
  expect(list[0].modalities[0].totalAmount).toBe(total);
});
