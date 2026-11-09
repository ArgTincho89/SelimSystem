const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');

describe('Rent collection classification, optional method and idempotency fingerprint', () => {
  let f;
  beforeAll(async () => { f = await setupRentFixture('rent-class'); });
  afterAll(() => cleanupTestDb());

  it('classifies an IVA contract as A with percent and ivaIncluded', async () => {
    const contract = await f.createContract();
    f.db.update('rentalContracts', contract.id, { ivaPercent: 21 }, f.userId);
    const res = await f.collect(contract, ['2025-01-01']);
    expect(res.status).toBe(201);
    expect(res.body.transaction).toMatchObject({ clasificacion: 'A', ivaPorcentaje: 21, ivaIncluded: true });
    expect(res.body.clasificacion).toBe('A');
  });

  it('leaves a contract without IVA unclassified and accepts a missing method', async () => {
    const contract = await f.createContract({ startDate: '2024-01-01', endDate: '2024-12-31' });
    const res = await f.collect(contract, ['2024-01-01']);
    expect(res.status).toBe(201);
    expect(res.body.transaction.clasificacion).toBeNull();
    expect(res.body.transaction.ivaIncluded).toBe(false);
    expect(res.body.method).toBe('');
  });

  it('lets the body override to B and rejects unknown values or long methods', async () => {
    const contract = await f.createContract({ startDate: '2023-01-01', endDate: '2023-12-31' });
    f.db.update('rentalContracts', contract.id, { ivaPercent: 21 }, f.userId);
    const asB = await f.collect(contract, ['2023-01-01'], { clasificacion: 'B' });
    expect(asB.status).toBe(201);
    expect(asB.body.transaction).toMatchObject({ clasificacion: 'B', ivaPorcentaje: null, ivaIncluded: false });
    expect((await f.collect(contract, ['2023-02-01'], { clasificacion: 'Mixto' })).status).toBe(400);
    expect((await f.collect(contract, ['2023-02-01'], { method: 'x'.repeat(101) })).status).toBe(400);
  });

  it('fingerprint ignores paymentMethodId but depends on clasificacion', async () => {
    const contract = await f.createContract({ startDate: '2022-01-01', endDate: '2022-12-31' });
    const body = { amount: 100000, accountId: f.accountId, date: '2025-03-02', idempotencyKey: 'fingerprint-key-1', allocations: [{ occurrenceId: f.occurrenceId(contract, '2022-01-01'), amount: 100000 }] };
    expect((await f.agent.post('/api/rentals/collections').send(body)).status).toBe(201);
    const replay = await f.agent.post('/api/rentals/collections').send({ ...body, paymentMethodId: 'ignored-by-fingerprint' });
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect((await f.agent.post('/api/rentals/collections').send({ ...body, clasificacion: 'B' })).status).toBe(409);
  });
});
