const fs = require('fs');
const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const { MAX_FILE_SIZE } = require('../../src/routes/documents');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

describe('Phase 2 wealth records', () => {
  let db;
  let storage;
  let agent;
  let otherAgent;
  let assetId;
  let entityId;

  beforeAll(async () => {
    db = setupTestDb();
    storage = new DiskDocumentStorage(TEMP_DATA_DIR);
    app.locals.db = db;
    app.locals.documentStorage = storage;
    agent = request.agent(app);
    otherAgent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'wealth-phase2@test.com', password: '123456', nombre: 'Phase Two User' });
    await otherAgent.post('/api/auth/register').send({ email: 'wealth-other@test.com', password: '123456', nombre: 'Other User' });
    const entity = await agent.post('/api/owners').send({ name: 'North LLC', kind: 'entity', roles: ['owner', 'provider'], email: 'office@example.test', phone: '+100000000', address: '1 Example Street', taxIdentification: 'TAX-123' });
    entityId = entity.body.id;
    const asset = await agent.post('/api/assets').send({ type: 'movable', name: 'Camera', ownerships: [{ ownerId: entityId, startDate: '2024-01-01' }] });
    assetId = asset.body.id;
  });

  afterAll(() => cleanupTestDb());

  it('requires authentication for document and dated-note APIs', async () => {
    expect((await request(app).get('/api/documents').query({ assetId })).status).toBe(401);
    expect((await request(app).post('/api/documents')).status).toBe(401);
    expect((await request(app).get('/api/notes').query({ targetType: 'asset', targetId: assetId })).status).toBe(401);
    expect((await request(app).post('/api/notes').send({})).status).toBe(401);
  });

  it('stores roles and optional contact fields while preserving the legacy owner ID', async () => {
    expect(entityId).toMatch(/^[0-9a-f-]{36}$/i);
    const listed = await agent.get('/api/owners');
    const entity = listed.body.find(item => item.id === entityId);
    expect(entity.roles).toEqual(['owner', 'provider']);
    expect(entity.email).toBe('office@example.test');
    expect(entity.taxIdentification).toBe('TAX-123');

    const updated = await agent.put(`/api/owners/${entityId}`).send({ roles: ['tenant'], phone: '+199999999' });
    expect(updated.status).toBe(200);
    expect(updated.body.id).toBe(entityId);
    expect(updated.body.roles).toEqual(['tenant']);
    expect((await agent.post('/api/assets').send({ type: 'movable', name: 'Rejected link', ownerships: [{ ownerId: entityId }] })).status).toBe(400);
    expect((await otherAgent.get(`/api/owners/${entityId}`)).status).toBe(404);
  });

  it('keeps legacy owner records compatible with owner role responses', async () => {
    const legacy = db.create('legalOwners', { name: 'Legacy Owner', kind: 'person', notes: '' }, db.findUserByName('Phase Two User').id);
    const response = await agent.get('/api/owners');
    expect(response.body.find(item => item.id === legacy.id).roles).toEqual(['owner']);
  });

  it('creates dated asset and entity notes with a safe author label and enforces user scope', async () => {
    const assetNote = await agent.post('/api/notes').send({ targetType: 'asset', targetId: assetId, date: '2025-03-04', content: 'Service record' });
    expect(assetNote.status).toBe(201);
    expect(assetNote.body.date).toBe('2025-03-04');
    expect(assetNote.body.author).toBe('Phase Two User');
    expect(assetNote.body).not.toHaveProperty('session');
    const entityNote = await agent.post('/api/notes').send({ targetType: 'entity', targetId: entityId, content: 'Contact confirmed' });
    expect(entityNote.status).toBe(201);
    expect((await agent.get('/api/notes').query({ targetType: 'entity', targetId: entityId })).body[0].content).toBe('Contact confirmed');
    expect((await otherAgent.get('/api/notes').query({ targetType: 'asset', targetId: assetId })).status).toBe(400);
    expect((await agent.post('/api/notes').send({ targetType: 'asset', targetId: 'foreign-id', content: 'No access' })).status).toBe(400);
    expect((await agent.post('/api/notes').send({ targetType: 'asset', targetId: assetId, date: '2025-02-30', content: 'Invalid date' })).status).toBe(400);
  });

  it('authenticates, scopes, validates and safely serves supported document content', async () => {
    const text = await agent.post('/api/documents').field('assetId', assetId).attach('file', Buffer.from('A dated maintenance note.\n', 'utf8'), { filename: 'maintenance.txt', contentType: 'application/octet-stream' });
    expect(text.status).toBe(201);
    expect(text.body.contentType).toBe('text/plain; charset=utf-8');
    expect(text.body).not.toHaveProperty('storageKey');
    expect(JSON.stringify(text.body)).not.toContain(TEMP_DATA_DIR);
    const content = await agent.get(`/api/documents/${text.body.id}/content`);
    expect(content.status).toBe(200);
    expect(content.text).toBe('A dated maintenance note.\n');
    expect(content.headers['x-content-type-options']).toBe('nosniff');
    expect(content.headers['cache-control']).toBe('private, no-store');
    expect(content.headers['content-security-policy']).toContain('sandbox');
    expect(content.headers['content-disposition']).toContain('inline');
    expect((await agent.get(`/api/documents/${text.body.id}/content?download=1`)).headers['content-disposition']).toContain('attachment');
    expect((await agent.get('/api/documents').query({ assetId })).body.map(item => item.id)).toContain(text.body.id);
    expect((await otherAgent.get(`/api/documents/${text.body.id}`)).status).toBe(404);
    expect((await otherAgent.get(`/api/documents/${text.body.id}/content`)).status).toBe(404);

    const entityDocument = await agent.post('/api/documents').field('entityId', entityId).attach('file', Buffer.from('%PDF-1.4\n1 0 obj\n%%EOF', 'ascii'), { filename: 'record.pdf', contentType: 'text/plain' });
    expect(entityDocument.status).toBe(201);
    expect(entityDocument.body.contentType).toBe('application/pdf');
    expect((await agent.get('/api/documents').query({ entityId })).body[0].id).toBe(entityDocument.body.id);

    const signatures = [
      ['png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      ['jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
      ['webp', Buffer.from('RIFF0000WEBP', 'ascii')]
    ];
    for (const [extension, bytes] of signatures) {
      const image = await agent.post('/api/documents').field('assetId', assetId).attach('file', bytes, { filename: `image.${extension}`, contentType: 'text/plain' });
      expect(image.status).toBe(201);
      expect(image.body.contentType).toMatch(/^image\//);
    }
  });

  it('rejects forged signatures, unsupported formats, HTML, SVG and traversal-looking filenames', async () => {
    const badSignature = await agent.post('/api/documents').field('assetId', assetId).attach('file', Buffer.from('<html>no</html>'), { filename: 'forged.pdf', contentType: 'application/pdf' });
    expect(badSignature.status).toBe(415);
    const extensionMismatch = await agent.post('/api/documents').field('assetId', assetId).attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), { filename: 'wrong.pdf' });
    expect(extensionMismatch.status).toBe(415);
    const html = await agent.post('/api/documents').field('assetId', assetId).attach('file', Buffer.from('<!doctype html><script>alert(1)</script>'), { filename: 'page.txt', contentType: 'text/plain' });
    expect(html.status).toBe(415);
    const svg = await agent.post('/api/documents').field('assetId', assetId).attach('file', Buffer.from('<svg><script>alert(1)</script></svg>'), { filename: 'image.svg', contentType: 'image/svg+xml' });
    expect(svg.status).toBe(415);
    const unsupported = await agent.post('/api/documents').field('assetId', assetId).attach('file', Buffer.from('not a zip'), { filename: 'archive.zip', contentType: 'application/zip' });
    expect(unsupported.status).toBe(415);
    const invalidUtf8 = await agent.post('/api/documents').field('assetId', assetId).attach('file', Buffer.from([0xff, 0xfe, 0x61]), { filename: 'invalid.txt' });
    expect(invalidUtf8.status).toBe(415);
    const executable = await agent.post('/api/documents').field('assetId', assetId).attach('file', Buffer.from('MZ\x00\x00not-text'), { filename: 'program.txt' });
    expect(executable.status).toBe(415);
    const text = await agent.post('/api/documents').field('assetId', assetId).attach('file', Buffer.from('safe text'), { filename: '..\\..\\escape.txt', contentType: 'text/plain' });
    expect(text.status).toBe(201);
    expect(text.body.fileName).toBe('escape.txt');
    const files = fs.readdirSync(storage.userDirectory(db.findUserByName('Phase Two User').id));
    expect(files).toHaveLength(6);
    expect(files.every(name => /^[0-9a-f]{48}\.bin$/i.test(name))).toBe(true);
    expect(() => storage.filePath(db.findUserByName('Phase Two User').id, '../users.json')).toThrow('Invalid document key');
  });

  it('rejects requests for another user’s assets or entities', async () => {
    const foreignAsset = await otherAgent.post('/api/assets').send({ type: 'movable', name: 'Private item' });
    const foreignEntity = await otherAgent.post('/api/owners').send({ name: 'Other Company', kind: 'entity' });
    expect((await agent.post('/api/documents').field('assetId', foreignAsset.body.id).attach('file', Buffer.from('safe'), { filename: 'safe.txt' })).status).toBe(400);
    expect((await agent.post('/api/documents').field('entityId', foreignEntity.body.id).attach('file', Buffer.from('safe'), { filename: 'safe.txt' })).status).toBe(400);
    expect((await agent.get('/api/documents').query({ assetId: foreignAsset.body.id })).status).toBe(400);
  });

  it('enforces the 20 MiB upload limit and removes files after metadata-write failures', async () => {
    const tooLarge = await agent.post('/api/documents').field('assetId', assetId).attach('file', Buffer.alloc(MAX_FILE_SIZE + 1, 0x61), { filename: 'large.txt' });
    expect(tooLarge.status).toBe(413);

    const userId = db.findUserByName('Phase Two User').id;
    const directory = storage.ensureUserDirectory(userId);
    const originalFileCount = fs.readdirSync(directory).length;
    const originalWriteFile = db._writeFile;
    db._writeFile = function (filePath, data) {
      if (filePath.endsWith('documents.json')) throw new Error('simulated metadata write failure');
      return originalWriteFile.call(this, filePath, data);
    };
    try {
      const failed = await agent.post('/api/documents').field('assetId', assetId).attach('file', Buffer.from('temporary data'), { filename: 'temporary.txt' });
      expect(failed.status).toBe(500);
      expect(fs.readdirSync(directory)).toHaveLength(originalFileCount);
      expect(db.findAll('documents', userId)).toHaveLength(originalFileCount);
    } finally {
      db._writeFile = originalWriteFile;
    }
  });
});
