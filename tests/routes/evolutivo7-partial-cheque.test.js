const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const ledger = require('../../src/services/account-ledger');
const rentCollections = require('../../src/services/rent-collections');
const activityLog = require('../../src/services/activity-log');

describe('Evolutivo 7: partial rent collections and cheques', () => {
  let f;
  let declaration;
  let counter = 0;
  beforeEach(async () => {
    f = await setupRentFixture(`evo7-partial-${counter}`);
    declaration = (await f.declare([f.modality('locacion', { amount: 100000, ivaPercent: 21 }), f.modality('comodato', { amount: 50000 })])).body;
  });
  afterAll(() => cleanupTestDb());

  const today = () => ledger.localDateForUser(f.db, f.userId);
  const plusDays = (date, days) => { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
  const part = (kind, date = '2025-01-01') => declaration.modalities.find(item => item.kind === kind).occurrences.find(item => item.date === date);
  const collectMonth = (lines, key) => {
    counter += 1;
    return f.agent.post('/api/rentals/collections/month').send({ idempotencyKey: key || `evo7-month-${counter}`, lines });
  };
  const line = (kind, amount, extra = {}) => ({ occurrenceId: part(kind).id, amount, accountId: f.accountId, date: today(), clasificacion: kind === 'locacion' ? 'A' : 'B', ...extra });
  const january = async () => (await f.agent.get(`/api/rentals/months?assetId=${f.assetId}`)).body.find(item => item.date === '2025-01-01');
  const logs = () => f.db.findAll('activityLogs', f.userId);
  const lastLog = () => logs()[logs().length - 1];

  describe('partial payments', () => {
    test('a lower amount leaves the period partially collected with its pending balance and logs it as partial', async () => {
      const res = await collectMonth([line('locacion', 50000)]);
      expect(res.status).toBe(201);
      expect(res.body.partial).toBe(true);
      expect(res.body.pending).toEqual([{ currencyCode: 'ARS', amountMinor: 7100000, amount: 71000 }]);
      const month = await january();
      expect(month.status).toBe('partially_collected');
      expect(month.parts.find(item => item.modality === 'locacion')).toMatchObject({ paidAmount: 50000, remainingAmount: 71000, status: 'partially_collected' });
      expect(lastLog().action).toBe('rental.collection-partial');
      expect(lastLog().message).toContain('Registraste un cobro parcial del alquiler');
      expect(lastLog().message).toContain('saldo pendiente ARS 71.000');
      expect(lastLog().undo).toEqual({ type: 'rental.collection', collectionId: res.body.id });
    });

    test('several collections accumulate until the month is fully collected; IVA follows each partial amount', async () => {
      const first = await collectMonth([line('locacion', 60500), line('comodato', 20000)]);
      expect(first.body.partial).toBe(true);
      const tx = f.db.findById('transactions', first.body.transactionIds[0], f.userId);
      expect(tx).toMatchObject({ monto: 60500, clasificacion: 'A', ivaPorcentaje: 21, ivaIncluded: true });
      const locacionLine = first.body.lines.find(item => item.modality === 'locacion');
      expect(locacionLine.ivaAmount).toBe(10500);
      const second = await collectMonth([line('locacion', 60500), line('comodato', 30000)]);
      expect(second.status).toBe(201);
      expect(second.body.partial).toBe(false);
      expect(second.body.pending).toEqual([]);
      expect((await january()).status).toBe('collected');
      expect(lastLog().action).toBe('rental.collection');
      const over = await collectMonth([line('locacion', 1)]);
      expect(over.status).toBe(400);
    });

    test('undoing one collection recomputes the pending balance of the period', async () => {
      const first = await collectMonth([line('locacion', 50000)]);
      const second = await collectMonth([line('locacion', 21000)]);
      expect((await january()).parts[0].remainingAmount).toBe(50000);
      const undo = await f.agent.post(`/api/rentals/collections/${second.body.id}/reverse`).send({ reason: 'Importe mal cargado' });
      expect(undo.status).toBe(200);
      const month = await january();
      expect(month.status).toBe('partially_collected');
      expect(month.parts[0]).toMatchObject({ paidAmount: 50000, remainingAmount: 71000 });
      expect(first.body.id).not.toBe(second.body.id);
    });

    test('the periods tab shows the partial state and the remaining balance', async () => {
      await collectMonth([line('locacion', 50000)]);
      const periods = (await f.agent.get(`/api/rentals/declarations/${declaration.id}/periods?from=2025-01&to=2025-01`)).body;
      const period = periods.find(item => item.period === '2025-01');
      expect(period.state).toBe('partial');
      expect(period.totals[0].remaining).toBe(121000);
      expect(period.parts.find(item => item.modality === 'locacion')).toMatchObject({ state: 'partial', remaining: 71000 });
      expect(period.actions).toContain('collect');
    });
  });

  describe('cheques', () => {
    test('a cheque records the income on the collection date (payment date + días)', async () => {
      const res = await collectMonth([line('locacion', 121000, { method: 'Cheque', chequeDays: 30 })]);
      expect(res.status).toBe(201);
      const due = plusDays(today(), 30);
      const collection = f.db.findById('rentCollections', res.body.collectionIds[0], f.userId);
      expect(collection).toMatchObject({ date: due, receivedDate: today(), method: 'Cheque', cheque: { days: 30, dueDate: due, cashedAt: null } });
      expect(f.db.findById('transactions', collection.transactionId, f.userId)).toMatchObject({ fecha: due, paymentMethod: 'Cheque', monto: 121000 });
      expect(res.body.lines[0].cheque).toMatchObject({ days: 30, dueDate: due });
      expect(lastLog().message).toContain(`cheque a 30 días, se cobra el ${due.split('-').reverse().join('-')}`);
    });

    test('validates the días of a cheque and rejects días on other methods', async () => {
      expect((await collectMonth([line('locacion', 121000, { method: 'cheque' })])).body.error).toMatch(/cuántos días/);
      expect((await collectMonth([line('locacion', 121000, { method: 'Cheque', chequeDays: 0 })])).status).toBe(400);
      expect((await collectMonth([line('locacion', 121000, { method: 'Cheque', chequeDays: 400 })])).status).toBe(400);
      expect((await collectMonth([line('locacion', 121000, { method: 'Cheque', chequeDays: 1.5 })])).status).toBe(400);
      const other = await collectMonth([line('locacion', 121000, { method: 'Transferencia', chequeDays: 3 })]);
      expect(other.status).toBe(400);
      expect(other.body.error).toMatch(/solo aplican al medio de cobro Cheque/);
      expect(rentCollections.isCheque('  CHÉQUE ')).toBe(true);
    });

    test('an alert announces the cheque 7 days before its date with asset, tenant, period and amount, until it is cashed', async () => {
      const soon = await collectMonth([line('locacion', 121000, { method: 'Cheque', chequeDays: 3 })]);
      await collectMonth([{ ...line('comodato', 50000, { method: 'Cheque', chequeDays: 30 }) }]);
      const alerts = (await f.agent.get('/api/alerts?type=cheque_due')).body;
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({ type: 'cheque_due', responsibility: 'tenant', collectionId: soon.body.collectionIds[0], assetId: f.assetId, amount: 121000, currencyCode: 'ARS', period: '2025-01', status: 'pending' });
      expect(alerts[0].message).toContain('Casa Centro');
      expect(alerts[0].message).toContain('Tenant');
      expect(alerts[0].message).toContain('enero 2025');
      expect(alerts[0].message).toContain('$121.000');
      expect(alerts[0].message).toContain('Faltan 3 días.');

      const cashed = await f.agent.post(`/api/rentals/collections/${soon.body.id}/cheque-cashed`).send({});
      expect(cashed.status).toBe(200);
      expect(cashed.body.cashedAt).toBeTruthy();
      expect(lastLog()).toMatchObject({ action: 'rental.cheque-cashed', undo: { type: 'rental.cheque', collectionId: soon.body.id } });
      expect(lastLog().message).toContain('Marcaste como cobrado el cheque del alquiler');
      expect(activityLog.isUndoable(f.db, f.userId, lastLog())).toBe(true);
      expect((await f.agent.get('/api/alerts?type=cheque_due')).body).toHaveLength(0);
      expect((await f.agent.post(`/api/rentals/collections/${soon.body.id}/cheque-cashed`).send({})).status).toBe(409);

      expect((await f.agent.post(`/api/rentals/collections/${soon.body.id}/cheque-cashed/undo`).send({})).status).toBe(400);
      const undone = await f.agent.post(`/api/rentals/collections/${soon.body.id}/cheque-cashed/undo`).send({ reason: 'Rebotó' });
      expect(undone.status).toBe(200);
      expect(lastLog().action).toBe('rental.cheque-undo');
      expect(lastLog().message).toContain('motivo: Rebotó');
      expect((await f.agent.get('/api/alerts?type=cheque_due')).body).toHaveLength(1);
      expect((await f.agent.post(`/api/rentals/collections/${soon.body.id}/cheque-cashed/undo`).send({ reason: 'otra vez' })).status).toBe(409);
    });

    test('a past cheque date stays as an overdue alert', async () => {
      const res = await collectMonth([line('locacion', 121000, { method: 'Cheque', chequeDays: 5, date: plusDays(today(), -10) })]);
      expect(res.status).toBe(201);
      const [alert] = (await f.agent.get(`/api/alerts?type=cheque_due&from=${plusDays(today(), -30)}`)).body;
      expect(alert.status).toBe('overdue');
      expect(alert.message).toContain('debía cobrarse');
    });

    test('cheque endpoints reject unknown, foreign and non-cheque collections', async () => {
      expect((await f.agent.post('/api/rentals/collections/nope/cheque-cashed').send({})).status).toBe(404);
      const plain = await collectMonth([line('locacion', 121000, { method: 'Transferencia' })]);
      expect((await f.agent.post(`/api/rentals/collections/${plain.body.id}/cheque-cashed`).send({})).status).toBe(409);
      const cheque = await collectMonth([line('comodato', 50000, { method: 'Cheque', chequeDays: 2 })]);
      expect((await f.other.post(`/api/rentals/collections/${cheque.body.id}/cheque-cashed`).send({})).status).toBe(404);
      const reversed = await f.agent.post(`/api/rentals/collections/${cheque.body.id}/reverse`).send({ reason: 'error' });
      expect(reversed.status).toBe(200);
      expect(rentCollections.chequeAlerts(f.db, f.userId, { today: today() })).toHaveLength(0);
      expect(activityLog.isUndoable(f.db, f.userId, { outcome: 'success', undo: { type: 'rental.cheque', collectionId: cheque.body.id } })).toBe(false);
    });
  });

  describe('log wording', () => {
    test('describe appends extra detail fragments and ignores empty ones', () => {
      expect(activityLog.describe({}, { amount: 10, currencyCode: 'ARS', details: ['saldo pendiente ARS 5', '', 3] }, 'Casa')).toBe('Casa, por un monto de ARS 10, saldo pendiente ARS 5');
    });
  });
});
