const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');

describe('Evolutivo 7 receipts attached to income and expense movements', () => {
  let f;
  beforeAll(async () => { f = await setupRentFixture('evo7-tx-receipts'); });
  afterAll(() => cleanupTestDb());

  const upload = (agent, fields) => {
    let req = agent.post('/api/documents');
    Object.entries(fields).forEach(([key, value]) => { req = req.field(key, value); });
    return req.attach('file', Buffer.from('receipt contents'), { filename: 'recibo.txt', contentType: 'text/plain' });
  };
  const createMovement = () => f.agent.post('/api/transactions').send({ tipo: 'income', monto: 10, titulo: 'Honorarios', fecha: '2025-03-01', accountId: f.accountId });

  it('links a receipt to a movement, lists it, serves it and keeps it away from other users', async () => {
    const movement = await createMovement();
    const uploaded = await upload(f.agent, { transactionId: movement.body.id });
    expect(uploaded.status).toBe(201);
    const listed = await f.agent.get('/api/documents').query({ transactionId: movement.body.id });
    expect((Array.isArray(listed.body) ? listed.body : listed.body.items).map(item => item.id)).toContain(uploaded.body.id);
    expect((await f.agent.get(`/api/documents/${uploaded.body.id}/content`)).status).toBe(200);
    expect((await f.other.get(`/api/documents/${uploaded.body.id}/content`)).status).toBe(404);
    expect((await upload(f.other, { transactionId: movement.body.id })).status).not.toBe(201);
  });

  it('deleting a movement removes the receipts that only belonged to it and unlinks shared ones', async () => {
    const movement = await createMovement();
    const own = await upload(f.agent, { transactionId: movement.body.id });
    const shared = await upload(f.agent, { transactionId: movement.body.id, assetId: f.assetId });
    const res = await f.agent.delete(`/api/transactions/${movement.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, deletedDocumentIds: [own.body.id] });
    expect(f.db.findById('documents', own.body.id, f.userId)).toBeFalsy();
    expect(f.db.findById('documents', shared.body.id, f.userId)).toMatchObject({ assetId: f.assetId, transactionId: null });
    expect((await f.agent.get(`/api/documents/${shared.body.id}/content`)).status).toBe(200);
  });
});
