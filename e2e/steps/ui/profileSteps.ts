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
