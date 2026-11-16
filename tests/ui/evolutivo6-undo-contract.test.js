const fs = require('fs');
const path = require('path');
const { FakeElement, loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const flush = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };

describe('Evolutivo 6 UndoDialog and mandatory notes UI contract', () => {
  const setupDialog = (api = {}) => {
    const API = {
      obligations: { revertPayment: jest.fn().mockResolvedValue({ reconciliationReset: false }), voidResolution: jest.fn().mockResolvedValue({}) },
      rentals: { reverseCollection: jest.fn().mockResolvedValue({ ok: true, reconciliationReset: false }) }, ...api
    };
    const Modal = { push: jest.fn(), hide: jest.fn() };
    const showToast = jest.fn();
    const { UndoDialog, context } = loadBrowser(['js/components/undoDialog.js'], ['UndoDialog'], { API, Modal, showToast });
    const open = (descriptor, options) => {
      const promise = UndoDialog.open(descriptor, options);
      const [title, body, config] = Modal.push.mock.calls.pop();
      const reason = body.find(item => item.dataset && item.dataset.undoReason);
      const error = body.find(item => item.dataset && item.dataset.undoError);
      const confirm = config.footer.find(item => item.dataset && item.dataset.undoConfirm);
      const cancel = config.footer.children[0];
      return { promise, title, body, config, reason, error, confirm, cancel };
    };
    return { UndoDialog, API, Modal, showToast, open, context };
  };
  const payment = { type: 'obligation.payment', obligationId: 'o1', occurrenceId: 'occ1', transactionId: 't1' };

  describe('UndoDialog', () => {
    it('blocks the confirmation until the trimmed reason has 1 to 500 characters and sends nothing', async () => {
      const { API, open, Modal } = setupDialog();
      const dialog = open(payment);
      expect(dialog.title).toBe('Deshacer pago');
      expect(dialog.reason.attributes['aria-label']).toBe('Motivo');
      for (const value of ['', '   ', 'x'.repeat(501)]) {
        dialog.reason.value = value;
        dialog.confirm.click();
        await flush();
        expect(dialog.error.textContent).toBe('Indicá el motivo (hasta 500 caracteres)');
        expect(dialog.error.hidden).toBe(false);
      }
      expect(API.obligations.revertPayment).not.toHaveBeenCalled();
      expect(Modal.hide).not.toHaveBeenCalled();
    });

    it('dispatches a payment to the revert endpoint with the trimmed reason and runs onDone', async () => {
      const { API, open, Modal, context } = setupDialog();
      const onDone = jest.fn();
      const dialog = open(payment, { onDone });
      dialog.reason.value = '  Pagué dos veces ';
      dialog.confirm.click();
      await flush();
      expect(API.obligations.revertPayment).toHaveBeenCalledWith('o1', 'occ1', 't1', { reason: 'Pagué dos veces' });
      expect(Modal.hide).toHaveBeenCalled();
      expect(context.document.body.textContent).toContain('Pago revertido');
      expect(onDone).toHaveBeenCalled();
      expect(await dialog.promise).toBe(true);
    });

    it('dispatches a resolution to DELETE .../resolution with the reason', async () => {
      const { API, open } = setupDialog();
      const dialog = open({ type: 'obligation.resolution', obligationId: 'o1', occurrenceId: 'occ1' });
      dialog.reason.value = 'Error de carga';
      dialog.confirm.click();
      await flush();
      expect(API.obligations.voidResolution).toHaveBeenCalledWith('o1', 'occ1', { reason: 'Error de carga' });
    });

    it('dispatches every collection (group or single) to the reverse endpoint once and reports a reset reconciliation', async () => {
      const reverseCollection = jest.fn().mockResolvedValue({ ok: true, reconciliationReset: true, collectionIds: ['c1', 'c2'] });
      const { open, context } = setupDialog({ rentals: { reverseCollection } });
      const dialog = open({ type: 'rental.collection', collectionIds: ['c1', 'c2', 'c3'] });
      dialog.reason.value = 'Cobro duplicado';
      dialog.confirm.click();
      await flush();
      expect(reverseCollection.mock.calls).toEqual([['c1', { reason: 'Cobro duplicado' }], ['c3', { reason: 'Cobro duplicado' }]]);
      expect(context.document.body.textContent).toContain('Cobro deshecho. La conciliación de la cuenta quedó pendiente de revisar');
    });

    it('keeps the dialog open and shows the server error when the request fails', async () => {
      const { open, Modal } = setupDialog({ obligations: { revertPayment: jest.fn().mockRejectedValue(new Error('Ese pago ya fue revertido')) } });
      const dialog = open(payment);
      dialog.reason.value = 'x';
      dialog.confirm.click();
      await flush();
      expect(dialog.error.textContent).toBe('Ese pago ya fue revertido');
      expect(Modal.hide).not.toHaveBeenCalled();
      expect(dialog.confirm.disabled).toBe(false);
    });

    it('sends nothing when the dialog is cancelled or dismissed', async () => {
      const { API, open, Modal } = setupDialog();
      const dialog = open(payment);
      dialog.cancel.click();
      expect(Modal.hide).toHaveBeenCalled();
      expect(await dialog.promise).toBe(false);
      expect(API.obligations.revertPayment).not.toHaveBeenCalled();
      const other = open(payment);
      other.config.onClose();
      expect(await other.promise).toBe(false);
    });

    it('is registered in index.html and the service worker', () => {
      expect(read('index.html')).toContain('/js/components/undoDialog.js');
      expect(read('sw.js')).toContain("'/js/components/undoDialog.js'");
    });
  });

  describe('obligations page', () => {
    const setup = () => {
      const API = {
        get: jest.fn().mockResolvedValue([]), rentals: { get: jest.fn() }, documents: { listBy: jest.fn().mockResolvedValue([]), uploadTargets: jest.fn() },
        obligations: { createResolution: jest.fn().mockResolvedValue({}), pay: jest.fn().mockResolvedValue({ transaction: { id: 't1' } }), paymentContext: jest.fn() }
      };
      const Modal = { show: jest.fn(), hide: jest.fn(), push: jest.fn() };
      const MoneyInput = { create: () => new FakeElement('input'), value: () => 1000, validate: () => true };
      const { ObligationsPage } = loadBrowser(['js/utils/format.js', 'js/pages/obligations.js'], ['ObligationsPage'], { API, Modal, MoneyInput, Router: {}, App: {}, showToast: jest.fn(), alert: jest.fn(), UndoDialog: { open: jest.fn() } });
      ObligationsPage.owners = [{ id: 't1', name: 'Ana', roles: ['tenant'] }];
      ObligationsPage.refresh = jest.fn();
      return { ObligationsPage, API, Modal };
    };
    const submit = form => form.dispatch('submit');

    it('blocks the resolve submit when the note is empty and shows the required error', async () => {
      const { ObligationsPage, API, Modal } = setup();
      await ObligationsPage.showResolveModal({ id: 'o1', assetId: null, title: 'Expensas' }, { id: 'occ1', date: '2026-11-10', currencyCode: 'ARS', tenantDueAmount: 1000 });
      const form = Modal.show.mock.calls[0][1];
      const notes = form.find(item => item.tagName === 'TEXTAREA');
      notes.value = '   ';
      submit(form);
      await flush();
      expect(API.obligations.createResolution).not.toHaveBeenCalled();
      const error = form.find(item => item.dataset && item.dataset.notesError);
      expect(error.textContent).toBe('Las notas son obligatorias');
      expect(error.hidden).toBe(false);
      notes.value = ' Pagado por transferencia ';
      submit(form);
      await flush();
      expect(API.obligations.createResolution).toHaveBeenCalledWith('o1', 'occ1', expect.objectContaining({ notes: 'Pagado por transferencia' }));
    });

    it('requires the note in the source of the pay form and always sends it', () => {
      const source = read('js/pages/obligations.js');
      expect(source).toContain("this.field(form, 'Notas', { multiline: true, required: true })");
      expect(source).toContain('if (!this.validNotes(payNotes)) return;');
      expect(source).toContain('notes: payNotes.value.trim(), idempotencyKey');
    });

    it('delegates "Revertir pago" and "Anular resolución" to the UndoDialog', () => {
      const source = read('js/pages/obligations.js');
      expect(source).toContain("type: 'obligation.payment'");
      expect(source).toContain("type: 'obligation.resolution'");
      expect(source).not.toContain('reasonField');
    });
  });

  describe('asset history and rental periods', () => {
    const setup = () => {
      const UndoDialog = { open: jest.fn() };
      const { AssetHistory } = loadBrowser(['js/utils/format.js', 'js/pages/assetHistory.js'], ['AssetHistory'], { API: {}, Modal: {}, UndoDialog, ObligationsPage: { revertPayment: jest.fn() }, AssetsPage: {}, showToast: jest.fn(), statusBadge: () => ({}) });
      return { AssetHistory, UndoDialog };
    };
    const refs = { obligationId: 'o1', occurrenceId: 'occ1' };

    it('offers a single "Deshacer" for a paid obligation, a resolved obligation and a collected rent', () => {
      const { AssetHistory } = setup();
      const paid = { kind: 'obligation', concept: 'Impuesto', actions: ['revert'], refs, payments: [{ transactionId: 't1', revertible: true }] };
      const resolved = { kind: 'obligation', concept: 'Expensas', actions: ['unresolve'], refs, payments: [] };
      const rent = { kind: 'rent', concept: 'Alquiler', actions: ['collect', 'undo-collect'], refs: { collectionIds: ['c1'] }, payments: [] };
      [paid, resolved, rent].forEach(row => expect(AssetHistory.undoButtons(row, jest.fn()).map(button => button.textContent)).toEqual(['Deshacer']));
    });

    it('offers no "Deshacer" for pending or already reverted rows', () => {
      const { AssetHistory } = setup();
      expect(AssetHistory.undoButtons({ kind: 'obligation', concept: 'Pendiente', actions: ['pay'], refs, payments: [] }, jest.fn())).toEqual([]);
      expect(AssetHistory.undoButtons({ kind: 'reversal', concept: 'Revertido', actions: [], refs, payments: [], reversals: [] }, jest.fn())).toEqual([]);
    });

    it('opens the UndoDialog with the matching descriptor', () => {
      const { AssetHistory, UndoDialog } = setup();
      const afterDone = jest.fn();
      const [resolution] = AssetHistory.undoButtons({ kind: 'obligation', concept: 'Expensas', actions: ['unresolve'], refs, payments: [] }, afterDone);
      resolution.click();
      expect(UndoDialog.open).toHaveBeenLastCalledWith({ type: 'obligation.resolution', obligationId: 'o1', occurrenceId: 'occ1' }, { onDone: afterDone });
      const [collection] = AssetHistory.undoButtons({ kind: 'rent', concept: 'Alquiler', actions: ['undo-collect'], refs: { collectionIds: ['c1', 'c2'] }, payments: [] }, afterDone);
      collection.click();
      expect(UndoDialog.open).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'rental.collection', collectionIds: ['c1', 'c2'] }), { onDone: afterDone });
    });

    it('shows "Motivo" for annulled resolutions and reversed rents in the detail', () => {
      const source = read('js/pages/assetHistory.js');
      expect(source).toContain('Motivo: ${voided.voidReason}');
      expect(source).toContain('Motivo: ${reversal.reason}');
    });

    it('uses the UndoDialog for "Deshacer cobro" and "Anular resolución" in the periods tab', () => {
      const source = read('js/pages/rentalPeriods.js');
      expect(source).toContain("UndoDialog.open({ type: 'rental.collection', collectionIds, message: note }");
      expect(source).toContain("type: 'obligation.resolution'");
      expect(source).not.toContain('Confirmar y deshacer');
    });
  });
});
