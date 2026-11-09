const { setupTestDb, cleanupTestDb, createTestUser } = require('../helpers/setup');
const { migrateEvolutivo } = require('../../src/services/migrations');

describe('migrateEvolutivo', () => {
  let db;
  let user;

  beforeAll(() => {
    db = setupTestDb();
    user = createTestUser(db);
    db.create('obligations', { title: 'Legacy', type: 'utility' }, user.id);
    db.create('obligations', { title: 'Current', type: 'utility', responsibilityType: 'tenant', externalIdentifier: 'A-1', externalIdentifierType: 'meter' }, user.id);
  });

  afterAll(() => cleanupTestDb());

  it('backfills defaults on legacy obligations without touching existing values', () => {
    expect(migrateEvolutivo(db).updated).toBe(1);
    const rows = db.findAll('obligations', user.id);
    const legacy = rows.find(item => item.title === 'Legacy');
    expect(legacy).toMatchObject({ responsibilityType: 'owner', externalIdentifier: null, externalIdentifierType: null });
    expect(rows.find(item => item.title === 'Current')).toMatchObject({ responsibilityType: 'tenant', externalIdentifier: 'A-1', externalIdentifierType: 'meter' });
  });

  it('is idempotent on a second run', () => {
    const before = JSON.stringify(db.findAll('obligations', user.id));
    expect(migrateEvolutivo(db).updated).toBe(0);
    expect(JSON.stringify(db.findAll('obligations', user.id))).toBe(before);
  });
});
