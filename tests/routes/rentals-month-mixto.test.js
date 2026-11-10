const fs = require('fs');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const { getIncomeIva, getIncomeBreakdown } = require('../../src/utils/income');

describe('Month-level rent: Mixto classification, month status, alerts and undo', () => {
  let f;
  let declaration;
  beforeEach(async () => {
    f = await setupRentFixture('month-mixto');
    declaration = (await f.declare([
      f.modality('locacion', { amount: 100000, ivaPercent: 21 }), f.modality('comodato', { amount: 50000 }), f.modality('mutuo', { amount: 30000 })
    ])).body;
  });
  afterAll(() => cleanupTestDb());

  const part = (kind, date = '2025-01-01') => declaration.modalities.find(item => item.kind === kind).occurrences.find(item => item.date === date);
  const line = (kind, extra = {}) => ({ occurrenceId: part(kind).id, amount: part(kind).rentMinor / 100, ...extra });
  let counter = 0;
  const collect = (allocations, extra = {}) => {
    counter += 1;
    return f.agent.post('/api/rentals/collections').send({
      amount: allocations.reduce((sum, item) => sum + item.amount, 0), accountId: f.accountId, date: '2025-03-02', allocations, idempotencyKey: `month-mixto-key-${counter}`, ...extra
    });
  };
  const months = async () => (await f.agent.get(`/api/rentals/months?assetId=${f.assetId}`)).body;
  const january = async () => (await months()).find(item => item.date === '2025-01-01');

  test('locacion A with IVA + comodato B + mutuo B in one collection is Mixto and IVA is only on the A part', async () => {
    const res = await collect([line('locacion'), line('comodato'), line('mutuo')]);
    expect(res.status).toBe(201);
    expect(res.body.clasificacion).toBe('Mixto');
    const tx = f.db.findById('transactions', res.body.transactionId, f.userId);
    expect(tx).toMatchObject({ clasificacion: 'Mixto', montoA: 121000, montoB: 80000, ivaPorcentaje: 21, ivaIncluded: true, monto: 201000 });
    expect(getIncomeBreakdown(tx)).toEqual({ a: 121000, b: 80000 });
    expect(getIncomeIva(tx)).toBe(21000);
  });

  test('comodato and mutuo alone are B without IVA; a per-allocation override moves a line to A', async () => {
    const onlyB = await collect([line('comodato'), line('mutuo')]);
    expect(f.db.findById('transactions', onlyB.body.transactionId, f.userId)).toMatchObject({ clasificacion: 'B', montoA: null, ivaPorcentaje: null, ivaIncluded: false });
    const overridden = await collect([line('locacion', { clasificacion: 'B' })]);
    expect(overridden.status).toBe(201);
    expect(f.db.findById('transactions', overridden.body.transactionId, f.userId)).toMatchObject({ clasificacion: 'B', ivaPorcentaje: null });
    const promoted = await collect([{ ...line('comodato', { clasificacion: 'A' }), occurrenceId: part('comodato', '2025-02-01').id }, { ...line('mutuo'), occurrenceId: part('mutuo', '2025-02-01').id }]);
    expect(f.db.findById('transactions', promoted.body.transactionId, f.userId)).toMatchObject({ clasificacion: 'Mixto', montoA: 50000, montoB: 30000, ivaPorcentaje: null });
  });

  test('rejects an invalid per-allocation classification', async () => {
    const res = await collect([line('locacion', { clasificacion: 'X' })]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/A o B/);
  });

  test('the month is partial until every modality is collected, then collected', async () => {
    expect((await january()).status).toBe('overdue');
    await collect([line('locacion')]);
    const partial = await january();
    expect(partial.status).toBe('partially_collected');
    expect(partial.parts.map(item => item.modality)).toEqual(['locacion', 'comodato', 'mutuo']);
    expect(partial.parts.map(item => item.status)).toEqual(['collected', 'overdue', 'overdue']);
    await collect([line('comodato')]);
    expect((await january()).status).toBe('partially_collected');
    await collect([line('mutuo')]);
    const done = await january();
    expect(done.status).toBe('collected');
    expect(done.collectionIds).toHaveLength(3);
  });

  test('Avisos has one entry per declaration month with its parts', async () => {
    const alerts = (await f.agent.get('/api/alerts?type=rent_due&limit=200')).body;
    const ofJanuary = alerts.filter(item => item.date === '2025-01-01');
    expect(ofJanuary).toHaveLength(1);
    expect(ofJanuary[0].parts.map(item => item.modality)).toEqual(['locacion', 'comodato', 'mutuo']);
    expect(new Set(alerts.map(item => item.id)).size).toBe(alerts.length);
    await collect([line('locacion')]);
    const after = (await f.agent.get('/api/alerts?type=rent_due&limit=200')).body.filter(item => item.date === '2025-01-01');
    expect(after).toHaveLength(1);
    expect(after[0].parts.find(item => item.modality === 'locacion').remainingAmount).toBe(0);
    await collect([line('comodato'), line('mutuo')]);
    expect((await f.agent.get('/api/alerts?type=rent_due&limit=200')).body.filter(item => item.date === '2025-01-01')).toHaveLength(0);
  });

  test('undo deletes receipts whose only target was the collection (and the file) and unlinks the rest', async () => {
    const res = await collect([line('locacion'), line('comodato'), line('mutuo')]);
    const storage = f.app.locals.documentStorage;
    const storageKey = `${'ab'.repeat(24)}.bin`;
    fs.writeFileSync(`${storage.ensureUserDirectory(f.userId)}/${storageKey}`, 'receipt');
    const only = f.db.create('documents', { userId: f.userId, transactionId: res.body.transactionId, storageKey, originalName: 'only.txt' }, f.userId);
    const shared = f.db.create('documents', { userId: f.userId, transactionId: res.body.transactionId, assetId: f.assetId, originalName: 'shared.txt' }, f.userId);
    const undone = await f.agent.post(`/api/rentals/collections/${res.body.id}/reverse`);
    expect(undone.status).toBe(200);
    expect(undone.body.deletedDocumentIds).toEqual([only.id]);
    expect(f.db.findById('documents', only.id, f.userId)).toBeFalsy();
    expect(fs.existsSync(storage.filePath(f.userId, storageKey))).toBe(false);
    expect(f.db.findById('documents', shared.id, f.userId)).toMatchObject({ transactionId: null, assetId: f.assetId });
    expect((await january()).status).toBe('overdue');
  });

  test('deleting the transaction undoes the collection and reports a reconciliation reset', async () => {
    await f.agent.post(`/api/accounts/${f.accountId}/reconcile`).send({ openingBalance: 0, openingDate: '2025-06-01', includedMovementIds: [] });
    const res = await collect([line('locacion'), line('comodato'), line('mutuo')]);
    const removed = await f.agent.delete(`/api/transactions/${res.body.transactionId}`);
    expect(removed.status).toBe(200);
    expect(removed.body.reconciliationReset).toBe(true);
    expect(f.db.findById('accounts', f.accountId, f.userId).reconciled).toBe(false);
    expect((await january()).status).toBe('overdue');
  });
});
