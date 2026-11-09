const request = require('supertest');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const ledger = require('../../src/services/account-ledger');

describe('Reverse a rent collection', () => {
  let f;
  beforeAll(async () => {
    f = await setupRentFixture('rent-reverse');
    await f.agent.post(`/api/accounts/${f.accountId}/reconcile`).send({ openingBalance: 0, openingDate: '2024-01-01', includedMovementIds: [] });
  });
  afterAll(() => cleanupTestDb());

  const balance = () => ledger.getAccountBalances(f.db, f.userId).find(item => item.id === f.accountId).balance;
  const status = async (contract, date) => (await f.agent.get(`/api/rentals/${contract.id}`)).body.occurrences.find(item => item.date === date).status;

  it('returns a single occurrence to overdue, removes the transaction and lowers the balance', async () => {
    const contract = await f.createContract();
    const before = balance();
    const collected = await f.collect(contract, ['2025-01-01']);
    expect(balance()).toBe(before + 100000);
    expect(await status(contract, '2025-01-01')).toBe('collected');
    const res = await f.agent.post(`/api/rentals/collections/${collected.body.id}/reverse`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, collectionId: collected.body.id, reopenedOccurrenceIds: [f.occurrenceId(contract, '2025-01-01')] });
    expect(await status(contract, '2025-01-01')).toBe('overdue');
    expect(f.db.findById('transactions', collected.body.transactionId, f.userId)).toBeFalsy();
    expect(f.db.findAll('rentCollectionAllocations', f.userId).filter(item => item.collectionId === collected.body.id)).toHaveLength(0);
    expect(f.db.findById('rentCollections', collected.body.id, f.userId)).toMatchObject({ reversedTransactionId: collected.body.transactionId });
    expect(balance()).toBe(before);
    const list = await f.agent.get('/api/rentals/collections/list');
    expect(list.body.find(item => item.id === collected.body.id)).toBeUndefined();
  });

  it('reverses a multi-period collection and allows registering again', async () => {
    const contract = await f.createContract({ startDate: '2024-03-01', endDate: '2024-12-31' });
    const collected = await f.collect(contract, ['2024-03-01', '2024-04-01'], { idempotencyKey: 'multi-period-key-1' });
    const res = await f.agent.post(`/api/rentals/collections/${collected.body.id}/reverse`);
    expect(res.body.reopenedOccurrenceIds).toHaveLength(2);
    expect(await status(contract, '2024-03-01')).toBe('overdue');
    expect(await status(contract, '2024-04-01')).toBe('overdue');
    const replay = await f.collect(contract, ['2024-03-01', '2024-04-01'], { idempotencyKey: 'multi-period-key-1' });
    expect(replay.status).toBe(409);
    expect(replay.body.error).toBe('Ese cobro fue anulado; registrá uno nuevo');
    const again = await f.collect(contract, ['2024-03-01']);
    expect(again.status).toBe(201);
    expect(again.body.id).not.toBe(collected.body.id);
  });

  it('rejects a double reverse, unknown ids, anonymous and other users', async () => {
    const contract = await f.createContract({ startDate: '2024-01-01', endDate: '2024-02-28' });
    const collected = await f.collect(contract, ['2024-01-01']);
    expect((await f.other.post(`/api/rentals/collections/${collected.body.id}/reverse`)).status).toBe(404);
    expect((await request(f.app).post(`/api/rentals/collections/${collected.body.id}/reverse`)).status).toBe(401);
    expect((await f.agent.post(`/api/rentals/collections/${collected.body.id}/reverse`)).status).toBe(200);
    expect((await f.agent.post(`/api/rentals/collections/${collected.body.id}/reverse`)).status).toBe(409);
    expect((await f.agent.post('/api/rentals/collections/missing/reverse')).status).toBe(404);
  });

  it('rejects reversal when the account was reconciled after the collection date', async () => {
    const reconciledId = (await f.agent.post('/api/accounts').send({ name: 'Reconciled ARS', currency: 'ARS' })).body.id;
    const contract = await f.createContract({ startDate: '2022-01-01', endDate: '2022-06-30' });
    const collected = await f.collect(contract, ['2022-01-01'], { accountId: reconciledId });
    await f.agent.post(`/api/accounts/${reconciledId}/reconcile`).send({ openingBalance: 0, openingDate: '2025-06-01', includedMovementIds: [] });
    const res = await f.agent.post(`/api/rentals/collections/${collected.body.id}/reverse`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('La cuenta fue conciliada; no se puede revertir el cobro');
    expect(f.db.findById('transactions', collected.body.transactionId, f.userId)).toBeTruthy();
  });

  it('rejects reversal when a refund references the transaction', async () => {
    const contract = await f.createContract({ startDate: '2021-01-01', endDate: '2021-06-30' });
    const collected = await f.collect(contract, ['2021-01-01']);
    f.db.create('transactions', { userId: f.userId, tipo: 'refund', refundSourceId: collected.body.transactionId, monto: 1, amountMinor: 100, accountId: f.accountId, currencyCode: 'ARS', fecha: '2025-03-03', titulo: 'refund' }, f.userId);
    expect((await f.agent.post(`/api/rentals/collections/${collected.body.id}/reverse`)).status).toBe(409);
  });

  it('keeps receipts detached and flagged, and keeps the tombstone for notes', async () => {
    const contract = await f.createContract({ startDate: '2020-01-01', endDate: '2020-06-30' });
    const collected = await f.collect(contract, ['2020-01-01']);
    const doc = f.db.create('documents', { userId: f.userId, assetId: f.assetId, transactionId: collected.body.transactionId, originalName: 'r.txt' }, f.userId);
    await f.agent.post(`/api/rentals/collections/${collected.body.id}/reverse`);
    expect(f.db.findById('documents', doc.id, f.userId)).toMatchObject({ transactionId: null, detachedFromCollectionId: collected.body.id, assetId: f.assetId });
    expect(f.db.findById('rentCollections', collected.body.id, f.userId)).toBeTruthy();
  });

  it('is atomic when a write fails', async () => {
    const contract = await f.createContract({ startDate: '2019-01-01', endDate: '2019-06-30' });
    const collected = await f.collect(contract, ['2019-01-01']);
    const spy = jest.spyOn(f.db, 'update').mockImplementation(() => { throw new Error('disk failure'); });
    const res = await f.agent.post(`/api/rentals/collections/${collected.body.id}/reverse`);
    spy.mockRestore();
    f.db.clearCache();
    expect(res.status).toBe(500);
    expect(f.db.findById('transactions', collected.body.transactionId, f.userId)).toBeTruthy();
    expect(f.db.findAll('rentCollectionAllocations', f.userId).filter(item => item.collectionId === collected.body.id)).toHaveLength(1);
    expect(f.db.findById('rentCollections', collected.body.id, f.userId).reversedAt).toBeFalsy();
  });
});
