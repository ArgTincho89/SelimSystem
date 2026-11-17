const request = require('supertest');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const ledger = require('../../src/services/account-ledger');

describe('GET /api/rentals/declarations/:id/periods', () => {
  let f;
  let declaration;
  let payAccountId;
  let categoryId;
  const today = () => ledger.localDateForUser(f.db, f.userId);
  const plusMonths = (date, count) => { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCMonth(value.getUTCMonth() + count); return value.toISOString().slice(0, 10); };
  const periods = (id, query = {}) => f.agent.get(`/api/rentals/declarations/${id}/periods`).query(query);
  const march = body => body.find(period => period.period === '2025-03');
  const collect = (key, occurrence, date = '2025-03-02') => f.agent.post('/api/rentals/collections/month').send({
    idempotencyKey: key, lines: [{ occurrenceId: occurrence.id, amount: occurrence.rentMinor / 100, accountId: f.accountId, date }]
  });
  const occurrence = (kind, date) => declaration.modalities.find(item => item.kind === kind).occurrences.find(item => item.date === date);

  beforeAll(async () => {
    f = await setupRentFixture('rental-periods-route');
    payAccountId = (await f.agent.post('/api/accounts').send({ name: 'Pagos', currency: 'ARS', initialBalance: 10000 })).body.id;
    categoryId = (await f.agent.post('/api/categories').send({ nombre: 'Impuestos' })).body.id;
    declaration = (await f.declare([f.modality('locacion', { ivaPercent: null }), f.modality('comodato', { amount: 50000 })])).body;
  });

  afterAll(() => cleanupTestDb());

  it('returns one row per month with every modality, consolidated state and totals', async () => {
    const response = await periods(declaration.id, { from: '2025-01', to: '2025-12' });
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(12);
    expect(response.body[0]).toMatchObject({ period: '2025-01', dueDate: '2025-01-01', state: 'overdue' });
    expect(response.body[0].parts.map(part => [part.modality, part.expected, part.state])).toEqual([['locacion', 100000, 'overdue'], ['comodato', 50000, 'overdue']]);
    expect(response.body[0].totals).toEqual([{ currencyCode: 'ARS', expected: 150000, collected: 0, remaining: 150000 }]);
    expect(response.body[0].actions).toEqual(['collect', 'cancel-period']);
  });

  it('is partial with one modality collected, then collected; undo-collect replaces cancel-period', async () => {
    expect((await collect('periods-route-1', occurrence('locacion', '2025-03-01'))).status).toBe(201);
    let row = march((await periods(declaration.id, { from: '2025-03', to: '2025-03' })).body);
    expect(row).toMatchObject({ state: 'partial' });
    expect(row.actions).toEqual(['collect', 'undo-collect']);
    expect(row.collections).toHaveLength(1);
    expect(row.collections[0]).toMatchObject({ amount: 100000, currencyCode: 'ARS', modality: 'locacion', accountName: 'Rent ARS' });
    expect(row.parts.map(part => part.state)).toEqual(['collected', 'overdue']);
    expect((await collect('periods-route-2', occurrence('comodato', '2025-03-01'))).status).toBe(201);
    row = march((await periods(declaration.id, { from: '2025-03', to: '2025-03' })).body);
    expect(row.state).toBe('collected');
    expect(row.actions).toEqual(['undo-collect']);
  });

  it('rejects collecting an already collected period and cancelling a period with collections', async () => {
    const again = await collect('periods-route-3', occurrence('locacion', '2025-03-01'));
    expect(again.status).toBe(400);
    expect(again.body.error).toBe('No se puede registrar un cobro porque el período ya está cobrado.');
    const contractId = declaration.modalities.find(item => item.kind === 'locacion').contractId;
    const cancel = await f.agent.post(`/api/rentals/${contractId}/occurrences/${occurrence('locacion', '2025-03-01').id}/cancel`).send({});
    expect(cancel.status).toBe(409);
    expect(cancel.body.error).toBe('No se puede cancelar este período porque tiene cobros registrados.');
  });

  it('marks generated future periods as virtual and not actionable, without persisting them', async () => {
    // The fixture asset already has a rental in 2025; use a second asset for an open-ended rental.
    const second = (await f.agent.post('/api/assets').send({ type: 'immovable', name: 'Local', propertyType: 'Local', usageStatus: 'vacant' })).body.id;
    const created = (await f.agent.post('/api/rentals/declarations').send({ assetId: second, tenantIds: [f.tenantId], notes: '', modalities: [f.modality('locacion', { startDate: '2025-01-01', endDate: null })] })).body;
    expect(created.id).toBeTruthy();
    const before = f.db.findAll('rentOccurrences', f.userId).length;
    const from = plusMonths(today(), 30).slice(0, 7);
    const to = plusMonths(today(), 33).slice(0, 7);
    const response = await f.agent.get(`/api/rentals/declarations/${created.id}/periods`).query({ from, to });
    expect(response.status).toBe(200);
    expect(response.body.length).toBe(4);
    expect(response.body.every(period => period.parts.every(part => part.actionable === false && part.occurrenceId.startsWith('virtual:')))).toBe(true);
    expect(response.body[0].actions).toEqual([]);
    expect(f.db.findAll('rentOccurrences', f.userId).length).toBe(before);
  });

  it('lists owner and tenant obligations of the month with payments, reversals and resolution', async () => {
    const owner = (await f.agent.post('/api/obligations').send({ title: 'Impuesto municipal', type: 'tax', currencyCode: 'ARS', estimatedAmount: 100, startDate: '2025-03-10', accountId: payAccountId, categoryId, assetId: f.assetId })).body;
    const tenant = (await f.agent.post('/api/obligations').send({ title: 'Expensas', type: 'utility', currencyCode: 'ARS', estimatedAmount: 80, startDate: '2025-03-12', accountId: payAccountId, categoryId, assetId: f.assetId, responsibilityType: 'tenant' })).body;
    expect(tenant.id).toBeTruthy();
    let row = march((await periods(declaration.id, { from: '2025-03', to: '2025-03' })).body);
    const find = title => row.obligations.find(item => item.concept === title);
    expect(find('Impuesto municipal')).toMatchObject({ responsibility: 'owner', state: 'overdue', expected: 100, balance: 100, actions: ['pay'] });
    expect(find('Expensas')).toMatchObject({ responsibility: 'tenant', state: 'overdue', actions: ['resolve'] });
    const paid = await f.agent.post(`/api/obligations/${owner.id}/occurrences/${owner.occurrences[0].id}/payments`).send({ amount: 100, accountId: payAccountId, categoryId, notes: 'Pago de prueba', idempotencyKey: 'periods-route-pay-1' });
    expect(paid.status).toBe(201);
    const resolved = await f.agent.post(`/api/obligations/${tenant.id}/occurrences/${tenant.occurrences[0].id}/resolution`).send({ tenantEntityId: f.tenantId, notes: 'Resuelto', period: '2025-03', amount: 80 });
    expect(resolved.status).toBe(201);
    row = march((await periods(declaration.id, { from: '2025-03', to: '2025-03' })).body);
    expect(find('Impuesto municipal')).toMatchObject({ state: 'paid', executed: 100, balance: 0 });
    expect(find('Impuesto municipal').payments).toHaveLength(1);
    expect(find('Expensas')).toMatchObject({ state: 'resolved', resolution: { amount: 80 }, actions: ['unresolve'] });
    // A payment reversal tombstone (written by the reversal feature) is listed under its occurrence.
    f.db.create('obligationPaymentReversals', { obligationId: owner.id, occurrenceId: owner.occurrences[0].id, reversedAt: '2026-01-01T00:00:00.000Z', reason: 'error', snapshot: { amount: 100, currencyCode: 'ARS', date: '2025-03-10' } }, f.userId);
    row = march((await periods(declaration.id, { from: '2025-03', to: '2025-03' })).body);
    expect(find('Impuesto municipal').reversals).toEqual([expect.objectContaining({ reason: 'error', amount: 100 })]);
  });

  it('never writes: the generated occurrences of any range stay in memory', async () => {
    const count = () => f.db.findAll('rentOccurrences', f.userId).length + f.db.findAll('obligationOccurrences', f.userId).length;
    const before = count();
    expect((await periods(declaration.id, { from: '2031-01', to: '2031-12' })).status).toBe(200);
    expect(count()).toBe(before);
  });

  it('validates the range and defaults to the current year', async () => {
    expect((await periods(declaration.id, { from: '2025-13', to: '2025-12' })).body.error).toBe('Los meses deben tener formato YYYY-MM');
    expect((await periods(declaration.id, { from: '2025-06', to: '2025-01' })).status).toBe(400);
    expect((await periods(declaration.id, { from: '2020-01', to: '2025-12' })).body.error).toBe('El rango no puede superar los 36 meses');
    const defaulted = await periods(declaration.id);
    expect(defaulted.status).toBe(200);
    expect(defaulted.body.every(period => period.period.startsWith(today().slice(0, 4)))).toBe(true);
  });

  it('answers 404 for unknown and foreign rentals and 401 without a session', async () => {
    expect((await periods('missing')).status).toBe(404);
    expect((await f.other.get(`/api/rentals/declarations/${declaration.id}/periods`)).status).toBe(404);
    expect((await request(f.app).get(`/api/rentals/declarations/${declaration.id}/periods`)).status).toBe(401);
  });
});
