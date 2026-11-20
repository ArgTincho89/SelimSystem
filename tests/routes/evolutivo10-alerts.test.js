const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const ledger = require('../../src/services/account-ledger');
const { addDaysDateOnly } = require('../../src/utils/recurring');

describe('Evolutivo 10 alerts: cheque/credit installments and lead-time configuration', () => {
  let f;
  let today;
  let categoryId;
  const day = offset => addDaysDateOnly(today, offset);
  const ddmmyyyy = date => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
  const alerts = async (query = '') => (await f.agent.get(`/api/alerts${query}`)).body;

  beforeAll(async () => {
    f = await setupRentFixture('evo10-alerts');
    today = ledger.localDateForUser(f.db, f.userId);
    categoryId = (await f.agent.post('/api/categories').send({ nombre: 'Varios' })).body.id;
  });

  afterAll(() => cleanupTestDb());

  it('announces pending cheque installments with the cheque number, owner for expenses', async () => {
    const created = (await f.agent.post('/api/transactions').send({
      tipo: 'expense', titulo: 'Sillones', monto: 300, categoryId, accountId: f.accountId, fecha: day(-40), paymentMethod: 'Cheque',
      chequeInstallments: [{ dueDate: day(-1), amount: 100, chequeNumber: '12345' }, { dueDate: day(3), amount: 100, chequeNumber: '12346' }, { dueDate: day(30), amount: 100, chequeNumber: '12347' }]
    })).body.installments;
    const list = (await alerts('?type=transaction_cheque_due')).filter(item => item.chequeGroupId === created[0].chequeGroupId);
    expect(list.map(item => item.transactionId)).toEqual([created[0].id, created[1].id]);
    expect(list[0]).toMatchObject({ status: 'overdue', responsibility: 'owner', chequeNumber: '12345', reminderLeadDays: 7 });
    expect(list[1].message).toBe(`Cheque Nº 12346 — cuota 2/3 de «Sillones» vence el ${ddmmyyyy(day(3))} — pendiente de confirmar ($100).`);
    await f.agent.post(`/api/transactions/${created[1].id}/confirm`);
    expect((await alerts('?type=transaction_cheque_due')).some(item => item.transactionId === created[1].id)).toBe(false);
  });

  it('assigns income cheques of a rented asset to the tenant, otherwise to the owner', async () => {
    await f.createContract({ startDate: day(-60), endDate: day(300) });
    const rented = (await f.agent.post('/api/transactions').send({
      tipo: 'income', titulo: 'Alquiler', monto: 100, accountId: f.accountId, fecha: today, paymentMethod: 'Cheque', attributionAssetId: f.assetId,
      chequeInstallments: [{ dueDate: day(2), amount: 100, chequeNumber: '0001-23456789' }]
    })).body;
    const plain = (await f.agent.post('/api/transactions').send({
      tipo: 'income', titulo: 'Venta', monto: 100, accountId: f.accountId, fecha: today, paymentMethod: 'Cheque',
      chequeInstallments: [{ dueDate: day(2), amount: 100, chequeNumber: '99' }]
    })).body;
    const list = await alerts('?type=transaction_cheque_due');
    expect(list.find(item => item.transactionId === rented.id)).toMatchObject({ responsibility: 'tenant', assetId: f.assetId, tenantEntityId: f.tenantId });
    expect(list.find(item => item.transactionId === plain.id)).toMatchObject({ responsibility: 'owner', assetId: null });
  });

  it('announces upcoming credit installments within their lead', async () => {
    const purchase = day(-28);
    const rows = (await f.agent.post('/api/transactions').send({
      tipo: 'expense', titulo: 'Notebook', monto: 900, categoryId, accountId: f.accountId, fecha: purchase, paymentMethod: 'Crédito',
      creditInstallments: { count: 3, interestPercent: 0 }
    })).body.installments;
    const list = (await alerts('?type=credit_installment_upcoming')).filter(item => item.creditGroupId === rows[0].creditGroupId);
    const upcoming = rows.filter(row => row.fecha > today && row.fecha <= day(5));
    expect(list.map(item => item.transactionId)).toEqual(upcoming.map(row => row.id));
    list.forEach(item => {
      expect(item.responsibility).toBe('owner');
      expect(item.message).toMatch(new RegExp(`^Ingresará el cobro de la cuota Nº \\d/3 del gasto «Notebook» realizado el ${ddmmyyyy(purchase)} \\(\\$300\\)\\.$`));
    });
  });

  it('serves the catalog, validates and stores defaults and overrides', async () => {
    const initial = (await f.agent.get('/api/alerts/settings')).body;
    expect(initial.catalog.map(entry => entry.key)).toEqual(expect.arrayContaining(['transaction_cheque_due', 'credit_installment_upcoming', 'document_pending', 'obligation_overdue']));
    expect(initial.targets.asset.map(item => item.id)).toContain(f.assetId);
    expect(initial.targets.account.map(item => item.id)).toContain(f.accountId);
    const put = body => f.agent.put('/api/alerts/settings').send(body);
    expect((await put({ defaults: { rent_due: 400 } })).status).toBe(400);
    expect((await put({ defaults: { obligation_overdue: 3 } })).status).toBe(400);
    expect((await put({ overrides: [{ type: 'rent_due', scope: 'account', targetId: f.accountId, days: 3 }] })).status).toBe(400);
    expect((await put({ overrides: [{ type: 'rent_due', scope: 'asset', targetId: 'missing', days: 3 }] })).status).toBe(400);
    const saved = await put({
      defaults: { rent_adjustment_due: 15, transaction_cheque_due: 0 },
      overrides: [{ type: 'rent_adjustment_due', scope: 'asset', targetId: f.assetId, days: 30 }, { type: 'rent_adjustment_due', scope: 'asset', targetId: f.assetId, days: 31 }]
    });
    expect(saved.status).toBe(200);
    expect(saved.body.settings.defaults).toEqual({ rent_adjustment_due: 15, transaction_cheque_due: 0 });
    expect(saved.body.settings.overrides).toEqual([expect.objectContaining({ scope: 'asset', targetId: f.assetId, days: 31, targetName: 'Casa Centro' })]);
    // transaction_cheque_due at 0 days: only today's and overdue cheques remain.
    expect((await alerts('?type=transaction_cheque_due')).every(item => item.date <= today)).toBe(true);
    const onlyDefaults = await put({ defaults: { rent_adjustment_due: 20 } });
    expect(onlyDefaults.body.settings.overrides).toHaveLength(1);
    expect(f.db.findAll('activityLogs', f.userId).some(item => item.action === 'alert.settings')).toBe(true);
  });

  it('resolves obligation alerts with obligation > asset > default precedence', async () => {
    const created = (await f.agent.post('/api/obligations').send({
      title: 'ABL', type: 'tax', currencyCode: 'ARS', estimatedAmount: 50, startDate: day(12), assetId: f.assetId, accountId: f.accountId, responsibilityType: 'owner'
    })).body;
    const has = async () => (await alerts('?type=obligation_due')).some(item => item.obligationId === created.id);
    expect(await has()).toBe(false);
    await f.agent.put('/api/alerts/settings').send({ overrides: [{ type: 'obligation_due', scope: 'asset', targetId: f.assetId, days: 15 }] });
    expect(await has()).toBe(true);
    await f.agent.put('/api/alerts/settings').send({ overrides: [{ type: 'obligation_due', scope: 'asset', targetId: f.assetId, days: 15 }, { type: 'obligation_due', scope: 'obligation', targetId: created.id, days: 2 }] });
    expect(await has()).toBe(false);
    const legacy = (await f.agent.get('/api/obligations/alerts')).body;
    expect(legacy.some(item => item.obligationId === created.id)).toBe(false);
  });
});
