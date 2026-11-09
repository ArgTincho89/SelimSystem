const rentals = require('../../src/services/rentals');
const { migrateEvolutivo3 } = require('../../src/services/migrations');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');

describe('migrateEvolutivo3 (contracts)', () => {
  let f;
  beforeEach(async () => { f = await setupRentFixture('mig-contracts'); });
  afterAll(() => cleanupTestDb());

  const year = new Date().getUTCFullYear();
  const snapshot = () => ({
    occurrences: f.db.findAll('rentOccurrences', f.userId), collections: f.db.findAll('rentCollections', f.userId),
    allocations: f.db.findAll('rentCollectionAllocations', f.userId), transactions: f.db.findAll('transactions', f.userId)
  });

  async function legacy() {
    const rental = await f.createContract();
    await f.collect(rental, ['2025-01-01', '2025-02-01']);
    const usufructAsset = (await f.agent.post('/api/assets').send({ type: 'immovable', name: 'Galpon', propertyType: 'Warehouse', usageStatus: 'vacant' })).body.id;
    const usufruct = (await f.agent.post('/api/rentals').send({
      assetId: usufructAsset, type: 'residential', startDate: `${year}-01-01`, endDate: `${year + 1}-12-31`, initialRent: 5000, expenseResponsibility: {},
      includedExpenses: [], depositAmount: 0, currencyCode: 'ARS', periodicity: 'monthly', dueDay: 1, tenantIds: [f.tenantId], status: 'active', contractKind: 'usufruct'
    })).body;
    const ended = (await f.agent.post('/api/rentals').send({
      assetId: usufructAsset, type: 'residential', startDate: '2023-01-01', endDate: '2023-12-31', initialRent: 1000, expenseResponsibility: {},
      includedExpenses: [], depositAmount: 0, currencyCode: 'ARS', periodicity: 'monthly', dueDay: 1, tenantIds: [f.tenantId], status: 'ended'
    })).body;
    return { rental, usufruct, ended, usufructAsset };
  }

  test('maps rental to locacion and usufruct to comodato, one declaration each', async () => {
    const { rental, usufruct, ended } = await legacy();
    expect(f.db.findById('rentalContracts', rental.id, f.userId).declarationId).toBeUndefined();
    const result = migrateEvolutivo3(f.db);
    expect(result.updated).toBeGreaterThanOrEqual(3);
    const read = id => f.db.findById('rentalContracts', id, f.userId);
    expect(read(rental.id)).toMatchObject({ modality: 'locacion', ivaPercent: null });
    expect(read(usufruct.id)).toMatchObject({ modality: 'comodato', ivaPercent: null });
    const declarations = f.db.findAll('rentalDeclarations', f.userId);
    expect(declarations).toHaveLength(3);
    expect(new Set([rental, usufruct, ended].map(item => read(item.id).declarationId)).size).toBe(3);
    const declarationOf = id => declarations.find(item => item.id === read(id).declarationId);
    expect(declarationOf(rental.id)).toMatchObject({ assetId: f.assetId, tenantIds: [f.tenantId], notes: '', endedAt: null });
    expect(declarationOf(ended.id).endedAt).toBe('2023-12-31');
  });

  test('keeps ids, generationKeys, collections and allocations unchanged', async () => {
    await legacy();
    const before = snapshot();
    migrateEvolutivo3(f.db);
    expect(snapshot()).toEqual(before);
  });

  test('is idempotent: a second run updates nothing', async () => {
    await legacy();
    migrateEvolutivo3(f.db);
    const contracts = JSON.stringify(f.db.findAll('rentalContracts', f.userId));
    const declarations = f.db.findAll('rentalDeclarations', f.userId).length;
    expect(migrateEvolutivo3(f.db).updated).toBe(0);
    expect(JSON.stringify(f.db.findAll('rentalContracts', f.userId))).toBe(contracts);
    expect(f.db.findAll('rentalDeclarations', f.userId)).toHaveLength(declarations);
  });

  test('legacy contracts are readable through the declarations API and activeContractFor', async () => {
    const { rental, usufructAsset, usufruct } = await legacy();
    migrateEvolutivo3(f.db);
    const list = await f.agent.get('/api/rentals/declarations').query({ assetId: f.assetId });
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].modalities[0]).toMatchObject({ contractId: rental.id, kind: 'locacion', amount: 100000, totalAmount: 100000, ivaPercent: null, locked: true });
    expect(list.body[0].modalities[0].occurrences.find(item => item.date === '2025-01-01')).toMatchObject({ status: 'collected' });
    expect(rentals.activeContractFor(f.db, f.userId, f.assetId).id).toBe(rental.id);
    expect(rentals.activeContractFor(f.db, f.userId, usufructAsset).id).toBe(usufruct.id);
    const asset = await f.agent.get(`/api/assets/${f.assetId}`);
    expect(asset.body.declaration.id).toBe(list.body[0].id);
    expect(asset.body.activeContract.id).toBe(rental.id);
  });

  test('legacy contracts created after startup are backfilled when listing declarations', async () => {
    const rental = await f.createContract();
    const list = await f.agent.get('/api/rentals/declarations').query({ assetId: f.assetId });
    expect(list.body).toHaveLength(1);
    expect(f.db.findById('rentalContracts', rental.id, f.userId).declarationId).toBe(list.body[0].id);
    expect(migrateEvolutivo3(f.db).updated).toBe(0);
  });

  test('a migrated legacy declaration can be edited without losing collected periods', async () => {
    const rental = await f.createContract();
    await f.collect(rental, ['2025-01-01', '2025-02-01']);
    migrateEvolutivo3(f.db);
    const declaration = (await f.agent.get('/api/rentals/declarations').query({ assetId: f.assetId })).body[0];
    const blocked = await f.edit(declaration.id, [f.modality('locacion', { ivaPercent: null, startDate: '2025-02-01' })]);
    expect(blocked.status).toBe(409);
    const edited = await f.edit(declaration.id, [f.modality('locacion', { ivaPercent: 21, endDate: '2026-03-31' })]);
    expect(edited.status).toBe(200);
    const view = edited.body.modalities[0].occurrences;
    expect(view.find(item => item.date === '2025-02-01')).toMatchObject({ status: 'collected', rentMinor: 10000000 });
    expect(view.find(item => item.date === '2026-03-01')).toMatchObject({ rentMinor: 12100000, status: 'overdue' });
  });

  test('alerts, economic overview and asset file still work on migrated data', async () => {
    const rental = await f.createContract({ startDate: `${year - 1}-01-01`, endDate: `${year + 1}-12-31` });
    migrateEvolutivo3(f.db);
    const alerts = await f.agent.get('/api/alerts');
    expect(alerts.status).toBe(200);
    const items = alerts.body.items || alerts.body;
    expect(items.some(item => item.type === 'rent_due' && item.contractId === rental.id)).toBe(true);
    expect((await f.agent.get('/api/finance/overview')).status).toBe(200);
    expect((await f.agent.get(`/api/assets/${f.assetId}/file`)).status).toBe(200);
  });
});
