const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const ledger = require('../../src/services/account-ledger');
const rentMirror = require('../../src/services/rent-mirror');

describe('Evolutivo 13: titular as tenant and its automatic mirror expense', () => {
  let f;
  let landlord;
  let titularTenant;
  let tenantAccountId;
  let counter = 0;

  beforeEach(async () => {
    counter += 1;
    f = await setupRentFixture(`evo13-${counter}`);
    landlord = (await f.agent.post('/api/owners').send({ name: 'Locador SA', kind: 'entity', roles: ['owner'] })).body;
    titularTenant = (await f.agent.post('/api/owners').send({ name: 'Titular Inquilino', kind: 'entity', roles: ['owner'] })).body;
    await f.agent.put(`/api/accounts/${f.accountId}`).send({ ownerId: landlord.id });
    await f.agent.post(`/api/assets/${f.assetId}/ownerships`).send({ ownerId: landlord.id, startDate: '2020-01-01', percentage: 100 });
    tenantAccountId = (await f.agent.post('/api/accounts').send({ name: 'Cuenta inquilino ARS', currency: 'ARS', ownerId: titularTenant.id })).body.id;
  });
  afterAll(() => cleanupTestDb());

  const today = () => ledger.localDateForUser(f.db, f.userId);
  const makeTenant = () => f.agent.put(`/api/owners/${titularTenant.id}`).send({ roles: [...titularTenant.roles, 'tenant'] });
  const declare = (modalities, tenantIds = [titularTenant.id]) => f.agent.post('/api/rentals/declarations').send({ assetId: f.assetId, tenantIds, notes: '', modalities });
  const declareBoth = async () => {
    await makeTenant();
    const res = await declare([f.modality('locacion', { amount: 100000, ivaPercent: 21 }), f.modality('comodato', { amount: 50000 })]);
    expect(res.status).toBe(201);
    return res.body;
  };
  const part = (declaration, kind, date = '2025-01-01') => declaration.modalities.find(item => item.kind === kind).occurrences.find(item => item.date === date);
  const collectMonth = (lines, key) => f.agent.post('/api/rentals/collections/month').send({ idempotencyKey: key || `evo13-month-${counter}-${Math.random()}`, lines });
  const line = (declaration, kind, amount, extra = {}) => ({
    occurrenceId: part(declaration, kind).id, amount, accountId: f.accountId, date: '2025-03-02', clasificacion: kind === 'locacion' ? 'A' : 'B', ...extra
  });
  const mirrors = () => f.db.findAll('transactions', f.userId).filter(item => item.mirrorRentCollectionId);

  describe('R1: an existing titular becomes a tenant (same entity, no duplicate)', () => {
    test('adding the tenant role keeps the id, the data and both role lists', async () => {
      const before = f.db.findAll('legalOwners', f.userId).length;
      const res = await makeTenant();
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: titularTenant.id, name: 'Titular Inquilino', roles: ['owner', 'tenant'] });
      expect(f.db.findAll('legalOwners', f.userId)).toHaveLength(before);
      const owners = (await f.agent.get('/api/owners')).body;
      expect(owners.filter(item => item.roles.includes('owner')).map(item => item.id)).toContain(titularTenant.id);
      expect(owners.filter(item => item.roles.includes('tenant')).map(item => item.id)).toContain(titularTenant.id);
    });
  });

  describe('R2: tenant pickers and self-rent', () => {
    test('an owner+tenant entity is a valid tenant of a contract', async () => {
      await makeTenant();
      const res = await declare([f.modality('locacion')]);
      expect(res.status).toBe(201);
      expect(res.body.tenants.map(item => item.id)).toEqual([titularTenant.id]);
    });

    test('a titular of the asset cannot rent its own asset (declarations and contracts)', async () => {
      await f.agent.put(`/api/owners/${landlord.id}`).send({ roles: ['owner', 'tenant'] });
      const declared = await declare([f.modality('locacion')], [landlord.id]);
      expect(declared.status).toBe(400);
      expect(declared.body.error).toBe('Locador SA es titular de este inmueble: un titular no puede alquilar su propio bien');
      await expect(f.createContract({ tenantIds: [landlord.id] })).rejects.toThrow(/400/);
      expect(f.db.findAll('rentalContracts', f.userId)).toHaveLength(0);
    });

    test('a former titular (ended ownership) may rent the asset', async () => {
      const ownership = f.db.findAll('assetOwnerships', f.userId).find(item => item.ownerId === landlord.id);
      f.db.update('assetOwnerships', ownership.id, { endDate: '2024-12-31' }, f.userId);
      await f.agent.put(`/api/owners/${landlord.id}`).send({ roles: ['owner', 'tenant'] });
      expect((await declare([f.modality('locacion')], [landlord.id])).status).toBe(201);
    });
  });

  describe('R3: mirror expense on a month collection', () => {
    test('locación A with IVA mirrors amount, account, date, payment method and the IVA as credit of the tenant titular', async () => {
      const declaration = await declareBoth();
      const res = await collectMonth([line(declaration, 'locacion', 121000, { method: 'Transferencia', tenantAccountId })]);
      expect(res.status).toBe(201);
      expect(res.body.mirrorTransactionIds).toHaveLength(1);
      expect(res.body.mirrorTenant).toBe('Titular Inquilino');
      const collection = f.db.findById('rentCollections', res.body.collectionIds[0], f.userId);
      const income = f.db.findById('transactions', collection.transactionId, f.userId);
      const mirror = f.db.findById('transactions', collection.mirrorTransactionId, f.userId);
      expect(income).toMatchObject({ tipo: 'income', incomeHolderId: landlord.id, ivaPorcentaje: 21, ivaIncluded: true });
      expect(mirror).toMatchObject({
        tipo: 'expense', monto: 121000, currencyCode: 'ARS', accountId: tenantAccountId, fecha: '2025-03-02', paymentMethod: 'Transferencia',
        titulo: 'Alquiler pagado — Casa Centro 01/2025', categoryId: null, ivaPorcentaje: 21, ivaIncluded: true,
        ivaHolderId: titularTenant.id, ivaHolderName: 'Titular Inquilino', mirrorOfTransactionId: income.id, mirrorRentCollectionId: collection.id
      });
      expect(res.body.lines[0].mirrorTransactionId).toBe(mirror.id);
      const summary = (await f.agent.get('/api/summary?month=2025-03')).body;
      const row = id => summary.ivaByHolder.find(item => item.ownerId === id && item.currency === 'ARS');
      expect(row(landlord.id)).toMatchObject({ debit: 21000, credit: 0 });
      expect(row(titularTenant.id)).toMatchObject({ debit: 0, credit: 21000 });
      const log = f.db.findAll('activityLogs', f.userId).pop();
      expect(log.message).toContain('con el gasto espejo de Titular Inquilino');
    });

    test('a B line mirrors without IVA, uses the "Alquiler" category and the default (primary-first) tenant account', async () => {
      const category = (await f.agent.post('/api/categories').send({ nombre: 'Alquiler' })).body;
      const declaration = await declareBoth();
      const res = await collectMonth([line(declaration, 'comodato', 50000)]);
      expect(res.status).toBe(201);
      expect(mirrors()).toHaveLength(1);
      expect(mirrors()[0]).toMatchObject({ accountId: tenantAccountId, monto: 50000, categoryId: category.id, ivaPorcentaje: null, ivaIncluded: false, ivaHolderId: null });
    });

    test('two lines create two mirrors; several titular tenants use the first one', async () => {
      const second = (await f.agent.post('/api/owners').send({ name: 'Otro Titular', kind: 'entity', roles: ['owner', 'tenant'] })).body;
      await makeTenant();
      const declaration = (await declare([f.modality('locacion', { amount: 100000, ivaPercent: 21 }), f.modality('comodato', { amount: 50000 })], [titularTenant.id, second.id])).body;
      const res = await collectMonth([line(declaration, 'locacion', 121000), line(declaration, 'comodato', 50000)]);
      expect(res.status).toBe(201);
      expect(mirrors().map(item => item.accountId)).toEqual([tenantAccountId, tenantAccountId]);
    });

    test('a cheque mirrors on the cheque collection date', async () => {
      const declaration = await declareBoth();
      const date = today();
      const res = await collectMonth([line(declaration, 'locacion', 121000, { date, method: 'Cheque', chequeDays: 30 })]);
      expect(res.status).toBe(201);
      const due = new Date(`${date}T00:00:00.000Z`);
      due.setUTCDate(due.getUTCDate() + 30);
      expect(mirrors()[0].fecha).toBe(due.toISOString().slice(0, 10));
      expect(mirrors()[0].paymentMethod).toBe('Cheque');
    });

    test('a tenant titular without an account in the currency blocks the collection and writes nothing', async () => {
      f.db.update('accounts', tenantAccountId, { currency: 'USD' }, f.userId);
      const declaration = await declareBoth();
      const before = f.db.findAll('transactions', f.userId).length;
      const res = await collectMonth([line(declaration, 'locacion', 121000)]);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('El inquilino Titular Inquilino es titular: creá primero una cuenta en ARS a su nombre para registrar su gasto de alquiler');
      expect(f.db.findAll('transactions', f.userId)).toHaveLength(before);
      expect(f.db.findAll('rentCollections', f.userId)).toHaveLength(0);
      expect(f.db.findAll('rentCollectionGroups', f.userId)).toHaveLength(0);
    });

    test('rejects a chosen account that is not an active account of the tenant titular in the line currency', async () => {
      const declaration = await declareBoth();
      const foreign = await collectMonth([line(declaration, 'locacion', 121000, { tenantAccountId: f.accountId })]);
      expect(foreign.status).toBe(400);
      expect(foreign.body.error).toContain('Seleccioná una cuenta activa del inquilino Titular Inquilino');
      const usd = (await f.agent.post('/api/accounts').send({ name: 'Inquilino USD', currency: 'USD', ownerId: titularTenant.id })).body.id;
      const wrongCurrency = await collectMonth([line(declaration, 'locacion', 121000, { tenantAccountId: usd })]);
      expect(wrongCurrency.status).toBe(400);
      expect(wrongCurrency.body.error).toBe('La cuenta del inquilino Titular Inquilino debe estar en ARS');
      expect((await collectMonth([line(declaration, 'locacion', 121000, { tenantAccountId: 42 })])).status).toBe(400);
      expect(mirrors()).toHaveLength(0);
    });

    test('a tenant that is not a titular creates no mirror', async () => {
      const res = await f.declare([f.modality('locacion')]);
      const occurrence = res.body.modalities[0].occurrences[0];
      const collected = await collectMonth([{ occurrenceId: occurrence.id, amount: occurrence.rentMinor / 100, accountId: f.accountId, date: '2025-03-02' }]);
      expect(collected.status).toBe(201);
      expect(collected.body.mirrorTransactionIds).toEqual([]);
      expect(mirrors()).toHaveLength(0);
    });

    test('undoing the collection removes the mirror and logs it; a dependent on the mirror blocks the undo', async () => {
      const declaration = await declareBoth();
      const res = await collectMonth([line(declaration, 'locacion', 121000)]);
      const mirror = mirrors()[0];
      const refund = f.db.create('transactions', { userId: f.userId, tipo: 'refund', monto: 1, refundSourceId: mirror.id, accountId: tenantAccountId, fecha: '2025-03-03', titulo: 'Reintegro' }, f.userId);
      const blocked = await f.agent.post(`/api/rentals/collections/${res.body.id}/reverse`).send({ reason: 'Error de carga' });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error).toContain('El gasto espejo del inquilino tiene un reembolso');
      f.db.remove('transactions', refund.id, f.userId);
      const undone = await f.agent.post(`/api/rentals/collections/${res.body.id}/reverse`).send({ reason: 'Error de carga' });
      expect(undone.status).toBe(200);
      expect(undone.body.deletedMirrorTransactionIds).toEqual([mirror.id]);
      expect(mirrors()).toHaveLength(0);
      expect(f.db.findById('rentCollections', res.body.collectionIds[0], f.userId)).toMatchObject({ reversedMirrorTransactionId: mirror.id });
      const log = f.db.findAll('activityLogs', f.userId).pop();
      expect(log.action).toBe('rental.collection-undo');
      expect(log.message).toContain('también se eliminó el gasto espejo del inquilino');
    });

    test('undoing through the income DELETE also removes the mirror and resets a reconciled tenant account', async () => {
      const declaration = await declareBoth();
      const res = await collectMonth([line(declaration, 'locacion', 121000)]);
      const mirror = mirrors()[0];
      f.db.update('accounts', tenantAccountId, { reconciled: true, openingDate: '2020-01-01', includedMovementIds: [mirror.id] }, f.userId);
      const deleted = await f.agent.delete(`/api/transactions/${res.body.transactionIds[0]}`);
      expect(deleted.status).toBe(200);
      expect(deleted.body.reconciliationReset).toBe(true);
      expect(mirrors()).toHaveLength(0);
      expect(f.db.findById('accounts', tenantAccountId, f.userId)).toMatchObject({ reconciled: false, includedMovementIds: [] });
    });

    test('the mirror is read-only: PUT and DELETE answer 409 pointing to the rent collection', async () => {
      const declaration = await declareBoth();
      await collectMonth([line(declaration, 'locacion', 121000)]);
      const mirror = mirrors()[0];
      const put = await f.agent.put(`/api/transactions/${mirror.id}`).send({ monto: 5 });
      expect(put.status).toBe(409);
      expect(put.body.error).toBe('Este gasto es el espejo de un cobro de alquiler: para corregirlo o eliminarlo, deshacé el cobro desde el alquiler');
      const del = await f.agent.delete(`/api/transactions/${mirror.id}`);
      expect(del.status).toBe(409);
      expect(del.body.error).toBe(put.body.error);
      expect(mirrors()).toHaveLength(1);
    });

    test('month parts expose the tenant ids for the collection form', async () => {
      await declareBoth();
      const months = (await f.agent.get(`/api/rentals/months?assetId=${f.assetId}`)).body;
      expect(months[0].parts[0].tenantIds).toEqual([titularTenant.id]);
    });
  });

  describe('R3: mirror expense on the legacy single collection', () => {
    const legacyCollect = (declaration, kinds, extra = {}) => {
      const allocations = kinds.map(kind => ({ occurrenceId: part(declaration, kind).id, amount: part(declaration, kind).rentMinor / 100 }));
      return f.agent.post('/api/rentals/collections').send({
        amount: allocations.reduce((sum, item) => sum + item.amount, 0), accountId: f.accountId, date: '2025-03-02', allocations,
        idempotencyKey: `evo13-legacy-${counter}-${kinds.join('-')}`, ...extra
      });
    };

    test('an A collection mirrors the whole amount with its IVA; undo removes it', async () => {
      const declaration = await declareBoth();
      const res = await legacyCollect(declaration, ['locacion'], { tenantAccountId, method: 'Efectivo' });
      expect(res.status).toBe(201);
      expect(res.body.mirrorTransactionId).toBe(mirrors()[0].id);
      expect(mirrors()[0]).toMatchObject({ monto: 121000, accountId: tenantAccountId, ivaPorcentaje: 21, ivaIncluded: true, ivaHolderId: titularTenant.id, paymentMethod: 'Efectivo' });
      expect(f.db.findAll('activityLogs', f.userId).pop().message).toContain('con el gasto espejo de Titular Inquilino');
      const undone = await f.agent.post(`/api/rentals/collections/${res.body.id}/reverse`).send({ reason: 'Error de carga' });
      expect(undone.status).toBe(200);
      expect(undone.body.deletedMirrorTransactionIds).toEqual([res.body.mirrorTransactionId]);
      expect(mirrors()).toHaveLength(0);
    });

    test('a Mixto collection mirrors without IVA', async () => {
      const declaration = await declareBoth();
      const res = await legacyCollect(declaration, ['locacion', 'comodato']);
      expect(res.status).toBe(201);
      expect(mirrors()[0]).toMatchObject({ monto: 171000, ivaPorcentaje: null, ivaHolderId: null });
    });

    test('a missing tenant account answers 400 and writes nothing; a mirror dependent blocks the undo', async () => {
      const declaration = await declareBoth();
      f.db.update('accounts', tenantAccountId, { activo: false }, f.userId);
      const before = f.db.findAll('transactions', f.userId).length;
      const blocked = await legacyCollect(declaration, ['locacion']);
      expect(blocked.status).toBe(400);
      expect(f.db.findAll('transactions', f.userId)).toHaveLength(before);
      f.db.update('accounts', tenantAccountId, { activo: true }, f.userId);
      const res = await legacyCollect(declaration, ['comodato']);
      f.db.create('movementAllocations', { transactionId: res.body.mirrorTransactionId, amountMinor: 1 }, f.userId);
      const undo = await f.agent.post(`/api/rentals/collections/${res.body.id}/reverse`).send({ reason: 'Error de carga' });
      expect(undo.status).toBe(409);
      expect(undo.body.error).toContain('El gasto espejo del inquilino tiene una atribución de movimiento');
    });

    test('a reconciled tenant account is reset when the mirror goes away', async () => {
      const declaration = await declareBoth();
      const res = await legacyCollect(declaration, ['locacion']);
      f.db.update('accounts', tenantAccountId, { reconciled: true, includedMovementIds: [res.body.mirrorTransactionId, 'other'] }, f.userId);
      const undone = await f.agent.post(`/api/rentals/collections/${res.body.id}/reverse`).send({ reason: 'Error de carga' });
      expect(undone.body.reconciliationReset).toBe(true);
      expect(f.db.findById('accounts', tenantAccountId, f.userId)).toMatchObject({ reconciled: false, includedMovementIds: ['other'] });
    });
  });

  describe('rent-mirror helpers', () => {
    test('titularTenant and tenantAccounts', async () => {
      expect(rentMirror.titularTenant(f.db, f.userId, null)).toBeNull();
      expect(rentMirror.titularTenant(f.db, f.userId, { tenantIds: [f.tenantId] })).toBeNull();
      expect(rentMirror.titularTenant(f.db, f.userId, { tenantIds: ['missing', titularTenant.id] }).id).toBe(titularTenant.id);
      const primary = (await f.agent.post('/api/accounts').send({ name: 'Otra', currency: 'ARS', ownerId: titularTenant.id })).body.id;
      f.db.update('accounts', primary, { primary: true }, f.userId);
      expect(rentMirror.tenantAccounts(f.db, f.userId, titularTenant, 'ARS').map(item => item.id)).toEqual([primary, tenantAccountId]);
      expect(rentMirror.isOwner({})).toBe(true);
      expect(rentMirror.isOwner({ roles: ['tenant'] })).toBe(false);
      expect(rentMirror.isOwner(null)).toBe(false);
    });

    test('plan without asset or period keeps a short title', () => {
      const planned = rentMirror.plan(f.db, f.userId, { contract: { tenantIds: [titularTenant.id] }, occurrence: null, currency: 'ARS', amountMinor: 100, ivaPercent: null, date: '2025-03-02' });
      expect(planned.value).toMatchObject({ titulo: 'Alquiler pagado —', method: '', paymentMethodId: null, ivaPorcentaje: null, ivaIncluded: false });
    });
  });
});
