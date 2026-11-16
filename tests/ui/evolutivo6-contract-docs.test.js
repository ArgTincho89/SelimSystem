const { loadBrowser } = require('../helpers/fake-dom');

const flush = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };

describe('Evolutivo 6 contract documents in the Contratos tab', () => {
  const overview = {
    header: { tenants: [{ name: 'Ana' }] },
    modalities: [
      { contractId: 'c1', status: 'active', modalityLabel: 'Vivienda', from: '2026-01-01', to: null, originalAmount: 1000, currentAmount: 1000, currencyCode: 'ARS' },
      { contractId: 'c2', status: 'active', modalityLabel: 'Cochera', from: '2026-01-01', to: null, originalAmount: 500, currentAmount: 500, currencyCode: 'ARS' }
    ]
  };
  const setup = lists => {
    const API = {
      documents: {
        list: jest.fn(async (type, id) => { if (lists[id] instanceof Error) throw lists[id]; return lists[id] || []; }),
        contentUrl: (id, download) => `/api/documents/${id}/content${download ? '?download=1' : ''}`
      }
    };
    const AssetHistory = { showReceipt: jest.fn() };
    const { RentalModal } = loadBrowser(['js/utils/format.js', 'js/pages/rentalModal.js'], ['RentalModal'], { API, Modal: {}, MoneyInput: {}, AssetHistory, showToast: jest.fn() });
    return { RentalModal, API, AssetHistory };
  };
  const slotOf = (root, id) => root.findAll(item => item.dataset && item.dataset.contractDocuments === id)[0];

  it('shows "Ver documento" and "Descargar documento" for a contract with a document', async () => {
    const doc = { id: 'd1', title: 'Contrato firmado', fileName: 'contrato.pdf' };
    const { RentalModal, API, AssetHistory } = setup({ c1: [doc] });
    const root = RentalModal.renderContracts({ overview, readOnly: true });
    await flush();
    expect(API.documents.list).toHaveBeenCalledWith('contract', 'c1');
    const slot = slotOf(root, 'c1');
    const view = slot.findAll(item => item.dataset && item.dataset.contractDocument === 'view')[0];
    const download = slot.findAll(item => item.dataset && item.dataset.contractDocument === 'download')[0];
    expect(view.textContent).toBe('Ver documento');
    expect(download.textContent).toBe('Descargar documento');
    expect(download.attributes.href).toBe('/api/documents/d1/content?download=1');
    view.click();
    expect(AssetHistory.showReceipt).toHaveBeenCalledWith(doc);
  });

  it('shows no document actions for a contract without documents', async () => {
    const { RentalModal } = setup({ c1: [{ id: 'd1', title: 'Contrato' }] });
    const root = RentalModal.renderContracts({ overview, readOnly: true });
    await flush();
    expect(slotOf(root, 'c2').children).toHaveLength(0);
    expect(slotOf(root, 'c1').children).toHaveLength(2);
  });

  it('keeps the tab usable when the documents request fails', async () => {
    const { RentalModal } = setup({ c1: new Error('boom') });
    const root = RentalModal.renderContracts({ overview, readOnly: true });
    await flush();
    expect(slotOf(root, 'c1').children).toHaveLength(0);
    expect(root.findAll(item => item.dataset && item.dataset.contractCard)).toHaveLength(2);
  });
});
