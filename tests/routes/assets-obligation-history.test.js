const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

describe('GET /api/assets/:id/obligation-history', () => {
  let db;
  let agent;
  let other;
  let today;
  let assetId;
  let occurrence;
  let documentId;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    app.locals.documentStorage = new DiskDocumentStorage(TEMP_DATA_DIR);
    agent = request.agent(app);
    other = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'hist-route@test.example', password: '123456', nombre: 'Hist Route' });
    await other.post('/api/auth/register').send({ email: 'hist-other@test.example', password: '123456', nombre: 'Hist Other' });
    today = ledger.localDateForUser(db, db.findUserByName('Hist Route').id);
    const accountId = (await agent.post('/api/accounts').send({ nombre: 'Main', tipo: 'checking', currency: 'ARS', saldoInicial: 10000 })).body.id;
    const categoryId = (await agent.post('/api/categories').send({ nombre: 'Taxes' })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Local' })).body.id;
    const created = await agent.post('/api/obligations').send({ title: 'Municipal', type: 'tax', currencyCode: 'ARS', estimatedAmount: 100, startDate: today, accountId, categoryId, assetId });
    occurrence = created.body.occurrences[0];
    const paid = await agent.post(`/api/obligations/${created.body.id}/occurrences/${occurrence.id}/payments`)
      .send({ amount: 100, accountId, categoryId, title: 'Pago tasa', notes: 'ok', idempotencyKey: 'hist-route-key-1' });
    const doc = await agent.post('/api/documents').field('occurrenceId', occurrence.id).field('transactionId', paid.body.transaction.id)
      .attach('file', Buffer.from('receipt'), { filename: 'receipt.txt', contentType: 'text/plain' });
    documentId = doc.body.id;
  });

  afterAll(() => cleanupTestDb());

  it('returns the history shape with payment title/notes and document metadata', async () => {
    const response = await agent.get(`/api/assets/${assetId}/obligation-history`);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ assetId, to: today.slice(0, 7) });
    const row = response.body.months[0].rows.find(item => item.occurrenceId === occurrence.id);
    expect(row).toMatchObject({ type: 'tax', obligationTitle: 'Municipal', dueState: 'paid' });
    expect(row.payments[0]).toMatchObject({ title: 'Pago tasa', notes: 'ok' });
    expect(row.documents[0]).toMatchObject({ id: documentId, fileName: 'receipt.txt', contentType: expect.stringContaining('text/plain') });
  });

  it('answers 404 for an unknown asset and for another user, 401 without a session', async () => {
    expect((await agent.get('/api/assets/missing/obligation-history')).status).toBe(404);
    expect((await other.get(`/api/assets/${assetId}/obligation-history`)).status).toBe(404);
    expect((await request(app).get(`/api/assets/${assetId}/obligation-history`)).status).toBe(401);
  });

  it('does not leak rows between users', async () => {
    const otherAsset = (await other.post('/api/assets').send({ type: 'immovable', name: 'Otro' })).body.id;
    const response = await other.get(`/api/assets/${otherAsset}/obligation-history`);
    expect(response.status).toBe(200);
    expect(response.body.months.flatMap(item => item.rows)).toEqual([]);
  });
});
