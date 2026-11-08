import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { currentMonth } from '../../fixtures/test-data';

function getCategory(world: SelimSystemWorld, nombre: string): any {
  const found = world.createdCategories.get(nombre);
  if (found) return found;
  throw new Error(`Categoría "${nombre}" no encontrada`);
}

Given('que existe una meta de ahorro mensual de {int}', async function (this: SelimSystemWorld, monto: number) {
  const res = await this.api!.post('/api/goals', {
    data: {
      tipo: 'ahorro_mensual',
      modo: 'monto_fijo',
      montoFijo: monto,
      meses: [currentMonth()],
    },
  });
  expect(res.status()).toBe(201);
  const goal = await res.json();
  this.createdGoals.set(`ahorro_${monto}`, goal);
});

Given('que existe una meta de gasto por categoría de {int} para {string}', async function (this: SelimSystemWorld, monto: number, nombre: string) {
  const category = getCategory(this, nombre);
  const res = await this.api!.post('/api/goals', {
    data: {
      tipo: 'gasto_categoria',
      modo: 'monto_fijo',
      montoFijo: monto,
      categoryId: category.id,
      categoryName: category.nombre,
      meses: [currentMonth()],
    },
  });
  expect(res.status()).toBe(201);
  const goal = await res.json();
  this.createdGoals.set(`gasto_${nombre}`, goal);
});

When('creo una meta de ahorro mensual de {int}', async function (this: SelimSystemWorld, monto: number) {
  this.lastResponse = await this.api!.post('/api/goals', {
    data: {
      tipo: 'ahorro_mensual',
      modo: 'monto_fijo',
      montoFijo: monto,
      meses: [currentMonth()],
    },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
  if (this.lastResponseBody?.id) {
    this.createdGoals.set('last', this.lastResponseBody);
  }
});

When('creo una meta sin meses', async function (this: SelimSystemWorld) {
  this.lastResponse = await this.api!.post('/api/goals', {
    data: {
      tipo: 'ahorro_mensual',
      modo: 'monto_fijo',
      montoFijo: 100,
      meses: [],
    },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

When('creo una meta de gasto por categoría de {int} para {string}', async function (this: SelimSystemWorld, monto: number, nombre: string) {
  const category = getCategory(this, nombre);
  this.lastResponse = await this.api!.post('/api/goals', {
    data: {
      tipo: 'gasto_categoria',
      modo: 'monto_fijo',
      montoFijo: monto,
      categoryId: category.id,
      categoryName: category.nombre,
      meses: [currentMonth()],
    },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
  if (this.lastResponseBody?.id) {
    this.createdGoals.set('last', this.lastResponseBody);
  }
});

When('elimino la meta', async function (this: SelimSystemWorld) {
  const id = this.lastResponseBody.id;
  this.lastResponse = await this.api!.delete(`/api/goals/${id}`);
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

Then('la meta es de tipo {string} con modo {string} y monto {int}', async function (this: SelimSystemWorld, tipo: string, modo: string, monto: number) {
  expect(this.lastResponseBody.tipo).toBe(tipo);
  expect(this.lastResponseBody.modo).toBe(modo);
  expect(this.lastResponseBody.montoFijo).toBe(monto);
});

Then('la meta aparece en el listado del mes actual', async function (this: SelimSystemWorld) {
  const id = this.lastResponseBody.id;
  const res = await this.api!.get(`/api/goals?month=${currentMonth()}`);
  expect(res.status()).toBe(200);
  const list = await res.json();
  expect(list.some((g: any) => g.id === id)).toBe(true);
});

Then('la meta no aparece en el listado del mes actual', async function (this: SelimSystemWorld) {
  const id = this.createdGoals.get('last')?.id || this.lastResponseBody?.id;
  const res = await this.api!.get(`/api/goals?month=${currentMonth()}`);
  expect(res.status()).toBe(200);
  const list = await res.json();
  expect(list.some((g: any) => g.id === id)).toBe(false);
});

Then('la meta es de tipo {string} y está asociada a {string}', async function (this: SelimSystemWorld, tipo: string, nombre: string) {
  const category = getCategory(this, nombre);
  expect(this.lastResponseBody.tipo).toBe(tipo);
  expect(this.lastResponseBody.categoryId).toBe(category.id);
});
