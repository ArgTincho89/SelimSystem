import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { StatisticsPage } from '../../pages/StatisticsPage';
import { currentMonth, addMonthsToMonth, firstDayOfMonth } from '../../fixtures/test-data';

When('abro la página de estadísticas', async function (this: SelimSystemWorld) {
  const statisticsPage = new StatisticsPage(this.page!);
  await statisticsPage.navigate();
});

Then('veo los botones de período', async function (this: SelimSystemWorld) {
  const statisticsPage = new StatisticsPage(this.page!);
  await expect(this.page!.locator('.period-selector')).toBeVisible();
});

When('selecciono el período {string}', async function (this: SelimSystemWorld, label: string) {
  const statisticsPage = new StatisticsPage(this.page!);
  const valueMap: Record<string, '3m' | '6m' | '12m'> = { '3 meses': '3m', '6 meses': '6m', '12 meses': '12m' };
  await statisticsPage.selectPeriod(valueMap[label]);
});

Then('el botón {string} está activo', async function (this: SelimSystemWorld, label: string) {
  const button = this.page!.locator('.period-btn').filter({ hasText: label });
  await expect(button).toHaveClass(/active/);
});

Then('se renderiza al menos un canvas', async function (this: SelimSystemWorld) {
  const statisticsPage = new StatisticsPage(this.page!);
  await statisticsPage.expectCanvasPresent();
});

When('selecciono el filtro de categoría {string}', async function (this: SelimSystemWorld, categoryName: string) {
  const statisticsPage = new StatisticsPage(this.page!);
  await statisticsPage.selectCategoryFilter(categoryName);
});

Then('el botón de filtro {string} está activo', async function (this: SelimSystemWorld, categoryName: string) {
  const button = this.page!.locator('.trend-filter-btn').filter({ hasText: categoryName });
  await expect(button).toHaveClass(/active/);
});

Then('veo el gráfico en estadísticas {string}', async function (this: SelimSystemWorld, titulo: string) {
  const statisticsPage = new StatisticsPage(this.page!);
  await statisticsPage.expectChartTitle(titulo);
});

Given('que existen transacciones de los últimos 6 meses por API en {string}', async function (this: SelimSystemWorld, categoryName: string) {
  const category = this.createdCategories.get(categoryName);
  if (!category) throw new Error(`Categoría "${categoryName}" no encontrada`);
  const nowMonth = currentMonth();
  for (let i = 5; i >= 0; i--) {
    const month = addMonthsToMonth(nowMonth, -i);
    const fecha = `${month}-01`;
    const expenseRes = await this.api!.post('/api/transactions', {
      data: {
        tipo: 'expense',
        titulo: `Gasto ${month}`,
        monto: 50 + i * 10,
        categoryId: category.id,
        fecha,
        clasificacion: 'variable',
      },
    });
    expect(expenseRes.status()).toBe(201);
  }
});

Given('que existen transacciones de ingreso y gasto de los últimos 6 meses por API en {string}', async function (this: SelimSystemWorld, categoryName: string) {
  const category = this.createdCategories.get(categoryName);
  if (!category) throw new Error(`Categoría "${categoryName}" no encontrada`);
  const nowMonth = currentMonth();
  for (let i = 5; i >= 0; i--) {
    const month = addMonthsToMonth(nowMonth, -i);
    const fecha = `${month}-01`;
    const expenseRes = await this.api!.post('/api/transactions', {
      data: {
        tipo: 'expense',
        titulo: `Gasto ${month}`,
        monto: 50 + i * 5,
        categoryId: category.id,
        fecha,
        clasificacion: 'variable',
      },
    });
    expect(expenseRes.status()).toBe(201);
    const incomeRes = await this.api!.post('/api/transactions', {
      data: {
        tipo: 'income',
        titulo: `Ingreso ${month}`,
        monto: 300 + i * 20,
        fecha,
        clasificacion: 'A',
        ivaPorcentaje: 21,
      },
    });
    expect(incomeRes.status()).toBe(201);
  }
});
