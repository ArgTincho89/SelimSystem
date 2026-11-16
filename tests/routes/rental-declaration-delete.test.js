const request = require('supertest');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');

describe('DELETE /api/rentals/declarations/:id, ?summary=1 and the safe edit of a historical rental', () => {
  let f;
  let declaration;
  let locacionId;
  const remove = id => f.agent.delete(`/api/rentals/declarations/${id || declaration.id}`);
  const logs = () => f.db.findAll('activityLogs', f.userId);
  const count = name => f.db.findAll(name, f.userId).length;
  const finish = () => f.agent.post(`/api/rentals/declarations/${declaration.id}/end`).send({ endDate: '2025-12-31' });
  const collect = async (key, date = '2025-03-01') => {
    const view = (await f.agent.get('/api/rentals/declarations').query({ assetId: f.assetId })).body.find(item => item.id === declaration.id);
    const occurrence = view.modalities[0].occurrences.find(item => item.date === date);
    return f.agent.post('/api/rentals/collections/month').send({ idempotencyKey: key, lines: [{ occurrenceId: occurrence.id, amount: occurrence.rentMinor / 100, accountId: f.accountId, date: '2025-03-02' }] });
  };
  const upload = (fields, name = 'receipt.txt') => {
    let req = f.agent.post('/api/documents');
    Object.entries(fields).forEach(([key, value]) => { req = req.field(key, value); });
    return req.attach('file', Buffer.from('receipt'), { filename: name, contentType: 'text/plain' });
  };

  beforeEach(async () => {
    f = await setupRentFixture('rental-delete');
    declaration = (await f.declare([f.modality('locacion', { ivaPercent: null })])).body;
    locacionId = declaration.modalities[0].contractId;
  });
  afterAll(() => cleanupTestDb());

  it('rejects deleting an active rental and changes nothing', async () => {
    const before = [count('rentalDeclarations'), count('rentalContracts'), count('rentOccurrences')];
    const response = await remove();
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Finalizá el alquiler antes de eliminarlo');
    expect([count('rentalDeclarations'), count('rentalContracts'), count('rentOccurrences')]).toEqual(before);
    expect(count('rentalDeletions')).toBe(0);
  });

  it('rejects deleting a finished rental with non-reversed collections, then allows it after "Deshacer cobro"', async () => {
    const collected = await collect('rental-delete-1');
    expect(collected.status).toBe(201);
    expect((await finish()).status).toBe(200);
    const blocked = await remove();
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('No se puede eliminar este alquiler porque tiene cobros registrados. Deshacé los cobros primero.');
    expect(count('rentalDeclarations')).toBe(1);
    expect((await f.agent.post(`/api/rentals/collections/${collected.body.id}/reverse`).send({})).status).toBe(200);
    const allowed = await remove();
    expect(allowed.status).toBe(200);
    expect(allowed.body.deleted).toBe(true);
    // The reversed collection stays for the audit; the rental itself is gone.
    expect(f.db.findAll('rentCollections', f.userId).filter(item => item.reversedAt)).toHaveLength(1);
    expect([count('rentalDeclarations'), count('rentalContracts'), count('rentOccurrences'), count('rentalConditions')]).toEqual([0, 0, 0, 0]);
  });

  it('cascades: rental-only documents and notes go, other documents are detached, obligations are unlinked, a tombstone is kept', async () => {
    const obligation = (await f.agent.post('/api/obligations').send({ title: 'Expensas', type: 'utility', currencyCode: 'ARS', estimatedAmount: 10, startDate: '2025-02-10', assetId: f.assetId })).body;
    expect((await f.agent.patch(`/api/obligations/${obligation.id}/responsibility`).send({ responsibilityType: 'tenant' })).status).toBe(200);
    expect(f.db.findById('obligations', obligation.id, f.userId).rentalContractId).toBe(locacionId);
    const onlyRental = (await upload({ contractId: locacionId })).body;
    const shared = (await upload({ contractId: locacionId, obligationId: obligation.id }, 'shared.txt')).body;
    expect(onlyRental.id).toBeTruthy();
    expect(shared.id).toBeTruthy();
    expect((await f.agent.post('/api/notes').send({ targetType: 'contract', targetId: locacionId, content: 'nota del contrato' })).status).toBe(201);
    const storageSpy = jest.spyOn(f.app.locals.documentStorage, 'remove');
    expect((await finish()).status).toBe(200);
    const response = await remove();
    const storageCalls = storageSpy.mock.calls.length;
    storageSpy.mockRestore();
    expect(response.status).toBe(200);
    expect(response.body.deletedDocumentIds).toEqual([onlyRental.id]);
    expect(response.body.detachedDocumentIds).toEqual([shared.id]);
    expect(f.db.findById('documents', onlyRental.id, f.userId)).toBeFalsy();
    expect(f.db.findById('documents', shared.id, f.userId)).toMatchObject({ contractId: null, obligationId: obligation.id });
    expect(f.db.findAll('wealthNotes', f.userId).filter(item => item.targetType === 'contract')).toEqual([]);
    expect(f.db.findById('obligations', obligation.id, f.userId).rentalContractId).toBeNull();
    const [tombstone] = f.db.findAll('rentalDeletions', f.userId);
    expect(tombstone).toMatchObject({ declarationId: declaration.id, assetId: f.assetId });
    expect(tombstone.snapshot.contracts.map(item => item.id)).toEqual([locacionId]);
    expect(tombstone.snapshot.documentIds).toEqual(expect.arrayContaining([onlyRental.id, shared.id]));
    expect(storageCalls).toBe(1);
    expect((await f.agent.get('/api/assets')).body.find(item => item.id === f.assetId).activeDeclarationId).toBeNull();
  });

  it('is atomic: a failure while removing leaves the rental and its data intact', async () => {
    expect((await finish()).status).toBe(200);
    const original = f.db.remove.bind(f.db);
    const spy = jest.spyOn(f.db, 'remove').mockImplementation((collection, ...args) => {
      if (collection === 'rentalDeclarations') throw new Error('boom');
      return original(collection, ...args);
    });
    const response = await remove();
    spy.mockRestore();
    expect(response.status).toBe(500);
    expect([count('rentalDeclarations'), count('rentalContracts')]).toEqual([1, 1]);
    expect(count('rentOccurrences')).toBeGreaterThan(0);
    expect(count('rentalDeletions')).toBe(0);
  });

  it('logs the deletion with its specific entry', async () => {
    expect((await finish()).status).toBe(200);
    expect((await remove()).status).toBe(200);
    expect(logs().some(entry => entry.action === 'rental.declaration-delete' && entry.outcome === 'success')).toBe(true);
  });

  it('answers 404 for unknown and foreign rentals and 401 without a session', async () => {
    expect((await remove('missing')).status).toBe(404);
    expect((await f.other.delete(`/api/rentals/declarations/${declaration.id}`)).status).toBe(404);
    expect((await request(f.app).delete(`/api/rentals/declarations/${declaration.id}`)).status).toBe(401);
    expect(count('rentalDeclarations')).toBe(1);
  });

  it('serves a lightweight summary list (no occurrences) with editable, deletable and impact', async () => {
    expect((await finish()).status).toBe(200);
    const response = await f.agent.get('/api/rentals/declarations').query({ assetId: f.assetId, summary: '1' });
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    const [row] = response.body;
    expect(JSON.stringify(row)).not.toContain('occurrences');
    expect(row).toMatchObject({
      id: declaration.id, from: '2025-01-01', to: '2025-12-31', state: 'ended', modalities: ['locacion'], editable: true, deletable: true,
      impact: { collections: 0, reversedCollections: 0, documents: 0, notes: 0, linkedObligations: 0 }
    });
    expect(row.tenants).toEqual([expect.objectContaining({ name: 'Tenant' })]);
    expect(row.impact.periods).toBeGreaterThan(0);
  });

  it('marks a rental with collections, documents or obligations as not editable, and not deletable while collections exist', async () => {
    expect((await collect('rental-delete-2')).status).toBe(201);
    expect((await upload({ contractId: locacionId })).status).toBe(201);
    expect((await finish()).status).toBe(200);
    const [row] = (await f.agent.get('/api/rentals/declarations').query({ assetId: f.assetId, summary: '1' })).body;
    expect(row).toMatchObject({ editable: false, deletable: false, impact: { collections: 1, documents: 1 } });
  });

  it('edits a historical rental only when it is safe, rewriting its periods', async () => {
    expect((await finish()).status).toBe(200);
    const safe = await f.edit(declaration.id, [f.modality('locacion', { ivaPercent: null, amount: 200000, startDate: '2025-02-01', endDate: '2025-08-31' })]);
    expect(safe.status).toBe(200);
    expect(safe.body.modalities).toHaveLength(1);
    expect(safe.body.modalities[0]).toMatchObject({ amount: 200000, startDate: '2025-02-01', endDate: '2025-08-31', status: 'ended' });
    expect(count('rentalContracts')).toBe(1);
    expect(f.db.findAll('rentOccurrences', f.userId).every(item => item.date >= '2025-02-01' && item.date <= '2025-08-31')).toBe(true);
    expect((await f.agent.get('/api/assets')).body.find(item => item.id === f.assetId).activeDeclarationId).toBeNull();
    expect((await collect('rental-delete-3', '2025-03-01')).status).toBe(201);
    const blocked = await f.edit(declaration.id, [f.modality('locacion', { ivaPercent: null })]);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain('No se puede editar este alquiler');
  });
});
