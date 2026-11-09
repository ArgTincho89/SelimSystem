const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../../src/app');
const ledger = require('../../src/services/account-ledger');
const { addDaysDateOnly } = require('../../src/utils/recurring');
const { setupTestDb, cleanupTestDb, TEMP_DATA_DIR } = require('../helpers/setup');

function snapshot(dir) {
  const result = {};
  const walk = current => fs.readdirSync(current, { withFileTypes: true }).forEach(entry => {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.json') && entry.name !== 'sessions.json') result[path.relative(dir, full)] = fs.readFileSync(full, 'utf8');
  });
  walk(dir);
  return result;
}

describe('Unified alerts API', () => {
  let db;
  let agent;
  let other;
  let userId;
  let today;
  let accountId;
  let categoryId;
  let assetId;
  let otherAssetId;
  let tenantId;
  let providerId;
  let cardId;

  const day = offset => addDaysDateOnly(today, offset);
  const alerts = async (query = '') => {
    const response = await agent.get(`/api/alerts${query}`);
    expect(response.status).toBe(200);
    return response.body;
  };
  const types = list => list.map(item => item.type);
  const createObligation = async (extra = {}) => {
    const response = await agent.post('/api/obligations').send({
      title: 'Electricidad', type: 'utility', currencyCode: 'EUR', estimatedAmount: 85, startDate: day(10), reminderLeadDays: 4,
      accountId, categoryId, assetId, ...extra
    });
    expect(response.status).toBe(201);
    return { obligation: response.body, occurrence: response.body.occurrences[0] };
  };
  const forObligation = (list, obligation) => list.filter(item => item.obligationId === obligation.id);

  beforeAll(async () => {
    db = setupTestDb();
    app.locals.db = db;
    agent = request.agent(app);
    other = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'alerts@test.example', password: '123456', nombre: 'Alerts User' });
    await other.post('/api/auth/register').send({ email: 'alerts2@test.example', password: '123456', nombre: 'Alerts Other' });
    userId = db.findUserByName('Alerts User').id;
    today = ledger.localDateForUser(db, userId);
    await agent.get('/api/accounts/setup');
    accountId = (await agent.post('/api/accounts').send({ name: 'EUR account', currency: 'EUR', initialBalance: 5000 })).body.id;
    categoryId = (await agent.post('/api/categories').send({ nombre: 'Home' })).body.id;
    assetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Departamento Palermo' })).body.id;
    otherAssetId = (await agent.post('/api/assets').send({ type: 'immovable', name: 'Otro' })).body.id;
    tenantId = (await agent.post('/api/owners').send({ name: 'Juan Pérez', kind: 'person', roles: ['tenant'] })).body.id;
    providerId = (await agent.post('/api/owners').send({ name: 'Edenor', kind: 'entity', roles: ['provider'] })).body.id;
    cardId = (await agent.post('/api/finance/payment-methods').send({ name: 'Visa', type: 'credit_card', accountId, lastFour: '1234' })).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('requires authentication', async () => {
    expect((await request(app).get('/api/alerts')).status).toBe(401);
  });

  it('respects per-obligation anticipation and always includes overdue items', async () => {
    const included = await createObligation({ title: 'Impuesto', startDate: day(10), reminderLeadDays: 15 });
    const excluded = await createObligation({ title: 'Agua', startDate: day(10), reminderLeadDays: 4 });
    const overdue = await createObligation({ title: 'Gas', startDate: day(-3), reminderLeadDays: 0 });
    const list = await alerts();
    expect(forObligation(list, included.obligation).map(item => item.type)).toEqual(['obligation_due']);
    expect(forObligation(list, excluded.obligation)).toHaveLength(0);
    const late = forObligation(list, overdue.obligation);
    expect(types(late)).toEqual(['obligation_overdue']);
    expect(late[0]).toMatchObject({ status: 'overdue', occurrenceId: overdue.occurrence.id, assetName: 'Departamento Palermo', currencyCode: 'EUR' });
    expect(late[0].message).toContain('venció');
  });

  it('returns normalized, date-sorted items with Spanish messages', async () => {
    const { obligation } = await createObligation({ title: 'Electricidad', startDate: day(4), reminderLeadDays: 4, estimatedAmount: 85000, currencyCode: 'ARS', accountId: null });
    const list = await alerts();
    list.forEach(item => ['id', 'type', 'date', 'title'].forEach(field => expect(item[field]).toBeTruthy()));
    expect([...list].sort((a, b) => a.date.localeCompare(b.date))).toEqual(list);
    expect(new Set(list.map(item => item.id)).size).toBe(list.length);
    const due = forObligation(list, obligation)[0];
    expect(due.type).toBe('obligation_due');
    expect(due.message).toMatch(/^Electricidad de Departamento Palermo vence el \d+ de \w+\. Importe estimado: \$85\.000\. Faltan 4 días\.$/);
    expect(due.daysUntil).toBe(4);
  });

  it('filters by type, asset and holder, and validates parameters', async () => {
    const { obligation } = await createObligation({ title: 'Seguro', startDate: day(1), reminderLeadDays: 5, assetId: otherAssetId, providerEntityId: providerId });
    expect(types(await alerts('?type=obligation_due')).every(type => type === 'obligation_due')).toBe(true);
    expect((await alerts('?type=obligation_due')).length).toBeGreaterThan(0);
    const byAsset = await alerts(`?assetId=${otherAssetId}`);
    expect(byAsset.length).toBeGreaterThan(0);
    expect(byAsset.every(item => item.assetId === otherAssetId)).toBe(true);
    const byHolder = await alerts(`?holderId=${providerId}`);
    expect(byHolder.map(item => item.obligationId)).toEqual([obligation.id]);
    expect(await alerts(`?from=${day(30)}`)).toEqual((await alerts()).filter(item => item.date >= day(30)));
    expect((await alerts('?limit=1'))).toHaveLength(1);
    const invalid = ['?from=2030-02-30', '?to=nope', `?from=${day(5)}&to=${day(1)}`, '?type=bogus', '?assetId=missing', '?holderId=missing', '?limit=0', '?limit=1001', '?limit=abc', '?type=a&type=b'];
    for (const query of invalid) expect((await agent.get(`/api/alerts${query}`)).status).toBe(400);
    expect((await other.get(`/api/alerts?assetId=${assetId}`)).status).toBe(400);
    expect(await other.get('/api/alerts').then(response => response.body)).toEqual([]);
  });

  it('does not mutate data, even when occurrences are not generated yet', async () => {
    const lazy = db.create('obligations', {
      title: 'Lazy', type: 'utility', currencyCode: 'EUR', estimatedAmount: 20, startDate: day(2), recurrenceFrequency: 'monthly', endDate: null,
      reminderLeadDays: 5, status: 'active', paymentMethod: '', notes: '', assetId, accountId: null, categoryId: null, responsibilityType: 'owner'
    }, userId);
    db.clearCache();
    const before = snapshot(TEMP_DATA_DIR);
    const list = await alerts();
    db.clearCache();
    expect(snapshot(TEMP_DATA_DIR)).toEqual(before);
    const item = forObligation(list, { id: lazy.id })[0];
    expect(item).toMatchObject({ type: 'obligation_due', occurrenceId: null });
  });

  it('closes tenant_obligation_pending with a resolution and reopens it when voided', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Expensas', responsibilityType: 'tenant', startDate: day(3), reminderLeadDays: 5 });
    let pending = forObligation(await alerts(), obligation);
    expect(types(pending)).toEqual(['tenant_obligation_pending']);
    expect(pending[0].message).toContain('debe enviar el comprobante de pago de Expensas de Departamento Palermo');
    const url = `/api/obligations/${obligation.id}/occurrences/${occurrence.id}/resolution`;
    const created = await agent.post(url).send({ tenantEntityId: tenantId, period: day(3).slice(0, 7), amount: 85 });
    expect(created.status).toBe(201);
    expect(forObligation(await alerts(), obligation)).toHaveLength(0);
    expect((await agent.delete(url)).status).toBe(200);
    pending = forObligation(await alerts(), obligation);
    expect(types(pending)).toEqual(['tenant_obligation_pending']);
  });

  it('never reports resolved occurrences as overdue or partial', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'ABL', responsibilityType: 'tenant', startDate: day(-5), reminderLeadDays: 5 });
    expect(types(forObligation(await alerts(), obligation))).toEqual(['tenant_obligation_pending']);
    const url = `/api/obligations/${obligation.id}/occurrences/${occurrence.id}/resolution`;
    expect((await agent.post(url).send({ tenantEntityId: tenantId, period: day(-5).slice(0, 7), amount: 85 })).status).toBe(201);
    expect(forObligation(await alerts(), obligation)).toHaveLength(0);
  });

  it('handles shared portions independently', async () => {
    const shared = { responsibilityType: 'shared', responsibilitySplit: { type: 'percentage', ownerPercent: 50, tenantPercent: 50 }, estimatedAmount: 100 };
    const first = await createObligation({ ...shared, title: 'Compartida A', startDate: day(2), reminderLeadDays: 5 });
    // Owner unpaid: only the owner payment alert is raised.
    expect(types(forObligation(await alerts(), first.obligation))).toEqual(['obligation_due']);
    // Tenant resolved, owner unpaid: owner alert remains, no tenant alert.
    const urlA = `/api/obligations/${first.obligation.id}/occurrences/${first.occurrence.id}/resolution`;
    expect((await agent.post(urlA).send({ tenantEntityId: tenantId, period: day(2).slice(0, 7), amount: 50 })).status).toBe(201);
    expect(types(forObligation(await alerts(), first.obligation))).toEqual(['obligation_due']);

    // Owner paid, tenant unresolved: tenant alert only.
    const second = await createObligation({ ...shared, title: 'Compartida B', startDate: day(2), reminderLeadDays: 5 });
    const pay = await agent.post(`/api/obligations/${second.obligation.id}/occurrences/${second.occurrence.id}/payments`).send({ amount: 50, idempotencyKey: 'alerts-shared-b' });
    expect(pay.status).toBe(201);
    const list = forObligation(await alerts(), second.obligation);
    expect(types(list)).toContain('tenant_obligation_pending');
    expect(types(list)).not.toContain('obligation_due');
    expect(types(list)).not.toContain('partial_payment');
  });

  it('reports partial payments and missing receipts', async () => {
    const { obligation, occurrence } = await createObligation({ title: 'Seguro hogar', startDate: day(-2), reminderLeadDays: 3, estimatedAmount: 100 });
    const pay = await agent.post(`/api/obligations/${obligation.id}/occurrences/${occurrence.id}/payments`).send({ amount: 40, idempotencyKey: 'alerts-partial' });
    expect(pay.status).toBe(201);
    const partial = forObligation(await alerts(), obligation);
    expect(types(partial)).toEqual(['partial_payment']);
    expect(partial[0]).toMatchObject({ amount: 60, status: 'overdue' });

    const full = await createObligation({ title: 'Municipal', startDate: day(-1), reminderLeadDays: 3, estimatedAmount: 10 });
    expect((await agent.post(`/api/obligations/${full.obligation.id}/occurrences/${full.occurrence.id}/payments`).send({ amount: 10, idempotencyKey: 'alerts-full' })).status).toBe(201);
    const missing = forObligation(await alerts('?type=document_pending'), full.obligation);
    expect(missing).toHaveLength(1);
    expect(missing[0].message).toMatch(/^Falta adjuntar el comprobante de pago de Municipal de \w+ correspondiente a Departamento Palermo\.$/);
    const upload = await agent.post('/api/documents').field('occurrenceId', full.occurrence.id).attach('file', Buffer.from('receipt'), { filename: 'r.txt', contentType: 'text/plain' });
    expect(upload.status).toBe(201);
    expect(forObligation(await alerts('?type=document_pending'), full.obligation)).toHaveLength(0);
  });

  it('ignores obligations without responsibility and cancelled occurrences', async () => {
    const none = await createObligation({ title: 'Sin responsable', responsibilityType: 'none', startDate: day(-3), reminderLeadDays: 5 });
    expect(forObligation(await alerts(), none.obligation)).toHaveLength(0);
    const cancelled = await createObligation({ title: 'Cancelada', startDate: day(1), reminderLeadDays: 5 });
    expect(forObligation(await alerts(), cancelled.obligation)).toHaveLength(1);
    expect((await agent.post(`/api/obligations/${cancelled.obligation.id}/occurrences/${cancelled.occurrence.id}/cancel`).send({})).status).toBe(200);
    expect(forObligation(await alerts(), cancelled.obligation)).toHaveLength(0);
  });

  it('raises rent, contract expiry and rent adjustment alerts for active contracts', async () => {
    const contract = (await agent.post('/api/rentals').send({
      assetId: otherAssetId, type: 'residential', startDate: day(-90), endDate: day(20), initialRent: 900, currencyCode: 'EUR',
      periodicity: 'monthly', dueDay: Number(day(2).slice(8, 10)), depositAmount: 0, guarantee: '', includedExpenses: [], expenseResponsibility: {}, notes: '', tenantIds: [tenantId], status: 'active'
    }));
    expect(contract.status).toBe(201);
    const list = (await alerts(`?assetId=${otherAssetId}`)).filter(item => item.contractId === contract.body.id);
    expect(types(list)).toEqual(expect.arrayContaining(['rent_due', 'contract_expiry']));
    const rent = list.find(item => item.type === 'rent_due');
    expect(rent.message).toContain('Falta cobrar el alquiler de');
    expect(rent.message).toContain('Importe esperado: €900');
    expect(rent.tenantEntityId).toBe(tenantId);
    const byTenant = await alerts(`?holderId=${tenantId}`);
    expect(byTenant.some(item => item.contractId === contract.body.id)).toBe(true);
    db.create('rentalConditions', {
      contractId: contract.body.id, effectiveDate: day(7), method: 'manual', rentMinor: 95000, rentAmount: 950, periodicity: 'monthly'
    }, userId);
    const adjustment = (await alerts('?type=rent_adjustment_due')).find(item => item.contractId === contract.body.id);
    expect(adjustment).toMatchObject({ date: day(7), amount: 950 });
  });

  it('raises card installment alerts inside the anticipation window only', async () => {
    const created = await agent.post('/api/installments/plans').send({
      title: 'Televisor', purchaseDate: day(-10), totalAmount: 1200, accountId, paymentMethodId: cardId, installmentsCount: 12, dueDay: 15, categoryId, reminderLeadDays: 5
    });
    expect(created.status).toBe(201);
    const [first, second] = created.body.occurrences;
    db.update('creditCardInstallmentOccurrences', first.id, { dueDate: day(5) }, userId);
    db.update('creditCardInstallmentOccurrences', second.id, { dueDate: day(10) }, userId);
    const list = (await alerts('?type=card_installment_due')).filter(item => item.planId === created.body.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ occurrenceId: first.id, installmentNumber: 1, date: day(5), status: 'scheduled' });
    expect(list[0].message).toMatch(/^En 5 días vence\. Cuota 1 de 12 de Televisor, comprado el \d+ de \w+\. Importe: €100\.$/);
    expect((await agent.post(`/api/installments/plans/${created.body.id}/cancel`).send({})).status).toBe(200);
    expect((await alerts('?type=card_installment_due')).filter(item => item.planId === created.body.id)).toHaveLength(0);
  });
});
