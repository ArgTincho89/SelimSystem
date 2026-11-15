const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const ledger = require('../../src/services/account-ledger');
const overview = require('../../src/services/economic-overview');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

describe('Obligation history service', () => {
  let db;
  let agent;
  let userId;
  let today;
  let month;
  let accountId;
  let categoryId;
  let providerId;
  let assetId;
  let n = 0;

  const asset = () => db.findById('assets', assetId, userId);
  const create = async (extra = {}) => {
    const response = await agent.post('/api/obligations').send({
      title: 'Impuesto municipal', type: 'tax', currencyCode: 'ARS', estimatedAmount: 100, startDate: today,
      accountId, categoryId, assetId, providerEntityId: providerId, ...extra
    });
    expect(response.status).toBe(201);
    return { obligation: response.body, occurrence: response.body.occurrences[0] };
  };
  const pay = (o, occ, body = {}) => agent.post(`/api/obligations/${o.id}/occurrences/${occ.id}/payments`)
    .send({ amount: 100, accountId, categoryId, idempotencyKey: `history-${n += 1}-abcdefgh`, ...body });
  const upload = fields => {
    let req = agent.post('/api/documents');
    Object.entries(fields).forEach(([key, value]) => { req = req.field(key, value); });
    return req.attach('file', Buffer.from('receipt'), { filename: 'receipt.txt', contentType: 'text/plain' });
  };
  const rowsOf = history => history.months.flatMap(item => item.rows);
  const monthsAgo = count => {
    const date = new Date(`${month}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - count);
    return date.toISOString().slice(0, 7);
  };

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    app.locals.documentStorage = new DiskDocumentStorage(TEMP_DATA_DIR);
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'history@test.example', password: '123456', nombre: 'History User' });
    userId = db.findUserByName('History User').id;
    today = ledger.localDateForUser(db, userId);
    month = today.slice(0, 7);
    accountId = (await agent.post('/api/accounts').send({ nombre: 'Main', tipo: 'checking', currency: 'ARS', saldoInicial: 100000 })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Taxes' })).body.id;
    providerId = (await agent.post('/api/owners').send({ name: 'Municipalidad', roles: ['provider'] })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Local' })).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('returns only the current month for an asset without obligations', async () => {
    const emptyId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Vacio' })).body.id;
    const history = overview.obligationHistory(db, userId, db.findById('assets', emptyId, userId));
    expect(history).toMatchObject({ assetId: emptyId, to: month });
    expect(history.months).toEqual([{ month, rows: [] }]);
  });

  it('groups rows by month, newest first, with type, provider, title and dueState', async () => {
    const start = `${monthsAgo(2)}-01`;
    const { obligation } = await create({ startDate: start, recurrenceFrequency: 'monthly', title: 'Tasa mensual' });
    const history = overview.obligationHistory(db, userId, asset());
    expect(history.to).toBe(month);
    expect(history.from).toBe(monthsAgo(2));
    expect(history.months.map(item => item.month)).toEqual([month, monthsAgo(1), monthsAgo(2)]);
    const oldest = history.months[2].rows.find(row => row.obligationId === obligation.id);
    expect(oldest).toMatchObject({ type: 'tax', providerName: 'Municipalidad', obligationTitle: 'Tasa mensual', dueState: 'overdue' });
    expect(oldest.date.slice(0, 7)).toBe(monthsAgo(2));
  });

  it('includes the payment title, notes and the attached receipt', async () => {
    const { obligation, occurrence } = await create({ title: 'Con comprobante' });
    const paid = await pay(obligation, occurrence, { title: 'Tasa pagada', notes: 'Con recibo' });
    expect(paid.status).toBe(201);
    const doc = await upload({ occurrenceId: occurrence.id, transactionId: paid.body.transaction.id });
    expect(doc.status).toBe(201);
    const row = rowsOf(overview.obligationHistory(db, userId, asset())).find(item => item.occurrenceId === occurrence.id);
    expect(row.dueState).toBe('paid');
    expect(row.payments[0]).toMatchObject({ title: 'Tasa pagada', notes: 'Con recibo', transactionId: paid.body.transaction.id });
    expect(row.documents.map(item => item.id)).toContain(doc.body.id);
  });

  it('excludes cancelled occurrences', async () => {
    const { obligation, occurrence } = await create({ title: 'A cancelar' });
    expect((await agent.delete(`/api/obligations/${obligation.id}`)).status).toBe(200);
    const ids = rowsOf(overview.obligationHistory(db, userId, asset())).map(item => item.occurrenceId);
    expect(ids).not.toContain(occurrence.id);
  });

  it('clamps the range to 120 months', async () => {
    await create({ title: 'Muy vieja', startDate: '2001-01-01', recurrenceFrequency: 'annual' });
    const history = overview.obligationHistory(db, userId, asset());
    expect(history.months).toHaveLength(120);
    expect(history.months[0].month).toBe(month);
    expect(history.from).toBe(monthsAgo(119));
  });

  it('keeps monthly-view rows identical to the shared obligationRow builder', async () => {
    const { obligation, occurrence } = await create({ title: 'Espejo' });
    await pay(obligation, occurrence, { amount: 40 });
    const monthly = overview.monthlyView(db, userId, asset(), { from: month, to: month });
    const row = monthly.months[0].obligations.find(item => item.occurrenceId === occurrence.id);
    const view = (await agent.get(`/api/obligations/${obligation.id}`)).body.occurrences.find(item => item.id === occurrence.id);
    expect(row).toEqual(overview.obligationRow(db, userId, obligation, view, db.findAll('documents', userId)));
    expect(Object.keys(row).sort()).toEqual([
      'actualMinor', 'currencyCode', 'date', 'documentIds', 'documents', 'estimatedMinor', 'obligationId', 'occurrenceId',
      'payments', 'resolutionAmountMinor', 'resolutionStatus', 'resolvedAt', 'responsibilityType', 'status', 'title'
    ]);
  });
});
