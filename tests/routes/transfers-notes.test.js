const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Transfers: notes and account-only impact', () => {
  let db;
  let agent;
  let userId;
  let date;
  let source;
  let destination;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'transfer-notes@test.example', password: '123456', nombre: 'Transfer Notes' });
    userId = db.findUserByName('Transfer Notes').id;
    date = ledger.localDateForUser(db, userId);
    await agent.get('/api/accounts/setup');
    source = (await agent.post('/api/accounts').send({ name: 'Origen', currency: 'ARS' })).body;
    destination = (await agent.post('/api/accounts').send({ name: 'Destino', currency: 'ARS' })).body;
    await agent.post(`/api/accounts/${source.id}/reconcile`).send({ openingBalance: 0, openingDate: date, includedMovementIds: [] });
    await agent.post(`/api/accounts/${destination.id}/reconcile`).send({ openingBalance: 0, openingDate: date, includedMovementIds: [] });
    await agent.post('/api/transactions').send({ tipo: 'income', monto: 5000, titulo: 'Sueldo', fecha: date, accountId: source.id });
  });

  afterAll(() => cleanupTestDb());

  const body = (extra = {}) => ({ fromAccountId: source.id, toAccountId: destination.id, sentAmount: 100, receivedAmount: 100, fecha: date, status: 'posted', ...extra });

  it('stores notes on create, keeps them when PUT omits them and replaces them when provided', async () => {
    const created = await agent.post('/api/transfers').send(body({ reference: 'Ahorro', notes: '  para vacaciones  ' }));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ reference: 'Ahorro', notes: 'para vacaciones' });

    const kept = await agent.put(`/api/transfers/${created.body.id}`).send({ sentAmount: 120, receivedAmount: 120 });
    expect(kept.status).toBe(200);
    expect(kept.body.notes).toBe('para vacaciones');

    const replaced = await agent.put(`/api/transfers/${created.body.id}`).send({ notes: 'otra nota' });
    expect(replaced.body.notes).toBe('otra nota');
  });

  it('defaults to empty notes and rejects invalid notes', async () => {
    const plain = await agent.post('/api/transfers').send(body());
    expect(plain.status).toBe(201);
    expect(plain.body.notes).toBe('');
    const tooLong = await agent.post('/api/transfers').send(body({ notes: 'x'.repeat(1001) }));
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toBe('La nota no es válida');
    expect((await agent.post('/api/transfers').send(body({ notes: 5 }))).status).toBe(400);
    expect((await agent.put(`/api/transfers/${plain.body.id}`).send({ notes: { a: 1 } })).status).toBe(400);
    expect((await agent.post('/api/transfers').send(body({ notes: 'x'.repeat(1000) }))).status).toBe(201);
  });

  it('lists transfer events with their notes', async () => {
    const created = await agent.post('/api/transfers').send(body({ reference: 'Con nota', notes: 'visible en la lista' }));
    const list = (await agent.get(`/api/transactions?month=${date.slice(0, 7)}`)).body;
    const event = list.find(item => item.transferId === created.body.id);
    expect(event).toMatchObject({ isTransfer: true, titulo: 'Con nota', notes: 'visible en la lista' });
  });

  it('moves account balances without touching income, expense or savings totals', async () => {
    const month = date.slice(0, 7);
    const before = (await agent.get(`/api/summary?month=${month}`)).body;
    const accountsBefore = (await agent.get('/api/accounts')).body;
    const transfer = await agent.post('/api/transfers').send(body({ sentAmount: 300, receivedAmount: 300, notes: 'sin efecto en resultados' }));
    expect(transfer.status).toBe(201);
    const after = (await agent.get(`/api/summary?month=${month}`)).body;
    expect(after.ingresos).toBe(before.ingresos);
    expect(after.gastos).toBe(before.gastos);
    expect(before.ingresos).toBe(5000);
    expect(after.ahorro).toBe(before.ahorro);
    const accountsAfter = (await agent.get('/api/accounts')).body;
    const balance = (accounts, id) => accounts.find(item => item.id === id).balance;
    expect(balance(accountsAfter, source.id)).toBe(balance(accountsBefore, source.id) - 300);
    expect(balance(accountsAfter, destination.id)).toBe(balance(accountsBefore, destination.id) + 300);
  });
});
