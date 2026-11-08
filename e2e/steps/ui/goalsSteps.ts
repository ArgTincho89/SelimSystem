import { Given, When, Then } from '@cucumber/cucumber';
import { SelimSystemWorld } from '../../support/world';
import { GoalsPage } from '../../pages/GoalsPage';
import { currentMonth } from '../../fixtures/test-data';

When('abro la página de metas', async function (this: SelimSystemWorld) {
  const goalsPage = new GoalsPage(this.page!);
  await goalsPage.navigate();
});

When('creo una meta de ahorro de {float}€ para el mes actual', async function (this: SelimSystemWorld, monto: number) {
  const goalsPage = new GoalsPage(this.page!);
  await goalsPage.createSavingsGoal(monto, currentMonth());
});

When('creo un límite de gasto de {float}€ para {string} en el mes actual', async function (this: SelimSystemWorld, monto: number, categoryName: string) {
  const goalsPage = new GoalsPage(this.page!);
  await goalsPage.createSpendingLimitGoal(categoryName, monto, currentMonth());
});

When('elimino la meta {string}', async function (this: SelimSystemWorld, title: string) {
  const goalsPage = new GoalsPage(this.page!);
  await goalsPage.deleteGoal(title);
});

Then('veo la meta {string} en la lista', async function (this: SelimSystemWorld, title: string) {
  const goalsPage = new GoalsPage(this.page!);
  await goalsPage.expectGoalVisible(title);
});

Then('no veo la meta {string} en la lista', async function (this: SelimSystemWorld, title: string) {
  const goalsPage = new GoalsPage(this.page!);
  await goalsPage.expectGoalNotVisible(title);
});
