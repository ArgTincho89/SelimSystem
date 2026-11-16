const fs = require('fs');
const path = require('path');
const { FakeElement, loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const labelsOf = element => element.findAll(item => item.tagName === 'BUTTON').map(button => button.textContent);

describe('Evolutivo 6 quick fixes UI contract', () => {
  describe('1.1 resolve modal tenants', () => {
    const owners = [
      { id: 't1', name: 'Ana', roles: ['tenant'] }, { id: 't2', name: 'Beto', roles: ['tenant'] }, { id: 't3', name: 'Carla', roles: ['tenant'] }, { id: 'o1', name: 'Dueño', roles: ['owner'] }
    ];
    const obligation = (extra = {}) => ({ id: 'ob1', assetId: 'a1', title: 'Expensas', ...extra });
    const occurrence = { id: 'occ1', date: '2026-11-10', currencyCode: 'ARS', tenantDueAmount: 1000 };
    const setup = ({ rentals = [], get } = {}) => {
      const API = {
        get: jest.fn().mockResolvedValue(rentals),
        rentals: { get: get || jest.fn().mockRejectedValue(new Error('no')) },
        documents: { listBy: jest.fn().mockResolvedValue([]) }
      };
      const Modal = { show: jest.fn(), hide: jest.fn(), push: jest.fn() };
      const { ObligationsPage } = loadBrowser(['js/utils/format.js', 'js/pages/obligations.js'], ['ObligationsPage'], { API, Modal, MoneyInput: { create: () => new FakeElement('input'), value: () => 1, validate: () => true }, Router: {}, App: {}, showToast: jest.fn(), alert: jest.fn() });
      ObligationsPage.owners = owners;
      return { ObligationsPage, API, Modal };
    };
    const tenantSelect = Modal => Modal.show.mock.calls[0][1].findAll(item => item.tagName === 'SELECT')[0];
    const tenantOptions = Modal => tenantSelect(Modal).children.map(option => option.textContent);

    it('lists only the tenants of the obligation contract and preselects the first', async () => {
      const { ObligationsPage, Modal } = setup({ get: jest.fn().mockResolvedValue({ id: 'c1', tenantIds: ['t2', 't3'], status: 'active' }) });
      await ObligationsPage.showResolveModal(obligation({ rentalContractId: 'c1' }), occurrence);
      expect(tenantOptions(Modal)).toEqual(['Beto', 'Carla']);
      expect(tenantSelect(Modal).value).toBe('t2');
    });

    it('falls back to the active contract of the asset when the obligation has no contract', async () => {
      const { ObligationsPage, Modal, API } = setup({ rentals: [{ id: 'c0', status: 'ended', tenantIds: ['t1'] }, { id: 'c1', status: 'active', tenantIds: ['t3'] }] });
      await ObligationsPage.showResolveModal(obligation(), occurrence);
      expect(API.get).toHaveBeenCalledWith('/rentals?assetId=a1');
      expect(tenantOptions(Modal)).toEqual(['Carla']);
      expect(tenantSelect(Modal).value).toBe('t3');
    });

    it('lists every tenant (first preselected) when no contract can be determined', async () => {
      const { ObligationsPage, Modal } = setup({ rentals: [] });
      await ObligationsPage.showResolveModal(obligation(), occurrence);
      expect(tenantOptions(Modal)).toEqual(['Ana', 'Beto', 'Carla']);
      expect(tenantSelect(Modal).value).toBe('t1');
    });

    it('lists the two tenants of a contract with several tenants', async () => {
      const { ObligationsPage, Modal } = setup({ rentals: [{ id: 'c1', status: 'active', tenantIds: ['t1', 't2'] }] });
      await ObligationsPage.showResolveModal(obligation(), occurrence);
      expect(tenantOptions(Modal)).toEqual(['Ana', 'Beto']);
    });
  });

  describe('1.2 rental modal', () => {
    const setup = () => loadBrowser(['js/utils/format.js', 'js/pages/rentalModal.js'], ['RentalModal'], { API: {}, Modal: {}, MoneyInput: {}, showToast: jest.fn() });
    const card = { contractId: 'c1', status: 'active', modalityLabel: 'Vivienda', modality: 'housing' };

    it('marks rent_due alerts as critical and leaves other types alone', () => {
      const { RentalModal } = setup();
      const section = RentalModal.renderAlerts({ readOnly: true }, [{ type: 'rent_due', message: 'Alquiler vencido' }, { type: 'document_pending', message: 'Falta comprobante' }]);
      const rows = section.findAll(item => item.dataset && item.dataset.alertType);
      expect(rows.find(row => row.dataset.alertType === 'rent_due').className).toContain('alert-critical');
      expect(rows.find(row => row.dataset.alertType === 'document_pending').className).not.toContain('alert-critical');
      expect(read('css/pages.css')).toMatch(/\.alert-critical\s*\{[^}]*font-weight:\s*700/);
    });

    it('omits "Registrar cobro" in the Contratos cards but keeps it in Resumen', () => {
      const { RentalModal } = setup();
      expect(labelsOf(RentalModal.cardActions({}, card, { collect: false }))).not.toContain('Registrar cobro');
      expect(labelsOf(RentalModal.cardActions({}, card))).toContain('Registrar cobro');
      expect(read('js/pages/rentalModal.js')).toContain('this.cardActions(ctx, card, { collect: false })');
    });
  });

  describe('1.3 provider form categories', () => {
    const setup = categories => {
      const API = { categories: { list: categories }, owners: { list: jest.fn().mockResolvedValue([]) } };
      const Modal = { show: jest.fn() };
      const { EntitiesPage } = loadBrowser(['js/pages/entities.js'], ['EntitiesPage'], { API, Modal, showToast: jest.fn(), WealthRecords: {} });
      return { EntitiesPage, Modal, API };
    };
    const hint = (Modal, kind) => Modal.show.mock.calls[0][1].find(item => item.dataset && item.dataset.categoryHint === kind);

    it('loads the categories when the form opens, whatever the role, and fills the dropdown', async () => {
      const { EntitiesPage, Modal, API } = setup(jest.fn().mockResolvedValue([{ id: 'c1', nombre: 'Servicios' }]));
      await EntitiesPage.showForm(new FakeElement('div'), 'tenant');
      expect(API.categories.list).toHaveBeenCalled();
      const form = Modal.show.mock.calls[0][1];
      expect(hint(Modal, 'empty')).toBeNull();
      expect(form.findAll(item => item.tagName === 'OPTION').map(option => option.textContent)).toContain('Servicios');
    });

    it('shows the empty-state hint when there are no categories', async () => {
      const { EntitiesPage, Modal } = setup(jest.fn().mockResolvedValue([]));
      await EntitiesPage.showForm(new FakeElement('div'), 'provider');
      expect(hint(Modal, 'empty').textContent).toContain('Primero creá una categoría de gastos');
    });

    it('shows an error message when the categories request fails', async () => {
      const { EntitiesPage, Modal } = setup(jest.fn().mockRejectedValue(new Error('boom')));
      await EntitiesPage.showForm(new FakeElement('div'), 'provider');
      expect(hint(Modal, 'error').textContent).toContain('boom');
    });
  });

  describe('1.4 principal account actions (regression)', () => {
    const source = read('js/pages/settings.js');
    it('never offers "Hacer principal", archive or delete on the principal account', () => {
      expect(source).toMatch(/if \(!account\.primary && account\.activo\) \{\s*if \(!isChild\) \{\s*const primary = create\('button'[^]*?textContent: 'Hacer principal'/);
      expect(source).toMatch(/if \(!account\.primary\) \{\s*const remove = create\('button'[^]*?textContent: 'Eliminar'/);
      expect(source.match(/textContent: 'Hacer principal'/g)).toHaveLength(1);
    });
  });
});
