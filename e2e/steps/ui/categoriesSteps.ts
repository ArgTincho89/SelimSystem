import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { CategoriesPage } from '../../pages/CategoriesPage';

When('abro la página de categorías', async function (this: SelimSystemWorld) {
  const categoriesPage = new CategoriesPage(this.page!);
  await categoriesPage.navigate();
});

When('creo una categoría llamada {string}', async function (this: SelimSystemWorld, nombre: string) {
  const categoriesPage = new CategoriesPage(this.page!);
  await categoriesPage.createCategory(nombre);
});

When('creo una subcategoría UI {string} bajo {string}', async function (this: SelimSystemWorld, childName: string, parentName: string) {
  const categoriesPage = new CategoriesPage(this.page!);
  await categoriesPage.createChildCategory(parentName, childName);
});

When('edito la categoría {string} a {string}', async function (this: SelimSystemWorld, oldName: string, newName: string) {
  const categoriesPage = new CategoriesPage(this.page!);
  await categoriesPage.editCategory(oldName, newName);
});

When('elimino la categoría UI {string}', async function (this: SelimSystemWorld, name: string) {
  const categoriesPage = new CategoriesPage(this.page!);
  await categoriesPage.deleteCategory(name);
});

Then('veo la categoría {string} en la lista', async function (this: SelimSystemWorld, nombre: string) {
  const categoriesPage = new CategoriesPage(this.page!);
  await categoriesPage.expectCategoryVisible(nombre);
});

Then('no veo la categoría {string} en la lista', async function (this: SelimSystemWorld, nombre: string) {
  const categoriesPage = new CategoriesPage(this.page!);
  await categoriesPage.expectCategoryNotVisible(nombre);
});
