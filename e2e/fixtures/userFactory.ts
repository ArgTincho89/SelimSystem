import crypto from 'crypto';

export interface TestUser {
  nombre: string;
  email: string;
  password: string;
}

export function buildTestUser(prefix = 'e2e'): TestUser {
  const suffix = crypto.randomBytes(6).toString('hex');
  return {
    nombre: `${prefix}_${suffix}`,
    email: `${prefix}_${suffix}@example.com`,
    password: 'Test1234!',
  };
}

export function buildUnique(prefix = 'e2e'): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}
