const request = require('supertest');
const app = require('../../src/app');
const { setupTestDb, cleanupTestDb } = require('../helpers/setup');

describe('Summary Routes', () => {
  let db;
  let agent;
  let categoryId;

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;

    agent = request.agent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'sum@test.com', password: '123456', nombre: 'Sum User' });

    const catRes = await agent.post('/api/categories').send({ nombre: 'Food', color: '#F00' });
    categoryId = catRes.body.id;

    await agent.post('/api/transactions').send({
      tipo: 'expense', monto: 50, titulo: 'Super', categoryId, fecha: '2024-03-15'
    });
    await agent.post('/api/transactions').send({
      tipo: 'refund', monto: 15, titulo: 'Refund', categoryId, fecha: '2024-03-16'
    });
    await agent.post('/api/transactions').send({
      tipo: 'income', monto: 2500, titulo: 'Salary', fecha: '2024-03-28'
    });
  });

  afterAll(() => {
    cleanupTestDb();
  });

  describe('GET /api/summary', () => {
    it('should return empty summary for month with no data', async () => {
      const res = await agent.get('/api/summary?month=2024-12');
      expect(res.status).toBe(200);
      expect(res.body.ingresos).toBe(0);
      expect(res.body.gastosNetos).toBe(0);
      expect(res.body.ahorro).toBe(0);
    });

    it('should require month parameter', async () => {
      const res = await agent.get('/api/summary');
      expect(res.status).toBe(400);
    });

    it('should require valid month format', async () => {
      const res = await agent.get('/api/summary?month=invalid');
      expect(res.status).toBe(400);
    });

    it('should calculate summary correctly with expenses and refunds', async () => {
      const res = await agent.get('/api/summary?month=2024-03');
      expect(res.body.ingresos).toBe(2500);
      expect(res.body.gastos).toBe(50);
      expect(res.body.reembolsos).toBe(15);
      expect(res.body.gastosNetos).toBe(35);
      expect(res.body.ahorro).toBe(2465);
    });

    it('should report income A/B breakdown and legacy income as B', async () => {
      await agent.post('/api/transactions').send({ tipo: 'income', monto: 100, titulo: 'A income', fecha: '2024-03-10', clasificacion: 'A' });
      await agent.post('/api/transactions').send({ tipo: 'income', monto: 50, titulo: 'Mixed income', fecha: '2024-03-11', clasificacion: 'Mixto', montoA: 20, montoB: 30 });
      const res = await agent.get('/api/summary?month=2024-03');
      expect(res.body.ingresos).toBe(2650);
      expect(res.body.ingresosA).toBe(120);
      expect(res.body.ingresosB).toBe(2530);
      expect(res.body.porcentajeA + res.body.porcentajeB).toBe(100);
    });

    it('should return zero income percentages without non-finite values', async () => {
      const res = await agent.get('/api/summary?month=2024-12');
      expect(res.body.porcentajeA).toBe(0);
      expect(res.body.porcentajeB).toBe(0);
    });

    it('should accumulate IVA across A and Mixto incomes and skip B', async () => {
      await agent.post('/api/transactions').send({ tipo: 'income', monto: 100, titulo: 'IVA A income', fecha: '2025-01-05', clasificacion: 'A', ivaPorcentaje: 21 });
      await agent.post('/api/transactions').send({ tipo: 'income', monto: 100, titulo: 'IVA Mixed income', fecha: '2025-01-06', clasificacion: 'Mixto', montoA: 40, montoB: 60, ivaPorcentaje: 10.5 });
      await agent.post('/api/transactions').send({ tipo: 'income', monto: 50, titulo: 'IVA B income', fecha: '2025-01-07', clasificacion: 'B', ivaPorcentaje: 21 });

      const res = await agent.get('/api/summary?month=2025-01');
      expect(res.body.ivaAcumulado).toBe(25.2);
    });

    it('should round accumulated IVA to cents', async () => {
      await agent.post('/api/transactions').send({ tipo: 'income', monto: 33.33, titulo: 'IVA rounding', fecha: '2025-02-05', clasificacion: 'A', ivaPorcentaje: 9 });

      const res = await agent.get('/api/summary?month=2025-02');
      expect(res.body.ivaAcumulado).toBe(3);
    });

    it('should return zero IVA for months without income', async () => {
      const res = await agent.get('/api/summary?month=2025-03');
      expect(res.body.ivaAcumulado).toBe(0);
      expect(Number.isNaN(res.body.ivaAcumulado)).toBe(false);
    });

    it('should show negative savings when expenses exceed income', async () => {
      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 3000, titulo: 'Big expense', categoryId, fecha: '2024-04-10'
      });
      await agent.post('/api/transactions').send({
        tipo: 'income', monto: 2500, titulo: 'Salary', fecha: '2024-04-28'
      });

      const res = await agent.get('/api/summary?month=2024-04');
      expect(res.body.ahorro).toBe(-500);
    });

    it('should break down by category', async () => {
      const cat2Res = await agent.post('/api/categories').send({ nombre: 'Transport', color: '#0F0' });
      const cat2Id = cat2Res.body.id;

      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 30, titulo: 'Food', categoryId, fecha: '2024-05-15'
      });
      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 20, titulo: 'Bus', categoryId: cat2Id, fecha: '2024-05-16'
      });

      const res = await agent.get('/api/summary?month=2024-05');
      expect(res.body.porCategoria.length).toBeGreaterThanOrEqual(2);
    });

    it('should not count refunds as income', async () => {
      await agent.post('/api/transactions').send({
        tipo: 'refund', monto: 100, titulo: 'RefundOnly', categoryId, fecha: '2024-06-15'
      });

      const res = await agent.get('/api/summary?month=2024-06');
      expect(res.body.ingresos).toBe(0);
      expect(res.body.gastosNetos).toBe(-100);
      expect(res.body.ahorro).toBe(100);
    });

    it('should include category with parentId in breakdown', async () => {
      const parentRes = await agent.post('/api/categories').send({ nombre: 'SumParent' });
      const childRes = await agent.post('/api/categories').send({
        nombre: 'SumChild', parentId: parentRes.body.id
      });

      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 40, titulo: 'ParentExp', categoryId: parentRes.body.id, fecha: '2024-07-20'
      });
      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 20, titulo: 'ChildExp', categoryId: childRes.body.id, fecha: '2024-07-21'
      });

      const res = await agent.get('/api/summary?month=2024-07');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.porCategoria)).toBe(true);

      const parentCat = res.body.porCategoria.find(c => c.categoryId === parentRes.body.id);
      expect(parentCat).toBeDefined();
      expect(parentCat.neto).toBe(60);
      expect(parentCat.children.length).toBe(1);
      expect(parentCat.children[0].neto).toBe(20);
    });

    it('should include children even when parent has no direct expenses', async () => {
      const parentRes = await agent.post('/api/categories').send({ nombre: 'NoDirectParent' });
      const child1Res = await agent.post('/api/categories').send({
        nombre: 'ChildA', parentId: parentRes.body.id
      });
      const child2Res = await agent.post('/api/categories').send({
        nombre: 'ChildB', parentId: parentRes.body.id
      });

      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 100, titulo: 'ChildA exp', categoryId: child1Res.body.id, fecha: '2024-08-10'
      });
      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 50, titulo: 'ChildB exp', categoryId: child2Res.body.id, fecha: '2024-08-11'
      });

      const res = await agent.get('/api/summary?month=2024-08');
      expect(res.body.gastosNetos).toBe(150);

      const parentCat = res.body.porCategoria.find(c => c.categoryId === parentRes.body.id);
      expect(parentCat).toBeDefined();
      expect(parentCat.neto).toBe(150);
      expect(parentCat.children.length).toBe(2);

      const child1 = parentCat.children.find(c => c.categoryId === child1Res.body.id);
      const child2 = parentCat.children.find(c => c.categoryId === child2Res.body.id);
      expect(child1.neto).toBe(100);
      expect(child2.neto).toBe(50);
    });

    it('should include goal progress in summary', async () => {
      const goalCatRes = await agent.post('/api/categories').send({ nombre: 'GoalCat', color: '#00F' });

      await agent.post('/api/goals').send({
        tipo: 'ahorro_mensual', modo: 'monto_fijo', montoFijo: 500, meses: ['2024-11']
      });
      await agent.post('/api/goals').send({
        tipo: 'gasto_categoria', modo: 'monto_fijo', montoFijo: 200,
        categoryId: goalCatRes.body.id, categoryName: 'GoalCat', meses: ['2024-11']
      });

      await agent.post('/api/transactions').send({
        tipo: 'income', monto: 3000, titulo: 'Salary', fecha: '2024-11-28'
      });
      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 150, titulo: 'Goal expense', categoryId: goalCatRes.body.id, fecha: '2024-11-15'
      });

      const res = await agent.get('/api/summary?month=2024-11');
      expect(Array.isArray(res.body.metas)).toBe(true);
      expect(res.body.metas.length).toBe(2);

      const ahorroMeta = res.body.metas.find(m => m.tipo === 'ahorro_mensual');
      expect(ahorroMeta.meta).toBe(500);
      expect(ahorroMeta.progresoActual).toBe(2850);

      const catMeta = res.body.metas.find(m => m.tipo === 'gasto_categoria');
      expect(catMeta.meta).toBe(200);
      expect(catMeta.progresoActual).toBe(150);
      expect(catMeta.categoryId).toBe(goalCatRes.body.id);
    });
  });

  describe('GET /api/summary/burn-rate', () => {
    it('should require month parameter', async () => {
      const res = await agent.get('/api/summary/burn-rate');
      expect(res.status).toBe(400);
    });

    it('should require valid month format', async () => {
      const res = await agent.get('/api/summary/burn-rate?month=invalid');
      expect(res.status).toBe(400);
    });

    it('should return cumulative spending for current month', async () => {
      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 100, titulo: 'Day5', categoryId, fecha: '2024-09-05'
      });
      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 50, titulo: 'Day8', categoryId, fecha: '2024-09-08'
      });
      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 30, titulo: 'Day8b', categoryId, fecha: '2024-09-08'
      });

      const res = await agent.get('/api/summary/burn-rate?month=2024-09&compare=1');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.currentMonth)).toBe(true);
      expect(res.body.currentMonth.length).toBeGreaterThan(0);

      const day5 = res.body.currentMonth.find(d => d.day === 5);
      expect(day5.cumulative).toBe(100);

      const day8 = res.body.currentMonth.find(d => d.day === 8);
      expect(day8.cumulative).toBe(180);

      const day6 = res.body.currentMonth.find(d => d.day === 6);
      expect(day6.cumulative).toBe(100);
    });

    it('should include recurring instances in burn rate', async () => {
      const recurring = await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 200, titulo: 'Recurring Rent', categoryId,
        fecha: '2024-10-01', recurrente: true, frecuencia: 'monthly'
      });
      await agent.post(`/api/transactions/${recurring.body.id}/occurrences/2024-10-01/post`).send({});

      const res = await agent.get('/api/summary/burn-rate?month=2024-10&compare=1');
      expect(res.status).toBe(200);
      const day1 = res.body.currentMonth.find(d => d.day === 1);
      expect(day1.cumulative).toBe(200);
    });

    it('should keep an unposted future recurring occurrence out of monthly totals', async () => {
      const response = await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 200, titulo: 'Scheduled Rent', categoryId,
        fecha: '2030-10-01', recurrente: true, frecuencia: 'monthly'
      });
      expect(response.status).toBe(201);
      const summary = await agent.get('/api/summary?month=2030-10');
      expect(summary.body.gastos).toBe(0);
      expect(summary.body.gastosNetos).toBe(0);
    });

    it('should return empty currentMonth when no expenses', async () => {
      const res = await agent.get('/api/summary/burn-rate?month=2024-01&compare=1');
      expect(res.status).toBe(200);
      expect(res.body.currentMonth).toEqual([]);
    });

    it('should compare with previous month when compare=1', async () => {
      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 100, titulo: 'PrevMonth', categoryId, fecha: '2024-06-05'
      });

      const res = await agent.get('/api/summary/burn-rate?month=2024-07&compare=1');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.historical)).toBe(true);
      expect(res.body.indicator).toHaveProperty('text');
      expect(res.body.indicator).toHaveProperty('percentage');
      expect(res.body.indicator).toHaveProperty('direction');
    });

    it('should average multiple months when compare=3', async () => {
      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 60, titulo: 'M1', categoryId, fecha: '2024-03-10'
      });
      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 90, titulo: 'M2', categoryId, fecha: '2024-04-10'
      });
      await agent.post('/api/transactions').send({
        tipo: 'expense', monto: 120, titulo: 'M3', categoryId, fecha: '2024-05-10'
      });

      const res = await agent.get('/api/summary/burn-rate?month=2024-06&compare=3');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.historical)).toBe(true);
      expect(res.body.historical.length).toBeGreaterThan(0);
    });

    it('should handle invalid compare parameter', async () => {
      const res = await agent.get('/api/summary/burn-rate?month=2024-09&compare=99');
      expect(res.status).toBe(400);
    });
  });
});
