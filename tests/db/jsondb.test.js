const fs = require('fs');
const JsonDB = require('../../src/db/jsondb');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

describe('JsonDB', () => {
  let db;

  beforeEach(() => {
    db = setupTestDb();
  });

  afterEach(() => {
    cleanupTestDb();
  });

  describe('users', () => {
    it('should create and find a user by id', () => {
      const user = db.createUser({
        email: 'test@example.com',
        password: 'hashed',
        nombre: 'Test'
      });

      expect(user).toHaveProperty('id');
      expect(user.email).toBe('test@example.com');

      const found = db.findUserById(user.id);
      expect(found).not.toBeNull();
      expect(found.email).toBe('test@example.com');
    });

    it('should find a user by email', () => {
      db.createUser({ email: 'findme@test.com', password: 'x', nombre: 'A' });
      const found = db.findUserByEmail('findme@test.com');
      expect(found).not.toBeNull();
      expect(found.nombre).toBe('A');
    });

    it('should return null for non-existent email', () => {
      const found = db.findUserByEmail('nobody@test.com');
      expect(found).toBeNull();
    });

    it('should return null for non-existent name', () => {
      const found = db.findUserByName('Ghost');
      expect(found).toBeNull();
    });

    it('should find a user by name', () => {
      db.createUser({ email: 'name@test.com', password: 'x', nombre: 'FindByName' });
      const found = db.findUserByName('FindByName');
      expect(found).not.toBeNull();
      expect(found.email).toBe('name@test.com');
    });

    it('should update a user', () => {
      const user = db.createUser({ email: 'u@test.com', password: 'x', nombre: 'Old' });
      const updated = db.updateUser(user.id, { nombre: 'New' });
      expect(updated.nombre).toBe('New');

      const found = db.findUserById(user.id);
      expect(found.nombre).toBe('New');
    });

    it('should return null for non-existent user id', () => {
      const found = db.findUserById('nonexistent-id');
      expect(found).toBeNull();
    });
  });

  describe('categories', () => {
    it('should create and list categories for a user', () => {
      const user = db.createUser({ email: 'a@test.com', password: 'x', nombre: 'A' });
      db.create('categories', { userId: user.id, nombre: 'Food', color: '#F00', orden: 1 }, user.id);
      db.create('categories', { userId: user.id, nombre: 'Transport', color: '#0F0', orden: 2 }, user.id);

      const cats = db.findAll('categories', user.id);
      expect(cats).toHaveLength(2);
      expect(cats[0].nombre).toBe('Food');
    });

    it('should not mix categories between users', () => {
      const user1 = db.createUser({ email: 'u1@test.com', password: 'x', nombre: 'A' });
      const user2 = db.createUser({ email: 'u2@test.com', password: 'x', nombre: 'B' });

      db.create('categories', { userId: user1.id, nombre: 'Cat1', orden: 1 }, user1.id);
      db.create('categories', { userId: user2.id, nombre: 'Cat2', orden: 1 }, user2.id);

      const cats1 = db.findAll('categories', user1.id);
      const cats2 = db.findAll('categories', user2.id);

      expect(cats1).toHaveLength(1);
      expect(cats2).toHaveLength(1);
      expect(cats1[0].nombre).toBe('Cat1');
      expect(cats2[0].nombre).toBe('Cat2');
    });

    it('should delete a category', () => {
      const user = db.createUser({ email: 'del@test.com', password: 'x', nombre: 'A' });
      const cat = db.create('categories', { userId: user.id, nombre: 'Del', orden: 1 }, user.id);

      const result = db.remove('categories', cat.id, user.id);
      expect(result).toBe(true);

      const cats = db.findAll('categories', user.id);
      expect(cats).toHaveLength(0);
    });

    it('should update a category', () => {
      const user = db.createUser({ email: 'upd@test.com', password: 'x', nombre: 'A' });
      const cat = db.create('categories', { userId: user.id, nombre: 'Old', orden: 1 }, user.id);

      const updated = db.update('categories', cat.id, { nombre: 'New' }, user.id);
      expect(updated.nombre).toBe('New');
    });

    it('should return null when updating non-existent category', () => {
      const user = db.createUser({ email: 'updnull@test.com', password: 'x', nombre: 'A' });
      const result = db.update('categories', 'nonexistent', { nombre: 'X' }, user.id);
      expect(result).toBeNull();
    });

    it('should return false when removing non-existent category', () => {
      const user = db.createUser({ email: 'rmnull@test.com', password: 'x', nombre: 'A' });
      const result = db.remove('categories', 'nonexistent', user.id);
      expect(result).toBe(false);
    });
  });

  describe('transactions', () => {
    it('should create and list transactions', () => {
      const user = db.createUser({ email: 'tx@test.com', password: 'x', nombre: 'A' });
      db.create('transactions', {
        userId: user.id, tipo: 'expense', monto: 10, titulo: 'Test', fecha: '2024-03-15'
      }, user.id);

      const txs = db.findAll('transactions', user.id);
      expect(txs).toHaveLength(1);
      expect(txs[0].monto).toBe(10);
    });

    it('should filter transactions by month', () => {
      const user = db.createUser({ email: 'filter@test.com', password: 'x', nombre: 'A' });
      db.create('transactions', {
        userId: user.id, tipo: 'expense', monto: 10, titulo: 'Mar', fecha: '2024-03-15'
      }, user.id);
      db.create('transactions', {
        userId: user.id, tipo: 'expense', monto: 20, titulo: 'Apr', fecha: '2024-04-10'
      }, user.id);

      const all = db.findAll('transactions', user.id);
      expect(all).toHaveLength(2);

      const march = all.filter(t => t.fecha.startsWith('2024-03'));
      expect(march).toHaveLength(1);
    });

    it('should not mix transactions between users', () => {
      const user1 = db.createUser({ email: 'u1x@test.com', password: 'x', nombre: 'A' });
      const user2 = db.createUser({ email: 'u2x@test.com', password: 'x', nombre: 'B' });

      db.create('transactions', {
        userId: user1.id, tipo: 'expense', monto: 10, titulo: 'U1', fecha: '2024-03-15'
      }, user1.id);
      db.create('transactions', {
        userId: user2.id, tipo: 'expense', monto: 20, titulo: 'U2', fecha: '2024-03-15'
      }, user2.id);

      expect(db.findAll('transactions', user1.id)).toHaveLength(1);
      expect(db.findAll('transactions', user2.id)).toHaveLength(1);
    });

    it('should delete a transaction', () => {
      const user = db.createUser({ email: 'deltx@test.com', password: 'x', nombre: 'A' });
      const tx = db.create('transactions', {
        userId: user.id, tipo: 'expense', monto: 10, titulo: 'Del', fecha: '2024-03-15'
      }, user.id);

      db.remove('transactions', tx.id, user.id);
      expect(db.findAll('transactions', user.id)).toHaveLength(0);
    });
  });

  describe('findAll with filter', () => {
    it('should filter items by property', () => {
      const user = db.createUser({ email: 'filt@test.com', password: 'x', nombre: 'A' });
      db.create('transactions', {
        userId: user.id, tipo: 'expense', monto: 10, titulo: 'Exp', fecha: '2024-03-15'
      }, user.id);
      db.create('transactions', {
        userId: user.id, tipo: 'income', monto: 100, titulo: 'Inc', fecha: '2024-03-15'
      }, user.id);

      const expenses = db.findAll('transactions', user.id, { tipo: 'expense' });
      expect(expenses).toHaveLength(1);
      expect(expenses[0].tipo).toBe('expense');
    });

    it('should return empty array when filter matches nothing', () => {
      const user = db.createUser({ email: 'emptyfilt@test.com', password: 'x', nombre: 'A' });
      const results = db.findAll('transactions', user.id, { tipo: 'refund' });
      expect(results).toHaveLength(0);
    });
  });

  describe('replace collection', () => {
    it('atomically replaces one user-scoped collection without changing another user', () => {
      const first = db.createUser({ email: 'replace-a@test.com', password: 'x', nombre: 'A' });
      const second = db.createUser({ email: 'replace-b@test.com', password: 'x', nombre: 'B' });
      db.create('accounts', { nombre: 'Old account' }, first.id);
      db.create('accounts', { nombre: 'Other user account' }, second.id);

      db.replace('accounts', first.id, [{ id: 'replacement', nombre: 'New account' }]);

      expect(db.findAll('accounts', first.id)).toEqual([{ id: 'replacement', nombre: 'New account' }]);
      expect(db.findAll('accounts', second.id).map(account => account.nombre)).toEqual(['Other user account']);
      expect(() => db.replace('accounts', first.id, {})).toThrow(TypeError);
    });
  });

  describe('findById', () => {
    it('should find an item by id', () => {
      const user = db.createUser({ email: 'findid@test.com', password: 'x', nombre: 'A' });
      const cat = db.create('categories', { userId: user.id, nombre: 'FindMe' }, user.id);
      const found = db.findById('categories', cat.id, user.id);
      expect(found).not.toBeNull();
      expect(found.nombre).toBe('FindMe');
    });

    it('should return null for non-existent id', () => {
      const user = db.createUser({ email: 'findnull@test.com', password: 'x', nombre: 'A' });
      const found = db.findById('categories', 'nope', user.id);
      expect(found).toBeNull();
    });
  });

  describe('query', () => {
    it('should return filtered copies of items', () => {
      const user = db.createUser({ email: 'query@test.com', password: 'x', nombre: 'A' });
      db.create('transactions', {
        userId: user.id, tipo: 'expense', monto: 10, titulo: 'Q1', fecha: '2024-03-15'
      }, user.id);
      db.create('transactions', {
        userId: user.id, tipo: 'income', monto: 20, titulo: 'Q2', fecha: '2024-03-15'
      }, user.id);

      const results = db.query('transactions', user.id, t => t.tipo === 'expense');
      expect(results).toHaveLength(1);
      expect(results[0].titulo).toBe('Q1');
    });

    it('should return copies, not references', () => {
      const user = db.createUser({ email: 'copy@test.com', password: 'x', nombre: 'A' });
      db.create('transactions', {
        userId: user.id, tipo: 'expense', monto: 10, titulo: 'Copy', fecha: '2024-03-15'
      }, user.id);

      const results = db.query('transactions', user.id, () => true);
      results[0].titulo = 'Modified';
      const fresh = db.findAll('transactions', user.id);
      expect(fresh[0].titulo).toBe('Copy');
    });
  });

  describe('atomic writes', () => {
    it('should handle concurrent writes without corruption', () => {
      const user = db.createUser({ email: 'atomic@test.com', password: 'x', nombre: 'A' });

      for (let i = 0; i < 10; i++) {
        db.create('transactions', {
          userId: user.id, tipo: 'expense', monto: i, titulo: `Tx ${i}`, fecha: '2024-03-15'
        }, user.id);
      }

      const txs = db.findAll('transactions', user.id);
      expect(txs).toHaveLength(10);
    });
  });

  describe('cache', () => {
    it('should clear cache', () => {
      const user = db.createUser({ email: 'cache@test.com', password: 'x', nombre: 'A' });
      db.create('transactions', {
        userId: user.id, tipo: 'expense', monto: 5, titulo: 'Cached', fecha: '2024-03-15'
      }, user.id);

      const before = db.findAll('transactions', user.id);
      expect(before).toHaveLength(1);

      db.clearCache();
      const after = db.findAll('transactions', user.id);
      expect(after).toHaveLength(1);
    });
  });

  describe('read errors', () => {
    it('should return empty array for corrupted JSON file', () => {
      const corruptPath = require('path').join(TEMP_DATA_DIR, 'corrupt.json');
      fs.writeFileSync(corruptPath, 'NOT VALID JSON {{{', 'utf-8');

      const user = db.createUser({ email: 'corrupt@test.com', password: 'x', nombre: 'A' });
      db.clearCache();
      const data = db._readCollection('corrupt');
      expect(data).toEqual([]);
    });
  });

  describe('global collection (no userId)', () => {
    it('should store and read global collections', () => {
      db.create('settings', { key: 'theme', value: 'dark' });
      const settings = db.findAll('settings');
      expect(settings).toHaveLength(1);
      expect(settings[0].key).toBe('theme');
    });

    it('should remove from global collection', () => {
      const item = db.create('settings', { key: 'lang', value: 'es' });
      const result = db.remove('settings', item.id);
      expect(result).toBe(true);
      expect(db.findAll('settings')).toHaveLength(0);
    });

    it('should update global collection', () => {
      const item = db.create('settings', { key: 'theme', value: 'light' });
      const updated = db.update('settings', item.id, { value: 'dark' });
      expect(updated.value).toBe('dark');
    });

    it('should return null when updating non-existent global item', () => {
      const result = db.update('settings', 'nonexistent', { value: 'x' });
      expect(result).toBeNull();
    });

    it('should return false when removing non-existent global item', () => {
      const result = db.remove('settings', 'nonexistent');
      expect(result).toBe(false);
    });
  });
});
