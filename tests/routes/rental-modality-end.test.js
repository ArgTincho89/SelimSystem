const request = require('supertest');
const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const ledger = require('../../src/services/account-ledger');
const rentals = require('../../src/services/rentals');

describe('Finalizar contrato: POST /api/rentals/declarations/:id/modalities/:contractId/end', () => {
  let f;
  let declaration;
  let locacionId;
  let comodatoId;
  const today = () => ledger.localDateForUser(f.db, f.userId);
  const shift = (date, months) => { const value = new Date(`${date.slice(0, 7)}-01T00:00:00.000Z`); value.setUTCMonth(value.getUTCMonth() + months); return value.toISOString().slice(0, 10); };
  const yesterday = () => { const value = new Date(`${today()}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() - 1); return value.toISOString().slice(0, 10); };
  const end = (contractId, body = {}) => f.agent.post(`/api/rentals/declarations/${declaration.id}/modalities/${contractId}/end`).send(body);
  const preview = (contractId, endDate) => f.agent.get(`/api/rentals/declarations/${declaration.id}/modalities/${contractId}/end-preview`).query({ endDate });
  const logs = () => f.db.findAll('activityLogs', f.userId);
  const liveOccurrences = contractId => f.db.findAll('rentOccurrences', f.userId).filter(item => item.contractId === contractId && !item.cancelled);

  beforeEach(async () => {
    f = await setupRentFixture('rental-modality-end');
    const start = shift(today(), -2);
    declaration = (await f.declare([
      f.modality('locacion', { startDate: start, endDate: shift(start, 14), ivaPercent: null }),
      f.modality('comodato', { startDate: start, endDate: shift(start, 14), amount: 50000 })
    ])).body;
    locacionId = declaration.modalities.find(item => item.kind === 'locacion').contractId;
    comodatoId = declaration.modalities.find(item => item.kind === 'comodato').contractId;
  });
  afterAll(() => cleanupTestDb());

  it('ends only that modality, cancels its future uncollected periods and keeps the collected ones', async () => {
    const first = declaration.modalities.find(item => item.kind === 'comodato').occurrences[0];
    expect((await f.agent.post('/api/rentals/collections/month').send({
      idempotencyKey: 'modality-end-1', lines: [{ occurrenceId: first.id, amount: first.rentMinor / 100, accountId: f.accountId, date: today() }]
    })).status).toBe(201);
    const response = await end(comodatoId, { endDate: yesterday() });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('active');
    expect(response.body.modalities.find(item => item.kind === 'comodato')).toMatchObject({ status: 'ended' });
    expect(response.body.modalities.find(item => item.kind === 'locacion').status).toBe('active');
    expect(liveOccurrences(comodatoId).every(item => item.date <= yesterday())).toBe(true);
    expect(liveOccurrences(comodatoId).some(item => item.id === first.id)).toBe(true);
    expect(liveOccurrences(locacionId).some(item => item.date > yesterday())).toBe(true);
  });

  it('previews the periods that would be cancelled without writing, and only of that modality', async () => {
    const before = JSON.stringify(f.db.findAll('rentOccurrences', f.userId)) + JSON.stringify(f.db.findAll('rentalContracts', f.userId));
    const response = await preview(comodatoId, yesterday());
    expect(response.status).toBe(200);
    expect(response.body.tenantObligations).toBeUndefined();
    expect(response.body.cancelledPeriods.length).toBeGreaterThan(5);
    expect(response.body.cancelledPeriods.every(item => item.contractId === comodatoId && item.modality === 'comodato' && item.date > yesterday())).toBe(true);
    expect(JSON.stringify(f.db.findAll('rentOccurrences', f.userId)) + JSON.stringify(f.db.findAll('rentalContracts', f.userId))).toBe(before);
    expect(logs().some(entry => entry.action === 'rental.contract-end')).toBe(false);
  });

  it('previews ending the whole rental with the cancelled periods of every modality and the tenant obligations', async () => {
    const tenantObligation = await f.agent.post('/api/obligations').send({ title: 'Expensas', type: 'utility', currencyCode: 'ARS', estimatedAmount: 10, startDate: today(), assetId: f.assetId, responsibilityType: 'tenant' });
    expect(tenantObligation.status).toBe(201);
    const response = await f.agent.get(`/api/rentals/declarations/${declaration.id}/end-preview`).query({ endDate: yesterday() });
    expect(response.status).toBe(200);
    expect(new Set(response.body.cancelledPeriods.map(item => item.modality))).toEqual(new Set(['locacion', 'comodato']));
    expect(response.body.tenantObligations).toEqual([{ obligationId: tenantObligation.body.id, title: 'Expensas' }]);
    expect((await f.agent.get(`/api/rentals/declarations/${declaration.id}/end-preview`).query({ endDate: 'bad' })).status).toBe(400);
  });

  it('settles when the last active modality ends: the asset is updated and tenant obligations return to the owner', async () => {
    const obligation = (await f.agent.post('/api/obligations').send({ title: 'Expensas', type: 'utility', currencyCode: 'ARS', estimatedAmount: 10, startDate: today(), assetId: f.assetId, responsibilityType: 'tenant' })).body;
    expect((await end(locacionId, { endDate: yesterday() })).status).toBe(200);
    expect((await f.agent.get(`/api/assets/${f.assetId}`)).body.condition).toBe('usufruct');
    const last = await end(comodatoId, { endDate: yesterday() });
    expect(last.status).toBe(200);
    expect(last.body.status).toBe('ended');
    expect((await f.agent.get(`/api/assets/${f.assetId}`)).body).toMatchObject({ condition: 'not_rented', activeDeclarationId: null });
    expect((await f.agent.get(`/api/obligations/${obligation.id}`)).body.responsibilityType).toBe('owner');
  });

  it('rejects ending an already finished modality with the specific message', async () => {
    expect((await end(comodatoId, { endDate: yesterday() })).status).toBe(200);
    const again = await end(comodatoId, { endDate: yesterday() });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('No se puede finalizar este contrato porque ya está finalizado.');
    expect((await preview(comodatoId)).body.error).toBe('No se puede finalizar este contrato porque ya está finalizado.');
  });

  it('validates the end date and refuses to end before collected periods', async () => {
    expect((await end(comodatoId, { endDate: 'x' })).status).toBe(400);
    expect((await end(comodatoId, { endDate: '2000-01-01' })).body.error).toBe('La fecha de finalización no puede ser anterior al inicio del contrato');
    expect((await end(comodatoId, { endDate: shift(today(), 40) })).body.error).toContain('posterior a la pactada');
    const last = declaration.modalities.find(item => item.kind === 'comodato').occurrences.find(item => item.date > today());
    if (last) {
      await f.agent.post('/api/rentals/collections/month').send({ idempotencyKey: 'modality-end-2', lines: [{ occurrenceId: last.id, amount: last.rentMinor / 100, accountId: f.accountId, date: today() }] });
      const blocked = await end(comodatoId, { endDate: yesterday() });
      expect(blocked.status).toBe(409);
      expect(blocked.body.error).toContain('deshacé esos cobros primero');
    }
  });

  it('is atomic: a failure leaves the modality active and every period untouched', async () => {
    const spy = jest.spyOn(rentals, 'cancelUnpaidOccurrences').mockImplementation(() => { throw new Error('boom'); });
    const occurrencesBefore = JSON.stringify(f.db.findAll('rentOccurrences', f.userId));
    const response = await end(comodatoId, { endDate: yesterday() });
    spy.mockRestore();
    expect(response.status).toBe(500);
    expect(f.db.findById('rentalContracts', comodatoId, f.userId).status).toBe('active');
    expect(JSON.stringify(f.db.findAll('rentOccurrences', f.userId))).toBe(occurrencesBefore);
  });

  it('logs the action with its specific entry', async () => {
    expect((await end(comodatoId, { endDate: yesterday() })).status).toBe(200);
    expect(logs().some(entry => entry.action === 'rental.contract-end' && entry.outcome === 'success')).toBe(true);
  });

  it('answers 404 for an unknown modality, a foreign rental and 401 without a session', async () => {
    expect((await end('missing')).status).toBe(404);
    expect((await f.other.post(`/api/rentals/declarations/${declaration.id}/modalities/${comodatoId}/end`).send({})).status).toBe(404);
    expect((await request(f.app).post(`/api/rentals/declarations/${declaration.id}/modalities/${comodatoId}/end`).send({})).status).toBe(401);
    expect((await f.agent.get(`/api/rentals/declarations/${declaration.id}/modalities/missing/end-preview`)).status).toBe(404);
  });
});
