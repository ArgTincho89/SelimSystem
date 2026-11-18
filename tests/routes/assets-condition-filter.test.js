const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('GET /api/assets condition filter', () => {
  let db;
  let agent;
  let userId;
  let counter = 0;

  beforeEach(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    counter += 1;
    userId = (await agent.post('/api/auth/register').send({ email: `asset-cond-${counter}@example.com`, password: '123456', nombre: 'Asset User' })).body.id;
  });

  afterEach(() => cleanupTestDb());

  it('returns rented assets for Alquilado and every other asset for No alquilado', async () => {
    db.create('assets', { name: 'Rented', type: 'immovable', condition: 'rented', status: 'active' }, userId);
    db.create('assets', { name: 'Free', type: 'immovable', condition: 'not_rented', status: 'active' }, userId);
    db.create('assets', { name: 'Usufruct', type: 'immovable', condition: 'usufruct', status: 'active' }, userId);
    db.create('assets', { name: 'Car', type: 'movable', status: 'active' }, userId);
    const names = async query => (await agent.get(`/api/assets?${query}`)).body.map(item => item.name).sort();
    expect(await names('condition=rented')).toEqual(['Rented']);
    expect(await names('condition=not_rented')).toEqual(['Car', 'Free', 'Usufruct']);
    expect(await names('type=immovable&condition=not_rented')).toEqual(['Free', 'Usufruct']);
  });
});
