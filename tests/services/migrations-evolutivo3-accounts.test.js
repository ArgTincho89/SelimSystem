const { setupTestDb, cleanupTestDb, createTestUser } = require('../helpers/setup');
const { migrateEvolutivo3 } = require('../../src/services/migrations');

describe('migrateEvolutivo3 (accounts)', () => {
  let db;
  let user;
  beforeAll(() => {
    db = setupTestDb();
    user = createTestUser(db);
    db.create('accounts', { nombre: 'Vieja', currency: 'ARS' }, user.id);
    db.create('accounts', { nombre: 'Hija', currency: 'USD', parentId: 'abc' }, user.id);
  });
  afterAll(() => cleanupTestDb());

  it('sets parentId=null only when undefined and is idempotent', () => {
    expect(migrateEvolutivo3(db).updated).toBe(1);
    const accounts = db.findAll('accounts', user.id);
    expect(accounts.find(a => a.nombre === 'Vieja').parentId).toBeNull();
    expect(accounts.find(a => a.nombre === 'Hija').parentId).toBe('abc');
    const before = JSON.stringify(accounts);
    expect(migrateEvolutivo3(db).updated).toBe(0);
    expect(JSON.stringify(db.findAll('accounts', user.id))).toBe(before);
  });
});
