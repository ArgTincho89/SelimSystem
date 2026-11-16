const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const ledger = require('../../src/services/account-ledger');
const { addDaysDateOnly } = require('../../src/utils/recurring');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

describe('Revert a registered obligation payment', () => {
  let db;
  let agent;
  let other;
  let userId;
  let today;
  let accountId;
  let categoryId;
  let assetId;
  let counter = 0;

  const day = offset => addDaysDateOnly(today, offset);
  const balance = id => ledger.getAccountBalances(db, userId).find(item => item.id === (id || accountId)).balance;
  const summary = async () => (await agent.get(`/api/summary?month=${today.slice(0, 7)}`)).body;
  const createObligation = async (extra = {}) => {
    const response = await agent.post('/api/obligations').send({
      title: 'Impuesto', type: 'tax', currencyCode: 'ARS', estimatedAmount: 100, startDate: day(-6), reminderLeadDays: 5, accountId, categoryId, assetId, ...extra
    });
    expect(response.status).toBe(201);
    return { obligation: response.body, occurrence: response.body.occurrences[0] };
  };
  const pay = async (obligation, occurrence, amount = 100, extra = {}) => {
    counter += 1;
    const response = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send({ amount, idempotencyKey: `revert-key-${counter}`, date: day(-2), ...extra });
    expect(response.status).toBe(201);
    return response.body.transaction;
  };
  const revert = (obligation, occurrence, transaction, body = {}, who = agent) => who.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments/${transaction.id}/revert`).send(body);
  const occurrenceOf = async (obligation, occurrence) => (await agent.get(`/api/obligations/${obligation.id}`)).body.occurrences.find(item => item.id === occurrence.id);
  const alertsOf = async obligation => (await agent.get('/api/alerts')).body.filter(item => item.obligationId === obligation.id);
  const logs = () => db.findAll('activityLogs', userId);

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    app.locals.documentStorage = new DiskDocumentStorage(TEMP_DATA_DIR);
    agent = request.agent(app);
    other = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'revert@test.example', password: '123456', nombre: 'Revert User' });
    await other.post('/api/auth/register').send({ email: 'revert2@test.example', password: '123456', nombre: 'Revert Other' });
    userId = db.findUserByName('Revert User').id;
    today = ledger.localDateForUser(db, userId);
    await agent.get('/api/accounts/setup');
    accountId = (await agent.post('/api/accounts').send({ name: 'ARS account', currency: 'ARS', initialBalance: 1000 })).body.id;
    await agent.post(`/api/accounts/${accountId}/reconcile`).send({ openingBalance: 1000, openingDate: '2024-01-01', includedMovementIds: [] });
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Taxes' })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Departamento Palermo' })).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('restores the balance, the month expenses, the savings and the alerts', async () => {
    const { obligation, occurrence } = await createObligation();
    const before = { balance: balance(), summary: await summary() };
    const transaction = await pay(obligation, occurrence);
    expect(balance()).toBe(before.balance - 100);
    expect((await summary()).gastos).toBe(before.summary.gastos + 100);
    expect((await alertsOf(obligation)).map(item => item.type)).toEqual(['document_pending']);
    const response = await revert(obligation, occurrence, transaction, { reason: 'Pagué por error' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ reconciliationReset: false, reversal: { transactionId: transaction.id, reason: 'Pagué por error' }, occurrence: { id: occurrence.id, status: 'overdue' } });
    expect(balance()).toBe(before.balance);
    const after = await summary();
    expect(after.gastos).toBe(before.summary.gastos);
    expect(after.ahorro).toBe(before.summary.ahorro);
    expect(db.findById('transactions', transaction.id, userId)).toBeFalsy();
    expect((await alertsOf(obligation)).map(item => item.type)).toEqual(['obligation_overdue']);
  });

  it('keeps a tombstone with the snapshot, the reason, the key hash and the receipts', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Seguro' });
    const transaction = await pay(obligation, occurrence);
    const receipt = (await agent.post('/api/documents').field('transactionId', transaction.id).attach('file', Buffer.from('recibo'), { filename: 'recibo.txt', contentType: 'text/plain' })).body;
    expect(receipt.id).toBeTruthy();
    const response = await revert(obligation, occurrence, transaction, { reason: '  duplicado ' });
    expect(response.status).toBe(200);
    const [tombstone] = db.findAll('obligationPaymentReversals', userId).filter(item => item.transactionId === transaction.id);
    expect(tombstone).toMatchObject({
      obligationId: obligation.id, occurrenceId: occurrence.id, reason: 'duplicado', idempotencyKeyHash: transaction.obligationIdempotencyKey, documentIds: [receipt.id]
    });
    expect(tombstone.reversedAt).toEqual(expect.any(String));
    expect(tombstone.snapshot).toMatchObject({ date: day(-2), amount: 100, currencyCode: 'ARS', obligationTitle: 'Seguro', accountId });
    expect(tombstone.snapshot.transaction.id).toBe(transaction.id);
    // The receipt is kept: viewable, no longer tied to the removed transaction, linked to the reverted record.
    expect(db.findById('documents', receipt.id, userId)).toMatchObject({ transactionId: null, revertedPaymentId: tombstone.id });
    expect((await agent.get(`/api/documents/${receipt.id}/content`)).status).toBe(200);
  });

  it('reverts only the chosen payment: the occurrence stays Parcial with the other payment', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Parcial', startDate: day(10), reminderLeadDays: 15 });
    const first = await pay(obligation, occurrence, 40, { date: day(-1) });
    const second = await pay(obligation, occurrence, 30, { date: day(-1) });
    const response = await revert(obligation, occurrence, first);
    expect(response.status).toBe(200);
    expect(response.body.occurrence).toMatchObject({ status: 'partial', totalPaid: 30, remainingAmount: 70 });
    expect(db.findById('transactions', second.id, userId)).toBeTruthy();
  });

  it('returns a future due date to pending and a past one to overdue', async () => {
    const future = await createObligation({ title: 'Futura', startDate: day(10), reminderLeadDays: 15 });
    const futureTx = await pay(future.obligation, future.occurrence);
    expect((await occurrenceOf(future.obligation, future.occurrence)).status).toBe('paid');
    await revert(future.obligation, future.occurrence, futureTx);
    expect((await occurrenceOf(future.obligation, future.occurrence)).status).toBe('expected');
  });

  it('answers 404 for unknown or foreign obligation, occurrence and payment, and 401 without a session', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Privada' });
    const transaction = await pay(obligation, occurrence);
    expect((await revert(obligation, occurrence, { id: 'missing' })).status).toBe(404);
    expect((await revert(obligation, { id: 'missing' }, transaction)).status).toBe(404);
    expect((await revert({ id: 'missing' }, occurrence, transaction)).status).toBe(404);
    expect((await revert(obligation, occurrence, transaction, {}, other)).status).toBe(404);
    expect((await request(app).post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments/${transaction.id}/revert`)).status).toBe(401);
    // A payment that belongs to another occurrence is not found through this one.
    const second = await createObligation({ title: 'Otra' });
    expect((await revert(second.obligation, second.occurrence, transaction)).status).toBe(404);
    expect(db.findById('transactions', transaction.id, userId)).toBeTruthy();
  });

  it('rejects a second revert and replaying the original payment with the same key', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Replay' });
    const body = { amount: 100, idempotencyKey: 'replay-key-1234', date: day(-2) };
    const created = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send(body);
    expect(created.status).toBe(201);
    const transaction = created.body.transaction;
    expect((await revert(obligation, occurrence, transaction)).status).toBe(200);
    const again = await revert(obligation, occurrence, transaction);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('Ese pago ya fue revertido');
    const replay = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send(body);
    expect(replay.status).toBe(409);
    expect(replay.body.error).toBe('Ese pago fue revertido; registrá uno nuevo');
    expect(db.findAll('transactions', userId).filter(item => item.obligationOccurrenceId === occurrence.id)).toHaveLength(0);
    expect((await pay(obligation, occurrence)).id).toBeTruthy();
  });

  it('rejects a payment with dependent movements and changes nothing', async () => {
    const refunded = await createObligation({ title: 'Con reintegro' });
    const refundedTx = await pay(refunded.obligation, refunded.occurrence);
    db.create('transactions', { userId, tipo: 'refund', refundSourceId: refundedTx.id, monto: 1, amountMinor: 100, accountId, currencyCode: 'ARS', fecha: day(-1), titulo: 'reintegro' }, userId);
    const claimed = await createObligation({ title: 'Con reclamo' });
    const claimedTx = await pay(claimed.obligation, claimed.occurrence);
    db.create('recoverableExpenseClaims', { transactionId: claimedTx.id, status: 'open' }, userId);
    const allocated = await createObligation({ title: 'Con atribución' });
    const allocatedTx = await pay(allocated.obligation, allocated.occurrence);
    db.create('movementAllocations', { transactionId: allocatedTx.id }, userId);
    const reversalsBefore = db.findAll('obligationPaymentReversals', userId).length;
    for (const [item, tx] of [[refunded, refundedTx], [claimed, claimedTx], [allocated, allocatedTx]]) {
      const response = await revert(item.obligation, item.occurrence, tx);
      expect(response.status).toBe(409);
      expect(response.body.error).toBe('No se puede revertir este pago porque tiene movimientos dependientes.');
      expect(db.findById('transactions', tx.id, userId)).toBeTruthy();
    }
    expect(db.findAll('obligationPaymentReversals', userId)).toHaveLength(reversalsBefore);
  });

  it('rejects payments of a tenant-responsible obligation', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Del inquilino' });
    const transaction = await pay(obligation, occurrence);
    db.update('obligationOccurrences', occurrence.id, { responsibilityType: 'tenant' }, userId);
    const response = await revert(obligation, occurrence, transaction);
    expect(response.status).toBe(409);
    expect(response.body.error).toContain('anulá la resolución');
    expect(db.findById('transactions', transaction.id, userId)).toBeTruthy();
  });

  it('resets the reconciliation when the account was reconciled after the payment, and reports it', async () => {
    const reconciledId = (await agent.post('/api/accounts').send({ name: 'Reconciled ARS', currency: 'ARS', initialBalance: 500 })).body.id;
    const { obligation, occurrence } = await createObligation({ title: 'Conciliada', accountId: reconciledId });
    const transaction = await pay(obligation, occurrence);
    await agent.post(`/api/accounts/${reconciledId}/reconcile`).send({ openingBalance: 0, openingDate: day(-1), includedMovementIds: [] });
    expect(db.findById('accounts', reconciledId, userId).reconciled).toBe(true);
    const response = await revert(obligation, occurrence, transaction);
    expect(response.status).toBe(200);
    expect(response.body.reconciliationReset).toBe(true);
    expect(db.findById('accounts', reconciledId, userId).reconciled).toBe(false);
  });

  it('validates the reason length and stores nothing on failure', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Motivo' });
    const transaction = await pay(obligation, occurrence);
    expect((await revert(obligation, occurrence, transaction, { reason: 'x'.repeat(501) })).status).toBe(400);
    expect((await revert(obligation, occurrence, transaction, { reason: 42 })).status).toBe(400);
    expect(db.findById('transactions', transaction.id, userId)).toBeTruthy();
    expect((await revert(obligation, occurrence, transaction)).status).toBe(200);
  });

  it('is atomic: a failure while writing restores every touched collection', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Atómica' });
    const transaction = await pay(obligation, occurrence);
    const receipt = (await agent.post('/api/documents').field('transactionId', transaction.id).attach('file', Buffer.from('r'), { filename: 'r.txt', contentType: 'text/plain' })).body;
    const reversalsBefore = db.findAll('obligationPaymentReversals', userId).length;
    const original = db.update.bind(db);
    const spy = jest.spyOn(db, 'update').mockImplementation((collection, ...args) => {
      if (collection === 'documents') throw new Error('boom');
      return original(collection, ...args);
    });
    const response = await revert(obligation, occurrence, transaction);
    spy.mockRestore();
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('No se pudo revertir el pago');
    expect(db.findById('transactions', transaction.id, userId)).toBeTruthy();
    expect(db.findAll('obligationPaymentReversals', userId)).toHaveLength(reversalsBefore);
    expect(db.findById('documents', receipt.id, userId).transactionId).toBe(transaction.id);
  });

  it('serves the payment detail used by the confirmation dialog', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Detalle' });
    const transaction = await pay(obligation, occurrence, 100, { title: 'Pago de detalle' });
    const url = `/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments/${transaction.id}`;
    const response = await agent.get(url);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      payment: { id: transaction.id, date: day(-2), amount: 100, currencyCode: 'ARS', title: 'Pago de detalle' },
      obligation: { id: obligation.id, title: 'Detalle' }, occurrence: { id: occurrence.id }, account: { id: accountId, name: 'ARS account' },
      dependent: null, revertible: true, reconciliationWillReset: false
    });
    db.create('movementAllocations', { transactionId: transaction.id }, userId);
    const blocked = (await agent.get(url)).body;
    expect(blocked).toMatchObject({ revertible: false });
    expect(blocked.dependent).toContain('una atribución de movimiento');
    expect((await other.get(url)).status).toBe(404);
    expect((await agent.get(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments/missing`)).status).toBe(404);
    expect(logs().some(entry => entry.method === 'GET')).toBe(false);
  });

  it('logs the reversal with its specific entry and the reason', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Registrada' });
    const transaction = await pay(obligation, occurrence);
    expect((await revert(obligation, occurrence, transaction, { reason: 'monto equivocado' })).status).toBe(200);
    const entry = logs().find(item => item.action === 'obligation.payment-revert' && item.outcome === 'success' && item.message.includes('Registrada'));
    expect(entry).toBeTruthy();
    expect(entry.message).toContain('Revertiste un pago de la obligación');
    expect(entry.message).toContain('Registrada');
    expect(entry.message).toContain('monto equivocado');
  });

  it('shows the reverted payment in the asset history with its receipt', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Historial' });
    const transaction = await pay(obligation, occurrence);
    const receipt = (await agent.post('/api/documents').field('transactionId', transaction.id).attach('file', Buffer.from('r'), { filename: 'r.txt', contentType: 'text/plain' })).body;
    const history = async () => (await agent.get(`/api/assets/${assetId}/history`).query({ year: today.slice(0, 4), month: 'all' })).body.rows;
    const paidRow = (await history()).find(row => row.kind === 'obligation' && row.refs.occurrenceId === occurrence.id);
    expect(paidRow.actions).toContain('revert');
    expect(paidRow.payments[0]).toMatchObject({ transactionId: transaction.id, revertible: true });
    expect((await revert(obligation, occurrence, transaction, { reason: 'error' })).status).toBe(200);
    const rows = await history();
    const row = rows.find(item => item.kind === 'obligation' && item.refs.occurrenceId === occurrence.id);
    expect(row.payments).toHaveLength(0);
    expect(row.reversals[0]).toMatchObject({ reason: 'error', amount: 100 });
    expect(row.actions).not.toContain('revert');
    const reversalRow = rows.find(item => item.kind === 'reversal' && item.refs.occurrenceId === occurrence.id);
    expect(reversalRow).toMatchObject({ state: 'reverted', date: day(-2) });
    expect(reversalRow.documents.map(item => item.id)).toEqual([receipt.id]);
  });

  it('keeps the transaction guards and points them to "Revertir pago"', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Guardas' });
    const transaction = await pay(obligation, occurrence);
    const removed = await agent.delete(`/api/transactions/${transaction.id}`);
    expect(removed.status).toBe(409);
    expect(removed.body.error).toContain('Revertir pago');
    const edited = await agent.put(`/api/transactions/${transaction.id}`).send({ titulo: 'otro' });
    expect(edited.status).toBe(409);
    expect(edited.body.error).toContain('Revertir pago');
  });
});
