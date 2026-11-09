const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

describe('Property monthly view', () => {
  let db;
  let agent;
  let other;
  let userId;
  let eurAccountId;
  let usdAccountId;
  let categoryId;
  let assetId;
  let tenantId;
  let contract;

  const url = (query = '') => `/api/assets/${assetId}/monthly-view${query}`;
  const monthOf = (body, month) => body.months.find(item => item.month === month);
  const expense = (accountId, amountMinor, fecha, extra = {}) => {
    const transaction = db.create('transactions', {
      userId, tipo: 'expense', monto: amountMinor / 100, amountMinor, accountId, categoryId, titulo: 'Repair',
      fecha, recurrente: false, ...extra
    }, userId);
    db.create('movementAllocations', { transactionId: transaction.id, assetId, amountMinor, complete: true }, userId);
    return transaction;
  };
  const obligation = async extra => {
    const response = await agent.post('/api/obligations').send({
      title: 'Building fee', type: 'other', currencyCode: 'EUR', estimatedAmount: 100, startDate: '2025-02-10',
      accountId: eurAccountId, categoryId, assetId, ...extra
    });
    expect(response.status).toBe(201);
    return { obligation: response.body, occurrence: response.body.occurrences[0] };
  };

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    app.locals.documentStorage = new DiskDocumentStorage(TEMP_DATA_DIR);
    agent = request.agent(app);
    other = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'monthly@test.example', password: '123456', nombre: 'Monthly User' });
    await other.post('/api/auth/register').send({ email: 'monthly2@test.example', password: '123456', nombre: 'Monthly Other' });
    userId = db.findUserByName('Monthly User').id;
    await agent.get('/api/accounts/setup');
    eurAccountId = (await agent.post('/api/accounts').send({ name: 'EUR', currency: 'EUR', initialBalance: 5000 })).body.id;
    usdAccountId = (await agent.post('/api/accounts').send({ name: 'USD', currency: 'USD', initialBalance: 5000 })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Maintenance' })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Flat' })).body.id;
    tenantId = (await agent.post('/api/owners').send({ name: 'Tenant', kind: 'person', roles: ['tenant'] })).body.id;
    contract = (await agent.post('/api/rentals').send({
      assetId, type: 'residential', startDate: '2025-01-01', endDate: '2035-12-31', initialRent: 100, currencyCode: 'EUR',
      periodicity: 'monthly', dueDay: 1, depositAmount: 0, guarantee: '', includedExpenses: [], expenseResponsibility: {}, notes: '', tenantIds: [tenantId], status: 'active'
    })).body;
  });

  afterAll(() => cleanupTestDb());

  it('requires authentication, rejects unknown or foreign assets and validates the range', async () => {
    expect((await request(app).get(url())).status).toBe(401);
    expect((await agent.get('/api/assets/missing/monthly-view')).status).toBe(404);
    expect((await other.get(url())).status).toBe(404);
    expect((await agent.get(url('?from=2025-13&to=2025-03'))).status).toBe(400);
    expect((await agent.get(url('?from=2025-04&to=2025-03'))).status).toBe(400);
    expect((await agent.get(url('?from=2010-01&to=2025-03'))).status).toBe(400);
    expect((await agent.get(url('?from=2015-04&to=2025-03'))).status).toBe(200);
  });

  it('defaults to twelve months and includes empty months with zero values', async () => {
    const response = await agent.get(url());
    expect(response.status).toBe(200);
    expect(response.body.months).toHaveLength(12);
    expect(response.body.months[11].month).toBe(response.body.to);
    const empty = (await agent.get(url('?from=2024-01&to=2024-02'))).body.months[0];
    expect(empty).toMatchObject({
      month: '2024-01', obligations: [], claims: [], documents: [], notes: [],
      expensesMinorByCurrency: {}, incomeMinorByCurrency: {}, refundsMinorByCurrency: {}, recoveriesMinorByCurrency: {},
      rent: { expectedMinor: 0, collectedMinor: 0, differenceMinor: 0, currencyCode: null }
    });
  });

  it('reports expected, collected and difference rent without persisting generated occurrences', async () => {
    const before = db.findAll('rentOccurrences', userId).length;
    const view = await agent.get(url('?from=2025-01&to=2025-03'));
    expect(db.findAll('rentOccurrences', userId).length).toBe(before);
    expect(monthOf(view.body, '2025-02').rent).toEqual({ expectedMinor: 10000, collectedMinor: 0, differenceMinor: 10000, currencyCode: 'EUR' });
    const first = contract.occurrences.find(item => item.date === '2025-02-01');
    const collected = await agent.post('/api/rentals/collections').send({
      amount: 40, accountId: eurAccountId, date: '2025-02-03', method: 'Bank transfer', idempotencyKey: 'monthly-view-rent',
      allocations: [{ occurrenceId: first.id, amount: 40 }]
    });
    expect(collected.status).toBe(201);
    const after = await agent.get(url('?from=2025-01&to=2025-03'));
    expect(monthOf(after.body, '2025-02').rent).toEqual({ expectedMinor: 10000, collectedMinor: 4000, differenceMinor: 6000, currencyCode: 'EUR' });
    expect(monthOf(after.body, '2025-02').incomeMinorByCurrency).toEqual({ EUR: 4000 });
  });

  it('lists attributed expenses per currency without mixing, plus claims and recoveries', async () => {
    const eur = expense(eurAccountId, 2500, '2025-03-05');
    expense(usdAccountId, 700, '2025-03-06');
    const claim = await agent.post('/api/finance/claims').send({ transactionId: eur.id, assetId, amount: 10 });
    expect(claim.status).toBe(201);
    const recovery = await agent.post(`/api/finance/claims/${claim.body.id}/recoveries`).send({
      amount: 4, accountId: eurAccountId, date: '2025-03-20', idempotencyKey: 'monthly-view-recovery'
    });
    expect(recovery.status).toBe(201);
    const month = monthOf((await agent.get(url('?from=2025-03&to=2025-03'))).body, '2025-03');
    expect(month.expensesMinorByCurrency).toEqual({ EUR: 2500, USD: 700 });
    expect(month.recoveriesMinorByCurrency).toEqual({ EUR: 400 });
    expect(month.claims).toEqual([expect.objectContaining({ claimId: claim.body.id, amountMinor: 1000, currencyCode: 'EUR', status: 'partial', recoveredMinor: 400 })]);
  });

  it('shows obligation rows with responsibility and documents, never adding resolutions to expenses', async () => {
    const owner = await obligation({ title: 'Owner fee' });
    const doc = await agent.post('/api/documents').field('title', 'Invoice').field('occurrenceId', owner.occurrence.id)
      .attach('file', Buffer.from('receipt'), { filename: 'receipt.txt', contentType: 'text/plain' });
    expect(doc.status).toBe(201);
    const tenantOnly = await obligation({ title: 'Tenant fee', responsibilityType: 'tenant', startDate: '2025-02-12' });
    const resolved = await agent.post(`/api/obligations/${tenantOnly.obligation.id}/occurrences/${tenantOnly.occurrence.id}/resolution`)
      .send({ tenantEntityId: tenantId, period: '2025-02', amount: 100 });
    expect(resolved.status).toBe(201);
    const shared = await obligation({
      title: 'Shared fee', responsibilityType: 'shared', startDate: '2025-02-14',
      responsibilitySplit: { type: 'percentage', ownerPercent: 50, tenantPercent: 50 }
    });
    const paid = await agent.post(`/api/obligations/${shared.obligation.id}/occurrences/${shared.occurrence.id}/payments`).send({ amount: 50, idempotencyKey: 'monthly-view-shared' });
    expect(paid.status).toBe(201);
    await agent.post(`/api/obligations/${shared.obligation.id}/occurrences/${shared.occurrence.id}/resolution`)
      .send({ tenantEntityId: tenantId, period: '2025-02', amount: 50 });

    const month = monthOf((await agent.get(url('?from=2025-02&to=2025-02'))).body, '2025-02');
    const row = title => month.obligations.find(item => item.title === title);
    expect(row('Owner fee')).toMatchObject({
      responsibilityType: 'owner', estimatedMinor: 10000, actualMinor: 0, resolutionStatus: 'none', resolutionAmountMinor: null, documentIds: [doc.body.id]
    });
    expect(row('Tenant fee')).toMatchObject({ responsibilityType: 'tenant', status: 'resolved', resolutionStatus: 'resolved', resolutionAmountMinor: 10000, actualMinor: 0 });
    expect(row('Shared fee')).toMatchObject({ responsibilityType: 'shared', actualMinor: 5000, resolutionStatus: 'resolved', resolutionAmountMinor: 5000 });
    expect(month.documents.map(item => item.id)).toContain(doc.body.id);
    // Only the owner payment (posted today) is an expense; resolutions are not transactions.
    expect(month.expensesMinorByCurrency).toEqual({});
    const latest = (await agent.get(url())).body;
    expect(latest.months.reduce((sum, item) => sum + (item.expensesMinorByCurrency.EUR || 0), 0)).toBe(5000);
  });

  it('keeps cancelled occurrences out of the view', async () => {
    const { obligation: created, occurrence } = await obligation({ title: 'Cancelled fee', startDate: '2025-04-10' });
    const cancelled = await agent.post(`/api/obligations/${created.id}/occurrences/${occurrence.id}/cancel`).send({});
    expect(cancelled.status).toBe(200);
    const month = monthOf((await agent.get(url('?from=2025-04&to=2025-04'))).body, '2025-04');
    expect(month.obligations.find(item => item.title === 'Cancelled fee')).toBeUndefined();
  });
});
