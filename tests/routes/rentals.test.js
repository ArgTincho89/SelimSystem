const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

describe('Rental contracts, expected rent periods, and collections', () => {
  let db;
  let storage;
  let agent;
  let otherAgent;
  let tenantId;
  let assetId;
  let userId;
  let eurAccountId;

  beforeAll(async () => {
    db = setupTestDb();
    storage = new DiskDocumentStorage(TEMP_DATA_DIR);
    app.locals.db = db;
    app.locals.documentStorage = storage;
    agent = request.agent(app);
    otherAgent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'rental-user@test.com', password: '123456', nombre: 'Rental User' });
    await otherAgent.post('/api/auth/register').send({ email: 'rental-other@test.com', password: '123456', nombre: 'Other Rental User' });
    userId = db.findUserByEmail('rental-user@test.com').id;
    const tenant = await agent.post('/api/owners').send({ name: 'Tenant One', kind: 'person', roles: ['tenant'] });
    tenantId = tenant.body.id;
    const asset = await agent.post('/api/assets').send({ type: 'immovable', name: 'Rental Home', propertyType: 'Apartment', usageStatus: 'vacant' });
    assetId = asset.body.id;
    ledger.ensureSetup(db, userId);
    eurAccountId = (await agent.post('/api/accounts').send({ name: 'Rent EUR account', currency: 'EUR' })).body.id;
    await agent.patch('/api/accounts/settings').send({ appCurrency: 'EUR' });
  });

  afterAll(() => cleanupTestDb());

  async function createContract(overrides = {}) {
    return agent.post('/api/rentals').send({
      assetId, type: 'residential', startDate: '2025-01-01', endDate: '2025-12-31',
      initialRent: 100, currencyCode: 'EUR', periodicity: 'monthly', dueDay: 1,
      depositAmount: 200, guarantee: 'Deposit', includedExpenses: ['Water'],
      expenseResponsibility: { electricity: 'tenant', building: 'owner' },
      notes: 'Test lease', tenantIds: [tenantId], status: 'active', ...overrides
    });
  }

  function firstOfMonth(date, offset = 0) {
    const result = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`);
    result.setUTCMonth(result.getUTCMonth() + offset);
    return result.toISOString().slice(0, 10);
  }

  it('validates tenant roles and rejects cross-user assets and tenants', async () => {
    expect((await request(app).get('/api/rentals')).status).toBe(401);
    const owner = await agent.post('/api/owners').send({ name: 'Not a tenant', kind: 'person', roles: ['owner'] });
    expect((await createContract({ tenantIds: [owner.body.id] })).status).toBe(400);
    const foreignAsset = await otherAgent.post('/api/assets').send({ type: 'immovable', name: 'Foreign property' });
    const foreignTenant = await otherAgent.post('/api/owners').send({ name: 'Foreign tenant', kind: 'person', roles: ['tenant'] });
    expect((await createContract({ assetId: foreignAsset.body.id })).status).toBe(400);
    expect((await createContract({ tenantIds: [foreignTenant.body.id] })).status).toBe(400);
    expect((await otherAgent.get('/api/rentals').query({ assetId })).status).toBe(400);
  });

  it('generates stable rent occurrences and preserves existing conditions and collected periods', async () => {
    const created = await createContract();
    expect(created.status).toBe(201);
    expect(created.body.occurrences.length).toBeGreaterThan(0);
    const assetAfterLease = (await agent.get(`/api/assets/${assetId}`)).body;
    expect(assetAfterLease.usageStatus).toBe('rented');
    expect(assetAfterLease.statusHistory).toHaveLength(1);
    const firstOccurrence = created.body.occurrences.find(item => item.date === '2025-02-01');
    const stableCount = db.findAll('rentOccurrences', userId).filter(item => item.contractId === created.body.id).length;
    await agent.get(`/api/rentals/${created.body.id}`);
    expect(db.findAll('rentOccurrences', userId).filter(item => item.contractId === created.body.id)).toHaveLength(stableCount);
    expect(firstOccurrence.generationKey).toBe(`${created.body.id}:2025-02-01`);

    const rejectedCondition = await agent.post(`/api/rentals/${created.body.id}/conditions`).send({ method: 'manual', effectiveDate: '2025-04-01', rentAmount: 125 });
    expect(rejectedCondition.status).toBe(409);
    expect(db.findById('rentOccurrences', firstOccurrence.id, userId).rentMinor).toBe(10000);
    expect((await agent.get('/api/transactions').query({ month: '2025-02' })).body.filter(item => item.tipo === 'income')).toHaveLength(0);

    const collectionInput = {
      amount: 150, accountId: eurAccountId, date: '2025-03-02', method: 'Bank transfer',
      idempotencyKey: 'multi-month-rent-2025-03',
      allocations: [
        { occurrenceId: created.body.occurrences.find(item => item.date === '2025-02-01').id, amount: 100 },
        { occurrenceId: created.body.occurrences.find(item => item.date === '2025-03-01').id, amount: 25 }
      ]
    };
    expect((await agent.post('/api/rentals/collections').send({ ...collectionInput, amount: 100, idempotencyKey: 'underfunded-rent-collection' })).status).toBe(400);
    const collected = await agent.post('/api/rentals/collections').send(collectionInput);
    expect(collected.status).toBe(201);
    expect(collected.body.allocatedAmount).toBe(125);
    expect(collected.body.unappliedAmount).toBe(25);
    const incomeRows = db.findAll('transactions', userId).filter(item => item.rentCollectionId === collected.body.id);
    expect(incomeRows).toHaveLength(1);
    expect(incomeRows[0]).toMatchObject({ tipo: 'income', monto: 150, amountMinor: 15000 });
    const allocationCount = db.findAll('rentCollectionAllocations', userId).filter(item => item.collectionId === collected.body.id).length;
    expect((await agent.post('/api/rentals/collections').send(collectionInput)).body.replayed).toBe(true);
    expect(db.findAll('transactions', userId).filter(item => item.rentCollectionId === collected.body.id)).toHaveLength(1);
    expect(db.findAll('rentCollectionAllocations', userId).filter(item => item.collectionId === collected.body.id)).toHaveLength(allocationCount);
    const marchBeforeRemainder = (await agent.get(`/api/rentals/${created.body.id}`)).body.occurrences.find(item => item.date === '2025-03-01');
    expect(marchBeforeRemainder).toMatchObject({ status: 'partially_collected', paidAmount: 25, remainingAmount: 75 });
    expect((await agent.post('/api/rentals/collections').send({ ...collectionInput, amount: 151 })).status).toBe(409);

    const secondOccurrence = created.body.occurrences.find(item => item.date === '2025-03-01');
    const applied = await agent.post(`/api/rentals/collections/${collected.body.id}/allocations`).send({
      idempotencyKey: 'apply-rent-remainder-2025', allocations: [{ occurrenceId: secondOccurrence.id, amount: 25 }]
    });
    expect(applied.status).toBe(201);
    expect(applied.body.allocatedAmount).toBe(150);
    expect(applied.body.unappliedAmount).toBe(0);
    expect(applied.body.allocations.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(15000);
    expect((await agent.post(`/api/rentals/collections/${collected.body.id}/allocations`).send({
      idempotencyKey: 'apply-rent-remainder-2025', allocations: [{ occurrenceId: secondOccurrence.id, amount: 25 }]
    })).body.replayed).toBe(true);
    const marchAfterRemainder = (await agent.get(`/api/rentals/${created.body.id}`)).body.occurrences.find(item => item.date === '2025-03-01');
    expect(marchAfterRemainder).toMatchObject({ status: 'partially_collected', paidAmount: 50, remainingAmount: 50 });
    expect(db.findAll('transactions', userId).filter(item => item.rentCollectionId === collected.body.id)).toHaveLength(1);

    const visibleIncome = await agent.get('/api/transactions').query({ month: '2025-03' });
    expect(visibleIncome.body.filter(item => item.rentCollectionId === collected.body.id)).toHaveLength(1);
    const summary = await agent.get('/api/summary').query({ month: '2025-03' });
    expect(summary.body.ingresos).toBe(150);
    expect((await agent.put(`/api/transactions/${incomeRows[0].id}`).send({ monto: 151 })).status).toBe(409);

    const ended = await agent.put(`/api/rentals/${created.body.id}`).send({ status: 'ended', endDate: '2025-03-31' });
    expect(ended.status).toBe(200);
    expect(ended.body.occurrences.find(item => item.id === firstOccurrence.id).status).toBe('collected');
    expect(db.findById('rentOccurrences', secondOccurrence.id, userId).cancelled).toBe(false);
    expect(ended.body.occurrences.find(item => item.date === '2025-04-01').status).toBe('cancelled');
  });

  it('supersedes unpaid forecasts for future rent conditions and keeps reads idempotent', async () => {
    const startDate = firstOfMonth(ledger.localDateForUser(db, userId), 1);
    const effectiveDate = firstOfMonth(startDate, 2);
    const unscheduledDate = firstOfMonth(effectiveDate, 1);
    const userCancelledDate = firstOfMonth(effectiveDate, 3);
    const nextQuarterDate = firstOfMonth(effectiveDate, 6);
    const created = await createContract({ startDate, endDate: firstOfMonth(startDate, 24) });
    expect(created.status).toBe(201);
    expect(created.body.occurrences.length).toBeGreaterThan(0);
    const originalEffective = created.body.occurrences.find(item => item.date === effectiveDate);
    const originalUnscheduled = created.body.occurrences.find(item => item.date === unscheduledDate);
    const originalNextQuarter = created.body.occurrences.find(item => item.date === nextQuarterDate);
    expect(originalEffective).toBeDefined();
    expect(originalUnscheduled).toBeDefined();
    expect(originalNextQuarter).toBeDefined();
    const originalFutureRows = created.body.occurrences.filter(item => item.date >= effectiveDate);
    const originalUserCancelled = created.body.occurrences.find(item => item.date === userCancelledDate);
    expect(originalUserCancelled).toBeDefined();
    const untouchedBeforeEffective = created.body.occurrences.find(item => item.date === firstOfMonth(effectiveDate, -1));
    const userCancelled = await agent.post(`/api/rentals/${created.body.id}/occurrences/${originalUserCancelled.id}/cancel`).send({});
    expect(userCancelled.status).toBe(200);
    const userCancelledBeforeCondition = db.findById('rentOccurrences', originalUserCancelled.id, userId);

    const condition = await agent.post(`/api/rentals/${created.body.id}/conditions`).send({
      method: 'manual', rentAmount: 125, periodicity: 'quarterly', effectiveDate
    });
    expect(condition.status).toBe(201);

    originalFutureRows.forEach(original => {
      const historical = db.findById('rentOccurrences', original.id, userId);
      expect(historical).toMatchObject({ cancelled: true, rentMinor: original.rentMinor, rentAmount: original.rentAmount });
      if (original.id === originalUserCancelled.id) {
        expect(historical).toEqual(userCancelledBeforeCondition);
      } else {
        expect(historical.supersededByConditionId).toBe(condition.body.id);
      }
    });
    const historicalEffective = db.findById('rentOccurrences', originalEffective.id, userId);
    const historicalUnscheduled = db.findById('rentOccurrences', originalUnscheduled.id, userId);
    const historicalNextQuarter = db.findById('rentOccurrences', originalNextQuarter.id, userId);
    [historicalEffective, historicalUnscheduled, historicalNextQuarter].forEach(item => {
      expect(item).toMatchObject({ cancelled: true, supersededByConditionId: condition.body.id, rentMinor: 10000, rentAmount: 100 });
    });
    expect(db.findById('rentOccurrences', originalUserCancelled.id, userId)).toMatchObject({ cancelled: true, rentMinor: 10000 });
    expect(db.findById('rentOccurrences', originalUserCancelled.id, userId).supersededByConditionId).toBeUndefined();
    expect(historicalEffective.generationKey).toBe(originalEffective.generationKey);
    expect(historicalEffective.createdAt).toBe(originalEffective.createdAt);
    expect(db.findById('rentOccurrences', untouchedBeforeEffective.id, userId)).toEqual(expect.objectContaining({
      cancelled: false, rentMinor: 10000, rentAmount: 100
    }));

    const firstRead = await agent.get(`/api/rentals/${created.body.id}`);
    const effectiveReplacement = firstRead.body.occurrences.find(item => item.date === effectiveDate && !item.cancelled);
    const quarterReplacement = firstRead.body.occurrences.find(item => item.date === nextQuarterDate && !item.cancelled);
    expect(effectiveReplacement).toMatchObject({ rentMinor: 12500, rentAmount: 125, conditionId: condition.body.id });
    expect(quarterReplacement).toMatchObject({ rentMinor: 12500, rentAmount: 125, conditionId: condition.body.id });
    expect(firstRead.body.occurrences.some(item => item.date === userCancelledDate && !item.cancelled)).toBe(false);
    expect(firstRead.body.occurrences.some(item => item.date === unscheduledDate && !item.cancelled)).toBe(false);
    expect(firstRead.body.occurrences.find(item => item.id === originalUnscheduled.id).status).toBe('cancelled');
    expect(firstRead.body.occurrences.find(item => item.id === untouchedBeforeEffective.id).rentAmount).toBe(100);

    const occurrenceCount = db.findAll('rentOccurrences', userId).filter(item => item.contractId === created.body.id).length;
    const firstIds = firstRead.body.occurrences.map(item => item.id);
    const secondRead = await agent.get(`/api/rentals/${created.body.id}`);
    expect(secondRead.body.occurrences.map(item => item.id)).toEqual(firstIds);
    expect(db.findAll('rentOccurrences', userId).filter(item => item.contractId === created.body.id)).toHaveLength(occurrenceCount);
  });

  it('rejects a rent condition update when an affected period has a collection allocation', async () => {
    const today = ledger.localDateForUser(db, userId);
    const startDate = firstOfMonth(today, 1);
    const effectiveDate = firstOfMonth(startDate, 2);
    const created = await createContract({ startDate, endDate: firstOfMonth(startDate, 24) });
    const occurrence = created.body.occurrences.find(item => item.date === effectiveDate);
    expect(occurrence).toBeDefined();
    const collection = await agent.post('/api/rentals/collections').send({
      amount: 100, accountId: eurAccountId, date: today, method: 'Bank transfer',
      idempotencyKey: 'paid-future-rent-period-0001', allocations: [{ occurrenceId: occurrence.id, amount: 100 }]
    });
    expect(collection.status).toBe(201);
    const occurrenceBefore = db.findById('rentOccurrences', occurrence.id, userId);
    const collectionBefore = db.findById('rentCollections', collection.body.id, userId);
    const allocationBefore = db.findAll('rentCollectionAllocations', userId).find(item => item.occurrenceId === occurrence.id);
    const transactionBefore = db.findById('transactions', collectionBefore.transactionId, userId);

    const rejected = await agent.post(`/api/rentals/${created.body.id}/conditions`).send({
      method: 'manual', rentAmount: 125, effectiveDate
    });
    expect(rejected.status).toBe(409);
    expect(db.findById('rentOccurrences', occurrence.id, userId)).toEqual(occurrenceBefore);
    expect(db.findById('rentCollections', collection.body.id, userId)).toEqual(collectionBefore);
    expect(db.findAll('rentCollectionAllocations', userId).find(item => item.occurrenceId === occurrence.id)).toEqual(allocationBefore);
    expect(db.findById('transactions', collectionBefore.transactionId, userId)).toEqual(transactionBefore);
  });

  it('supports future user-entered percentage and index conditions without external indices', async () => {
    const start = '2030-01-01';
    const created = await createContract({ startDate: start, endDate: '2030-12-31' });
    const manual = await agent.post(`/api/rentals/${created.body.id}/conditions`).send({ method: 'manual', rentAmount: 120, effectiveDate: start });
    expect(manual.status).toBe(201);
    const percent = await agent.post(`/api/rentals/${created.body.id}/conditions`).send({ method: 'percentage', percentage: 10, effectiveDate: '2030-02-01' });
    expect(percent.status).toBe(201);
    const index = await agent.post(`/api/rentals/${created.body.id}/conditions`).send({ method: 'index', indexValue: 120, baseIndexValue: 100, effectiveDate: '2030-03-01' });
    expect(index.status).toBe(201);
    const periods = await agent.get(`/api/rentals/${created.body.id}`).query({ to: '2030-03-01' });
    expect(periods.body.occurrences.find(item => item.date === '2030-01-01').rentAmount).toBe(120);
    expect(periods.body.occurrences.find(item => item.date === '2030-02-01').rentAmount).toBe(132);
    expect(periods.body.occurrences.find(item => item.date === '2030-03-01').rentAmount).toBe(158.4);
  });

  it('rejects invalid currency allocation and protects contract documents by user', async () => {
    const created = await createContract({ startDate: '2031-01-01', endDate: '2031-03-31' });
    const usd = db.create('accounts', { nombre: 'USD account', currency: 'USD', activo: true, primary: false }, userId);
    const generated = await agent.get(`/api/rentals/${created.body.id}`).query({ to: '2031-01-01' });
    const occurrence = generated.body.occurrences[0];
    const mismatch = await agent.post('/api/rentals/collections').send({
      amount: 100, accountId: usd.id, date: '2025-03-02', method: 'Cash', idempotencyKey: 'wrong-currency-key',
      allocations: [{ occurrenceId: occurrence.id, amount: 100 }]
    });
    expect(mismatch.status).toBe(400);
    const document = await agent.post('/api/documents').field('contractId', created.body.id)
      .attach('file', Buffer.from('Rental agreement'), { filename: 'agreement.txt', contentType: 'text/plain' });
    expect(document.status).toBe(201);
    expect((await agent.get('/api/documents').query({ contractId: created.body.id })).body).toHaveLength(1);
    expect((await otherAgent.get(`/api/documents/${document.body.id}/content`)).status).toBe(404);
    expect((await otherAgent.get('/api/documents').query({ contractId: created.body.id })).status).toBe(400);
  });
});
