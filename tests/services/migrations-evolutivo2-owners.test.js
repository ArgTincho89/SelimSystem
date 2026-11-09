const { setupTestDb, cleanupTestDb, createTestUser } = require('../helpers/setup');
const { migrateEvolutivo2 } = require('../../src/services/migrations');

describe('migrateEvolutivo2 (owners)', () => {
  let db;
  let user;

  beforeAll(() => {
    db = setupTestDb();
    user = createTestUser(db);
    db.create('legalOwners', { name: 'Juan Gómez', kind: 'person', roles: ['owner'] }, user.id);
    db.create('legalOwners', { name: 'Ana Pérez', kind: 'person', firstName: 'Ana', lastName: 'Pérez', dni: '1', expenseCategoryId: 'c1', roles: ['owner'] }, user.id);
    db.create('legalOwners', { name: 'Muni', kind: 'entity', roles: ['provider'] }, user.id);
  });

  afterAll(() => cleanupTestDb());

  it('backfills blanks on legacy persons only', () => {
    expect(migrateEvolutivo2(db).updated).toBe(1);
    const rows = db.findAll('legalOwners', user.id);
    expect(rows.find(r => r.name === 'Juan Gómez')).toMatchObject({ name: 'Juan Gómez', firstName: 'Juan Gómez', lastName: '', dni: null, expenseCategoryId: null });
    expect(rows.find(r => r.name === 'Muni').firstName).toBeUndefined();
  });

  it('does not overwrite existing values and is idempotent', () => {
    const before = JSON.stringify(db.findAll('legalOwners', user.id));
    expect(migrateEvolutivo2(db).updated).toBe(0);
    expect(JSON.stringify(db.findAll('legalOwners', user.id))).toBe(before);
    expect(db.findAll('legalOwners', user.id).find(r => r.name === 'Ana Pérez')).toMatchObject({ dni: '1', expenseCategoryId: 'c1' });
  });
});
