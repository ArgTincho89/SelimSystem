const assetKinds = require('../../src/services/asset-kinds');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('asset-kinds service', () => {
  let db;
  beforeAll(() => { db = setupTestDb(); });
  afterAll(() => cleanupTestDb());

  it('normalizes accents, case and spacing', () => {
    expect(assetKinds.normalize('  GALPÓN  ')).toBe('galpon');
    expect(assetKinds.slug('Local   Comercial!')).toBe('local-comercial');
  });

  it('creates a kind with a stable custom key and lists it', () => {
    const result = assetKinds.create(db, 'u1', '  Local comercial ');
    expect(result.value).toMatchObject({ name: 'Local comercial', key: 'custom-local-comercial' });
    expect(assetKinds.list(db, 'u1').map(kind => kind.key)).toEqual(['custom-local-comercial']);
    expect(assetKinds.isValidKey(db, 'u1', 'custom-local-comercial')).toBe(true);
    expect(assetKinds.isValidKey(db, 'u1', 'casa')).toBe(true);
    expect(assetKinds.isValidKey(db, 'u1', 'custom-otro')).toBe(false);
  });

  it('rejects blank, too long, and duplicates (case and accent insensitive, built-ins included)', () => {
    expect(assetKinds.create(db, 'u1', '   ')).toMatchObject({ status: 400 });
    expect(assetKinds.create(db, 'u1', 'x'.repeat(51))).toMatchObject({ status: 400 });
    expect(assetKinds.create(db, 'u1', '!!!')).toMatchObject({ status: 400 });
    expect(assetKinds.create(db, 'u1', 'LOCAL COMERCIAL')).toMatchObject({ status: 409, error: 'Ese tipo ya existe' });
    expect(assetKinds.create(db, 'u1', 'galpon')).toMatchObject({ status: 409 });
    expect(assetKinds.create(db, 'u1', 'Galpón')).toMatchObject({ status: 409 });
  });

  it('isolates kinds per user', () => {
    assetKinds.create(db, 'u2', 'Cochera');
    expect(assetKinds.list(db, 'u1').some(kind => kind.name === 'Cochera')).toBe(false);
    expect(assetKinds.isValidKey(db, 'u1', 'custom-cochera')).toBe(false);
  });
});
