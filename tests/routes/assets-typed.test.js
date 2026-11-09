const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Typed asset fields', () => {
  let agent;
  let db;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'typed@test.example', password: '123456', nombre: 'Typed' });
  });

  afterAll(() => cleanupTestDb());

  const immovable = extra => ({ type: 'immovable', name: 'Casa Alta Gracia', ...extra });

  it('persists movable fields with defaults and uppercase plate', async () => {
    const res = await agent.post('/api/assets').send({ type: 'movable', name: 'Auto', brand: ' Fiat ', plate: 'ab123cd', mileage: '45000', color: 'Rojo', notes: 'Service pendiente' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ vehicleType: 'automovil', brand: 'Fiat', plate: 'AB123CD', mileage: '45000', color: 'Rojo', notes: 'Service pendiente', name: 'Auto' });
    expect((await agent.post('/api/assets').send({ type: 'movable', name: 'X', vehicleType: 'moto' })).status).toBe(400);
    expect((await agent.post('/api/assets').send({ type: 'movable', name: 'X', brand: 'b'.repeat(81) })).status).toBe(400);
  });

  it('persists immovable fields and notes', async () => {
    const res = await agent.post('/api/assets').send(immovable({
      propertyKind: 'casa', characteristics: '3 dormitorios', location: 'l'.repeat(300), coveredAreaM2: 80, freeAreaM2: 0, ageYears: 12, condition: 'rented', notes: 'Llaves en porteria'
    }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ propertyKind: 'casa', characteristics: '3 dormitorios', coveredAreaM2: 80, freeAreaM2: 0, ageYears: 12, condition: 'rented', usageStatus: 'rented', notes: 'Llaves en porteria' });
    const read = await agent.get(`/api/assets/${res.body.id}`);
    expect(read.body.freeAreaM2).toBe(0);
    expect((await agent.post('/api/assets').send(immovable({ location: 'l'.repeat(301) }))).status).toBe(400);
  });

  it('rejects decimal, negative or oversized numbers and bad enums', async () => {
    for (const extra of [{ coveredAreaM2: 45.5 }, { freeAreaM2: -1 }, { ageYears: -1 }, { ageYears: 501 }, { ageYears: '3' }, { propertyKind: 'castillo' }, { condition: 'sold' }]) {
      expect((await agent.post('/api/assets').send(immovable(extra))).status).toBe(400);
    }
  });

  it('defaults condition and syncs usageStatus', async () => {
    const plain = await agent.post('/api/assets').send(immovable({}));
    expect(plain.body).toMatchObject({ condition: 'not_rented', propertyKind: null, coveredAreaM2: null });
    const legacy = await agent.post('/api/assets').send(immovable({ propertyType: 'Apartment', usageStatus: 'rented' }));
    expect(legacy.status).toBe(201);
    expect(legacy.body).toMatchObject({ propertyType: 'Apartment', condition: 'rented', usageStatus: 'rented' });
    const freed = await agent.put(`/api/assets/${legacy.body.id}`).send({ condition: 'not_rented' });
    expect(freed.body).toMatchObject({ condition: 'not_rented', usageStatus: 'vacant' });
    const usufruct = await agent.put(`/api/assets/${freed.body.id}`).send({ condition: 'usufruct' });
    expect(usufruct.body).toMatchObject({ condition: 'usufruct', usageStatus: 'rented' });
  });

  it('searches by plate and brand and filters by condition and kind', async () => {
    const plate = await agent.get('/api/assets').query({ q: 'ab123' });
    expect(plate.body.map(a => a.name)).toEqual(['Auto']);
    expect((await agent.get('/api/assets').query({ q: 'fiat' })).body).toHaveLength(1);
    const rented = await agent.get('/api/assets').query({ condition: 'rented' });
    expect(rented.body.length).toBeGreaterThan(0);
    expect(rented.body.every(a => a.condition === 'rented')).toBe(true);
    const kind = await agent.get('/api/assets').query({ propertyKind: 'casa' });
    expect(kind.body.map(a => a.name)).toEqual(['Casa Alta Gracia']);
  });
});
