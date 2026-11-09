const { setupTestDb, cleanupTestDb, createTestUser } = require('../helpers/setup');
const { migrateEvolutivo3 } = require('../../src/services/migrations');

describe('migrateEvolutivo3 (assets)', () => {
  let db;
  let user;
  const byName = name => db.findAll('assets', user.id).find(a => a.name === name);

  beforeAll(() => {
    db = setupTestDb();
    user = createTestUser(db);
    db.create('assets', { name: 'Dpto', type: 'immovable' }, user.id);
    db.create('assets', { name: 'Con datos', type: 'immovable', cadastralId: 'Parc 4', constructionDate: '2010-03-15' }, user.id);
    db.create('assets', { name: 'Auto', type: 'movable' }, user.id);
  });

  afterAll(() => cleanupTestDb());

  it('backfills immovables and leaves movables alone', () => {
    expect(migrateEvolutivo3(db).updated).toBe(1);
    expect(byName('Dpto')).toMatchObject({ cadastralId: null, constructionDate: null });
    expect(byName('Auto')).not.toHaveProperty('cadastralId');
  });

  it('never overwrites existing values', () => {
    expect(byName('Con datos')).toMatchObject({ cadastralId: 'Parc 4', constructionDate: '2010-03-15' });
  });

  it('is idempotent', () => {
    const before = JSON.stringify(db.findAll('assets', user.id));
    expect(migrateEvolutivo3(db).updated).toBe(0);
    expect(JSON.stringify(db.findAll('assets', user.id))).toBe(before);
  });
});
