const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const flush = async () => { for (let index = 0; index < 6; index += 1) await Promise.resolve(); };

describe('Evolutivo 5 rental history and deletion UI contract', () => {
  const impact = (extra = {}) => ({ collections: 0, reversedCollections: 0, periods: 12, documents: 2, notes: 1, linkedObligations: 0, ...extra });
  const load = (globals = {}) => loadBrowser(['js/utils/format.js', 'js/pages/rentalModal.js'], ['RentalModal'], { Modal: { push() {}, hide() {} }, MoneyInput: {}, setTimeout: () => 0, ...globals });
  const toast = context => context.document.body.children.at(-1);

  describe('history list', () => {
    const row = (extra = {}) => ({ id: 'd1', from: '2026-07-01', to: '2029-06-30', state: 'ended', tenants: [{ name: 'Bella Paloma' }], modalities: ['locacion', 'comodato'], editable: true, deletable: true, impact: impact(), ...extra });
    const asset = { id: 'a1', name: 'Casa' };

    it('shows period, tenant, modalities, state and the "Ver" action of every rental', () => {
      const { RentalModal } = load();
      const element = RentalModal.historyRow(asset, row(), () => {});
      expect(element.textContent).toContain('01-07-2026 – 30-06-2029');
      expect(element.textContent).toContain('Bella Paloma');
      expect(element.textContent).toContain('Locación + Comodato');
      expect(element.textContent).toContain('Finalizado');
      expect(element.findAll(node => node.tagName === 'BUTTON').map(button => button.textContent)).toEqual(['Ver', 'Eliminar']);
      const active = RentalModal.historyRow(asset, row({ state: 'active', to: null, deletable: false }), () => {});
      expect(active.textContent).toContain('sin fecha de fin');
      expect(active.textContent).toContain('Activo');
      expect(active.findAll(node => node.tagName === 'BUTTON').map(button => button.textContent)).toEqual(['Ver']);
    });

    it('opens a finished rental read-only and the current one in the normal modal', () => {
      const openRental = jest.fn();
      const { RentalModal } = load({ AssetsPage: { openRental } });
      RentalModal.historyRow(asset, row(), () => {}).findAll(node => node.tagName === 'BUTTON')[0].click();
      expect(openRental).toHaveBeenCalledWith('a1', 'd1', { readOnly: true });
      RentalModal.historyRow(asset, row({ state: 'active', deletable: false }), () => {}).findAll(node => node.tagName === 'BUTTON')[0].click();
      expect(openRental).toHaveBeenLastCalledWith('a1', 'd1', { readOnly: false });
    });

    it('uses the lightweight summary endpoint and shows an empty message', async () => {
      const pushed = [];
      const summary = jest.fn().mockResolvedValue([]);
      const { RentalModal } = load({ Modal: { push: (title, body) => pushed.push({ title, body }), hide() {} }, API: { rentals: { declarations: { summary } } } });
      await RentalModal.showHistory(asset);
      expect(summary).toHaveBeenCalledWith('a1');
      expect(pushed[0].title).toBe('Histórico de alquileres · Casa');
      expect(pushed[0].body.textContent).toContain('Este inmueble todavía no tuvo alquileres.');
      expect(read('js/api.js')).toContain('&summary=1');
    });

    it('keeps the "Histórico de alquileres" access in the ficha, delegating the list to the rental modal', () => {
      const assets = read('js/pages/assets.js');
      expect(assets).toContain("textContent: 'Histórico de alquileres'");
      expect(assets).toContain('return RentalModal.showHistory(asset);');
      expect(assets).not.toContain('async showRentalHistory(');
    });
  });

  describe('deletion', () => {
    const setup = confirmResult => {
      const calls = [];
      const ConfirmDialog = { open: jest.fn(async options => { calls.push(options); return confirmResult; }) };
      const remove = jest.fn().mockResolvedValue({});
      const { context, RentalModal } = load({ ConfirmDialog, API: { rentals: { declarations: { remove } } } });
      return { RentalModal, ConfirmDialog, remove, lastToast: () => toast(context), calls };
    };

    it('asks for a strong confirmation with the exact copy, an extra warning with the impact, and then deletes', async () => {
      const { RentalModal, remove, calls, lastToast } = setup({ confirmed: true, reason: '' });
      const done = jest.fn();
      await RentalModal.deleteRental({ declarationId: 'd1', impact: impact() }, done);
      expect(calls[0]).toMatchObject({ title: 'Eliminar alquiler', danger: true, confirmLabel: 'Eliminar alquiler' });
      const lines = calls[0].message.split('\n');
      expect(lines[0]).toBe('Estás por eliminar un alquiler y potencialmente sus datos asociados.');
      expect(lines).toContain('Esta acción no se puede deshacer.');
      expect(lines.at(-1)).toBe('¿Querés continuar?');
      expect(lines.some(line => line.includes('12 períodos, 2 documentos y 1 nota asociados'))).toBe(true);
      expect(calls[0].details).toContainEqual(['Documentos', 2]);
      expect(remove).toHaveBeenCalledWith('d1');
      expect(lastToast().textContent).toBe('Alquiler eliminado');
      expect(done).toHaveBeenCalled();
    });

    it('shows no extra warning when nothing is attached', async () => {
      const { RentalModal, calls } = setup({ confirmed: true, reason: '' });
      await RentalModal.deleteRental({ declarationId: 'd1', impact: impact({ periods: 0, documents: 0, notes: 0 }) }, () => {});
      expect(calls[0].message.split('\n')).toHaveLength(3);
    });

    it('sends nothing when the confirmation is dismissed', async () => {
      const { RentalModal, remove } = setup({ confirmed: false, reason: '' });
      const done = jest.fn();
      await RentalModal.deleteRental({ declarationId: 'd1', impact: impact() }, done);
      expect(remove).not.toHaveBeenCalled();
      expect(done).not.toHaveBeenCalled();
    });

    it('surfaces the server rejection (collections not reversed) as an error toast', async () => {
      const { RentalModal, remove, lastToast } = setup({ confirmed: true, reason: '' });
      remove.mockRejectedValue(new Error('No se puede eliminar este alquiler porque tiene cobros registrados. Deshacé los cobros primero.'));
      const done = jest.fn();
      await RentalModal.deleteRental({ declarationId: 'd1', impact: impact() }, done);
      expect(lastToast().textContent).toContain('Deshacé los cobros primero');
      expect(lastToast().className).toContain('error');
      expect(done).not.toHaveBeenCalled();
    });
  });

  describe('header of a finished rental', () => {
    const header = management => {
      const { context, RentalModal } = load();
      const ctx = {
        readOnly: true, declarationId: 'd1', assetId: 'a1', header: context.document.createElement('div'),
        overview: { header: { status: 'ended', tenants: [], monthlyTotals: [], pendingTotals: [], nextCollection: null, nextDue: null, from: '2025-01-01', to: '2025-12-31' }, management }
      };
      RentalModal.renderHeader(ctx);
      return ctx.header;
    };

    it('offers neither "Actualizar alquiler" nor "Finalizar alquiler", only the safe edit and delete', () => {
      const element = header({ editable: true, deletable: true, impact: impact() });
      const buttons = element.findAll(node => node.tagName === 'BUTTON').map(button => button.textContent);
      expect(buttons).toEqual(['Editar alquiler', 'Eliminar alquiler']);
      expect(buttons).not.toContain('Actualizar alquiler');
      expect(buttons).not.toContain('Finalizar alquiler');
    });

    it('explains why a rental cannot be edited or deleted instead of offering the action', () => {
      const element = header({ editable: false, deletable: false, impact: impact({ collections: 1 }) });
      expect(element.findAll(node => node.tagName === 'BUTTON')).toHaveLength(0);
      expect(element.textContent).toContain('No se puede editar: tiene cobros, documentos, notas u obligaciones vinculadas.');
      expect(element.textContent).toContain('Para eliminarlo, primero deshacé sus cobros.');
    });
  });

  it('lets the declaration modal edit a historical rental passed in `options.declaration`', () => {
    const modal = read('js/pages/rentalDeclaration.js');
    expect(modal).toContain('options.declaration || (');
    expect(modal).toContain("options.declaration ? ['active', 'draft', 'ended']");
    expect(read('js/pages/rentalModal.js')).toContain('this.editRental(ctx, { historical: true })');
  });
});
