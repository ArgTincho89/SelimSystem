const request = require('supertest');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');

describe('Documents: declaration target, uploader and DELETE /api/documents/:id', () => {
  let f;
  let declaration;
  let contractId;
  const upload = (fields, name = 'receipt.txt', agent) => {
    let req = (agent || f.agent).post('/api/documents');
    Object.entries(fields).forEach(([key, value]) => { req = req.field(key, value); });
    return req.attach('file', Buffer.from('receipt'), { filename: name, contentType: 'text/plain' });
  };
  const logs = () => f.db.findAll('activityLogs', f.userId);

  beforeAll(async () => {
    f = await setupRentFixture('doc-declaration');
    declaration = (await f.declare([f.modality('locacion', { ivaPercent: null })])).body;
    contractId = declaration.modalities[0].contractId;
  });
  afterAll(() => cleanupTestDb());

  it('attaches to a declaration, derives the asset and records the uploader', async () => {
    const response = await upload({ declarationId: declaration.id });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ declarationId: declaration.id, assetId: f.assetId, uploadedBy: f.userId });
    expect(response.body.storageKey).toBeUndefined();
    const listed = await f.agent.get('/api/documents').query({ declarationId: declaration.id });
    expect(listed.body.map(item => item.id)).toContain(response.body.id);
  });

  it('rejects unknown, foreign and mismatched declaration targets', async () => {
    expect((await upload({ declarationId: 'missing' })).status).toBe(400);
    expect((await upload({ declarationId: declaration.id }, 'receipt.txt', f.other)).status).toBe(400);
    const otherAsset = (await f.agent.post('/api/assets').send({ type: 'immovable', name: 'Otro' })).body.id;
    expect((await upload({ declarationId: declaration.id, assetId: otherAsset })).status).toBe(400);
    expect((await f.agent.get('/api/documents').query({ declarationId: 'missing' })).status).toBe(400);
  });

  it('lists documents of the contracts and periods with includeRelated=1', async () => {
    const view = (await f.agent.get(`/api/rentals/declarations/${declaration.id}`)).body;
    const occurrence = view.modalities[0].occurrences[0];
    const viaContract = (await upload({ contractId })).body;
    const viaPeriod = (await upload({ rentOccurrenceId: occurrence.id })).body;
    const unrelated = (await upload({ assetId: f.assetId })).body;
    const plain = (await f.agent.get('/api/documents').query({ declarationId: declaration.id })).body.map(item => item.id);
    expect(plain).not.toContain(viaContract.id);
    const related = (await f.agent.get('/api/documents').query({ declarationId: declaration.id, includeRelated: '1' })).body.map(item => item.id);
    expect(related).toEqual(expect.arrayContaining([viaContract.id, viaPeriod.id]));
    expect(related).not.toContain(unrelated.id);
  });

  it('deletes a document: file removed, resolution reference dropped, log entry written', async () => {
    const created = (await upload({ declarationId: declaration.id }, 'to-delete.txt')).body;
    const stored = f.db.findById('documents', created.id, f.userId);
    const resolution = f.db.create('obligationResolutions', { occurrenceId: 'x', obligationId: 'y', status: 'active', documentIds: [created.id, 'keep'], resolvedAt: '2025-01-01' }, f.userId);
    const spy = jest.spyOn(f.app.locals.documentStorage, 'remove');
    const response = await f.agent.delete(`/api/documents/${created.id}`);
    expect(response.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(f.userId, stored.storageKey);
    spy.mockRestore();
    expect(f.db.findById('documents', created.id, f.userId)).toBeFalsy();
    expect(f.db.findById('obligationResolutions', resolution.id, f.userId).documentIds).toEqual(['keep']);
    expect((await f.agent.get(`/api/documents/${created.id}/content`)).status).toBe(404);
    expect(logs().some(entry => entry.action === 'document.delete' && entry.outcome === 'success')).toBe(true);
  });

  it('answers 404 for unknown and foreign documents and 401 without a session', async () => {
    const created = (await upload({ declarationId: declaration.id })).body;
    expect((await f.agent.delete('/api/documents/missing')).status).toBe(404);
    expect((await f.other.delete(`/api/documents/${created.id}`)).status).toBe(404);
    expect((await request(f.app).delete(`/api/documents/${created.id}`)).status).toBe(401);
    expect(f.db.findById('documents', created.id, f.userId)).toBeTruthy();
  });

  it('keeps rendering legacy documents without an uploader', async () => {
    const legacy = f.db.create('documents', { assetId: f.assetId, title: 'old', fileName: 'old.txt', contentType: 'text/plain', size: 1, storageKey: `${'a'.repeat(48)}.bin`, uploadedAt: '2020-01-01T00:00:00.000Z' }, f.userId);
    const listed = (await f.agent.get('/api/documents').query({ assetId: f.assetId })).body.find(item => item.id === legacy.id);
    expect(listed.uploadedBy).toBeUndefined();
  });
});
