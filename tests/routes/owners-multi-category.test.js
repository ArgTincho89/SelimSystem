const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');
const { loadBrowser } = require('../helpers/fake-dom');

describe('Provider with several expense categories', () => {
  let agent;
  let c1;
  let c2;

  beforeEach(async () => {
    app.locals.db = setupTestDb();
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: `multi-cat-${Date.now()}@example.com`, password: '123456', nombre: 'Multi' });
    c1 = (await agent.post('/api/categories').send({ nombre: 'Servicios', color: '#111111' })).body.id;
    c2 = (await agent.post('/api/categories').send({ nombre: 'Mantenimiento', color: '#222222' })).body.id;
  });

  afterEach(() => cleanupTestDb());

  it('stores several categories, mirrors the first one and dedupes', async () => {
    const created = await agent.post('/api/owners').send({ kind: 'entity', name: 'Edesur', roles: ['provider'], expenseCategoryIds: [c2, c1, c2] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ expenseCategoryIds: [c2, c1], expenseCategoryId: c2 });
    const updated = await agent.put(`/api/owners/${created.body.id}`).send({ expenseCategoryIds: [c1] });
    expect(updated.body).toMatchObject({ expenseCategoryIds: [c1], expenseCategoryId: c1 });
    const renamed = await agent.put(`/api/owners/${created.body.id}`).send({ name: 'Edesur SA' });
    expect(renamed.body).toMatchObject({ expenseCategoryIds: [c1], expenseCategoryId: c1 });
    const cleared = await agent.put(`/api/owners/${created.body.id}`).send({ expenseCategoryIds: [] });
    expect(cleared.body).toMatchObject({ expenseCategoryIds: [], expenseCategoryId: null });
  });

  it('keeps accepting the legacy single category', async () => {
    const created = await agent.post('/api/owners').send({ kind: 'entity', name: 'Muni', roles: ['provider'], expenseCategoryId: c1 });
    expect(created.body).toMatchObject({ expenseCategoryIds: [c1], expenseCategoryId: c1 });
    const cleared = await agent.put(`/api/owners/${created.body.id}`).send({ expenseCategoryIds: null });
    expect(cleared.body).toMatchObject({ expenseCategoryIds: [], expenseCategoryId: null });
  });

  it.each([
    [{ roles: ['provider'], expenseCategoryIds: 'x' }, 'no es válida'],
    [{ roles: ['provider'], expenseCategoryIds: [''] }, 'no es válida'],
    [{ roles: ['provider'], expenseCategoryIds: ['missing'] }, 'no existe'],
    [{ roles: ['owner'], expenseCategoryIds: ['__c1__'] }, 'solo aplica a proveedores']
  ])('rejects %p', async (body, message) => {
    const payload = { kind: 'entity', name: 'Bad', ...body };
    if (Array.isArray(payload.expenseCategoryIds)) payload.expenseCategoryIds = payload.expenseCategoryIds.map(id => (id === '__c1__' ? c1 : id));
    const res = await agent.post('/api/owners').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(message);
  });

  it('shows every category on the provider card and requires at least one in the form', () => {
    const { EntitiesPage } = loadBrowser(['js/pages/entities.js'], ['EntitiesPage'], {});
    expect(EntitiesPage.entityCategoryIds({ expenseCategoryIds: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(EntitiesPage.entityCategoryIds({ expenseCategoryId: 'a' })).toEqual(['a']);
    expect(EntitiesPage.entityCategoryIds(null)).toEqual([]);
    const values = { kind: 'entity', roles: ['provider'], firstName: '', lastName: '', dni: '', businessName: 'Edesur', taxId: '', email: '', phone: '', address: '', notes: '' };
    const payload = EntitiesPage.buildPayload({ ...values, categoryIds: ['a', 'b'] });
    expect(payload.expenseCategoryIds).toEqual(['a', 'b']);
    expect(EntitiesPage.validate(payload)).toBeNull();
    expect(EntitiesPage.validate(EntitiesPage.buildPayload({ ...values, categoryIds: [] }))).toBe('Elegí al menos una categoría de gasto para el proveedor');
  });
});
