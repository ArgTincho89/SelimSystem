const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Goals Routes', () => {
  let db;
  let agent;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;

    agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'goals@test.com', password: '123456', nombre: 'Goals User' });
  });

  afterAll(() => {
    cleanupTestDb();
  });

  describe('POST /api/goals', () => {
    it('should create a monto_fijo goal', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual',
        modo: 'monto_fijo',
        montoFijo: 500,
        meses: ['2026-07']
      });
      expect(res.status).toBe(201);
      expect(res.body.tipo).toBe('ahorro_mensual');
      expect(res.body.modo).toBe('monto_fijo');
      expect(res.body.montoFijo).toBe(500);
      expect(res.body.meses).toEqual(['2026-07']);
      expect(res.body).toHaveProperty('id');
    });

    it('should create a porcentaje_salario goal', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual',
        modo: 'porcentaje_salario',
        porcentaje: 15,
        salarioEstimado: 3000,
        meses: ['2026-08']
      });
      expect(res.status).toBe(201);
      expect(res.body.modo).toBe('porcentaje_salario');
      expect(res.body.porcentaje).toBe(15);
      expect(res.body.salarioEstimado).toBe(3000);
    });

    it('should create a porcentaje_ingresos_dinamico goal', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual',
        modo: 'porcentaje_ingresos_dinamico',
        porcentaje: 20,
        meses: ['2026-09']
      });
      expect(res.status).toBe(201);
      expect(res.body.modo).toBe('porcentaje_ingresos_dinamico');
      expect(res.body.porcentaje).toBe(20);
      expect(res.body.montoFijo).toBeUndefined();
      expect(res.body.salarioEstimado).toBeUndefined();
    });

    it('should NOT auto-replace goal when creating for same month', async () => {
      await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual',
        modo: 'monto_fijo',
        montoFijo: 300,
        meses: ['2026-10']
      });
      const res = await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual',
        modo: 'monto_fijo',
        montoFijo: 600,
        meses: ['2026-10']
      });
      expect(res.status).toBe(201);
      expect(res.body.montoFijo).toBe(600);

      const list = await agent.get('/api/goals?month=2026-10');
      const octGoals = list.body.filter(g => g.meses.includes('2026-10'));
      expect(octGoals).toHaveLength(2);
    });

    it('should reject missing tipo', async () => {
      const res = await agent.post('/api/goals').send({ modo: 'monto_fijo', montoFijo: 100, meses: ['2026-07'] });
      expect(res.status).toBe(400);
    });

    it('should reject invalid modo', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual', modo: 'invalido', meses: ['2026-07']
      });
      expect(res.status).toBe(400);
    });

    it('should reject monto_fijo without montoFijo', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual', modo: 'monto_fijo', meses: ['2026-07']
      });
      expect(res.status).toBe(400);
    });

    it('should reject porcentaje_salario without salarioEstimado', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual', modo: 'porcentaje_salario', porcentaje: 15, meses: ['2026-07']
      });
      expect(res.status).toBe(400);
    });

    it('should reject porcentaje out of range', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual', modo: 'porcentaje_salario', porcentaje: 150, salarioEstimado: 3000, meses: ['2026-07']
      });
      expect(res.status).toBe(400);
    });

    it('should reject empty meses', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual', modo: 'monto_fijo', montoFijo: 500, meses: []
      });
      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app).post('/api/goals').send({
        tipo: 'ahorro_mensual', modo: 'monto_fijo', montoFijo: 500, meses: ['2026-07']
      });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/goals - gasto_categoria', () => {
    let catId;

    beforeAll(async () => {
      const catRes = await agent.post('/api/categories').send({ nombre: 'Salidas', color: '#FF0000' });
      catId = catRes.body.id;
    });

    it('should create a gasto_categoria goal with monto_fijo', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'gasto_categoria',
        modo: 'monto_fijo',
        montoFijo: 200,
        categoryId: catId,
        categoryName: 'Salidas',
        meses: ['2026-07']
      });
      expect(res.status).toBe(201);
      expect(res.body.tipo).toBe('gasto_categoria');
      expect(res.body.categoryId).toBe(catId);
      expect(res.body.categoryName).toBe('Salidas');
      expect(res.body.montoFijo).toBe(200);
    });

    it('should create a gasto_categoria goal with porcentaje_salario', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'gasto_categoria',
        modo: 'porcentaje_salario',
        porcentaje: 10,
        salarioEstimado: 3000,
        categoryId: catId,
        categoryName: 'Salidas',
        meses: ['2026-08']
      });
      expect(res.status).toBe(201);
      expect(res.body.modo).toBe('porcentaje_salario');
      expect(res.body.porcentaje).toBe(10);
    });

    it('should reject gasto_categoria without categoryId', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'gasto_categoria',
        modo: 'monto_fijo',
        montoFijo: 200,
        meses: ['2026-07']
      });
      expect(res.status).toBe(400);
    });

    it('should reject gasto_categoria with non-existent categoryId', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'gasto_categoria',
        modo: 'monto_fijo',
        montoFijo: 200,
        categoryId: 'non-existent',
        meses: ['2026-07']
      });
      expect(res.status).toBe(400);
    });

    it('should allow ahorro_mensual and gasto_categoria in same month', async () => {
      await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual',
        modo: 'monto_fijo',
        montoFijo: 500,
        meses: ['2026-12']
      });
      const res = await agent.post('/api/goals').send({
        tipo: 'gasto_categoria',
        modo: 'monto_fijo',
        montoFijo: 200,
        categoryId: catId,
        categoryName: 'Salidas',
        meses: ['2026-12']
      });
      expect(res.status).toBe(201);

      const list = await agent.get('/api/goals?month=2026-12');
      expect(list.body).toHaveLength(2);
      const tipos = list.body.map(g => g.tipo).sort();
      expect(tipos).toEqual(['ahorro_mensual', 'gasto_categoria']);
    });

    it('should allow multiple gasto_categoria for different categories in same month', async () => {
      const cat2 = await agent.post('/api/categories').send({ nombre: 'Transporte', color: '#00FF00' });
      await agent.post('/api/goals').send({
        tipo: 'gasto_categoria',
        modo: 'monto_fijo',
        montoFijo: 200,
        categoryId: catId,
        categoryName: 'Salidas',
        meses: ['2026-11']
      });
      const res = await agent.post('/api/goals').send({
        tipo: 'gasto_categoria',
        modo: 'monto_fijo',
        montoFijo: 100,
        categoryId: cat2.body.id,
        categoryName: 'Transporte',
        meses: ['2026-11']
      });
      expect(res.status).toBe(201);

      const list = await agent.get('/api/goals?month=2026-11');
      expect(list.body).toHaveLength(2);
    });
  });

  describe('POST /api/goals - gasto_general', () => {
    it('should create a gasto_general goal with monto_fijo', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'gasto_general',
        modo: 'monto_fijo',
        montoFijo: 1200,
        meses: ['2026-07']
      });
      expect(res.status).toBe(201);
      expect(res.body.tipo).toBe('gasto_general');
      expect(res.body.montoFijo).toBe(1200);
      expect(res.body).not.toHaveProperty('categoryId');
    });

    it('should create a gasto_general goal with porcentaje_salario', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'gasto_general',
        modo: 'porcentaje_salario',
        porcentaje: 80,
        salarioEstimado: 3000,
        meses: ['2026-08']
      });
      expect(res.status).toBe(201);
      expect(res.body.tipo).toBe('gasto_general');
      expect(res.body.porcentaje).toBe(80);
      expect(res.body.salarioEstimado).toBe(3000);
    });

    it('should create a gasto_general goal with porcentaje_ingresos_dinamico', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'gasto_general',
        modo: 'porcentaje_ingresos_dinamico',
        porcentaje: 90,
        meses: ['2026-09']
      });
      expect(res.status).toBe(201);
      expect(res.body.tipo).toBe('gasto_general');
      expect(res.body.porcentaje).toBe(90);
    });

    it('should NOT require categoryId for gasto_general', async () => {
      const res = await agent.post('/api/goals').send({
        tipo: 'gasto_general',
        modo: 'monto_fijo',
        montoFijo: 1000,
        meses: ['2026-10']
      });
      expect(res.status).toBe(201);
      expect(res.body.categoryId).toBeUndefined();
    });

    it('should allow gasto_general alongside ahorro_mensual and gasto_categoria', async () => {
      const catRes = await agent.post('/api/categories').send({ nombre: 'TestCat2', color: '#000' });
      await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual',
        modo: 'monto_fijo',
        montoFijo: 500,
        meses: ['2029-06']
      });
      await agent.post('/api/goals').send({
        tipo: 'gasto_categoria',
        modo: 'monto_fijo',
        montoFijo: 200,
        categoryId: catRes.body.id,
        categoryName: 'TestCat2',
        meses: ['2029-06']
      });
      const res = await agent.post('/api/goals').send({
        tipo: 'gasto_general',
        modo: 'monto_fijo',
        montoFijo: 1500,
        meses: ['2029-06']
      });
      expect(res.status).toBe(201);

      const list = await agent.get('/api/goals?month=2029-06');
      const generalGoals = list.body.filter(g => g.meses.includes('2029-06'));
      const tipos = generalGoals.map(g => g.tipo).sort();
      expect(tipos).toContain('gasto_general');
      expect(tipos).toContain('ahorro_mensual');
      expect(tipos).toContain('gasto_categoria');
    });
  });

  describe('POST /api/goals - coexistence (no auto-replace)', () => {
    it('should NOT auto-replace ahorro_mensual for overlapping months', async () => {
      await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual',
        modo: 'monto_fijo',
        montoFijo: 300,
        meses: ['2027-01']
      });
      await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual',
        modo: 'monto_fijo',
        montoFijo: 600,
        meses: ['2027-01']
      });

      const list = await agent.get('/api/goals?month=2027-01');
      const ahorroGoals = list.body.filter(g => g.tipo === 'ahorro_mensual');
      expect(ahorroGoals).toHaveLength(2);
    });
  });

  describe('GET /api/goals', () => {
    it('should list all goals', async () => {
      const res = await agent.get('/api/goals');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should filter goals by month', async () => {
      const res = await agent.get('/api/goals?month=2026-07');
      expect(res.status).toBe(200);
      res.body.forEach(g => {
        expect(g.meses).toContain('2026-07');
      });
    });

    it('should return empty array for month with no goals', async () => {
      const res = await agent.get('/api/goals?month=2030-01');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('DELETE /api/goals/:id', () => {
    it('should delete a goal', async () => {
      const create = await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual', modo: 'monto_fijo', montoFijo: 100, meses: ['2026-11']
      });
      const res = await agent.delete(`/api/goals/${create.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should return 404 for non-existent goal', async () => {
      const res = await agent.delete('/api/goals/non-existent-id');
      expect(res.status).toBe(404);
    });
  });
});
