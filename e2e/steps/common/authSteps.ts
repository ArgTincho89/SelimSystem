import { Given, When, Then } from '@cucumber/cucumber';
import { expect, request } from '@playwright/test';
import { SelimSystemWorld } from '../../support/world';
import { buildTestUser } from '../../fixtures/userFactory';
import { registerUser, loginUser } from '../../fixtures/apiHelpers';

Given('que la API está disponible', async function (this: SelimSystemWorld) {
  const res = await this.api!.get('/health');
  expect(res.status()).toBe(200);
});

Given('que existe un usuario registrado', async function (this: SelimSystemWorld) {
  this.user = buildTestUser();
  await registerUser(this.api!, this.user);
});

Given('que existe un usuario autenticado', async function (this: SelimSystemWorld) {
  this.user = buildTestUser();
  await registerUser(this.api!, this.user);
  await loginUser(this.api!, this.user);
});

Given('que no estoy autenticado', async function (this: SelimSystemWorld) {
  if (this.api) {
    await this.api.dispose();
  }
  this.api = await request.newContext({ baseURL: this.baseURL });
});

When('consulto el endpoint de health', async function (this: SelimSystemWorld) {
  this.lastResponse = await this.api!.get('/health');
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

When('registro un nuevo usuario', async function (this: SelimSystemWorld) {
  this.user = buildTestUser();
  this.lastResponse = await this.api!.post('/api/auth/register', { data: this.user });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

When('intento registrar otro usuario con el mismo email', async function (this: SelimSystemWorld) {
  const otherUser = buildTestUser();
  otherUser.email = this.user!.email;
  this.lastResponse = await this.api!.post('/api/auth/register', { data: otherUser });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

When('inicio sesión con esas credenciales', async function (this: SelimSystemWorld) {
  this.lastResponse = await this.api!.post('/api/auth/login', {
    data: { nombre: this.user!.nombre, password: this.user!.password },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

When('inicio sesión en un nuevo contexto con las credenciales actuales', async function (this: SelimSystemWorld) {
  if (this.api) {
    await this.api.dispose();
  }
  this.api = await request.newContext({ baseURL: this.baseURL });
  this.lastResponse = await this.api.post('/api/auth/login', {
    data: { nombre: this.user!.nombre, password: this.user!.password },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

When('inicio sesión con contraseña incorrecta', async function (this: SelimSystemWorld) {
  this.lastResponse = await this.api!.post('/api/auth/login', {
    data: { nombre: this.user!.nombre, password: 'contraseñaIncorrecta123' },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

When('no puedo iniciar sesión con esas credenciales', async function (this: SelimSystemWorld) {
  this.lastResponse = await this.api!.post('/api/auth/login', {
    data: { nombre: this.user!.nombre, password: this.user!.password },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

When('consulto mi perfil', async function (this: SelimSystemWorld) {
  this.lastResponse = await this.api!.get('/api/auth/me');
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

When('cambio el email a uno nuevo', async function (this: SelimSystemWorld) {
  const newEmail = `updated_${Date.now()}@example.com`;
  this.lastResponse = await this.api!.post('/api/auth/change-email', {
    data: { email: newEmail, password: this.user!.password },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
  this.user!.email = newEmail;
});

When('cambio la contraseña a una nueva', async function (this: SelimSystemWorld) {
  const newPassword = 'NuevaPass456!';
  this.lastResponse = await this.api!.post('/api/auth/change-password', {
    data: { currentPassword: this.user!.password, newPassword },
  });
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
  this.user!.password = newPassword;
});

When('cierro sesión', async function (this: SelimSystemWorld) {
  this.lastResponse = await this.api!.post('/api/auth/logout');
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

When('elimino la cuenta autenticada', async function (this: SelimSystemWorld) {
  this.lastResponse = await this.api!.delete('/api/auth/account');
  this.lastResponseBody = await this.lastResponse.json().catch(() => null);
});

Then('la respuesta tiene status {int}', async function (this: SelimSystemWorld, status: number) {
  expect(this.lastResponse!.status()).toBe(status);
});

Then('la respuesta indica status {string}', async function (this: SelimSystemWorld, value: string) {
  expect(this.lastResponseBody.status).toBe(value);
});

Then('el usuario registrado tiene id, email y nombre', async function (this: SelimSystemWorld) {
  expect(this.lastResponseBody).toMatchObject({
    id: expect.any(String),
    email: this.user!.email.toLowerCase(),
    nombre: this.user!.nombre,
  });
});

Then('la respuesta contiene id, email y nombre', async function (this: SelimSystemWorld) {
  expect(this.lastResponseBody).toMatchObject({
    id: expect.any(String),
    email: this.user!.email.toLowerCase(),
    nombre: this.user!.nombre,
  });
});

Then('la respuesta indica error de email duplicado', async function (this: SelimSystemWorld) {
  expect(this.lastResponseBody.error).toContain('email');
});

Then('la sesión está destruida', async function (this: SelimSystemWorld) {
  const res = await this.api!.get('/api/auth/me');
  expect(res.status()).toBe(401);
});

Then('puedo consultar mi perfil con éxito', async function (this: SelimSystemWorld) {
  const res = await this.api!.get('/api/auth/me');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({
    id: expect.any(String),
    email: this.user!.email.toLowerCase(),
    nombre: this.user!.nombre,
  });
});
