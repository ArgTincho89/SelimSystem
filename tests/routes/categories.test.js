const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb, createTestUser, createTestCategory } = require('../helpers/setup');

describe('Categories Routes', () => {
  let db;
  let agent;
  let userId;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;

    agent = request.agent(app);
    const res = await agent
      .post('/api/auth/register')
      .send({ email: 'cat@test.com', password: '123456', nombre: 'Cat User' });
    userId = res.body.id;
  });

  afterAll(() => {
    cleanupTestDb();
  });

  describe('GET /api/categories', () => {
    it('should return empty array initially', async () => {
      const res = await agent.get('/api/categories');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should return categories after creation', async () => {
      await agent.post('/api/categories').send({ nombre: 'Food', color: '#F00' });
      const res = await agent.get('/api/categories');
      expect(res.body.length).toBeGreaterThan(0);
      const food = res.body.find(c => c.nombre === 'Food');
      expect(food).toBeDefined();
    });

    it('should sort categories by orden', async () => {
      await agent.post('/api/categories').send({ nombre: 'ZCat', color: '#00F', orden: 100 });
      const res = await agent.get('/api/categories');
      for (let i = 1; i < res.body.length; i++) {
        expect((res.body[i - 1].orden || 0)).toBeLessThanOrEqual(res.body[i].orden || 0);
      }
    });
  });

  describe('POST /api/categories', () => {
    it('should create a category', async () => {
      const res = await agent.post('/api/categories').send({ nombre: 'Transport', color: '#0F0' });
      expect(res.status).toBe(201);
      expect(res.body.nombre).toBe('Transport');
      expect(res.body).toHaveProperty('id');
    });

    it('should reject empty name', async () => {
      const res = await agent.post('/api/categories').send({ nombre: '' });
      expect(res.status).toBe(400);
    });

    it('should reject whitespace-only name', async () => {
      const res = await agent.post('/api/categories').send({ nombre: '   ' });
      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app).post('/api/categories').send({ nombre: 'X' });
      expect(res.status).toBe(401);
    });

    it('should create with parentId', async () => {
      const parentRes = await agent.post('/api/categories').send({ nombre: 'Parent', color: '#AAA' });
      const childRes = await agent.post('/api/categories').send({
        nombre: 'Child', color: '#BBB', parentId: parentRes.body.id
      });
      expect(childRes.status).toBe(201);
      expect(childRes.body.parentId).toBe(parentRes.body.id);
    });

    it('should reject parentId of non-existent category', async () => {
      const res = await agent.post('/api/categories').send({
        nombre: 'Orphan', parentId: 'nonexistent'
      });
      expect(res.status).toBe(400);
    });

    it('should reject parentId pointing to a child (max 1 level)', async () => {
      const parentRes = await agent.post('/api/categories').send({ nombre: 'Grandparent' });
      const childRes = await agent.post('/api/categories').send({
        nombre: 'Parent2', parentId: parentRes.body.id
      });
      const grandchildRes = await agent.post('/api/categories').send({
        nombre: 'Grandchild', parentId: childRes.body.id
      });
      expect(grandchildRes.status).toBe(400);
    });

    it('should trim category name', async () => {
      const res = await agent.post('/api/categories').send({ nombre: '  Trimmed  ' });
      expect(res.status).toBe(201);
      expect(res.body.nombre).toBe('Trimmed');
    });

    it('should auto-increment orden', async () => {
      const res = await agent.post('/api/categories').send({ nombre: 'AutoOrd' });
      expect(res.status).toBe(201);
      expect(res.body.orden).toBeGreaterThan(0);
    });
  });

  describe('PUT /api/categories/:id', () => {
    it('should update a category', async () => {
      const createRes = await agent.post('/api/categories').send({ nombre: 'Old' });
      const id = createRes.body.id;

      const res = await agent.put(`/api/categories/${id}`).send({ nombre: 'New' });
      expect(res.status).toBe(200);
      expect(res.body.nombre).toBe('New');
    });

    it('should return 404 for non-existent category', async () => {
      const res = await agent.put('/api/categories/nonexistent').send({ nombre: 'X' });
      expect(res.status).toBe(404);
    });

    it('should reject parentId === id (self-reference)', async () => {
      const createRes = await agent.post('/api/categories').send({ nombre: 'SelfRef' });
      const res = await agent.put(`/api/categories/${createRes.body.id}`).send({
        parentId: createRes.body.id
      });
      expect(res.status).toBe(400);
    });

    it('should reject parentId of non-existent category on update', async () => {
      const createRes = await agent.post('/api/categories').send({ nombre: 'NoParent' });
      const res = await agent.put(`/api/categories/${createRes.body.id}`).send({
        parentId: 'nonexistent'
      });
      expect(res.status).toBe(400);
    });

    it('should reject setting parent to a child category', async () => {
      const parentRes = await agent.post('/api/categories').send({ nombre: 'UpdParent' });
      const childRes = await agent.post('/api/categories').send({
        nombre: 'UpdChild', parentId: parentRes.body.id
      });
      const otherRes = await agent.post('/api/categories').send({ nombre: 'UpdOther' });
      const res = await agent.put(`/api/categories/${otherRes.body.id}`).send({
        parentId: childRes.body.id
      });
      expect(res.status).toBe(400);
    });

    it('should update color', async () => {
      const createRes = await agent.post('/api/categories').send({ nombre: 'ColorUpd' });
      const res = await agent.put(`/api/categories/${createRes.body.id}`).send({ color: '#FFF' });
      expect(res.status).toBe(200);
      expect(res.body.color).toBe('#FFF');
    });

    it('should update orden', async () => {
      const createRes = await agent.post('/api/categories').send({ nombre: 'OrdUpd' });
      const res = await agent.put(`/api/categories/${createRes.body.id}`).send({ orden: 999 });
      expect(res.status).toBe(200);
      expect(res.body.orden).toBe(999);
    });

    it('should set parentId to null', async () => {
      const parentRes = await agent.post('/api/categories').send({ nombre: 'ClearParent' });
      const childRes = await agent.post('/api/categories').send({
        nombre: 'ClearChild', parentId: parentRes.body.id
      });
      const res = await agent.put(`/api/categories/${childRes.body.id}`).send({ parentId: null });
      expect(res.status).toBe(200);
      expect(res.body.parentId).toBeNull();
    });
  });

  describe('DELETE /api/categories/:id', () => {
    it('should delete a category without transactions', async () => {
      const createRes = await agent.post('/api/categories').send({ nombre: 'Del' });
      const id = createRes.body.id;

      const res = await agent.delete(`/api/categories/${id}`);
      expect(res.status).toBe(200);

      const listRes = await agent.get('/api/categories');
      const deleted = listRes.body.find(c => c.id === id);
      expect(deleted).toBeUndefined();
    });

    it('should reject deletion if category has transactions', async () => {
      const catRes = await agent.post('/api/categories').send({ nombre: 'Used' });
      const catId = catRes.body.id;

      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 10, titulo: 'Test', categoryId: catId, fecha: '2024-03-15'
      });

      const res = await agent.delete(`/api/categories/${catId}`);
      expect(res.status).toBe(409);
    });

    it('should return 404 for non-existent category', async () => {
      const res = await agent.delete('/api/categories/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/categories/reorder', () => {
    it('should reorder categories', async () => {
      const cat1 = await agent.post('/api/categories').send({ nombre: 'Re1', orden: 1 });
      const cat2 = await agent.post('/api/categories').send({ nombre: 'Re2', orden: 2 });

      const res = await agent.patch('/api/categories/reorder').send({
        orderedIds: [cat2.body.id, cat1.body.id]
      });
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should reject non-array orderedIds', async () => {
      const res = await agent.patch('/api/categories/reorder').send({
        orderedIds: 'not-array'
      });
      expect(res.status).toBe(400);
    });
  });
});
