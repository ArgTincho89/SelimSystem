const { setupRentFixture } = require('../helpers/rent-fixture');
const { cleanupTestDb } = require('../helpers/setup');
const obligationsService = require('../../src/services/obligations');
const { migrateRentalResponsibilities } = require('../../src/services/migrations');

// Items 1 and 2: obligations created from an unsaved rental declaration and automatic reassignment.
describe('Rental batch: pending declaration obligations and automatic owner reassignment', () => {
  let f;
  beforeEach(async () => { f = await setupRentFixture('rent-batch-obl'); });
  afterAll(() => cleanupTestDb());

  const year = new Date().getUTCFullYear();
  const token = 'draft-token-1234';
  const newObligation = (extra = {}) => f.agent.post('/api/obligations').send({
    title: 'ABL', type: 'tax', assetId: f.assetId, currencyCode: 'ARS', estimatedAmount: 1000, startDate: `${year - 1}-01-10`, recurrenceFrequency: 'monthly', ...extra
  });
  const obligation = id => f.db.findById('obligations', id, f.userId);
  const future = (overrides = {}) => f.modality('locacion', { startDate: `${year - 1}-01-01`, endDate: `${year + 1}-12-31`, ...overrides });

  describe('item 1: stacked "Nueva obligación" from the declaration', () => {
    test('a tenant obligation for a draft rental is stored as owner with a pending link', async () => {
      const created = await newObligation({ responsibilityType: 'tenant', pendingDeclarationToken: token });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ responsibilityType: 'owner', rentalContractId: null });
      expect(created.body.pendingRentalLink).toMatchObject({ responsibilityType: 'tenant' });
      expect(created.body.pendingRentalLink.tokenHash).not.toBe(token);
    });

    test('saving the declaration links the obligation to the new rental with the tenant responsible', async () => {
      const created = (await newObligation({ responsibilityType: 'tenant', pendingDeclarationToken: token })).body;
      const declared = await f.declare([future()], { pendingObligationToken: token });
      expect(declared.status).toBe(201);
      const saved = obligation(created.id);
      expect(saved).toMatchObject({ responsibilityType: 'tenant', rentalContractId: declared.body.modalities[0].contractId, pendingRentalLink: null });
    });

    test('an explicit responsibility in the declaration wins over the pending link', async () => {
      const created = (await newObligation({ responsibilityType: 'tenant', pendingDeclarationToken: token })).body;
      const declared = await f.declare([future()], { pendingObligationToken: token, obligationResponsibilities: [{ obligationId: created.id, responsibilityType: 'owner' }] });
      expect(declared.status).toBe(201);
      expect(obligation(created.id)).toMatchObject({ responsibilityType: 'owner', pendingRentalLink: null });
    });

    test('cancelling the declaration releases the link and the owner stays responsible', async () => {
      const created = (await newObligation({ responsibilityType: 'tenant', pendingDeclarationToken: token })).body;
      const released = await f.agent.post('/api/obligations/pending-links/release').send({ token });
      expect(released.status).toBe(200);
      expect(released.body.released).toBe(1);
      expect(obligation(created.id)).toMatchObject({ responsibilityType: 'owner', pendingRentalLink: null, rentalContractId: null });
      // A later declaration with the stale token no longer touches it.
      expect((await f.declare([future()], { pendingObligationToken: token })).status).toBe(201);
      expect(obligation(created.id).responsibilityType).toBe('owner');
    });

    test('a failed declaration keeps the obligation pending and with the owner', async () => {
      const created = (await newObligation({ responsibilityType: 'tenant', pendingDeclarationToken: token })).body;
      const failed = await f.declare([future({ amount: 0 })], { pendingObligationToken: token });
      expect(failed.status).toBe(400);
      expect(obligation(created.id)).toMatchObject({ responsibilityType: 'owner' });
      expect(obligation(created.id).pendingRentalLink).toBeTruthy();
    });

    test('with an active rental the obligation is created for the tenant right away', async () => {
      const declared = (await f.declare([future()])).body;
      const created = await newObligation({ responsibilityType: 'tenant', pendingDeclarationToken: token, rentalContractId: declared.modalities[0].contractId });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ responsibilityType: 'tenant', rentalContractId: declared.modalities[0].contractId });
      expect(created.body.pendingRentalLink).toBeUndefined();
    });

    test('validates the token and the asset', async () => {
      expect((await newObligation({ responsibilityType: 'tenant', pendingDeclarationToken: 'short' })).status).toBe(400);
      expect((await newObligation({ responsibilityType: 'tenant', pendingDeclarationToken: token, assetId: null })).status).toBe(400);
      expect((await f.agent.post('/api/obligations/pending-links/release').send({ token: 'x' })).status).toBe(400);
      expect((await f.declare([future()], { pendingObligationToken: 'x' })).status).toBe(400);
    });

    test('abandoned drafts expire after 24 hours and the obligation stays with the owner', async () => {
      const created = (await newObligation({ responsibilityType: 'tenant', pendingDeclarationToken: token })).body;
      expect(obligationsService.expirePendingRentalLinks(f.db, f.userId)).toBe(0);
      expect(obligationsService.expirePendingRentalLinks(f.db, f.userId, Date.now() + obligationsService.PENDING_LINK_MAX_AGE_MS + 1000)).toBe(1);
      expect(obligation(created.id)).toMatchObject({ responsibilityType: 'owner', pendingRentalLink: null });
    });
  });

  describe('item 2: automatic reassignment when the rental ends', () => {
    test('a tenant obligation of a rental whose end date passed goes back to the owner on read', async () => {
      const created = (await newObligation({ startDate: '2025-01-10' })).body;
      const declared = await f.declare([f.modality('locacion', { startDate: '2025-01-01', endDate: '2025-06-30' })], { obligationResponsibilities: [{ obligationId: created.id, responsibilityType: 'tenant' }] });
      expect(declared.status).toBe(201);
      // The declaration just set it to tenant (with the past occurrences pinned to the owner).
      f.db.update('obligations', created.id, { responsibilityType: 'tenant' }, f.userId);
      f.db.findAll('obligationOccurrences', f.userId).filter(item => item.obligationId === created.id).forEach(item => f.db.update('obligationOccurrences', item.id, { responsibilityType: null }, f.userId));
      const list = await f.agent.get('/api/obligations');
      expect(list.status).toBe(200);
      expect(obligation(created.id).responsibilityType).toBe('owner');
      const pinned = f.db.findAll('obligationOccurrences', f.userId).filter(item => item.obligationId === created.id);
      expect(pinned.find(item => item.date === '2025-06-10').responsibilityType).toBe('tenant');
      // After the rental end the occurrences follow the live (owner) responsibility.
      expect(pinned.find(item => item.date === '2025-07-10').responsibilityType || 'owner').toBe('owner');
      // Idempotent.
      expect(obligationsService.reassignEndedTenantObligations(f.db, f.userId)).toBe(0);
    });

    test('keeps tenant obligations of rentals in force and re-links orphan ones', async () => {
      const declared = (await f.declare([future()])).body;
      const linked = (await newObligation({ responsibilityType: 'tenant', rentalContractId: declared.modalities[0].contractId })).body;
      const orphan = (await newObligation({ title: 'Agua', responsibilityType: 'tenant' })).body;
      expect(obligationsService.reassignEndedTenantObligations(f.db, f.userId)).toBe(1);
      expect(obligation(linked.id)).toMatchObject({ responsibilityType: 'tenant' });
      expect(obligation(orphan.id)).toMatchObject({ responsibilityType: 'tenant', rentalContractId: declared.modalities[0].contractId });
      expect((await f.agent.get(`/api/obligations/${linked.id}`)).body.responsibilityType).toBe('tenant');
    });

    test('orphan tenant obligations without any rental and ended contracts go back to the owner', async () => {
      const orphan = (await newObligation({ responsibilityType: 'tenant' })).body;
      const declared = (await f.declare([future()])).body;
      const contractId = declared.modalities[0].contractId;
      const linked = (await newObligation({ title: 'Luz', responsibilityType: 'tenant', rentalContractId: contractId })).body;
      f.db.update('obligations', orphan.id, { assetId: null }, f.userId);
      f.db.update('rentalContracts', contractId, { status: 'ended' }, f.userId);
      const daily = migrateRentalResponsibilities(f.db);
      expect(daily.updated).toBeGreaterThanOrEqual(2);
      expect(obligation(orphan.id).responsibilityType).toBe('owner');
      expect(obligation(linked.id).responsibilityType).toBe('owner');
      expect((await f.agent.get(`/api/obligations/${linked.id}`)).status).toBe(200);
      expect((await f.agent.get('/api/obligations/missing')).status).toBe(404);
    });

    test('maintenance survives a failing user', () => {
      const failing = { findAll: name => (name === 'users' ? [{ id: 'u1' }] : (() => { throw new Error('boom'); })()) };
      const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(obligationsService.runResponsibilityMaintenance(failing)).toBe(0);
      expect(errors).toHaveBeenCalled();
      errors.mockRestore();
    });
  });
});
