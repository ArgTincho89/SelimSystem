import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { ProfilePage } from '../../pages/ProfilePage';

When('cambio el email a {string}', async function (this: SelimSystemWorld, newEmail: string) {
  const profilePage = new ProfilePage(this.page!);
  await profilePage.changeEmail(newEmail, this.user!.password);
  this.user!.email = newEmail;
});

Then('el email mostrado en el perfil es {string}', async function (this: SelimSystemWorld, email: string) {
  const profilePage = new ProfilePage(this.page!);
  await expect.poll(async () => profilePage.getEmail()).toBe(email.toLowerCase());
});

When('abro los LOGS de la cuenta', async function (this: SelimSystemWorld) {
  const profilePage = new ProfilePage(this.page!);
  await profilePage.openLogs();
});

Then('veo en los LOGS la acción {string} con día y hora', async function (this: SelimSystemWorld, message: string) {
  const profilePage = new ProfilePage(this.page!);
  await profilePage.expectLogEntry(message);
});
