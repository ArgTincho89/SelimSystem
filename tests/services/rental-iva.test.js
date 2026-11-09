const rentals = require('../../src/services/rentals');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');

describe('rental IVA gross-up', () => {
  let f;
  beforeAll(async () => { f = await setupRentFixture('rental-iva'); });
  afterAll(() => cleanupTestDb());

  test('grossMinor rounds net x (1 + IVA%)', () => {
    expect(rentals.grossMinor(10000000, 21)).toBe(12100000);
    expect(rentals.grossMinor(10000000, 0)).toBe(10000000);
    expect(rentals.grossMinor(10000000, null)).toBe(10000000);
    expect(rentals.grossMinor(333, 10.5)).toBe(368);
  });

  test('locacion occurrences store net, IVA and gross', async () => {
    const created = await f.declare([f.modality('locacion', { ivaPercent: 21 })]);
    expect(created.status).toBe(201);
    const [mod] = created.body.modalities;
    expect(mod.amount).toBe(100000);
    expect(mod.totalAmount).toBe(121000);
    const first = mod.occurrences[0];
    expect(first).toMatchObject({ rentMinor: 12100000, netMinor: 10000000, ivaMinor: 2100000, ivaPercent: 21, modality: 'locacion', rentAmount: 121000 });
  });

  test('IVA 0 or empty keeps expected amount equal to the original', async () => {
    const f2 = await setupRentFixture('rental-iva-zero');
    const asset = (await f2.agent.post('/api/assets').send({ type: 'immovable', name: 'Casa 2', propertyType: 'Apartment', usageStatus: 'vacant' })).body.id;
    const zero = await f2.agent.post('/api/rentals/declarations').send({ assetId: asset, tenantIds: [f2.tenantId], modalities: [f2.modality('locacion', { ivaPercent: 0 })] });
    expect(zero.body.modalities[0].occurrences[0].rentMinor).toBe(10000000);
    expect(zero.body.modalities[0].ivaPercent).toBe(0);
  });

  test('collections work against the gross amount and classify as A with IVA included', async () => {
    const f3 = await setupRentFixture('rental-iva-collect');
    const created = await f3.declare([f3.modality('locacion', { ivaPercent: 21 })]);
    const collected = await f3.collectModality(created.body, 'locacion', ['2025-01-01']);
    expect(collected.status).toBe(201);
    expect(collected.body.allocations[0].occurrence.status).toBe('collected');
    const tx = f3.db.findById('transactions', collected.body.transactionId, f3.userId);
    expect(tx).toMatchObject({ clasificacion: 'A', ivaPorcentaje: 21, ivaIncluded: true, monto: 121000 });
    const over = await f3.agent.post('/api/rentals/collections').send({
      amount: 130000, accountId: f3.accountId, date: '2025-03-02', idempotencyKey: 'rental-iva-over-1',
      allocations: [{ occurrenceId: created.body.modalities[0].occurrences[1].id, amount: 130000 }]
    });
    expect(over.status).toBe(400);
  });

  test('adjustments apply to the net amount and are grossed up', async () => {
    const f4 = await setupRentFixture('rental-iva-adjust');
    const year = new Date().getUTCFullYear();
    const created = await f4.declare([f4.modality('locacion', { startDate: `${year}-01-01`, endDate: `${year + 2}-12-31`, ivaPercent: 21 })]);
    const contractId = created.body.modalities[0].contractId;
    const effectiveDate = `${year + 1}-01-01`;
    const adjusted = await f4.agent.post(`/api/rentals/${contractId}/conditions`).send({ method: 'percentage', percentage: 10, effectiveDate });
    expect(adjusted.status).toBe(201);
    expect(adjusted.body.rentMinor).toBe(11000000);
    const contract = (await f4.agent.get(`/api/rentals/${contractId}`).query({ to: `${year + 1}-03-31` })).body;
    const occurrence = contract.occurrences.find(item => item.date === effectiveDate && !item.cancelled);
    expect(occurrence).toMatchObject({ netMinor: 11000000, rentMinor: 13310000, ivaMinor: 2310000 });
  });

  test('legacy occurrences without netMinor fall back to gross = net', async () => {
    const f5 = await setupRentFixture('rental-iva-legacy');
    const contract = await f5.createContract();
    const stored = f5.db.findAll('rentOccurrences', f5.userId).find(item => item.contractId === contract.id);
    expect(stored.ivaPercent).toBeNull();
    f5.db.replace('rentOccurrences', f5.userId, f5.db.findAll('rentOccurrences', f5.userId).map(item => {
      const { netMinor, ivaMinor, ivaPercent, modality, ...legacy } = item;
      return legacy;
    }));
    const view = rentals.occurrenceView(f5.db, f5.userId, f5.db.findAll('rentOccurrences', f5.userId)[0], '2025-06-01');
    expect(view.rentMinor).toBe(10000000);
    expect(view.modality).toBe('locacion');
    expect((await f5.collect(contract, ['2025-01-01'])).status).toBe(201);
  });
});
