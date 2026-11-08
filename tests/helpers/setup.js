const fs = require('fs');
const os = require('os');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const TEMP_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'selimsystem-test-data-'));

function safeRmSync(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch {
    try {
      if (fs.existsSync(dir)) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            safeRmSync(fullPath);
          } else {
            try { fs.unlinkSync(fullPath); } catch {}
          }
        }
        try { fs.rmdirSync(dir); } catch {}
      }
    } catch {}
  }
}

function setupTestDb() {
  safeRmSync(TEMP_DATA_DIR);
  fs.mkdirSync(TEMP_DATA_DIR, { recursive: true });

  const JsonDB = require('../../src/db/jsondb');
  return new JsonDB(TEMP_DATA_DIR);
}

function cleanupTestDb() {
  safeRmSync(TEMP_DATA_DIR);
}

function createTestUser(db, overrides = {}) {
  const userData = {
    email: `test-${uuidv4().slice(0, 8)}@example.com`,
    password: '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012',
    nombre: 'Test User',
    ...overrides
  };
  return db.createUser(userData);
}

function createTestCategory(db, userId, overrides = {}) {
  return db.create('categories', {
    userId,
    nombre: 'Test Category',
    color: '#FF000',
    orden: 1,
    ...overrides
  }, userId);
}

function createTestTransaction(db, userId, overrides = {}) {
  return db.create('transactions', {
    userId,
    tipo: 'expense',
    monto: 25.50,
    titulo: 'Test Transaction',
    categoryId: null,
    fecha: '2024-03-15',
    ...overrides
  }, userId);
}

module.exports = {
  setupTestDb,
  cleanupTestDb,
  createTestUser,
  createTestCategory,
  createTestTransaction,
  TEMP_DATA_DIR
};
