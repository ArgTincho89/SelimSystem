import { Page, request } from '@playwright/test';
import { TestUser } from './userFactory';

/**
 * Autentica una página de browser haciendo login por API e inyectando
 * la cookie de sesión en el contexto de la página.
 *
 * Esto es más robusto que hacer login por UI en cada test.
 */
export async function authenticatePage(page: Page, user: TestUser, baseURL?: string): Promise<void> {
  const resolvedBaseURL = baseURL || 'http://localhost:3001';
  const api = await request.newContext({ baseURL: resolvedBaseURL });

  try {
    const loginRes = await api.post('/api/auth/login', {
      data: { nombre: user.nombre, password: user.password },
    });

    if (loginRes.status() !== 200) {
      throw new Error(`API login failed: ${loginRes.status()} ${await loginRes.text()}`);
    }

    const cookies = await api.storageState();
    await page.context().addCookies(cookies.cookies);
  } finally {
    await api.dispose();
  }
}
