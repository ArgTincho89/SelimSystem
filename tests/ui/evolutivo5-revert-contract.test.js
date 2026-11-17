const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const flush = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };

describe('Evolutivo 5 payment reversal UI contract', () => {
  const detail = (extra = {}) => ({
    payment: { id: 't1', date: '2026-11-10', amount: 100000, currencyCode: 'ARS' }, obligation: { id: 'o1', title: 'Impuesto municipal' }, occurrence: { id: 'occ1', date: '2026-11-10' },
    account: { id: 'a1', name: 'Banco' }, paymentMethod: 'Transferencia', documents: [{ id: 'd1', title: 'recibo.pdf' }], dependent: null, revertible: true, reconciliationWillReset: false, ...extra
  });
  // The confirmation is the shared UndoDialog (required reason, covered by evolutivo6-undo-contract); here it is a stub.
  const setup = (api = {}, undone = true) => {
    const API = { obligations: { payment: jest.fn().mockResolvedValue(detail()), revertPayment: jest.fn().mockResolvedValue({ reconciliationReset: false }), ...api } };
    const ConfirmDialog = { open: jest.fn().mockResolvedValue({ confirmed: true, reason: '' }) };
    const UndoDialog = { open: jest.fn().mockResolvedValue(undone) };
    const showToast = jest.fn();
    const { ObligationsPage, context } = loadBrowser(['js/utils/format.js', 'js/pages/obligations.js'], ['ObligationsPage'], { API, ConfirmDialog, UndoDialog, Modal: { push: jest.fn(), hide: jest.fn() }, showToast, MoneyInput: {}, Router: {}, App: {} });
    return { ObligationsPage, API, ConfirmDialog, UndoDialog, showToast, context };
  };
  const ref = { obligationId: 'o1', occurrenceId: 'occ1', transactionId: 't1' };

  it('shows the payment data and the exact copy in the UndoDialog before sending anything', async () => {
    const { ObligationsPage, UndoDialog, API } = setup();
    await ObligationsPage.revertPayment(ref);
    const options = UndoDialog.open.mock.calls[0][0];
    expect(options).toMatchObject({ type: 'obligation.payment', obligationId: 'o1', occurrenceId: 'occ1', transactionId: 't1', title: 'Revertir pago', confirmLabel: 'Revertir pago' });
    expect(options.message).toBe('Estás por revertir un pago registrado. Se anulará el gasto asociado y el vencimiento volverá a pendiente. Esta acción no se puede deshacer. ¿Querés continuar?');
    const labels = options.details.map(([label]) => label);
    ['Fecha', 'Importe', 'Cuenta', 'Medio de pago', 'Obligación', 'Vencimiento', 'Comprobante'].forEach(label => expect(labels).toContain(label));
    expect(API.obligations.payment).toHaveBeenCalledWith('o1', 'occ1', 't1');
  });

  it('hands the done callback to the UndoDialog, which sends the required reason and the request', async () => {
    const { ObligationsPage, UndoDialog, API } = setup();
    const onDone = jest.fn();
    expect(await ObligationsPage.revertPayment(ref, onDone)).toBe(true);
    expect(UndoDialog.open.mock.calls[0][1]).toEqual({ onDone });
    expect(API.obligations.revertPayment).not.toHaveBeenCalled();
  });

  it('sends nothing from the page when the dialog is dismissed', async () => {
    const { ObligationsPage, API } = setup({}, false);
    expect(await ObligationsPage.revertPayment(ref)).toBe(false);
    expect(API.obligations.revertPayment).not.toHaveBeenCalled();
  });

  it('does not offer the revert for a payment with dependents and shows why', async () => {
    const { ObligationsPage, ConfirmDialog, API } = setup({ payment: jest.fn().mockResolvedValue(detail({ revertible: false, dependent: 'Tiene un reembolso (x, 2026-11-11).' })) });
    expect(await ObligationsPage.revertPayment(ref)).toBe(false);
    expect(ConfirmDialog.open.mock.calls[0][0].message).toContain('No se puede revertir este pago porque tiene movimientos dependientes.');
    expect(API.obligations.revertPayment).not.toHaveBeenCalled();
  });

  it('asks which payment to revert when an occurrence has several, and reverts the only one directly', async () => {
    const { ObligationsPage, API } = setup();
    await ObligationsPage.revertFromOccurrence({ id: 'o1' }, { id: 'occ1', paymentIds: ['t1'] });
    await flush();
    expect(API.obligations.payment).toHaveBeenCalledWith('o1', 'occ1', 't1');
    expect(await ObligationsPage.revertFromOccurrence({ id: 'o1' }, { id: 'occ1', paymentIds: [] })).toBe(false);
  });

  describe('entry points', () => {
    it('is wired in the obligation due date list, asset history, periods, alerts and the transaction detail', () => {
      expect(read('js/pages/obligations.js')).toContain("textContent: all.length > 1 ? `Revertir pago ${index + 1}` : 'Revertir pago'");
      expect(read('js/pages/assetHistory.js')).toContain('AssetHistory.actionProviders.push((row, ctx) => AssetHistory.undoButtons(row, ctx.afterDone));');
      expect(read('js/pages/rentalPeriods.js')).toContain("AssetHistory.revertButtons({ ...item, kind: 'obligation' }");
      expect(read('js/pages/alerts.js')).toContain("['Revertir pago', () => this.revertPayment(alert)]");
      expect(read('js/pages/home.js')).toContain("textContent: 'Revertir pago'");
      expect(read('js/pages/home.js')).toContain('ObligationsPage.revertPayment({ obligationId: tx.obligationId');
    });

    it('only the document_pending alert offers it', () => {
      const source = read('js/pages/alerts.js');
      const documentCase = source.slice(source.indexOf("case 'document_pending'"), source.indexOf("case 'rent_due'"));
      expect(documentCase).toContain('Revertir pago');
      expect(source.slice(source.indexOf("case 'obligation_due'"), source.indexOf("case 'document_pending'"))).not.toContain('Revertir pago');
    });

    it('the history builds one button per revertible payment of an obligation row and none for pending rows', () => {
      const { AssetHistory } = loadBrowser(['js/utils/format.js', 'js/pages/assetHistory.js'], ['AssetHistory'], { ObligationsPage: { revertPayment: jest.fn() } });
      const row = { kind: 'obligation', concept: 'Impuesto', actions: ['revert'], payments: [{ transactionId: 't1', revertible: true }, { transactionId: 't2', revertible: false }], refs: { obligationId: 'o1', occurrenceId: 'occ1' } };
      expect(AssetHistory.revertButtons(row, jest.fn()).map(button => button.textContent)).toEqual(['Deshacer']);
      expect(AssetHistory.revertButtons({ ...row, actions: ['pay'], payments: [] }, jest.fn())).toEqual([]);
      expect(AssetHistory.revertButtons({ ...row, kind: 'rent' }, jest.fn())).toEqual([]);
      expect(AssetHistory.actionProviders).toHaveLength(1);
    });
  });
});
