const request = require('supertest');
const app = require('../../src/app');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');

describe('POST /api/rentals/declarations', () => {
  let f;
  beforeEach(async () => { f = await setupRentFixture('decl-create'); });
  afterAll(() => cleanupTestDb());

  const contracts = () => f.db.findAll('rentalContracts', f.userId);

  test('creates one contract per modality (1, 2 and 3)', async () => {
    const one = await f.declare([f.modality('comodato')]);
    expect(one.status).toBe(201);
    expect(one.body).toMatchObject({ assetId: f.assetId, status: 'active', notes: '' });
    expect(one.body.modalities).toHaveLength(1);
    expect(one.body.modalities[0]).toMatchObject({ kind: 'comodato', ivaPercent: null, locked: true });
    expect(contracts()[0]).toMatchObject({ declarationId: one.body.id, modality: 'comodato', contractKind: 'usufruct', ivaPercent: null });

    const f2 = await setupRentFixture('decl-create-2');
    const two = await f2.declare([f2.modality('locacion'), f2.modality('mutuo', { amount: 50000 })]);
    expect(two.status).toBe(201);
    expect(two.body.modalities.map(item => item.kind)).toEqual(['locacion', 'mutuo']);
    const f3 = await setupRentFixture('decl-create-3');
    const three = await f3.declare([f3.modality('mutuo'), f3.modality('comodato'), f3.modality('locacion')]);
    expect(three.status).toBe(201);
    expect(three.body.modalities.map(item => item.kind)).toEqual(['locacion', 'comodato', 'mutuo']);
    expect(f3.db.findAll('rentalDeclarations', f3.userId)).toHaveLength(1);
  });

  test('two occurrences in the same month keep their own amounts', async () => {
    const created = await f.declare([f.modality('locacion', { ivaPercent: 21 }), f.modality('mutuo', { amount: 50000 })]);
    const june = created.body.modalities.map(item => item.occurrences.find(occ => occ.period === '2025-06'));
    expect(june.map(occ => [occ.modality, occ.rentAmount])).toEqual([['locacion', 121000], ['mutuo', 50000]]);
  });

  test('ARS and USD modalities stay separate', async () => {
    const created = await f.declare([f.modality('locacion'), f.modality('comodato', { currencyCode: 'USD', amount: 500 })]);
    expect(created.status).toBe(201);
    expect(created.body.modalities.map(item => item.occurrences[0].currencyCode)).toEqual(['ARS', 'USD']);
  });

  test('adjustment settings are stored per modality', async () => {
    const created = await f.declare([f.modality('locacion', { adjustmentFrequencyMonths: 6, adjustmentCriterion: 'IPC' }), f.modality('mutuo')]);
    expect(created.body.modalities.map(item => item.adjustmentFrequencyMonths)).toEqual([6, null]);
    expect(created.body.modalities[0].adjustmentCriterion).toBe('IPC');
  });

  test('asset condition becomes rented and shared obligation responsibilities are applied once', async () => {
    const obligation = await f.agent.post('/api/obligations').send({
      title: 'ABL', type: 'tax', assetId: f.assetId, currencyCode: 'ARS', estimatedAmount: 1000, startDate: '2025-01-10', recurrenceFrequency: 'monthly'
    });
    expect(obligation.status).toBe(201);
    const created = await f.declare([f.modality('locacion'), f.modality('mutuo')], { obligationResponsibilities: [{ obligationId: obligation.body.id, responsibilityType: 'tenant' }] });
    expect(created.status).toBe(201);
    const asset = f.db.findById('assets', f.assetId, f.userId);
    expect(asset.condition).toBe('rented');
    expect(asset.usageStatus).toBe('rented');
    expect(f.db.findById('obligations', obligation.body.id, f.userId)).toMatchObject({ responsibilityType: 'tenant', rentalContractId: created.body.modalities[0].contractId });
    const detail = await f.agent.get(`/api/assets/${f.assetId}`);
    expect(detail.body.declaration).toMatchObject({ id: created.body.id, status: 'active' });
    expect(detail.body.activeContract.id).toBe(created.body.modalities[0].contractId);
  });

  test('comodato only sets the asset condition to usufruct', async () => {
    await f.declare([f.modality('comodato')]);
    expect(f.db.findById('assets', f.assetId, f.userId).condition).toBe('usufruct');
  });

  test('GET lists declarations by asset', async () => {
    const created = await f.declare();
    const list = await f.agent.get('/api/rentals/declarations').query({ assetId: f.assetId });
    expect(list.status).toBe(200);
    expect(list.body.map(item => item.id)).toEqual([created.body.id]);
    expect((await f.agent.get('/api/rentals/declarations').query({ assetId: 'nope' })).status).toBe(400);
  });

  test.each([
    ['no modalities', () => [], 'Seleccioná al menos una modalidad'],
    ['duplicate kind', g => [g.modality('locacion'), g.modality('locacion')], null],
    ['IVA on comodato', g => [g.modality('comodato', { ivaPercent: 10 })], 'Solo el contrato de locación admite IVA'],
    ['IVA on mutuo', g => [g.modality('mutuo', { ivaPercent: 21 })], null],
    ['IVA 150', g => [g.modality('locacion', { ivaPercent: 150 })], null],
    ['end before start', g => [g.modality('locacion', { startDate: '2025-06-01', endDate: '2025-05-01' })], 'La fecha de finalización debe ser posterior a la de inicio'],
    ['end equals start', g => [g.modality('locacion', { startDate: '2025-06-01', endDate: '2025-06-01' })], 'La fecha de finalización debe ser posterior a la de inicio'],
    ['zero amount', g => [g.modality('locacion', { amount: 0 })], null],
    ['unsupported currency', g => [g.modality('locacion', { currencyCode: 'XXX' })], null],
    ['bad frequency', g => [g.modality('locacion', { adjustmentFrequencyMonths: 0 })], null],
    ['unknown kind', g => [{ ...g.modality('locacion'), kind: 'venta' }], null]
  ])('rejects %s with 400 and writes nothing', async (_name, build, message) => {
    const response = await f.declare(build(f));
    expect(response.status).toBe(400);
    if (message) expect(response.body.error).toBe(message);
    expect(contracts()).toHaveLength(0);
    expect(f.db.findAll('rentalDeclarations', f.userId)).toHaveLength(0);
    expect(f.db.findById('assets', f.assetId, f.userId).condition).not.toBe('rented');
  });

  test('rejects a missing tenant, a non-tenant owner and long notes', async () => {
    expect((await f.agent.post('/api/rentals/declarations').send({ assetId: f.assetId, tenantIds: [], modalities: [f.modality()] })).status).toBe(400);
    const owner = (await f.agent.post('/api/owners').send({ name: 'Owner only', kind: 'person', roles: ['owner'] })).body.id;
    expect((await f.agent.post('/api/rentals/declarations').send({ assetId: f.assetId, tenantIds: [owner], modalities: [f.modality()] })).status).toBe(400);
    expect((await f.declare([f.modality()], { notes: 'x'.repeat(4001) })).status).toBe(400);
    expect(contracts()).toHaveLength(0);
  });

  test('second declaration for an asset with an active rental is 409', async () => {
    await f.declare();
    expect((await f.declare([f.modality('mutuo')])).status).toBe(409);
  });

  test('requires auth and hides other users data', async () => {
    expect((await request(app).post('/api/rentals/declarations').send({})).status).toBe(401);
    expect((await request(app).get('/api/rentals/declarations')).status).toBe(401);
    const foreign = await f.other.post('/api/rentals/declarations').send({ assetId: f.assetId, tenantIds: [f.tenantId], modalities: [f.modality()] });
    expect(foreign.status).toBe(404);
    const created = await f.declare();
    expect((await f.other.put(`/api/rentals/declarations/${created.body.id}`).send({ modalities: [f.modality()] })).status).toBe(404);
    expect((await f.other.post(`/api/rentals/declarations/${created.body.id}/end`)).status).toBe(404);
  });
});
