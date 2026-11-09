const { setupTestDb, cleanupTestDb, createTestUser } = require('../helpers/setup');
const { migrateEvolutivo2 } = require('../../src/services/migrations');

describe('migrateEvolutivo2 (assets and contracts)', () => {
  let db;
  let user;
  const byName = name => db.findAll('assets', user.id).find(a => a.name === name);

  beforeAll(() => {
    db = setupTestDb();
    user = createTestUser(db);
    const imm = (name, extra) => db.create('assets', { name, type: 'immovable', usageStatus: 'vacant', ...extra }, user.id);
    db.create('assets', { name: 'Auto', type: 'movable' }, user.id);
    imm('Dpto', { propertyType: 'Departamento', area: 80.6 });
    imm('Casa', { propertyType: 'Casa quinta' });
    imm('Galpon', { propertyType: 'Galpón industrial' });
    imm('Lote', { propertyType: 'Terreno' });
    imm('Otro', { propertyType: 'Cochera' });
    imm('Alquilado', { usageStatus: 'rented' });
    const withContract = imm('Con contrato', {});
    imm('Previo', { condition: 'usufruct', propertyKind: 'casa', coveredAreaM2: 5 });
    db.create('rentalContracts', { assetId: withContract.id, status: 'active' }, user.id);
    db.create('rentalContracts', { assetId: 'x', status: 'active', contractKind: 'usufruct', adjustmentCriterion: 'IPC' }, user.id);
  });

  afterAll(() => cleanupTestDb());

  it('backfills movables', () => {
    expect(migrateEvolutivo2(db).updated).toBeGreaterThan(0);
    expect(byName('Auto')).toMatchObject({ vehicleType: 'automovil', brand: '', plate: '', mileage: '', color: '' });
  });

  it('maps propertyKind and areas', () => {
    expect(byName('Dpto')).toMatchObject({ propertyKind: 'departamento', coveredAreaM2: 81, freeAreaM2: null, ageYears: null, characteristics: '' });
    expect(byName('Casa').propertyKind).toBe('casa');
    expect(byName('Galpon').propertyKind).toBe('galpon');
    expect(byName('Lote').propertyKind).toBe('lote');
    expect(byName('Otro')).toMatchObject({ propertyKind: null, coveredAreaM2: null });
  });

  it('derives condition from usageStatus or an active contract', () => {
    expect(byName('Alquilado').condition).toBe('rented');
    expect(byName('Con contrato').condition).toBe('rented');
    expect(byName('Dpto').condition).toBe('not_rented');
  });

  it('backfills contracts without overwriting', () => {
    const contracts = db.findAll('rentalContracts', user.id);
    expect(contracts[0]).toMatchObject({ adjustmentFrequencyMonths: null, adjustmentCriterion: null, contractKind: 'rental' });
    expect(contracts[1]).toMatchObject({ contractKind: 'usufruct', adjustmentCriterion: 'IPC', adjustmentFrequencyMonths: null });
    expect(byName('Previo')).toMatchObject({ condition: 'usufruct', coveredAreaM2: 5 });
  });

  it('is idempotent', () => {
    const before = JSON.stringify([db.findAll('assets', user.id), db.findAll('rentalContracts', user.id)]);
    expect(migrateEvolutivo2(db).updated).toBe(0);
    expect(JSON.stringify([db.findAll('assets', user.id), db.findAll('rentalContracts', user.id)])).toBe(before);
  });
});
