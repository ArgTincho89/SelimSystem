const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Asset card order', () => {
  let agent;
  let other;
  const names = () => agent.get('/api/assets').then(res => res.body.map(asset => asset.name));

  beforeEach(async () => {
    app.locals.db = setupTestDb();
    agent = request.agent(app);
    other = request.agent(app);
    const stamp = Date.now();
    await agent.post('/api/auth/register').send({ email: `order-${stamp}@example.com`, password: '123456', nombre: 'Order' });
    await other.post('/api/auth/register').send({ email: `order-other-${stamp}@example.com`, password: '123456', nombre: 'Other' });
    for (const name of ['A', 'B', 'C', 'D']) {
      const created = await agent.post('/api/assets').send({ type: 'immovable', name, propertyType: 'Apartment', usageStatus: 'vacant', propertyKind: name === 'B' || name === 'D' ? 'local' : 'casa' });
      if (created.status !== 201) throw new Error(JSON.stringify(created.body));
    }
  });

  afterEach(() => cleanupTestDb());

  const ids = async () => Object.fromEntries((await agent.get('/api/assets')).body.map(asset => [asset.name, asset.id]));

  it('lists assets in creation order until they are reordered, then persists the new order', async () => {
    expect(await names()).toEqual(['A', 'B', 'C', 'D']);
    const map = await ids();
    const res = await agent.put('/api/assets/order').send({ ids: [map.D, map.A, map.C, map.B] });
    expect(res.status).toBe(200);
    expect(await names()).toEqual(['D', 'A', 'C', 'B']);
    await agent.post('/api/assets').send({ type: 'immovable', name: 'E', propertyType: 'Apartment', usageStatus: 'vacant' });
    expect(await names()).toEqual(['D', 'A', 'C', 'B', 'E']);
  });

  it('reorders a filtered subset inside the slots it occupies', async () => {
    const map = await ids();
    const filtered = (await agent.get('/api/assets?propertyKind=local')).body.map(asset => asset.name);
    expect(filtered).toEqual(['B', 'D']);
    await agent.put('/api/assets/order').send({ ids: [map.D, map.B] });
    expect(await names()).toEqual(['A', 'D', 'C', 'B']);
  });

  it.each([
    [{}, 400],
    [{ ids: [] }, 400],
    [{ ids: ['x', 'x'] }, 400],
    [{ ids: [1] }, 400],
    [{ ids: ['missing'] }, 400]
  ])('rejects invalid payload %p', async (body, status) => {
    expect((await agent.put('/api/assets/order').send(body)).status).toBe(status);
  });

  it('does not let another user reorder these assets', async () => {
    const map = await ids();
    expect((await other.put('/api/assets/order').send({ ids: [map.B, map.A] })).status).toBe(400);
    expect(await names()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('wires a drag handle with pointer and keyboard reordering on the Bienes cards', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../public/js/pages/assets.js'), 'utf8');
    expect(source).toContain("className: 'asset-drag-handle'");
    expect(source).toContain('this.enableReorder(list);');
    expect(source).toMatch(/on\(list, 'pointerdown'/);
    expect(source).toMatch(/on\(list, 'pointermove'/);
    expect(source).toMatch(/event.key !== 'ArrowUp' && event.key !== 'ArrowDown'/);
    expect(fs.readFileSync(path.join(__dirname, '../../public/js/api.js'), 'utf8')).toContain("reorder(ids) { return API.put('/assets/order', { ids }); }");
    expect(fs.readFileSync(path.join(__dirname, '../../public/css/pages.css'), 'utf8')).toMatch(/\.asset-drag-handle \{[^}]*touch-action: none/);
  });
});
