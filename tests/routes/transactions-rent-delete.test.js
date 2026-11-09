const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');

describe('Deleting or editing a rent collection transaction', () => {
  let f;
  beforeAll(async () => { f = await setupRentFixture('rent-tx-delete'); });
  afterAll(() => cleanupTestDb());

  const rentDue = async contractId => {
    const res = await f.agent.get('/api/alerts').query({ type: 'rent_due', limit: '1000' });
    const items = Array.isArray(res.body) ? res.body : (res.body.items || res.body.alerts || []);
    return items.filter(item => item.contractId === contractId);
  };

  it('delete returns the period to pending and it reappears in alerts', async () => {
    const contract = await f.createContract();
    const collected = await f.collect(contract, ['2025-01-01']);
    expect((await rentDue(contract.id)).some(item => item.date === '2025-01-01')).toBe(false);
    const res = await f.agent.delete(`/api/transactions/${collected.body.transactionId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, collectionId: collected.body.id });
    expect((await rentDue(contract.id)).some(item => item.date === '2025-01-01')).toBe(true);
    expect(f.db.findById('transactions', collected.body.transactionId, f.userId)).toBeFalsy();
  });

  it('PUT is blocked with guidance', async () => {
    const contract = await f.createContract({ startDate: '2024-01-01', endDate: '2024-06-30' });
    const collected = await f.collect(contract, ['2024-01-01']);
    const res = await f.agent.put(`/api/transactions/${collected.body.transactionId}`).send({ monto: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Para corregir un cobro de alquiler, eliminá la transacción: el período vuelve a quedar pendiente de cobro');
  });

  it('plain transactions are unaffected', async () => {
    const created = await f.agent.post('/api/transactions').send({ tipo: 'income', monto: 10, titulo: 'plain', fecha: '2025-03-01', accountId: f.accountId });
    expect(created.status).toBe(201);
    expect((await f.agent.delete(`/api/transactions/${created.body.id}`)).body).toEqual({ ok: true });
  });
});
