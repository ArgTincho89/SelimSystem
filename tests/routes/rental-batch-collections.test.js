const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const rentSchedule = require('../../src/services/rent-schedule');
const ledger = require('../../src/services/account-ledger');

describe('Rental batch: overlaps, early end, schedule and per-modality collections', () => {
  let f;
  beforeEach(async () => { f = await setupRentFixture('rent-batch-col'); });
  afterAll(() => cleanupTestDb());

  const today = () => ledger.localDateForUser(f.db, f.userId);
  const plusDays = (date, days) => { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
  const account = async name => (await f.agent.post('/api/accounts').send({ name, currency: 'ARS' })).body.id;

  describe('item 3: one rental per date range', () => {
    test('rejects overlapping rentals with a 409 that points at the rental to finalize', async () => {
      const first = (await f.declare([f.modality('locacion', { startDate: '2025-01-01', endDate: '2025-12-31' }), f.modality('comodato', { startDate: '2025-01-01', endDate: '2025-12-31' })])).body;
      const overlapping = await f.declare([f.modality('mutuo', { startDate: '2025-06-01', endDate: '2026-05-31' })]);
      expect(overlapping.status).toBe(409);
      expect(overlapping.body.error).toContain('Primero declará la finalización de ese alquiler');
      expect(overlapping.body.error).toContain('del 01/01/2025 al 31/12/2025');
      expect(overlapping.body.conflict).toMatchObject({ declarationId: first.id, startDate: '2025-01-01', endDate: '2025-12-31', active: true });
      // A non-overlapping rental may be declared while the other one is in force.
      const next = await f.declare([f.modality('locacion', { startDate: '2026-01-01', endDate: null })]);
      expect(next.status).toBe(201);
      // Editing never conflicts with itself, but cannot grow into the next rental.
      expect((await f.edit(first.id, [f.modality('locacion', { startDate: '2025-01-01', endDate: '2025-12-31' })])).status).toBe(200);
      const grown = await f.edit(first.id, [f.modality('locacion', { startDate: '2025-01-01', endDate: '2026-03-31' })]);
      expect(grown.status).toBe(409);
      expect(grown.body.error).toContain('sin fecha de finalización');
      expect(grown.body.conflict.declarationId).toBe(next.body.id);
    });

    test('an ended rental still blocks its dates with a specific message', async () => {
      const first = (await f.declare([f.modality('locacion', { startDate: '2025-01-01', endDate: '2025-12-31' })])).body;
      expect((await f.agent.post(`/api/rentals/declarations/${first.id}/end`).send({ endDate: '2025-06-30' })).status).toBe(200);
      const overlapping = await f.declare([f.modality('locacion', { startDate: '2025-06-01', endDate: '2025-12-31' })]);
      expect(overlapping.status).toBe(409);
      expect(overlapping.body.error).toContain('alquiler finalizado');
      expect(overlapping.body.conflict.active).toBe(false);
      expect((await f.declare([f.modality('locacion', { startDate: '2025-07-01', endDate: '2025-12-31' })])).status).toBe(201);
    });

    test('early termination with a past date ends every modality and frees the following dates', async () => {
      const first = (await f.declare([f.modality('locacion', { startDate: '2025-01-01', endDate: '2025-12-31' }), f.modality('mutuo', { startDate: '2025-08-01', endDate: '2025-12-31' })])).body;
      const ended = await f.agent.post(`/api/rentals/declarations/${first.id}/end`).send({ endDate: '2025-04-30' });
      expect(ended.status).toBe(200);
      const locacion = ended.body.modalities.find(item => item.kind === 'locacion');
      const mutuo = ended.body.modalities.find(item => item.kind === 'mutuo');
      expect(locacion).toMatchObject({ status: 'ended', endDate: '2025-04-30' });
      expect(mutuo.status).toBe('cancelled');
      expect(f.db.findAll('rentOccurrences', f.userId).filter(item => item.contractId === locacion.contractId && !item.cancelled).every(item => item.date <= '2025-04-30')).toBe(true);
    });

    test('early termination with a future date keeps the rental in force until then', async () => {
      const end = plusDays(today(), 40);
      const first = (await f.declare([f.modality('locacion', { startDate: '2025-01-01', endDate: plusDays(today(), 400) })])).body;
      const ended = await f.agent.post(`/api/rentals/declarations/${first.id}/end`).send({ endDate: end });
      expect(ended.status).toBe(200);
      expect(ended.body.status).toBe('active');
      expect(ended.body.modalities[0]).toMatchObject({ status: 'active', endDate: end });
      expect((await f.declare([f.modality('locacion', { startDate: plusDays(end, 1), endDate: null })])).status).toBe(201);
    });

    test('validates the termination date', async () => {
      const first = (await f.declare([f.modality('locacion', { startDate: '2025-01-01', endDate: '2025-12-31' })])).body;
      const end = body => f.agent.post(`/api/rentals/declarations/${first.id}/end`).send(body);
      expect((await end({ endDate: '2025-13-01' })).status).toBe(400);
      expect((await end({ endDate: '2024-12-31' })).body.error).toContain('anterior al inicio');
      expect((await end({ endDate: '2026-01-31' })).body.error).toContain('posterior a la pactada');
      expect((await f.collectModality(first, 'locacion', ['2025-03-01'])).status).toBe(201);
      const blocked = await end({ endDate: '2025-02-28' });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error).toContain('períodos cobrados posteriores');
    });
  });

  describe('item 4: current period, upcoming and overdue', () => {
    test('day 01-10 is the current month; from day 11 on, the next month', () => {
      expect(rentSchedule.currentPeriod('2026-03-01')).toBe('2026-03');
      expect(rentSchedule.currentPeriod('2026-03-10')).toBe('2026-03');
      expect(rentSchedule.currentPeriod('2026-03-11')).toBe('2026-04');
      expect(rentSchedule.currentPeriod('2026-12-20')).toBe('2027-01');
      expect(rentSchedule.lastDayOf('2028-02')).toBe('2028-02-29');
      expect(rentSchedule.bucketOf('2026-04-05', '2026-04', '2026-03-15')).toBe('upcoming');
      expect(rentSchedule.bucketOf('2026-03-20', '2026-04', '2026-03-15')).toBe('upcoming');
      expect(rentSchedule.bucketOf('2026-03-05', '2026-04', '2026-03-15')).toBe('overdue');
      expect(rentSchedule.bucketOf('2026-05-05', '2026-04', '2026-03-15')).toBeNull();
    });

    test('lists the rent and obligations of the period and every unpaid previous month', async () => {
      const period = rentSchedule.currentPeriod(today());
      await f.declare([f.modality('locacion', { startDate: '2025-01-01', endDate: '2030-12-31', ivaPercent: 21 }), f.modality('comodato', { startDate: '2025-01-01', endDate: '2030-12-31' })]);
      await f.agent.post('/api/obligations').send({ title: 'ABL', type: 'tax', assetId: f.assetId, currencyCode: 'ARS', estimatedAmount: 1000, startDate: '2025-01-10', recurrenceFrequency: 'monthly' });
      const res = await f.agent.get(`/api/rentals/schedule?assetId=${f.assetId}`);
      expect(res.status).toBe(200);
      expect(res.body.period).toBe(period);
      const upcomingRent = res.body.upcoming.filter(item => item.kind === 'rent');
      expect(upcomingRent.some(item => item.period === period)).toBe(true);
      expect(upcomingRent.every(item => item.period <= period)).toBe(true);
      expect(upcomingRent[0].parts.map(part => part.modality)).toEqual(['locacion', 'comodato']);
      expect(res.body.upcoming.some(item => item.kind === 'obligation' && item.period === period)).toBe(true);
      expect(res.body.overdue.some(item => item.kind === 'rent' && item.period === '2025-01')).toBe(true);
      expect(res.body.overdue.some(item => item.kind === 'obligation' && item.date === '2025-01-10')).toBe(true);
      expect(res.body.overdue.every(item => item.period < period && item.date < today())).toBe(true);
      expect([...res.body.upcoming, ...res.body.overdue].every(item => item.period <= period)).toBe(true);
    });

    test('rejects a missing or movable asset', async () => {
      expect((await f.agent.get('/api/rentals/schedule')).status).toBe(400);
      const movable = (await f.agent.post('/api/assets').send({ type: 'movable', name: 'Auto' })).body.id;
      expect((await f.agent.get(`/api/rentals/schedule?assetId=${movable}`)).status).toBe(400);
    });
  });

  describe('items 5 and 6: one transaction per modality, grouped, with "Ver"', () => {
    let declaration;
    let transferAccount;
    let cashAccount;
    const part = (kind, date = '2025-01-01') => declaration.modalities.find(item => item.kind === kind).occurrences.find(item => item.date === date);
    let counter = 0;
    const collectMonth = (lines, key) => { counter += 1; return f.agent.post('/api/rentals/collections/month').send({ idempotencyKey: key || `month-key-${counter}-abc`, lines }); };
    const lines = () => [
      { occurrenceId: part('locacion').id, amount: part('locacion').rentMinor / 100, accountId: transferAccount, date: '2025-01-05', method: 'Transferencia' },
      { occurrenceId: part('comodato').id, amount: 3000000, accountId: cashAccount, date: '2025-01-06', method: 'Efectivo' }
    ];

    beforeEach(async () => {
      transferAccount = await account('Banco');
      cashAccount = await account('Caja');
      declaration = (await f.declare([f.modality('locacion', { amount: 9750000, ivaPercent: 21 }), f.modality('comodato', { amount: 3000000 })])).body;
    });

    test('locación with IVA (A) + comodato (B) produce two transactions in their own accounts', async () => {
      const res = await collectMonth(lines());
      expect(res.status).toBe(201);
      const group = f.db.findById('rentCollectionGroups', res.body.id, f.userId);
      expect(group.collectionIds).toHaveLength(2);
      const txs = group.transactionIds.map(id => f.db.findById('transactions', id, f.userId));
      expect(txs[0]).toMatchObject({ accountId: transferAccount, monto: 11797500, clasificacion: 'A', ivaPorcentaje: 21, ivaIncluded: true, paymentMethod: 'Transferencia', fecha: '2025-01-05', rentModality: 'locacion', rentCollectionGroupId: group.id });
      expect(txs[1]).toMatchObject({ accountId: cashAccount, monto: 3000000, clasificacion: 'B', ivaPorcentaje: null, ivaIncluded: false, paymentMethod: 'Efectivo', fecha: '2025-01-06', rentModality: 'comodato' });
      const months = (await f.agent.get(`/api/rentals/months?assetId=${f.assetId}`)).body;
      expect(months.find(item => item.date === '2025-01-01').status).toBe('collected');
      // "Ver" works from the group, a child collection and a transaction.
      for (const id of [group.id, group.collectionIds[1], txs[0].id]) {
        const view = await f.agent.get(`/api/rentals/collections/${id}/view`);
        expect(view.status).toBe(200);
        expect(view.body).toMatchObject({ id: group.id, legacy: false, periods: ['2025-01'], asset: { id: f.assetId, name: 'Casa Centro' }, tenants: ['Tenant'] });
        expect(view.body.lines.map(line => [line.modality, line.amount, line.ivaAmount, line.method, line.accountName, line.date])).toEqual([
          ['locacion', 11797500, 2047500, 'Transferencia', 'Banco', '2025-01-05'], ['comodato', 3000000, 0, 'Efectivo', 'Caja', '2025-01-06']
        ]);
        expect(view.body.totals).toEqual([expect.objectContaining({ currencyCode: 'ARS', amount: 14797500, ivaAmount: 2047500 })]);
      }
    });

    test('replays idempotently and rejects key reuse with other lines', async () => {
      const first = await collectMonth(lines(), 'month-replay-key');
      const replay = await collectMonth(lines(), 'month-replay-key');
      expect(replay.status).toBe(200);
      expect(replay.body).toMatchObject({ id: first.body.id, replayed: true });
      expect((await collectMonth(lines().slice(0, 1), 'month-replay-key')).status).toBe(409);
      expect(f.db.findAll('rentCollectionGroups', f.userId)).toHaveLength(1);
    });

    test('"Deshacer cobro" of any modality undoes the whole month atomically', async () => {
      const res = await collectMonth(lines());
      const group = f.db.findById('rentCollectionGroups', res.body.id, f.userId);
      const undone = await f.agent.delete(`/api/transactions/${group.transactionIds[1]}`);
      expect(undone.status).toBe(200);
      expect(undone.body.reopenedOccurrenceIds.sort()).toEqual([part('locacion').id, part('comodato').id].sort());
      expect(group.transactionIds.map(id => f.db.findById('transactions', id, f.userId))).toEqual([null, null]);
      expect(f.db.findById('rentCollectionGroups', group.id, f.userId).reversedAt).toBeTruthy();
      expect(f.db.findAll('rentCollectionAllocations', f.userId)).toHaveLength(0);
      expect((await f.agent.post(`/api/rentals/collections/${group.id}/reverse`)).status).toBe(409);
      expect((await f.agent.get(`/api/rentals/collections/${group.id}/view`)).body.reversed).toBe(true);
      expect((await collectMonth(lines(), 'month-key-1-abc')).status).toBe(201);
      const log = f.db.findAll('activityLogs', f.userId).map(item => item.message);
      expect(log.some(message => message.startsWith('Deshiciste el cobro del alquiler') && message.includes('ARS 14797500'))).toBe(true);
      expect(log.some(message => message.startsWith('Registraste el cobro del alquiler de Casa Centro'))).toBe(true);
    });

    test('reverses through the group id and the child collection id', async () => {
      const a = (await collectMonth(lines())).body;
      const byGroup = await f.agent.post(`/api/rentals/collections/${a.id}/reverse`);
      expect(byGroup.status).toBe(200);
      expect(byGroup.body.collectionIds).toHaveLength(2);
      const b = (await collectMonth(lines())).body;
      const byChild = await f.agent.post(`/api/rentals/collections/${b.collectionIds[0]}/reverse`);
      expect(byChild.status).toBe(200);
      expect(byChild.body.collectionId).toBe(b.collectionIds[0]);
    });

    test('a dependent refund blocks the undo of the whole month', async () => {
      const res = (await collectMonth(lines())).body;
      f.db.create('transactions', { userId: f.userId, tipo: 'refund', refundSourceId: res.transactionIds[1], monto: 1, amountMinor: 100, accountId: cashAccount, currencyCode: 'ARS', fecha: '2025-03-03', titulo: 'refund' }, f.userId);
      const undone = await f.agent.post(`/api/rentals/collections/${res.id}/reverse`);
      expect(undone.status).toBe(409);
      expect(undone.body.error).toContain('un reembolso');
      expect(res.transactionIds.every(id => f.db.findById('transactions', id, f.userId))).toBe(true);
    });

    test('resets the reconciliation of a reconciled destination account', async () => {
      const res = (await collectMonth(lines())).body;
      await f.agent.post(`/api/accounts/${cashAccount}/reconcile`).send({ openingBalance: 0, openingDate: '2025-06-01', includedMovementIds: [] });
      const undone = await f.agent.post(`/api/rentals/collections/${res.id}/reverse`);
      expect(undone.body.reconciliationReset).toBe(true);
      expect(f.db.findById('accounts', cashAccount, f.userId).reconciled).toBe(false);
    });

    test('validates lines and writes nothing on errors', async () => {
      const usd = (await f.agent.post('/api/accounts').send({ name: 'USD', currency: 'USD' })).body.id;
      const base = lines()[0];
      const cases = [
        [{ idempotencyKey: 'x', lines: [base] }, 'clave de idempotencia'],
        [{ idempotencyKey: 'valid-key-123', lines: [] }, 'al menos una modalidad'],
        [{ idempotencyKey: 'valid-key-123', lines: [base, base] }, 'repetida'],
        [{ idempotencyKey: 'valid-key-123', lines: ['bad'] }, 'Cada modalidad'],
        [{ idempotencyKey: 'valid-key-123', lines: [{ ...base, accountId: 'missing' }] }, 'cuenta activa'],
        [{ idempotencyKey: 'valid-key-123', lines: [{ ...base, amount: -1 }] }, 'importe'],
        [{ idempotencyKey: 'valid-key-123', lines: [{ ...base, date: '2999-01-01' }] }, 'no futura'],
        [{ idempotencyKey: 'valid-key-123', lines: [{ ...base, paymentMethodId: 'missing' }] }, 'medio de cobro'],
        [{ idempotencyKey: 'valid-key-123', lines: [{ ...base, method: 'x'.repeat(101) }] }, '100 caracteres'],
        [{ idempotencyKey: 'valid-key-123', lines: [{ ...base, clasificacion: 'Z' }] }, 'A o B'],
        [{ idempotencyKey: 'valid-key-123', lines: [{ ...base, accountId: usd }] }, 'otra moneda'],
        [{ idempotencyKey: 'valid-key-123', lines: [{ ...base, amount: 99999999 }] }, 'saldo pendiente']
      ];
      for (const [body, message] of cases) {
        const res = await f.agent.post('/api/rentals/collections/month').send(body);
        expect(res.status).toBe(400);
        expect(res.body.error).toContain(message);
      }
      expect(f.db.findAll('rentCollectionGroups', f.userId)).toHaveLength(0);
      expect(f.db.findAll('transactions', f.userId).filter(item => item.rentCollectionId)).toHaveLength(0);
    });

    test('lines from two properties are rejected', async () => {
      const otherAsset = (await f.agent.post('/api/assets').send({ type: 'immovable', name: 'Otra', propertyType: 'Casa' })).body.id;
      const other = (await f.agent.post('/api/rentals/declarations').send({ assetId: otherAsset, tenantIds: [f.tenantId], notes: '', modalities: [f.modality('comodato')] })).body;
      const res = await collectMonth([lines()[0], { occurrenceId: other.modalities[0].occurrences[0].id, amount: 100000, accountId: cashAccount }]);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('mismo alquiler');
    });

    test('rolls back every write when a step fails', async () => {
      const original = f.db.create.bind(f.db);
      const spy = jest.spyOn(f.db, 'create').mockImplementation((collection, item, userId) => {
        if (collection === 'rentCollectionAllocations') throw new Error('disk full');
        return original(collection, item, userId);
      });
      const res = await collectMonth(lines());
      spy.mockRestore();
      expect(res.status).toBe(500);
      expect(f.db.findAll('transactions', f.userId).filter(item => item.rentCollectionId)).toHaveLength(0);
      expect(f.db.findAll('rentCollections', f.userId)).toHaveLength(0);
    });

    test('"Ver" splits a legacy single-transaction collection by modality', async () => {
      const allocations = [{ occurrenceId: part('locacion').id, amount: part('locacion').rentMinor / 100 }, { occurrenceId: part('comodato').id, amount: 3000000 }];
      const legacy = await f.agent.post('/api/rentals/collections').send({ amount: 14797500 + 500, accountId: f.accountId, date: '2025-01-07', method: 'Cheque', allocations, idempotencyKey: 'legacy-collection-key' });
      expect(legacy.status).toBe(201);
      const view = await f.agent.get(`/api/rentals/collections/${legacy.body.transactionId}/view`);
      expect(view.status).toBe(200);
      expect(view.body).toMatchObject({ id: legacy.body.id, legacy: true, groupId: null, date: '2025-01-07' });
      expect(view.body.lines.map(line => [line.modality, line.amount, line.ivaAmount, line.method, line.accountName, line.clasificacion])).toEqual([
        ['locacion', 11797500, 2047500, 'Cheque', 'Rent ARS', 'A'], ['comodato', 3000000, 0, 'Cheque', 'Rent ARS', 'B'], [null, 500, 0, 'Cheque', 'Rent ARS', null]
      ]);
      expect((await f.agent.get('/api/rentals/collections/missing/view')).status).toBe(404);
      expect((await f.other.get(`/api/rentals/collections/${legacy.body.id}/view`)).status).toBe(404);
    });
  });
});
