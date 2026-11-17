const { loadBrowser } = require('../helpers/fake-dom');

const flush = async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); };

describe('Evolutivo 7 cheque alerts and undo', () => {
  const alert = {
    id: 'cheque:c1', type: 'cheque_due', title: 'Cheque a cobrar · Casa', message: 'El cheque de Ana por $1.000 del alquiler de enero 2025 del Casa se cobra el 20 de noviembre.',
    date: '2026-11-20', status: 'pending', collectionId: 'c1', groupId: 'g1', assetId: 'a1', assetName: 'Casa', tenantNames: ['Ana'], period: '2025-01', amount: 1000, currencyCode: 'ARS'
  };

  it('offers "Marcar como cobrado" and "Ver cobro" and marks the cheque after confirming', async () => {
    const API = { rentals: { markChequeCashed: jest.fn(async () => ({})) } };
    const ConfirmDialog = { open: jest.fn(async () => ({ confirmed: true })) };
    const AssetsPage = { showCollectionView: jest.fn() };
    const { AlertsPage, context } = loadBrowser(['js/utils/format.js', 'js/pages/alerts.js'], ['AlertsPage'], { API, ConfirmDialog, AssetsPage, Router: { navigate: jest.fn() } });
    context.showToast = jest.fn();
    AlertsPage.reload = jest.fn();
    expect(AlertsPage.TYPE_LABELS.cheque_due).toBe('Cheques por cobrar');
    const actions = AlertsPage.actionsFor(alert);
    expect(actions.map(([label]) => label)).toEqual(['Marcar como cobrado', 'Ver cobro', 'Ver bien']);
    await actions[0][1]();
    expect(ConfirmDialog.open.mock.calls[0][0].details).toEqual(expect.arrayContaining([['Bien', 'Casa'], ['Inquilino', 'Ana']]));
    expect(API.rentals.markChequeCashed).toHaveBeenCalledWith('g1');
    expect(AlertsPage.reload).toHaveBeenCalled();
    actions[1][1]();
    expect(AssetsPage.showCollectionView).toHaveBeenCalledWith('g1');
  });

  it('does nothing when the confirmation is dismissed', async () => {
    const API = { rentals: { markChequeCashed: jest.fn() } };
    const { AlertsPage } = loadBrowser(['js/utils/format.js', 'js/pages/alerts.js'], ['AlertsPage'], { API, ConfirmDialog: { open: async () => ({ confirmed: false }) } });
    await AlertsPage.markChequeCashed(alert);
    expect(API.rentals.markChequeCashed).not.toHaveBeenCalled();
  });

  it('undoes a cashed cheque from the logs with the required reason', async () => {
    const API = { rentals: { undoChequeCashed: jest.fn(async () => ({})) } };
    const pushed = [];
    const Modal = { push: (title, body, options) => pushed.push({ title, body, options }), hide: jest.fn() };
    const { UndoDialog, context } = loadBrowser(['js/components/undoDialog.js'], ['UndoDialog'], { API, Modal });
    context.showToast = jest.fn();
    const done = UndoDialog.open({ type: 'rental.cheque', collectionId: 'g1' });
    const { body, options } = pushed[0];
    expect(pushed[0].title).toBe('Deshacer cobro del cheque');
    body.find(element => element.dataset && element.dataset.undoReason).value = 'Rebotó';
    options.footer.find(element => element.dataset && element.dataset.undoConfirm).click();
    await flush();
    expect(API.rentals.undoChequeCashed).toHaveBeenCalledWith('g1', { reason: 'Rebotó' });
    expect(await done).toBe(true);
    expect(context.showToast).toHaveBeenCalledWith('El cheque volvió a quedar pendiente de cobro');
  });
});
