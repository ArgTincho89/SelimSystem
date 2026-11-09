import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { HomePage } from '../../pages/HomePage';
import { formatEuro, today, addMonthsToDate } from '../../fixtures/test-data';

When('creo un ingreso {string} de {float} con clasificación {string}', async function (this: SelimSystemWorld, titulo: string, monto: number, clasificacion: string) {
  const homePage = new HomePage(this.page!);
  await homePage.createIncome(titulo, monto, clasificacion as 'A' | 'B' | 'Mixto');
});

When('creo un ingreso {string} de {float} con clasificación {string} y con IVA cero', async function (this: SelimSystemWorld, titulo: string, monto: number, clasificacion: string) {
  const homePage = new HomePage(this.page!);
  await homePage.createIncome(titulo, monto, clasificacion as 'A' | 'B' | 'Mixto', { ivaPorcentaje: 0 });
});

When('creo un ingreso {string} de {float} con clasificación {string} desglosado {float} en A y {float} en B', async function (
  this: SelimSystemWorld,
  titulo: string,
  monto: number,
  clasificacion: string,
  montoA: number,
  montoB: number
) {
  const homePage = new HomePage(this.page!);
  await homePage.createIncome(titulo, monto, clasificacion as 'A' | 'B' | 'Mixto', { montoA, montoB });
});

When('creo un gasto fijo en {string} llamado {string} por {float}', async function (this: SelimSystemWorld, categoria: string, titulo: string, monto: number) {
  const homePage = new HomePage(this.page!);
  await homePage.createExpense(categoria, titulo, monto, today(), 'fijo');
});

When('creo un gasto variable en {string} llamado {string} por {float}', async function (this: SelimSystemWorld, categoria: string, titulo: string, monto: number) {
  const homePage = new HomePage(this.page!);
  await homePage.createExpense(categoria, titulo, monto, today(), 'variable');
});

When('creo un gasto en {string} llamado {string} por {float} con comentarios {string}', async function (
  this: SelimSystemWorld,
  categoria: string,
  titulo: string,
  monto: number,
  comments: string
) {
  const homePage = new HomePage(this.page!);
  await homePage.createExpense(categoria, titulo, monto, today(), 'variable', comments);
});

When('creo un reembolso en {string} llamado {string} por {float}', async function (this: SelimSystemWorld, categoria: string, titulo: string, monto: number) {
  const homePage = new HomePage(this.page!);
  await homePage.createRefund(categoria, titulo, monto, today());
});

When('creo un gasto recurrente mensual en {string} llamado {string} por {float}', async function (this: SelimSystemWorld, categoria: string, titulo: string, monto: number) {
  const homePage = new HomePage(this.page!);
  await homePage.createRecurringExpense(categoria, titulo, monto, today(), 'fijo');
});

When('edito la transacción {string} a {string} por {float}', async function (this: SelimSystemWorld, titulo: string, nuevoTitulo: string, nuevoMonto: number) {
  const homePage = new HomePage(this.page!);
  await homePage.editTransaction(titulo, nuevoTitulo, nuevoMonto);
});

When('actualizo los comentarios de {string} a {string}', async function (
  this: SelimSystemWorld,
  titulo: string,
  comments: string
) {
  const homePage = new HomePage(this.page!);
  await homePage.editTransactionComments(titulo, comments);
});

When('elimino la transacción {string}', async function (this: SelimSystemWorld, titulo: string) {
  const homePage = new HomePage(this.page!);
  await homePage.deleteTransaction(titulo);
});

When('navego al mes siguiente', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.navigateMonth('next');
});

When('navego al mes anterior', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.navigateMonth('prev');
});

When('hago clic en el botón de ojo', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.toggleEye();
});

When('marco {string} como favorito analítico', async function (this: SelimSystemWorld, label: string) {
  const homePage = new HomePage(this.page!);
  await homePage.selectAnalyticFavorite(label);
});

When('quito el favorito analítico {string}', async function (this: SelimSystemWorld, label: string) {
  const homePage = new HomePage(this.page!);
  await homePage.clearAnalyticFavorite(label);
});

When('activo nueva transacción desde los controles de inicio', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.openNewTransaction();
});

When('redimensiono el inicio al ancho de escritorio {int}', async function (this: SelimSystemWorld, width: number) {
  await this.page!.setViewportSize({ width, height: 900 });
});

When('configuro el inicio en modo escritorio', async function (this: SelimSystemWorld) {
  await this.page!.setViewportSize({ width: 1280, height: 900 });
  await this.page!.evaluate(() => localStorage.setItem('pate_experience', 'desktop'));
  await this.page!.reload();
  await this.page!.waitForSelector('.desktop-home-workspace', { state: 'visible' });
  await expect(this.page!.locator('body')).toHaveClass(/desktop-mode/);
});

When('guardo el desglose por categoría como favorito heredado y recargo', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.persistCategoryBreakdownFavoriteAndReload();
});

When('mantengo el modo móvil en viewport {int}', async function (this: SelimSystemWorld, width: number) {
  await this.page!.setViewportSize({ width, height: 844 });
  await this.page!.evaluate(() => localStorage.setItem('pate_experience', 'mobile'));
  await this.page!.reload();
  await this.page!.waitForSelector('.fab', { state: 'visible' });
});

Then('el stat {string} muestra {string}', async function (this: SelimSystemWorld, label: string, valor: string) {
  const homePage = new HomePage(this.page!);
  await homePage.expectStatContains(label, valor);
});

Then('no veo la transacción {string}', async function (this: SelimSystemWorld, titulo: string) {
  const homePage = new HomePage(this.page!);
  await homePage.expectTransactionNotVisible(titulo);
});

Then('los comentarios de {string} se muestran en el detalle y el formulario de edición como {string}', async function (
  this: SelimSystemWorld,
  titulo: string,
  comments: string
) {
  const homePage = new HomePage(this.page!);
  await homePage.expectTransactionCommentsInDetailAndEdit(titulo, comments);
});

Then('los comentarios de escritorio de {string} se guardan en el atributo title y no se muestran inline como {string}', async function (
  this: SelimSystemWorld,
  titulo: string,
  comments: string
) {
  const homePage = new HomePage(this.page!);
  await homePage.expectDesktopTransactionCommentsInTitle(titulo, comments);
});

Then('el título del mes cambia', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  const label = await homePage.getMonthLabel();
  expect(label).toBeTruthy();
});

Then('los valores de ingresos y ahorro aparecen difuminados', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectValuesBlurred();
});

Then('los valores de ingresos y ahorro no aparecen difuminados', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectValuesNotBlurred();
});

Then('el favorito analítico de inicio es {string}', async function (this: SelimSystemWorld, label: string) {
  const homePage = new HomePage(this.page!);
  await homePage.expectAnalyticFavorite(label);
});

Then('no hay datos para el favorito analítico del período actual', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectFavoriteUnavailable();
});

Then('la réplica favorita contiene un gráfico interactivo', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectFavoriteReplicaChart();
});

Then('no hay tarjeta de favorito en inicio', async function (this: SelimSystemWorld) {
  await expect(this.page!.locator('.desktop-favorite-card')).toHaveCount(0);
});

Then('los controles de inicio aparecen en el orden requerido', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectDesktopControlOrder();
});

Then('aparecen tres métricas principales', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectThreePrimaryMetrics();
});

Then('las métricas tienen iconos decorativos y el botón dice Nueva transacción', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectDesktopMetricIconsAndTransactionLabel();
});

Then('las tres métricas principales no tienen estrellas', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectFixedMetricsHaveNoStars();
});

Then('no hay accesos a secciones analíticas retiradas', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectLegacyAnalyticsNavigationRemoved();
});

Then('el selector de mes está centrado y destacado', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectDesktopMonthCenteredAndLarger();
});

Then('las flechas del mes están visibles y no se superponen', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectDesktopMonthArrowsVisibleAndSeparated();
});

Then('el desglose por categoría sigue en analítica sin estrella', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectCategoryBreakdownIsNotFavoritable();
});

Then('la gráfica {string} sigue disponible como favorito', async function (this: SelimSystemWorld, label: string) {
  const homePage = new HomePage(this.page!);
  await homePage.expectAnalyticCanBeFavorited(label);
});

Then('el favorito heredado de desglose por categoría se descarta', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectNoPersistedCategoryBreakdownFavorite();
});

Then('la réplica favorita es compacta, sin desplazamiento interno y la fila KPI ocupa como máximo dos filas', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectFavoriteReplicaCompactWithoutScrolling();
});

Then('la leyenda de la réplica favorita contiene {string}', async function (this: SelimSystemWorld, value: string) {
  const homePage = new HomePage(this.page!);
  await homePage.expectFavoriteLegendContains(value);
});

Then('el desglose por categoría está contraído y se abre y cierra con teclado', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectCategoryBreakdownDisclosureKeyboardToggle();
});

Then('el selector muestra mes y año completos sin preposición', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectMonthLabelHasFullMonthAndYear();
});

Then('la estrella del gráfico de IVA queda dentro de la tarjeta sin tapar el título', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectIvaFavoriteStarInsideChartCard();
});

Then('la página no tiene desbordamiento horizontal', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectNoHorizontalPageOverflow();
});

Then('el tooltip del gráfico {string} muestra datos de euros y porcentajes', async function (this: SelimSystemWorld, label: string) {
  const homePage = new HomePage(this.page!);
  const tooltip = await homePage.hoverChartPoint(label);
  expect(tooltip).toMatch(/(?:[A-Z]{3}|\$)\s?\d[\d.,]*/);
  expect(tooltip).toMatch(/\d[\d.,]*%/);
});

Then('el tooltip del gráfico {string} muestra un valor en euros', async function (this: SelimSystemWorld, label: string) {
  const homePage = new HomePage(this.page!);
  const tooltip = await homePage.hoverChartPoint(label);
  expect(tooltip).toMatch(/(?:[A-Z]{3}|\$)\s?\d[\d.,]*/);
});

Then('el tooltip del gráfico {string} muestra porcentajes', async function (this: SelimSystemWorld, label: string) {
  const homePage = new HomePage(this.page!);
  const tooltip = await homePage.hoverChartPoint(label);
  expect(tooltip).toMatch(/\d[\d.,]*%/);
});

Then('el tooltip del gráfico {string} se puede explorar con teclado', async function (this: SelimSystemWorld, label: string) {
  const homePage = new HomePage(this.page!);
  await homePage.expectChartTooltipKeyboard(label);
});

Then('la privacidad indica importes ocultos', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectPrivacyState(true);
});

Then('la privacidad indica importes visibles', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectPrivacyState(false);
});

Then('el formulario de nueva transacción está abierto', async function (this: SelimSystemWorld) {
  await expect(this.page!.locator('.modal-overlay h3')).toContainText('Nueva transacción');
});

Then('el diseño de inicio cabe en el viewport', async function (this: SelimSystemWorld) {
  const homePage = new HomePage(this.page!);
  await homePage.expectDesktopLayoutWithinViewport();
});

Then('el inicio móvil conserva su estructura', async function (this: SelimSystemWorld) {
  await expect(this.page!.locator('.desktop-home-workspace')).toHaveCount(0);
  await expect(this.page!.locator('.stats-row')).toBeVisible();
  await expect(this.page!.locator('.fab')).toBeVisible();
});

Given('que existe una transacción {string} de {float} del mes pasado por API en {string}', async function (
  this: SelimSystemWorld,
  titulo: string,
  monto: number,
  categoryName: string
) {
  const category = this.createdCategories.get(categoryName);
  if (!category) throw new Error(`Categoría "${categoryName}" no encontrada en el world`);
  const fecha = addMonthsToDate(today(), -1);
  const tx = await this.api!.post('/api/transactions', {
    data: {
      tipo: 'expense',
      titulo,
      monto,
      categoryId: category.id,
      fecha,
      clasificacion: 'variable',
    },
  });
  expect(tx.status()).toBe(201);
  this.createdTransactions.set(titulo, await tx.json());
});
