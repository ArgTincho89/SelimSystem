import { APIRequestContext, request } from '@playwright/test';
import { buildTestUser, TestUser } from './userFactory';

export interface ApiContext {
  api: APIRequestContext;
  baseURL: string;
  user: TestUser;
}

export async function createApiContext(baseURL: string): Promise<ApiContext> {
  const api = await request.newContext({
    baseURL,
    // Las cookies de sesión viajan automáticamente dentro del contexto.
  });
  const user = buildTestUser();
  return { api, baseURL, user };
}

export async function registerUser(api: APIRequestContext, user: TestUser) {
  const res = await api.post('/api/auth/register', { data: user });
  if (res.status() !== 201) {
    const body = await res.text();
    throw new Error(`Register failed: ${res.status()} ${body}`);
  }
  return res.json();
}

export async function loginUser(api: APIRequestContext, user: TestUser) {
  const res = await api.post('/api/auth/login', {
    data: { nombre: user.nombre, password: user.password },
  });
  if (res.status() !== 200) {
    const body = await res.text();
    throw new Error(`Login failed: ${res.status()} ${body}`);
  }
  return res.json();
}

export async function deleteAccount(api: APIRequestContext) {
  const res = await api.delete('/api/auth/account');
  // La cuenta puede ya no existir si el test falló antes de crearla.
  return res.ok();
}

export async function cleanupAccount(api: APIRequestContext, user: TestUser) {
  try {
    // Intentar login por si la sesión no está activa.
    await api.post('/api/auth/login', {
      data: { nombre: user.nombre, password: user.password },
    });
  } catch {
    // Ignorar errores de login; puede que ya esté autenticado o la cuenta no exista.
  }
  try {
    await deleteAccount(api);
  } catch {
    // Best-effort cleanup.
  }
}

export interface CreateCategoryInput {
  nombre: string;
  color?: string;
  parentId?: string;
}

export async function createCategory(api: APIRequestContext, input: CreateCategoryInput) {
  const res = await api.post('/api/categories', { data: input });
  if (res.status() !== 201) {
    const body = await res.text();
    throw new Error(`Create category failed: ${res.status()} ${body}`);
  }
  return res.json();
}

export interface CreateTransactionInput {
  tipo: 'expense' | 'income' | 'refund';
  titulo?: string;
  monto: number;
  categoryId?: string;
  fecha?: string;
  clasificacion?: 'fijo' | 'variable' | 'A' | 'B' | 'Mixto';
  montoA?: number;
  montoB?: number;
  ivaPorcentaje?: number;
  comments?: string;
  recurrente?: boolean;
  frecuencia?: 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'annual';
  fechaFin?: string;
}

export async function createTransaction(api: APIRequestContext, input: CreateTransactionInput) {
  const res = await api.post('/api/transactions', { data: input });
  if (res.status() !== 201) {
    const body = await res.text();
    throw new Error(`Create transaction failed: ${res.status()} ${body}`);
  }
  return res.json();
}

export interface CreateGoalInput {
  tipo: 'ahorro_mensual' | 'gasto_categoria' | 'gasto_general';
  modo: 'monto_fijo' | 'porcentaje_salario' | 'porcentaje_ingresos_dinamico';
  montoFijo?: number;
  porcentaje?: number;
  salarioEstimado?: number;
  categoryId?: string;
  categoryName?: string;
  meses: string[];
}

export async function createGoal(api: APIRequestContext, input: CreateGoalInput) {
  const res = await api.post('/api/goals', { data: input });
  if (res.status() !== 201) {
    const body = await res.text();
    throw new Error(`Create goal failed: ${res.status()} ${body}`);
  }
  return res.json();
}
