const { FakeElement, loadBrowser } = require('../helpers/fake-dom');

const flush = async () => { for (let index = 0; index < 30; index += 1) await Promise.resolve(); };
const byLabel = (root, label) => root.find(element => element.attributes && element.attributes['aria-label'] === label);
const buttons = root => root.findAll(element => element.tagName === 'BUTTON').map(button => button.textContent);

describe('Evolutivo 13 UI: titular as tenant and its mirror expense', () => {
  describe('Settings > Inquilino > "Agregar inquilino": elegir un titular existente', () => {
    const entities = [
      { id: 'ana', name: 'Ana Titular', roles: ['owner'] },
      { id: 'beto', name: 'Beto Inquilino', roles: ['tenant'] },
      { id: 'carla', name: 'Carla Ambos', roles: ['owner', 'tenant'] },
      { id: 'prov', name: 'Proveedor SA', roles: ['provider'] }
    ];
    const setup = () => {
      const API = {
        categories: { list: jest.fn(async () => []) },
        owners: { list: jest.fn(async () => entities), update: jest.fn(async () => ({})), create: jest.fn(async () => ({})) }
      };
      let shown = null;
      const Modal = { show: jest.fn((title, body, options) => { shown = { title, body, options }; }), hide: jest.fn() };
      const showToast = jest.fn();
      const { EntitiesPage, context } = loadBrowser(['js/pages/entities.js'], ['EntitiesPage'], { API, Modal, WealthRecords: {} });
      context.showToast = showToast;
      return { EntitiesPage, API, Modal, showToast, shown: () => shown };
    };

    it('lists only titulares that are not tenants yet and adds the tenant role to the same entity', async () => {
      const ctx = setup();
      const panel = new FakeElement('div');
      await ctx.EntitiesPage.renderPanel(panel, 'tenant');
      await ctx.EntitiesPage.showForm(panel, 'tenant');
      const { body, options } = ctx.shown();
      const origin = byLabel(body, 'Origen del registro');
      expect(origin.children.map(option => option.textContent)).toEqual(['Crear inquilino nuevo', 'Elegir un titular existente']);
      const existing = byLabel(body, 'Registro existente');
      expect(existing.children.map(option => option.textContent)).toEqual(['Ana Titular (Propietario)']);
      const picker = body.find(element => element.dataset && element.dataset.existingPicker);
      const submit = options.footer.lastChild;
      expect(picker.hidden).toBe(true);
      expect(submit.textContent).toBe('Crear');
      origin.value = 'existing';
      origin.dispatch('change');
      expect(picker.hidden).toBe(false);
      expect(submit.textContent).toBe('Agregar como inquilino');
      existing.value = 'ana';
      submit.click();
      await flush();
      expect(ctx.API.owners.update).toHaveBeenCalledWith('ana', { roles: ['owner', 'tenant'] });
      expect(ctx.API.owners.create).not.toHaveBeenCalled();
      expect(ctx.showToast).toHaveBeenCalledWith('Ana Titular ahora también es inquilino');
      expect(ctx.Modal.hide).toHaveBeenCalled();
    });

    it('asks to pick a record when none is selected and keeps the creation form when going back to "new"', async () => {
      const ctx = setup();
      ctx.EntitiesPage.allEntities = entities;
      await ctx.EntitiesPage.showForm(new FakeElement('div'), 'tenant');
      const { body, options } = ctx.shown();
      const origin = byLabel(body, 'Origen del registro');
      origin.value = 'existing';
      origin.dispatch('change');
      byLabel(body, 'Registro existente').value = 'missing';
      options.footer.lastChild.click();
      await flush();
      expect(ctx.showToast).toHaveBeenCalledWith('Elegí un registro existente', 'error');
      origin.value = 'new';
      origin.dispatch('change');
      expect(options.footer.lastChild.textContent).toBe('Crear');
    });

    it('works generically for other panels and hides the option when there is nobody to pick or while editing', async () => {
      const ctx = setup();
      expect(ctx.EntitiesPage.existingCandidates(entities, 'owner').map(item => item.id)).toEqual(['beto', 'prov']);
      expect(ctx.EntitiesPage.existingCandidates(entities, 'provider').map(item => item.id)).toEqual(['ana', 'beto', 'carla']);
      expect(ctx.EntitiesPage.existingCandidates(entities, 'other')).toEqual([]);
      expect(ctx.EntitiesPage.existingCandidates([{ id: 'legacy', name: 'Sin roles' }], 'tenant').map(item => item.id)).toEqual(['legacy']);
      ctx.EntitiesPage.allEntities = [];
      await ctx.EntitiesPage.showForm(new FakeElement('div'), 'tenant');
      expect(byLabel(ctx.shown().body, 'Origen del registro')).toBeNull();
      ctx.EntitiesPage.allEntities = entities;
      await ctx.EntitiesPage.showForm(new FakeElement('div'), 'tenant', entities[1]);
      expect(byLabel(ctx.shown().body, 'Origen del registro')).toBeNull();
    });

    it('reports a failed update', async () => {
      const ctx = setup();
      ctx.API.owners.update.mockRejectedValue(new Error('boom'));
      await ctx.EntitiesPage.addRoleToExisting(new FakeElement('div'), 'tenant', entities[0]);
      expect(ctx.showToast).toHaveBeenCalledWith('boom', 'error');
    });
  });

  describe('declaration tenant picker', () => {
    it('lists every tenant (also titulares that are tenants) except the current holders of the asset', () => {
      const { RentalDeclarationModal } = loadBrowser(['js/utils/format.js', 'js/pages/rentalDeclaration.js'], ['RentalDeclarationModal'], { API: {}, Modal: {}, MoneyInput: {}, showToast: jest.fn() });
      const owners = [{ id: 'a', roles: ['owner', 'tenant'] }, { id: 'b', roles: ['tenant'] }, { id: 'c', roles: ['owner'] }, { id: 'h', roles: ['owner', 'tenant'] }];
      expect(RentalDeclarationModal.tenantChoices(owners, new Set(['h'])).map(item => item.id)).toEqual(['a', 'b']);
      expect(RentalDeclarationModal.tenantChoices(owners, new Set(['h']), new Set(['h'])).map(item => item.id)).toEqual(['a', 'b', 'h']);
    });
  });

  describe('"Registrar cobro": Cuenta del inquilino (titular)', () => {
    const part = extra => ({ occurrenceId: 'o1', modality: 'locacion', currencyCode: 'ARS', remainingMinor: 12100000, remainingAmount: 121000, ivaPercent: 21, status: 'overdue', ...extra });
    const setup = ({ parts, accounts, owners = [{ id: 't1', name: 'Titular Inquilino', roles: ['owner', 'tenant'] }, { id: 't2', name: 'Solo Inquilino', roles: ['tenant'] }] }) => {
      let doc = null;
      const MoneyInput = {
        create: ({ value, ariaLabel }) => { const el = doc.createElement('input'); el.value = value == null ? '' : String(value); el.setAttribute('aria-label', ariaLabel); return el; },
        value: el => (el.value === '' ? null : Number(el.value)),
        validateAll: () => true
      };
      const pushed = [];
      const API = {
        rentals: { months: jest.fn(async () => [{ key: 'k1', date: '2025-01-01', status: 'overdue', totals: [], parts }]), collectMonth: jest.fn(async () => ({ id: 'g1', transactionIds: ['t1'] })) },
        accounts: { list: jest.fn(async () => accounts) },
        owners: { list: jest.fn(async () => owners) },
        finance: { paymentMethods: jest.fn(async () => []) }
      };
      const Modal = { push: jest.fn((title, body, options) => pushed.push({ title, body, options })), hide: jest.fn() };
      const loaded = loadBrowser(['js/utils/format.js', 'js/pages/rentalPeriods.js'], ['RentalPeriods'], {
        API, Modal, MoneyInput, ConfirmDialog: { open: jest.fn(async () => ({ confirmed: true })) }, crypto: { randomUUID: () => 'key-12345678' }
      });
      doc = loaded.context.document;
      loaded.context.showToast = jest.fn();
      return { ...loaded, API, pushed };
    };
    const landlordAccount = { id: 'acc', activo: true, currency: 'ARS', nombre: 'Caja locador', primary: true, ownerId: 'landlord' };
    const tenantAccount = { id: 'tacc', activo: true, currency: 'ARS', nombre: 'Banco inquilino', ownerId: 't1' };
    const open = async ctx => { await ctx.RentalPeriods.collectMonth('a1', 'k1', jest.fn()); return ctx.pushed[0]; };

    it('shows the select with the tenant titular accounts, the mirror note, and sends the chosen account', async () => {
      const ctx = setup({ parts: [part({ tenantIds: ['t2', 't1'] })], accounts: [landlordAccount, tenantAccount, { ...tenantAccount, id: 'usd', currency: 'USD' }] });
      const { body, options } = await open(ctx);
      const select = byLabel(body, 'Cuenta del inquilino (titular) (Locación)');
      expect(select.children.map(option => option.textContent)).toEqual(['Seleccionar cuenta', 'Banco inquilino (ARS)']);
      expect(select.value).toBe('tacc');
      expect(body.find(element => element.dataset && element.dataset.tenantAccountBox).style.display).toBe('grid');
      const note = body.find(element => element.dataset && element.dataset.mirrorNote);
      expect(note.textContent).toBe('Se registrará el gasto del inquilino Titular Inquilino con su crédito fiscal.');
      const kind = byLabel(body, 'Clasificación Locación');
      kind.value = 'B';
      kind.dispatch('change');
      expect(note.textContent).toBe('Se registrará el gasto del inquilino Titular Inquilino.');
      options.footer.children[0].click();
      await flush();
      expect(ctx.API.rentals.collectMonth.mock.calls[0][0].lines[0]).toMatchObject({ accountId: 'acc', tenantAccountId: 'tacc' });
    });

    it('hides it when the tenant is not a titular and never loads the tenants when the month has none', async () => {
      const ctx = setup({ parts: [part({ tenantIds: ['t2'] })], accounts: [landlordAccount] });
      const { body, options } = await open(ctx);
      expect(byLabel(body, 'Cuenta del inquilino (titular) (Locación)')).toBeNull();
      expect(body.find(element => element.dataset && element.dataset.tenantAccountBox).style.display).toBe('none');
      options.footer.children[0].click();
      await flush();
      expect(ctx.API.rentals.collectMonth.mock.calls[0][0].lines[0].tenantAccountId).toBeUndefined();
      const legacy = setup({ parts: [part()], accounts: [landlordAccount] });
      await open(legacy);
      expect(legacy.API.owners.list).not.toHaveBeenCalled();
    });

    it('blocks the collection when the tenant titular has no account in the currency', async () => {
      const ctx = setup({ parts: [part({ tenantIds: ['t1'] })], accounts: [landlordAccount] });
      const { body, options } = await open(ctx);
      expect(byLabel(body, 'Cuenta del inquilino (titular) (Locación)').children[0].textContent).toBe('Sin cuentas en ARS');
      expect(body.find(element => element.dataset && element.dataset.tenantAccountMissing).textContent).toContain('Titular Inquilino no tiene una cuenta activa en ARS');
      options.footer.children[0].click();
      await flush();
      expect(ctx.API.rentals.collectMonth).not.toHaveBeenCalled();
      expect(body.textContent).toContain('Locación: seleccioná la cuenta del inquilino (titular)');
    });

    it('titularTenant picks the first tenant with the owner role', () => {
      const { RentalPeriods } = setup({ parts: [], accounts: [] });
      expect(RentalPeriods.titularTenant(['x', 't2'], [{ id: 't2', roles: ['tenant'] }])).toBeNull();
      expect(RentalPeriods.titularTenant(['a', 'b'], [{ id: 'a' }, { id: 'b', roles: ['owner'] }]).id).toBe('a');
      expect(RentalPeriods.titularTenant(undefined, undefined)).toBeNull();
    });
  });

  describe('Home: mirror expense detail', () => {
    it('labels it as the mirror of the rent collection, offers "Ver" and hides edit and delete', async () => {
      let shown = null;
      const Modal = { show: (title, body, options) => { shown = { body, options }; }, hide: jest.fn(), push: jest.fn() };
      const API = { documents: { listBy: jest.fn(async () => []) } };
      const { HomePage, context } = loadBrowser(['js/utils/format.js', 'js/pages/home.js'], ['HomePage'], { API, Modal, localStorage: { getItem: () => null, setItem: () => {} } });
      context.showToast = jest.fn();
      HomePage.showTransactionOptions({ id: 'm1', tipo: 'expense', titulo: 'Alquiler pagado — Casa 01/2025', monto: 100, fecha: '2025-03-01', mirrorRentCollectionId: 'c1', mirrorOfTransactionId: 'i1' }, {});
      await flush();
      expect(shown.body.textContent).toContain('Gasto espejo del cobro de alquiler');
      const labels = buttons(shown.options.footer);
      expect(labels).toContain('Ver');
      expect(labels).not.toContain('Editar');
      expect(labels).not.toContain('Eliminar');
      expect(shown.options.footer.find(element => element.dataset && element.dataset.viewRentCollection === 'c1')).not.toBeNull();
    });
  });
});
