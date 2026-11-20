const { setupTestDb, cleanupTestDb, createTestUser } = require('../helpers/setup');
const { migrateRentCollectionClassification } = require('../../src/services/migrations');
const { getIncomeBreakdown } = require('../../src/utils/income');

describe('migrateRentCollectionClassification', () => {
  let db;
  let user;
  const ids = {};

  function collection(name, { contractModality, occurrenceModality, amountMinor, allocations, clasificacion = null, txClass = null }) {
    const contract = db.create('rentalContracts', { ...(contractModality ? { modality: contractModality } : {}) }, user.id);
    const tx = db.create('transactions', {
      tipo: 'income', monto: amountMinor / 100, amountMinor, currencyCode: 'ARS', titulo: name, fecha: '2026-11-01',
      clasificacion: txClass, montoA: null, montoB: null, rentCollectionId: `${name}-col`
    }, user.id);
    db.create('rentCollections', { id: `${name}-col`, transactionId: tx.id, amountMinor, currencyCode: 'ARS', clasificacion }, user.id);
    allocations.forEach(([modality, minor, cls]) => {
      const occurrence = db.create('rentOccurrences', { contractId: contract.id, ...(modality ? { modality } : occurrenceModality ? { modality: occurrenceModality } : {}) }, user.id);
      db.create('rentCollectionAllocations', { collectionId: `${name}-col`, occurrenceId: occurrence.id, amountMinor: minor, ...(cls ? { clasificacion: cls } : {}) }, user.id);
    });
    ids[name] = tx.id;
  }

  beforeAll(() => {
    db = setupTestDb();
    user = createTestUser(db);
    collection('legacyLocacion', { contractModality: 'locacion', amountMinor: 10000000, allocations: [[null, 10000000]] });
    collection('legacyComodato', { contractModality: 'comodato', amountMinor: 5000000, allocations: [[null, 5000000]] });
    collection('legacyMixed', { amountMinor: 15000000, allocations: [['locacion', 10000000], ['comodato', 5000000]] });
    collection('alreadyB', { contractModality: 'locacion', amountMinor: 2000000, allocations: [[null, 2000000]], txClass: 'B', clasificacion: 'B' });
    collection('noAllocations', { contractModality: 'locacion', amountMinor: 1000000, allocations: [] });
  });

  afterAll(() => cleanupTestDb());

  it('persists the classification the rental screen shows for unclassified rent incomes', () => {
    expect(migrateRentCollectionClassification(db).updated).toBe(3);
    const tx = name => db.findById('transactions', ids[name], user.id);
    expect(tx('legacyLocacion').clasificacion).toBe('A');
    expect(getIncomeBreakdown(tx('legacyLocacion'))).toEqual({ a: 100000, b: 0 });
    expect(db.findById('rentCollections', 'legacyLocacion-col', user.id).clasificacion).toBe('A');
    expect(tx('legacyComodato').clasificacion).toBe('B');
    expect(tx('legacyMixed')).toMatchObject({ clasificacion: 'Mixto', montoA: 100000, montoB: 50000 });
    expect(tx('alreadyB').clasificacion).toBe('B');
    expect(tx('noAllocations').clasificacion).toBeNull();
  });

  it('is idempotent on a second run', () => {
    const before = JSON.stringify(db.findAll('transactions', user.id));
    expect(migrateRentCollectionClassification(db).updated).toBe(0);
    expect(JSON.stringify(db.findAll('transactions', user.id))).toBe(before);
  });
});
