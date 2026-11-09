const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');

const MESSAGE_OUT_OF_RANGE = 'Hay períodos cobrados fuera del nuevo rango; anulá esos cobros primero';

describe('PUT /api/rentals/declarations/:id and POST .../end', () => {
  let f;
  beforeEach(async () => { f = await setupRentFixture('decl-edit'); });
  afterAll(() => cleanupTestDb());

  const state = () => JSON.stringify({
    contracts: f.db.findAll('rentalContracts', f.userId), occurrences: f.db.findAll('rentOccurrences', f.userId),
    declarations: f.db.findAll('rentalDeclarations', f.userId), tx: f.db.findAll('transactions', f.userId)
  });
  const occurrences = contractId => f.db.findAll('rentOccurrences', f.userId).filter(item => item.contractId === contractId);
  const live = contractId => occurrences(contractId).filter(item => !item.cancelled);
  const year = new Date().getUTCFullYear();

  test('edit start with nothing collected regenerates occurrences and follows the new due day', async () => {
    const created = (await f.declare()).body;
    const contractId = created.modalities[0].contractId;
    const oldIds = occurrences(contractId).map(item => item.id);
    const edited = await f.edit(created.id, [f.modality('locacion', { startDate: '2025-03-15', endDate: '2025-08-31' })]);
    expect(edited.status).toBe(200);
    expect(edited.body.modalities[0].occurrences.map(item => item.date)).toEqual(['2025-03-15', '2025-04-15', '2025-05-15', '2025-06-15', '2025-07-15', '2025-08-15']);
    expect(edited.body.modalities[0].contractId).toBe(contractId);
    expect(occurrences(contractId).some(item => oldIds.includes(item.id))).toBe(false);
    expect(f.db.findById('rentalContracts', contractId, f.userId).dueDay).toBe(15);
  });

  test('collected period outside the new range is 409 and nothing changes', async () => {
    const created = (await f.declare()).body;
    expect((await f.collectModality(created, 'locacion', ['2025-01-01', '2025-02-01'])).status).toBe(201);
    const before = state();
    const response = await f.edit(created.id, [f.modality('locacion', { startDate: '2025-03-01' })]);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe(MESSAGE_OUT_OF_RANGE);
    const shortened = await f.edit(created.id, [f.modality('locacion', { endDate: '2025-01-31' })]);
    expect(shortened.status).toBe(409);
    expect(state()).toBe(before);
  });

  test('moving the start earlier keeps collected periods and adds unpaid ones', async () => {
    const created = (await f.declare()).body;
    const collected = await f.collectModality(created, 'locacion', ['2025-03-01']);
    const paidOccurrenceId = collected.body.allocations[0].occurrenceId;
    const edited = await f.edit(created.id, [f.modality('locacion', { startDate: '2024-10-01' })]);
    expect(edited.status).toBe(200);
    const dates = edited.body.modalities[0].occurrences.map(item => item.date);
    expect(dates.slice(0, 3)).toEqual(['2024-10-01', '2024-11-01', '2024-12-01']);
    const paid = edited.body.modalities[0].occurrences.find(item => item.id === paidOccurrenceId);
    expect(paid).toMatchObject({ date: '2025-03-01', status: 'collected', paidMinor: 12100000 });
    expect(live(created.modalities[0].contractId).filter(item => item.date === '2025-03-01')).toHaveLength(1);
  });

  test('changing the amount or IVA updates unpaid periods only', async () => {
    const created = (await f.declare()).body;
    await f.collectModality(created, 'locacion', ['2025-01-01']);
    const edited = await f.edit(created.id, [f.modality('locacion', { amount: 200000, ivaPercent: 10.5 })]);
    expect(edited.status).toBe(200);
    const [first, second] = edited.body.modalities[0].occurrences;
    expect(first).toMatchObject({ date: '2025-01-01', status: 'collected', rentMinor: 12100000 });
    expect(second).toMatchObject({ date: '2025-02-01', rentMinor: 22100000, netMinor: 20000000, ivaPercent: 10.5 });
    expect(edited.body.modalities[0]).toMatchObject({ amount: 200000, ivaPercent: 10.5 });
  });

  test('currency change: 409 with a collection, allowed without', async () => {
    const created = (await f.declare()).body;
    await f.collectModality(created, 'locacion', ['2025-01-01']);
    const before = state();
    const blocked = await f.edit(created.id, [f.modality('locacion', { currencyCode: 'USD' })]);
    expect(blocked.status).toBe(409);
    expect(state()).toBe(before);

    const f2 = await setupRentFixture('decl-edit-currency');
    const other = (await f2.declare()).body;
    const changed = await f2.edit(other.id, [f2.modality('locacion', { currencyCode: 'USD', amount: 500, ivaPercent: null })]);
    expect(changed.status).toBe(200);
    expect(changed.body.modalities[0].occurrences.every(item => item.currencyCode === 'USD')).toBe(true);
  });

  test('a start after an existing adjustment is 409; other edits keep the adjustment', async () => {
    const created = (await f.declare([f.modality('locacion', { startDate: `${year}-01-01`, endDate: `${year + 2}-12-31` })])).body;
    const contractId = created.modalities[0].contractId;
    const effectiveDate = `${year + 1}-01-01`;
    expect((await f.agent.post(`/api/rentals/${contractId}/conditions`).send({ method: 'percentage', percentage: 10, effectiveDate })).status).toBe(201);
    const before = state();
    const late = await f.edit(created.id, [f.modality('locacion', { startDate: `${year + 1}-02-01`, endDate: `${year + 2}-12-31` })]);
    expect(late.status).toBe(409);
    expect(state()).toBe(before);
    const ok = await f.edit(created.id, [f.modality('locacion', { startDate: `${year}-01-01`, endDate: `${year + 3}-12-31` })]);
    expect(ok.status).toBe(200);
    expect(f.db.findAll('rentalConditions', f.userId)).toHaveLength(1);
    const adjusted = ok.body.modalities[0].occurrences.find(item => item.date === effectiveDate && !item.cancelled);
    expect(adjusted).toMatchObject({ netMinor: 11000000, rentMinor: 13310000 });
    expect(live(contractId).filter(item => item.date === effectiveDate)).toHaveLength(1);
  });

  test('adds and removes a modality keeping the collected history', async () => {
    const created = (await f.declare([f.modality('locacion'), f.modality('mutuo', { amount: 50000 })])).body;
    const mutuo = created.modalities.find(item => item.kind === 'mutuo');
    const locacion = created.modalities.find(item => item.kind === 'locacion');
    await f.collectModality(created, 'mutuo', ['2025-01-01']);

    const added = await f.edit(created.id, [f.modality('locacion'), f.modality('mutuo', { amount: 50000 }), f.modality('comodato', { amount: 30000 })]);
    expect(added.status).toBe(200);
    expect(added.body.modalities.map(item => item.kind)).toEqual(['locacion', 'comodato', 'mutuo']);
    expect(added.body.modalities.find(item => item.kind === 'mutuo').contractId).toBe(mutuo.contractId);
    expect(added.body.modalities.find(item => item.kind === 'locacion').contractId).toBe(locacion.contractId);

    const removed = await f.edit(created.id, [f.modality('locacion')]);
    expect(removed.status).toBe(200);
    const ended = f.db.findById('rentalContracts', mutuo.contractId, f.userId);
    expect(ended.status).toBe('ended');
    expect(f.db.findAll('rentCollectionAllocations', f.userId).some(item => item.occurrenceId === occurrences(mutuo.contractId).find(o => o.date === '2025-01-01').id)).toBe(true);
    expect(removed.body.status).toBe('active');
    expect(removed.body.modalities.filter(item => item.status === 'active').map(item => item.kind)).toEqual(['locacion']);
  });

  test('removing a modality repoints tenant obligations to the remaining contract', async () => {
    const obligation = (await f.agent.post('/api/obligations').send({
      title: 'Expensas', type: 'service', assetId: f.assetId, currencyCode: 'ARS', estimatedAmount: 1000, startDate: '2025-01-10', recurrenceFrequency: 'monthly'
    })).body;
    const created = (await f.declare([f.modality('locacion'), f.modality('mutuo')], { obligationResponsibilities: [{ obligationId: obligation.id, responsibilityType: 'tenant' }] })).body;
    const locacionId = created.modalities[0].contractId;
    await f.edit(created.id, [f.modality('mutuo')]);
    expect(f.db.findById('obligations', obligation.id, f.userId)).toMatchObject({ responsibilityType: 'tenant', rentalContractId: created.modalities[1].contractId });
    expect(f.db.findById('rentalContracts', locacionId, f.userId).status).toBe('ended');
  });

  test('invalid edits return 400 and change nothing', async () => {
    const created = (await f.declare([f.modality('locacion'), f.modality('mutuo')])).body;
    const before = state();
    const bad = await f.edit(created.id, [f.modality('locacion', { startDate: '2025-02-01' }), f.modality('mutuo', { amount: 0 })]);
    expect(bad.status).toBe(400);
    expect((await f.edit(created.id, [])).status).toBe(400);
    expect(state()).toBe(before);
  });

  test('/end closes all contracts, hands tenant obligations back and frees the asset', async () => {
    const obligation = (await f.agent.post('/api/obligations').send({
      title: 'ABL', type: 'tax', assetId: f.assetId, currencyCode: 'ARS', estimatedAmount: 1000, startDate: '2025-01-10', recurrenceFrequency: 'monthly'
    })).body;
    const created = (await f.declare([
      f.modality('locacion', { startDate: `${year - 1}-01-01`, endDate: `${year + 1}-12-31` }),
      f.modality('mutuo', { startDate: `${year - 1}-01-01`, endDate: `${year + 1}-12-31` })
    ], { obligationResponsibilities: [{ obligationId: obligation.id, responsibilityType: 'tenant' }] })).body;
    const today = new Date().toISOString().slice(0, 10);
    const ended = await f.agent.post(`/api/rentals/declarations/${created.id}/end`);
    expect(ended.status).toBe(200);
    expect(ended.body.status).toBe('ended');
    expect(ended.body.endedAt).toBeTruthy();
    for (const mod of ended.body.modalities) {
      expect(mod.status).toBe('ended');
      expect(mod.endDate <= today).toBe(true);
      expect(live(mod.contractId).every(item => item.date <= mod.endDate)).toBe(true);
    }
    expect(f.db.findById('obligations', obligation.id, f.userId).responsibilityType).toBe('owner');
    expect(f.db.findById('assets', f.assetId, f.userId)).toMatchObject({ condition: 'not_rented', usageStatus: 'vacant' });
    expect((await f.agent.post(`/api/rentals/declarations/${created.id}/end`)).status).toBe(409);
    const again = await f.declare([f.modality('comodato', { startDate: `${year}-01-01`, endDate: `${year}-12-31` })]);
    expect(again.status).toBe(201);
  });

  test('ending keeps collected periods and alerts, overview and asset file keep working', async () => {
    const created = (await f.declare([f.modality('locacion', { startDate: `${year - 1}-01-01`, endDate: `${year + 1}-12-31` })])).body;
    const collected = await f.collectModality(created, 'locacion', [`${year - 1}-01-01`], { date: `${year - 1}-01-02` });
    expect(collected.status).toBe(201);
    const edited = await f.edit(created.id, [f.modality('locacion', { startDate: `${year - 1}-01-01`, endDate: `${year}-06-30` })]);
    expect(edited.status).toBe(200);

    const alerts = await f.agent.get('/api/alerts');
    expect(alerts.status).toBe(200);
    const overview = await f.agent.get('/api/finance/overview');
    expect(overview.status).toBe(200);
    const file = await f.agent.get(`/api/assets/${f.assetId}/file`);
    expect(file.status).toBe(200);

    expect((await f.agent.post(`/api/rentals/declarations/${created.id}/end`)).status).toBe(200);
    expect((await f.agent.get('/api/alerts')).status).toBe(200);
    expect((await f.agent.get('/api/finance/overview')).status).toBe(200);
    expect((await f.agent.get(`/api/assets/${f.assetId}/file`)).status).toBe(200);
    const history = (await f.agent.get(`/api/rentals/${created.modalities[0].contractId}`)).body;
    expect(history.occurrences.find(item => item.date === `${year - 1}-01-01`)).toMatchObject({ status: 'collected' });
  });

  test('pending rent of a regenerated declaration appears in alerts once', async () => {
    const created = (await f.declare([f.modality('locacion', { startDate: `${year - 1}-01-01`, endDate: `${year + 1}-12-31` })])).body;
    const edited = await f.edit(created.id, [f.modality('locacion', { startDate: `${year - 1}-02-10`, endDate: `${year + 1}-12-31` })]);
    expect(edited.status).toBe(200);
    const alerts = (await f.agent.get('/api/alerts')).body;
    const items = (alerts.items || alerts).filter(item => item.type === 'rent_due' && item.contractId === created.modalities[0].contractId);
    const dates = items.map(item => item.date);
    expect(new Set(dates).size).toBe(dates.length);
    expect(dates.length).toBeGreaterThan(10);
    expect(dates.every(date => date >= `${year - 1}-02-10`)).toBe(true);
    expect(items.every(item => item.modality === 'locacion')).toBe(true);
  });

  test('a reversed collection reopens the period so a later edit may move the range', async () => {
    const created = (await f.declare()).body;
    const collected = await f.collectModality(created, 'locacion', ['2025-01-01']);
    expect((await f.edit(created.id, [f.modality('locacion', { startDate: '2025-02-01' })])).status).toBe(409);
    expect((await f.agent.post(`/api/rentals/collections/${collected.body.id}/reverse`)).status).toBe(200);
    const edited = await f.edit(created.id, [f.modality('locacion', { startDate: '2025-02-01' })]);
    expect(edited.status).toBe(200);
    expect(edited.body.modalities[0].occurrences[0].date).toBe('2025-02-01');
  });
});
