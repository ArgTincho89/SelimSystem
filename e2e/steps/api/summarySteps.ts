import { When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { currentMonth } from '../../fixtures/test-data';

function getCategory(world: SelimSystemWorld, nombre: string): any {
  const found = world.createdCategories.get(nombre);
  if (found) return found;
  throw new Error(`Categoría "${nombre}" no encontrada`);
}

When('consulto el resumen del mes actual', async function (this: SelimSystemWorld) {
  this.lastResponse = await this.api!.get(`/api/summary?month=${currentMonth()}`);
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

Then('el resumen tiene el mes actual', async function (this: SelimSystemWorld) {
  expect(this.lastResponseBody.month).toBe(currentMonth());
});

Then('los totales del resumen son cero', async function (this: SelimSystemWorld) {
  expect(this.lastResponseBody.ingresos).toBe(0);
  expect(this.lastResponseBody.ingresosA).toBe(0);
  expect(this.lastResponseBody.ingresosB).toBe(0);
  expect(this.lastResponseBody.ivaAcumulado).toBe(0);
  expect(this.lastResponseBody.gastos).toBe(0);
  expect(this.lastResponseBody.gastosNetos).toBe(0);
  expect(this.lastResponseBody.ahorro).toBe(0);
  expect(this.lastResponseBody.fijos).toBe(0);
  expect(this.lastResponseBody.variables).toBe(0);
});

Then('el desglose por categoría está vacío', async function (this: SelimSystemWorld) {
  expect(Array.isArray(this.lastResponseBody.porCategoria)).toBe(true);
  expect(this.lastResponseBody.porCategoria).toHaveLength(0);
});

Then('el resumen tiene ingresos {int}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.ingresos).toBe(value);
});

Then('el resumen tiene gastos {int}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.gastos).toBe(value);
});

Then('el resumen tiene gastosNetos {int}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.gastosNetos).toBe(value);
});

Then('el resumen tiene ahorro {int}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.ahorro).toBe(value);
});

Then('el resumen tiene fijos {int}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.fijos).toBe(value);
});

Then('el resumen tiene variables {int}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.variables).toBe(value);
});

Then('el resumen tiene ingresosA {int}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.ingresosA).toBe(value);
});

Then('el resumen tiene ingresosB {int}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.ingresosB).toBe(value);
});

Then('el resumen tiene ivaAcumulado {int}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.ivaAcumulado).toBe(value);
});

Then('el desglose de ingresos A es {float}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.ingresosDesglose.A).toBe(value);
});

Then('el desglose de ingresos B es {float}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.ingresosDesglose.B).toBe(value);
});

Then('el porcentaje A es {float}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.porcentajeA).toBeCloseTo(value, 2);
});

Then('el porcentaje B es {float}', async function (this: SelimSystemWorld, value: number) {
  expect(this.lastResponseBody.porcentajeB).toBeCloseTo(value, 2);
});

Then('el progreso de la meta de ahorro es {float} sobre {int}', async function (this: SelimSystemWorld, progreso: number, meta: number) {
  const goal = this.lastResponseBody.metas.find((g: any) => g.tipo === 'ahorro_mensual');
  expect(goal).toBeDefined();
  expect(goal.progresoActual).toBe(progreso);
  expect(goal.meta).toBe(meta);
});

Then('el progreso de la meta de gasto por categoría es {float} sobre {int} para {string}', async function (this: SelimSystemWorld, progreso: number, meta: number, nombre: string) {
  const category = getCategory(this, nombre);
  const goal = this.lastResponseBody.metas.find((g: any) => g.tipo === 'gasto_categoria' && g.categoryId === category.id);
  expect(goal).toBeDefined();
  expect(goal.progresoActual).toBe(progreso);
  expect(goal.meta).toBe(meta);
});
