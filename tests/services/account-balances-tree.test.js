const { setupTestDb, cleanupTestDb, createTestUser } = require('../helpers/setup');
const ledger = require('../../src/services/account-ledger');

describe('getAccountBalances tree order', () => {
  let db;
  let user;
  beforeAll(() => { db = setupTestDb(); user = createTestUser(db); });
  afterAll(() => cleanupTestDb());

  it('lists a parent followed by its children and exposes parentId', () => {
    const a = db.create('accounts', { nombre: 'A', currency: 'ARS', activo: true, order: 0, createdAt: '2025-01-01' }, user.id);
    const b = db.create('accounts', { nombre: 'B', currency: 'ARS', activo: true, order: 1, createdAt: '2025-01-02' }, user.id);
    const c = db.create('accounts', { nombre: 'C', currency: 'USD', activo: true, order: 2, parentId: a.id, createdAt: '2025-01-03' }, user.id);
    const list = ledger.getAccountBalances(db, user.id);
    expect(list.map(item => item.id)).toEqual([a.id, c.id, b.id]);
    expect(list.map(item => item.parentId)).toEqual([null, a.id, null]);
  });
});
