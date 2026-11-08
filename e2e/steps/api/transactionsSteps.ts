import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { currentMonth, today } from '../../fixtures/test-data';

function getCategory(world: SelimSystemWorld, nombre: string): any {
  const found = world.createdCategories.get(nombre);
  if (found) return found;
  throw new Error(`Categoría "${nombre}" no encontrada`);
}

function rememberTransaction(world: SelimSystemWorld, titulo: string, tx: any) {
  world.createdTransactions.set(titulo, tx);
  world.lastTransaction = tx;
}

Given('que existe un gasto {string} por {float} en {string}', async function (this: SelimSystemWorld, titulo: string, monto: number, nombre: string) {
  const category = getCategory(this, nombre);
  const res = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'expense',
      titulo,
      monto,
      categoryId: category.id,
      fecha: today(),
    },
  });
  expect(res.status()).toBe(201);
  const tx = await res.json();
  rememberTransaction(this, titulo, tx);
});

Given('que existe un ingreso {string} por {float}', async function (this: SelimSystemWorld, titulo: string, monto: number) {
  const res = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'income',
      titulo,
      monto,
      clasificacion: 'A',
      fecha: today(),
    },
  });
  expect(res.status()).toBe(201);
  const tx = await res.json();
  rememberTransaction(this, titulo, tx);
});

Given('que existe un ingreso {string} por {float} con clasificación {string}', async function (this: SelimSystemWorld, titulo: string, monto: number, clasificacion: string) {
  const res = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'income',
      titulo,
      monto,
      clasificacion,
      fecha: today(),
    },
  });
  expect(res.status()).toBe(201);
  const tx = await res.json();
  this.createdTransactions.set(titulo, tx);
});

Given('que existe un gasto {string} por {float} en {string} clasificación {string}', async function (this: SelimSystemWorld, titulo: string, monto: number, nombre: string, clasificacion: string) {
  const category = getCategory(this, nombre);
  const res = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'expense',
      titulo,
      monto,
      categoryId: category.id,
      clasificacion,
      fecha: today(),
    },
  });
  expect(res.status()).toBe(201);
  const tx = await res.json();
  rememberTransaction(this, titulo, tx);
});

When('creo un gasto llamado {string} por {float} en {string}', async function (this: SelimSystemWorld, titulo: string, monto: number, nombre: string) {
  const category = getCategory(this, nombre);
  this.lastResponse = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'expense',
      titulo,
      monto,
      categoryId: category.id,
      fecha: today(),
      clasificacion: 'variable',
    },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
  if (this.lastResponseBody?.id) {
    rememberTransaction(this, titulo, this.lastResponseBody);
  }
});

When('creo un ingreso llamado {string} por {float} con clasificación {string}', async function (this: SelimSystemWorld, titulo: string, monto: number, clasificacion: string) {
  this.lastResponse = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'income',
      titulo,
      monto,
      clasificacion,
      fecha: today(),
    },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
  if (this.lastResponseBody?.id) {
    rememberTransaction(this, titulo, this.lastResponseBody);
  }
});

When('creo un ingreso llamado {string} por {float} con clasificación {string} e IVA {int}%', async function (this: SelimSystemWorld, titulo: string, monto: number, clasificacion: string, iva: number) {
  this.lastResponse = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'income',
      titulo,
      monto,
      clasificacion,
      ivaPorcentaje: iva,
      fecha: today(),
    },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
  if (this.lastResponseBody?.id) {
    this.createdTransactions.set(titulo, this.lastResponseBody);
  }
});

When('creo un ingreso mixto llamado {string} por {float} con montos A {int} y B {int}', async function (this: SelimSystemWorld, titulo: string, monto: number, montoA: number, montoB: number) {
  this.lastResponse = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'income',
      titulo,
      monto,
      clasificacion: 'Mixto',
      montoA,
      montoB,
      fecha: today(),
    },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
  if (this.lastResponseBody?.id) {
    rememberTransaction(this, titulo, this.lastResponseBody);
  }
});

When('creo un gasto recurrente mensual {string} por {float} en {string} desde {string}', async function (this: SelimSystemWorld, titulo: string, monto: number, nombre: string, fecha: string) {
  const category = getCategory(this, nombre);
  this.lastResponse = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'expense',
      titulo,
      monto,
      categoryId: category.id,
      fecha,
      recurrente: true,
      frecuencia: 'monthly',
    },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
  if (this.lastResponseBody?.id) {
    rememberTransaction(this, titulo, this.lastResponseBody);
  }
});

When('listo las transacciones del mes actual', async function (this: SelimSystemWorld) {
  this.lastResponse = await this.api!.get(`/api/transactions?month=${currentMonth()}`);
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

When('consulto la transacción por su id', async function (this: SelimSystemWorld) {
  const id = this.lastTransaction!.id;
  this.lastResponse = await this.api!.get(`/api/transactions/${id}`);
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

When('actualizo la transacción a título {string} y monto {float}', async function (this: SelimSystemWorld, titulo: string, monto: number) {
  const id = this.lastTransaction!.id;
  this.lastResponse = await this.api!.put(`/api/transactions/${id}`, {
    data: { titulo, monto },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

When('elimino la transacción', async function (this: SelimSystemWorld) {
  const id = this.lastTransaction!.id;
  this.lastResponse = await this.api!.delete(`/api/transactions/${id}`);
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

When('listo las transacciones del mes actual filtradas por tipo {string} y categoría {string}', async function (this: SelimSystemWorld, tipo: string, nombre: string) {
  const category = getCategory(this, nombre);
  this.lastResponse = await this.api!.get(`/api/transactions?month=${currentMonth()}&tipo=${tipo}&categoryId=${category.id}`);
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

Then('la transacción es de tipo {string} con monto {float}', async function (this: SelimSystemWorld, tipo: string, monto: number) {
  expect(this.lastResponseBody.tipo).toBe(tipo);
  expect(this.lastResponseBody.monto).toBe(monto);
});

Then('la transacción tiene título {string}', async function (this: SelimSystemWorld, titulo: string) {
  expect(this.lastResponseBody.titulo).toBe(titulo);
});

Then('la transacción tiene monto {float}', async function (this: SelimSystemWorld, monto: number) {
  expect(this.lastResponseBody.monto).toBe(monto);
});

Then('la transacción está asociada a la categoría {string}', async function (this: SelimSystemWorld, nombre: string) {
  const category = getCategory(this, nombre);
  expect(this.lastResponseBody.categoryId).toBe(category.id);
});

Then('la transacción tiene clasificación {string}', async function (this: SelimSystemWorld, clasificacion: string) {
  expect(this.lastResponseBody.clasificacion).toBe(clasificacion);
});

Then('la transacción tiene ivaPorcentaje {int}', async function (this: SelimSystemWorld, iva: number) {
  expect(this.lastResponseBody.ivaPorcentaje).toBe(iva);
});

Then('la transacción tiene montoA {int}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.montoA).toBe(value);
});

Then('la transacción tiene montoB {int}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.montoB).toBe(value);
});

Then('la transacción es recurrente con frecuencia {string}', async function (this: SelimSystemWorld, frecuencia: string) {
  expect(this.lastResponseBody.recurrente).toBe(true);
  expect(this.lastResponseBody.frecuencia).toBe(frecuencia);
});

Then('el total recurrente del mes actual incluye {string} con al menos {float}', async function (this: SelimSystemWorld, titulo: string, monto: number) {
  const res = await this.api!.get(`/api/transactions/recurring-total?month=${currentMonth()}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.total).toBeGreaterThanOrEqual(monto);
  expect(body.items.some((i: any) => i.titulo === titulo)).toBe(true);
});

Then('el listado contiene la transacción', async function (this: SelimSystemWorld) {
  const tx = this.lastTransaction;
  expect(Array.isArray(this.lastResponseBody)).toBe(true);
  expect(this.lastResponseBody.some((t: any) => t.id === tx.id)).toBe(true);
});

Then('la transacción no aparece en el listado del mes actual', async function (this: SelimSystemWorld) {
  const id = this.lastTransaction!.id;
  const res = await this.api!.get(`/api/transactions?month=${currentMonth()}`);
  expect(res.status()).toBe(200);
  const list = await res.json();
  expect(list.some((t: any) => t.id === id)).toBe(false);
});

Then('el listado tiene al menos {int} elemento', async function (this: SelimSystemWorld, count: number) {
  expect(Array.isArray(this.lastResponseBody)).toBe(true);
  expect(this.lastResponseBody.length).toBeGreaterThanOrEqual(count);
});
