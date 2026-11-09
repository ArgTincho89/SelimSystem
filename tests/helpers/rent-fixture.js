const request = require('supertest');
const app = require('../../src/app');
const DiskDocumentStorage = require('../../src/services/document-storage');
const ledger = require('../../src/services/account-ledger');
const { setupTestDb, TEMP_DATA_DIR } = require('./setup');

// Shared fixture for rent collection tests: one user with a tenant, an immovable asset and an ARS account.
async function setupRentFixture(prefix) {
  const db = setupTestDb();
  app.locals.db = db;
  app.locals.documentStorage = new DiskDocumentStorage(TEMP_DATA_DIR);
  const agent = request.agent(app);
  const other = request.agent(app);
  await agent.post('/api/auth/register').send({ email: `${prefix}@test.com`, password: '123456', nombre: prefix });
  await other.post('/api/auth/register').send({ email: `${prefix}-other@test.com`, password: '123456', nombre: `${prefix} other` });
  const userId = db.findUserByEmail(`${prefix}@test.com`).id;
  ledger.ensureSetup(db, userId);
  const tenantId = (await agent.post('/api/owners').send({ name: 'Tenant', kind: 'person', roles: ['tenant'] })).body.id;
  const assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Casa Centro', propertyType: 'Apartment', usageStatus: 'vacant' })).body.id;
  const accountId = (await agent.post('/api/accounts').send({ name: 'Rent ARS', currency: 'ARS' })).body.id;
  let counter = 0;
  async function createContract(overrides = {}) {
    const created = await agent.post('/api/rentals').send({
      assetId, type: 'residential', startDate: '2025-01-01', endDate: '2025-12-31', initialRent: 100000,
      expenseResponsibility: {}, includedExpenses: [], depositAmount: 0, currencyCode: 'ARS', periodicity: 'monthly', dueDay: 1, tenantIds: [tenantId], status: 'active', ...overrides
    });
    if (created.status !== 201) throw new Error(`createContract failed: ${created.status} ${JSON.stringify(created.body)}`);
    return created.body;
  }
  function occurrenceId(contract, date) { return contract.occurrences.find(item => item.date === date).id; }
  function collect(contract, dates, extra = {}) {
    counter += 1;
    const allocations = dates.map(date => ({ occurrenceId: occurrenceId(contract, date), amount: contract.initialRent }));
    return agent.post('/api/rentals/collections').send({
      amount: contract.initialRent * dates.length, accountId, date: '2025-03-02', allocations,
      idempotencyKey: `${prefix}-collection-${counter}`, ...extra
    });
  }
  const modality = (kind = 'locacion', overrides = {}) => ({
    kind, startDate: '2025-01-01', endDate: '2025-12-31', amount: 100000, currencyCode: 'ARS',
    ivaPercent: kind === 'locacion' ? 21 : null, adjustmentFrequencyMonths: null, adjustmentCriterion: null, ...overrides
  });
  const declare = (modalities = [modality()], extra = {}) => agent.post('/api/rentals/declarations').send({ assetId, tenantIds: [tenantId], notes: '', modalities, ...extra });
  const edit = (id, modalities, extra = {}) => agent.put(`/api/rentals/declarations/${id}`).send({ tenantIds: [tenantId], modalities, ...extra });
  // Collects occurrences of one modality at their (gross) expected amount.
  function collectModality(view, kind, dates, extra = {}) {
    counter += 1;
    const item = view.modalities.find(entry => entry.kind === kind);
    const allocations = dates.map(date => {
      const occurrence = item.occurrences.find(entry => entry.date === date);
      return { occurrenceId: occurrence.id, amount: occurrence.rentMinor / 100 };
    });
    return agent.post('/api/rentals/collections').send({
      amount: allocations.reduce((sum, entry) => sum + entry.amount, 0), accountId, date: '2025-03-02', allocations,
      idempotencyKey: `${prefix}-decl-collection-${counter}`, ...extra
    });
  }
  return { app, db, agent, other, userId, tenantId, assetId, accountId, createContract, occurrenceId, collect, modality, declare, edit, collectModality };
}

module.exports = { setupRentFixture };
