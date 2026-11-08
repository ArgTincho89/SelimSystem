import { APIRequestContext, Browser, Page, request } from '@playwright/test';
import { buildTestUser, TestUser } from './userFactory';

export interface UiTestContext {
  page: Page;
  user: TestUser;
  api: APIRequestContext;
}

export async function createUiUser(baseURL: string): Promise<{ user: TestUser; api: APIRequestContext }> {
  const api = await request.newContext({ baseURL });
  const user = buildTestUser('ui');
  const registerRes = await api.post('/api/auth/register', { data: user });
  if (registerRes.status() !== 201) {
    throw new Error(`UI setup register failed: ${registerRes.status()} ${await registerRes.text()}`);
  }
  return { user, api };
}

export async function cleanupUiUser(api: APIRequestContext, user: TestUser): Promise<void> {
  try {
    await api.post('/api/auth/login', { data: { nombre: user.nombre, password: user.password } });
    await api.delete('/api/auth/account');
  } catch {
    // Best-effort cleanup.
  }
  await api.dispose();
}
