const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');
const { loadBrowser } = require('../helpers/fake-dom');

describe('Obligation provider name', () => {
  let agent;

  beforeAll(async () => {
    app.locals.db = setupTestDb();
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: `provider-name-${Date.now()}@example.com`, password: '123456', nombre: 'Prov' });
  });

  afterAll(() => cleanupTestDb());

  it('returns the provider name when an obligation is created, read and listed', async () => {
    const provider = (await agent.post('/api/owners').send({ name: 'Aguas SA', kind: 'person', firstName: 'Aguas', lastName: 'SA', roles: ['provider'] })).body;
    const created = await agent.post('/api/obligations').send({ title: 'Agua', type: 'utility', providerEntityId: provider.id, currencyCode: 'ARS', estimatedAmount: 100, startDate: '2026-11-01' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ providerEntityId: provider.id, providerName: provider.name });
    expect((await agent.get(`/api/obligations/${created.body.id}`)).body.providerName).toBe(provider.name);
    const none = await agent.post('/api/obligations').send({ title: 'Varios', type: 'utility', currencyCode: 'ARS', estimatedAmount: 10, startDate: '2026-11-01' });
    expect(none.body.providerName).toBeNull();
  });

  it('shows the provider on the stacked "Nueva" line even without providerName', () => {
    const { AssetsPage } = loadBrowser(['js/pages/assets.js'], ['AssetsPage'], {});
    AssetsPage.owners = [{ id: 'p1', name: 'Aguas SA' }];
    expect(AssetsPage.obligationLine({ title: 'Agua', providerEntityId: 'p1' })).toBe('Aguas SA - Agua');
    expect(AssetsPage.obligationLine({ title: 'Agua', providerName: 'Otro', providerEntityId: 'p1' })).toBe('Otro - Agua');
    expect(AssetsPage.obligationLine({ title: 'Agua' })).toBe('Sin proveedor - Agua');
  });
});
