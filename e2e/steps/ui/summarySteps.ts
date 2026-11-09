import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { SummaryPage } from '../../pages/SummaryPage';
import { currentMonth, firstDayOfMonth, formatEuro } from '../../fixtures/test-data';
import { createGoal } from '../../fixtures/apiHelpers';

When('registro por API un ingreso A de {float} con IVA {int}%', async function (this: SelimSystemWorld, monto: number, iva: number) {
  const res = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'income',
      titulo: 'Ingreso A API',
      monto,
      fecha: firstDayOfMonth(),
      clasificacion: 'A',
      ivaPorcentaje: iva,
    },
  });
  expect(res.status()).toBe(201);
});

When('registro por API un ingreso Mixto de {float} con A {float}, B {float} e IVA {int}%', async function (
  this: SelimSystemWorld,
  monto: number,
  montoA: number,
  montoB: number,
  iva: number
) {
  const res = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'income',
      titulo: 'Ingreso Mixto API',
      monto,
      montoA,
      montoB,
      fecha: firstDayOfMonth(),
      clasificacion: 'Mixto',
      ivaPorcentaje: iva,
    },
  });
  expect(res.status()).toBe(201);
});

When('registro por API un ingreso B de {float}', async function (this: SelimSystemWorld, monto: number) {
  const res = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'income',
      titulo: 'Ingreso B API',
      monto,
      fecha: firstDayOfMonth(),
      clasificacion: 'B',
    },
  });
  expect(res.status()).toBe(201);
});

When('registro por API un ingreso A de {float}', async function (this: SelimSystemWorld, monto: number) {
  const res = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'income',
      titulo: 'Ingreso A API',
      monto,
      fecha: firstDayOfMonth(),
      clasificacion: 'A',
    },
  });
  expect(res.status()).toBe(201);
});

When('registro por API un gasto fijo de {float} en {string}', async function (this: SelimSystemWorld, monto: number, categoryName: string) {
  const category = this.createdCategories.get(categoryName);
  if (!category) throw new Error(`Categoría "${categoryName}" no encontrada`);
  const res = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'expense',
      titulo: 'Gasto fijo API',
      monto,
      categoryId: category.id,
      fecha: firstDayOfMonth(),
      clasificacion: 'fijo',
    },
  });
  expect(res.status()).toBe(201);
});

When('registro por API un gasto variable de {float} en {string}', async function (this: SelimSystemWorld, monto: number, categoryName: string) {
  const category = this.createdCategories.get(categoryName);
  if (!category) throw new Error(`Categoría "${categoryName}" no encontrada`);
  const res = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'expense',
      titulo: 'Gasto variable API',
      monto,
      categoryId: category.id,
      fecha: firstDayOfMonth(),
      clasificacion: 'variable',
    },
  });
  expect(res.status()).toBe(201);
});

Given('que existe una meta de ahorro de {float}€ para el mes actual por API', async function (this: SelimSystemWorld, monto: number) {
  const goal = await createGoal(this.api!, {
    tipo: 'ahorro_mensual',
    modo: 'monto_fijo',
    montoFijo: monto,
    meses: [currentMonth()],
  });
  this.createdGoals.set('ahorro', goal);
});

Given('que existe un límite de gasto de {float}€ para {string} por API', async function (this: SelimSystemWorld, monto: number, categoryName: string) {
  const category = this.createdCategories.get(categoryName);
  if (!category) throw new Error(`Categoría "${categoryName}" no encontrada`);
  const goal = await createGoal(this.api!, {
    tipo: 'gasto_categoria',
    modo: 'monto_fijo',
    montoFijo: monto,
    categoryId: category.id,
    categoryName: category.nombre,
    meses: [currentMonth()],
  });
  this.createdGoals.set('limite-' + categoryName, goal);
});

Then('el badge de IVA acumulado muestra {string}', async function (this: SelimSystemWorld, valor: string) {
  const summaryPage = new SummaryPage(this.page!);
  await summaryPage.expectIvaBadge(valor);
});

Then('veo el gráfico en el resumen {string}', async function (this: SelimSystemWorld, titulo: string) {
  const summaryPage = new SummaryPage(this.page!);
  await summaryPage.expectChartTitle(titulo);
});

Then('el gráfico {string} tiene un canvas', async function (this: SelimSystemWorld, titulo: string) {
  const summaryPage = new SummaryPage(this.page!);
  await summaryPage.expectChartCanvas(titulo);
});

Then('la leyenda Fijo vs Variable contiene {string}', async function (this: SelimSystemWorld, texto: string) {
  const summaryPage = new SummaryPage(this.page!);
  await summaryPage.expectFvLegendContains(texto);
});

Then('la leyenda A vs B contiene {string}', async function (this: SelimSystemWorld, texto: string) {
  const summaryPage = new SummaryPage(this.page!);
  await summaryPage.expectIncomeABLegendContains(texto);
});

Then('el desglose muestra la barra {string} con {string}', async function (this: SelimSystemWorld, categoria: string, monto: string) {
  const summaryPage = new SummaryPage(this.page!);
  await summaryPage.expectCategoryBar(categoria, monto);
});

Then('veo la tarjeta de progreso {string}', async function (this: SelimSystemWorld, etiqueta: string) {
  const summaryPage = new SummaryPage(this.page!);
  await summaryPage.expectGoalProgressLabel(etiqueta);
});



Then('los contadores mensuales de IVA estan visibles', async function (this: SelimSystemWorld) {
  const summaryPage = new SummaryPage(this.page!);
  await summaryPage.expectIvaMonthlyCounters();
});
