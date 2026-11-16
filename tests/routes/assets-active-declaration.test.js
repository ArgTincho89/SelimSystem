const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');

describe('GET /api/assets activeDeclarationId', () => {
  let f;
  beforeAll(async () => { f = await setupRentFixture('asset-active-declaration'); });
  afterAll(() => cleanupTestDb());

  const find = async id => (await f.agent.get('/api/assets')).body.find(item => item.id === id);

  it('is null for an immovable without rental and for a movable', async () => {
    expect((await find(f.assetId)).activeDeclarationId).toBeNull();
    const movable = (await f.agent.post('/api/assets').send({ type: 'movable', name: 'Auto' })).body;
    expect((await find(movable.id)).activeDeclarationId).toBeNull();
  });

  it('is the declaration id while at least one modality is active, and null again once it ends', async () => {
    const declaration = (await f.declare([f.modality('locacion'), f.modality('comodato')])).body;
    expect((await find(f.assetId)).activeDeclarationId).toBe(declaration.id);
    expect((await f.agent.post(`/api/rentals/declarations/${declaration.id}/end`).send({ endDate: '2025-02-28' })).status).toBe(200);
    expect((await find(f.assetId)).activeDeclarationId).toBeNull();
  });

  it('is also returned by the single-asset endpoint', async () => {
    const asset = (await f.agent.post('/api/assets').send({ type: 'immovable', name: 'Casa detalle', propertyType: 'Casa' })).body;
    expect((await f.agent.get('/api/assets/' + asset.id)).body.activeDeclarationId).toBeNull();
    const own = (await f.agent.get('/api/assets/' + f.assetId)).body;
    expect(own.activeDeclarationId).toBe(own.declaration ? own.declaration.id : null);
  });

  it('does not infer a rental from the usufruct condition alone', async () => {
    const asset = (await f.agent.post('/api/assets').send({ type: 'immovable', name: 'Casa usufructo', propertyType: 'Casa', condition: 'usufruct', usageStatus: 'rented' })).body;
    const row = await find(asset.id);
    expect(row.condition).toBe('usufruct');
    expect(row.activeDeclarationId).toBeNull();
  });

  it('only exposes the declaration of the authenticated user', async () => {
    const declaration = (await f.declare([f.modality('locacion', { startDate: '2026-01-01', endDate: '2026-12-31' })])).body;
    const others = (await f.other.get('/api/assets')).body;
    expect(JSON.stringify(others)).not.toContain(declaration.id);
  });
});
