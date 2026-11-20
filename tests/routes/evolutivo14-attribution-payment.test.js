const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const obligationPayments = require('../../src/services/obligation-payments');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

// Evolutivo 14: a new expense whose "Atribución del movimiento" points at a due date (vencimiento) is registered as a
// payment of it, through the same service as "Registrar pago".
describe('Evolutivo 14 paying a due date from the transaction form', () => {
  let db;
  let agent;
  let userId;
  let today;
  let accountId;
  let usdAccountId;
  let categoryId;
  let assetId;
  let ownerId;
  let counter = 0;

  const latestLog = () => db.findAll('activityLogs', userId).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];
  const createObligation = async (extra = {}) => {
    const response = await agent.post('/api/obligations').send({
      title: 'Tasa municipal', type: 'tax', currencyCode: 'ARS', estimatedAmount: 100, startDate: today, accountId, categoryId, assetId, ...extra
    });
    expect(response.status).toBe(201);
    return { obligation: response.body, occurrence: response.body.occurrences[0] };
  };
  const occurrenceOf = async (obligation, occurrence) => (await agent.get(`/api/obligations/${obligation.id}`)).body.occurrences.find(item => item.id === occurrence.id);
  const expense = (occurrence, body = {}) => {
    counter += 1;
    return agent.post('/api/transactions').send({
      tipo: 'expense', monto: 100, categoryId, accountId, fecha: today, comments: 'Pagado desde el formulario', titulo: '',
      obligationPayment: { occurrenceId: occurrence.id, idempotencyKey: `e14-payment-key-${counter}` }, ...body
    });
  };
  const transactionCount = () => db.findAll('transactions', userId).length;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'e14-payment@test.example', password: '123456', nombre: 'E14 Payment' });
    userId = db.findUserByName('E14 Payment').id;
    today = ledger.localDateForUser(db, userId);
    await agent.get('/api/accounts/setup');
    accountId = (await agent.post('/api/accounts').send({ name: 'Caja ARS', currency: 'ARS', initialBalance: 100000 })).body.id;
    usdAccountId = (await agent.post('/api/accounts').send({ name: 'Caja USD', currency: 'USD', initialBalance: 100000 })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Impuestos' })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Casa Sur' })).body.id;
    ownerId = (await agent.post('/api/owners').send({ name: 'Titular', kind: 'person', roles: ['owner'] })).body.id;
    expect((await agent.post(`/api/assets/${assetId}/ownerships`).send({ ownerId, startDate: '2020-01-01', percentage: 100 })).status).toBe(201);
  });

  afterAll(() => cleanupTestDb());

  it('registers the full expense as a payment: same record, paid status, totalPaid and no movement allocation', async () => {
    const { obligation, occurrence } = await createObligation();
    const response = await expense(occurrence, { clasificacion: 'fijo' });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      tipo: 'expense', monto: 100, amountMinor: 10000, accountId, currencyCode: 'ARS', categoryId, fecha: today,
      obligationId: obligation.id, obligationOccurrenceId: occurrence.id, titulo: 'Tasa municipal', comments: 'Pagado desde el formulario', clasificacion: 'fijo'
    });
    expect(response.body.paymentId).toEqual(expect.any(String));
    expect(response.body.obligationIdempotencyKey).toEqual(expect.any(String));
    expect(response.body.paidOccurrence).toMatchObject({ status: 'paid', totalPaid: 100, remainingAmount: 0 });
    const view = await occurrenceOf(obligation, occurrence);
    expect(view).toMatchObject({ status: 'paid', totalPaid: 100, remainingAmount: 0, paymentIds: [response.body.id] });
    expect(db.findAll('movementAllocations', userId).filter(item => item.transactionId === response.body.id)).toEqual([]);
  });

  it('writes the same audit entry as "Registrar pago", with its undo descriptor', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Seguro hogar' });
    const response = await expense(occurrence);
    expect(response.status).toBe(201);
    const [d, m, y] = [occurrence.date.slice(8), occurrence.date.slice(5, 7), occurrence.date.slice(0, 4)];
    const entry = latestLog();
    expect(entry.action).toBe('obligation.payment');
    expect(entry.message).toBe(`Registraste un pago de la obligación Seguro hogar de la propiedad Casa Sur, por un monto de ARS 100, con vencimiento ${d}/${m}/${y}`);
    expect(entry).toMatchObject({ assetId, ownerIds: [ownerId], categoryId, entityType: 'transaction', entityId: response.body.id });
    expect(entry.undo).toEqual({ type: 'obligation.payment', obligationId: obligation.id, occurrenceId: occurrence.id, transactionId: response.body.id });
  });

  it('accepts partial payments until the due date is covered', async () => {
    const { obligation, occurrence } = await createObligation();
    const first = await expense(occurrence, { monto: 40, titulo: 'Primera parte' });
    expect(first.status).toBe(201);
    expect(first.body.titulo).toBe('Primera parte');
    let view = await occurrenceOf(obligation, occurrence);
    expect(view).toMatchObject({ status: 'partial', totalPaid: 40, remainingAmount: 60 });
    const second = await expense(occurrence, { monto: 60 });
    expect(second.status).toBe(201);
    view = await occurrenceOf(obligation, occurrence);
    expect(view).toMatchObject({ status: 'paid', totalPaid: 100, remainingAmount: 0 });
    expect(view.paymentIds).toEqual([first.body.id, second.body.id]);
  });

  it('rejects an amount over the remaining and writes nothing', async () => {
    const { obligation, occurrence } = await createObligation();
    const before = transactionCount();
    const response = await expense(occurrence, { monto: 100.01 });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('El pago supera el importe pendiente');
    expect(transactionCount()).toBe(before);
    expect(await occurrenceOf(obligation, occurrence)).toMatchObject({ totalPaid: 0, remainingAmount: 100 });
  });

  it('rejects an account whose currency differs from the obligation and writes nothing', async () => {
    const { occurrence } = await createObligation();
    const before = transactionCount();
    const response = await expense(occurrence, { accountId: usdAccountId });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('La moneda de la cuenta no coincide con la obligación');
    expect(transactionCount()).toBe(before);
  });

  it('never pays from an income, a recurrence, installments, a missing note or an unknown due date', async () => {
    const { obligation, occurrence } = await createObligation();
    const before = transactionCount();
    const cases = [
      [{ tipo: 'income', categoryId: undefined }, 'Solo un gasto puede registrar el pago de un vencimiento'],
      [{ recurrente: true, frecuencia: 'monthly' }, 'El pago de un vencimiento no puede ser recurrente'],
      [{ paymentMethod: 'Crédito', creditInstallments: { count: 2 } }, 'Las cuotas no se pueden combinar con el pago de un vencimiento'],
      [{ comments: '  ' }, 'Los comentarios son obligatorios para registrar el pago de un vencimiento'],
      [{ obligationPayment: { occurrenceId: 'missing' } }, 'El vencimiento a pagar no es válido'],
      [{ obligationPayment: ['x'] }, 'El vencimiento a pagar no es válido'],
      [{ fecha: '2999-01-01' }, 'La fecha de pago debe ser válida y no futura']
    ];
    for (const [body, error] of cases) {
      const response = await expense(occurrence, body);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(error);
    }
    expect(transactionCount()).toBe(before);
    expect(await occurrenceOf(obligation, occurrence)).toMatchObject({ totalPaid: 0 });
  });

  it('keeps an income allocation to a due date informational: it is rejected and pays nothing', async () => {
    const { obligation, occurrence } = await createObligation();
    const income = await agent.post('/api/transactions').send({ tipo: 'income', monto: 100, accountId, fecha: today });
    expect(income.status).toBe(201);
    const allocation = await agent.put(`/api/finance/transactions/${income.body.id}/allocations`).send({ allocations: [{ obligationId: obligation.id, occurrenceId: occurrence.id, amount: 100 }] });
    expect(allocation.status).toBe(400);
    expect(await occurrenceOf(obligation, occurrence)).toMatchObject({ totalPaid: 0, remainingAmount: 100 });
  });

  it('replays the same idempotency key instead of paying twice', async () => {
    const { obligation, occurrence } = await createObligation();
    const body = { monto: 30, obligationPayment: { occurrenceId: occurrence.id, idempotencyKey: 'e14-replay-key-123' } };
    const first = await expense(occurrence, body);
    expect(first.status).toBe(201);
    const replay = await expense(occurrence, body);
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ id: first.body.id, replayed: true });
    expect((await expense(occurrence, { ...body, monto: 31 })).status).toBe(409);
    expect(await occurrenceOf(obligation, occurrence)).toMatchObject({ totalPaid: 30 });
  });

  it('is reverted like any payment: no direct delete, "Revertir pago" puts the due date back to pending', async () => {
    const { obligation, occurrence } = await createObligation();
    const paid = await expense(occurrence);
    expect(paid.status).toBe(201);
    const removed = await agent.delete(`/api/transactions/${paid.body.id}`);
    expect(removed.status).toBe(409);
    const edited = await agent.put(`/api/transactions/${paid.body.id}`).send({ monto: 50 });
    expect(edited.status).toBe(409);
    const detail = await agent.get(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments/${paid.body.id}`);
    expect(detail.body.revertible).toBe(true);
    const reverted = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments/${paid.body.id}/revert`).send({ reason: 'Cargado por error' });
    expect(reverted.status).toBe(200);
    expect(db.findById('transactions', paid.body.id, userId)).toBeNull();
    expect(await occurrenceOf(obligation, occurrence)).toMatchObject({ totalPaid: 0, remainingAmount: 100 });
  });

  it('attributes the payment to the asset of the obligation in the economic analysis', async () => {
    const { occurrence } = await createObligation({ title: 'Expensas' });
    const paid = await expense(occurrence);
    expect(paid.status).toBe(201);
    const economic = require('../../src/services/economic-overview');
    expect(economic.allocationsForTransaction(db, userId, db.findById('transactions', paid.body.id, userId)))
      .toEqual([expect.objectContaining({ assetId, amountMinor: 10000, source: 'obligation' })]);
  });

  it('the shared service refuses a cancelled due date and keeps the dialog fingerprint without extra fields', async () => {
    const { obligation, occurrence } = await createObligation();
    expect(obligationPayments.register(db, userId, { obligation, occurrence: { ...occurrence, status: 'cancelled' }, input: {} })).toEqual({ error: 'La ocurrencia está cancelada', status: 409 });
    const result = obligationPayments.register(db, userId, { obligation, occurrence, input: { amount: 10, notes: 'ok', idempotencyKey: 'e14-service-key-1', accountId, categoryId } });
    expect(result.replayed).toBe(false);
    expect(result.transaction).toMatchObject({ clasificacion: 'variable', obligationOccurrenceId: occurrence.id });
    expect(result.transaction).not.toHaveProperty('ivaPorcentaje');
    // "Registrar pago" replays the same key against the same fingerprint.
    const replay = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send({ amount: 10, notes: 'ok', idempotencyKey: 'e14-service-key-1', accountId, categoryId });
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
  });
});
