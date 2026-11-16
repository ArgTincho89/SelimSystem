const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const flush = async () => { for (let index = 0; index < 10; index += 1) await Promise.resolve(); };

describe('Evolutivo 5 monthly sheet modal contract', () => {
  const rows = [
    { id: 'r1', kind: 'rent', date: '2026-11-01', concept: 'Alquiler', responsibility: 'tenant', counterpart: 'Ana', currencyCode: 'ARS', expected: 14797500, executed: 14797500, balance: 0, state: 'collected', parts: [{ modality: 'locacion', modalityLabel: 'Locación', amount: 14797500, currencyCode: 'ARS', state: 'collected' }], payments: [], reversals: [], documents: [{ id: 'doc1', title: 'Recibo' }], notes: [], actions: ['undo-collect'], refs: { assetId: 'a1', monthKey: '2026-11', collectionIds: ['c1'] } },
    { id: 'r2', kind: 'obligation', date: '2026-11-10', concept: 'Impuesto municipal', responsibility: 'owner', counterpart: 'Municipalidad', currencyCode: 'ARS', expected: 100000, executed: 0, balance: 100000, state: 'overdue', parts: [], payments: [], reversals: [], documents: [], notes: [], actions: ['pay'], refs: { assetId: 'a1', obligationId: 'o1', occurrenceId: 'occ1' } },
    { id: 'r3', kind: 'obligation', date: '2026-11-12', concept: 'Impuesto municipal', responsibility: 'tenant', counterpart: 'Ana', currencyCode: 'ARS', expected: 100000, executed: 0, balance: 100000, state: 'pending', parts: [], payments: [], reversals: [], documents: [], notes: [], actions: ['resolve'], refs: { assetId: 'a1', obligationId: 'o2', occurrenceId: 'occ2' } },
    { id: 'r4', kind: 'obligation', date: '2026-10-05', concept: 'Seguro USD', responsibility: 'owner', counterpart: 'Aseguradora', currencyCode: 'USD', expected: 50, executed: 50, balance: 0, state: 'paid', parts: [], payments: [], reversals: [], documents: [], notes: [], actions: [], refs: { assetId: 'a1' } },
    { id: 'r5', kind: 'event', date: '2026-10-20', concept: 'Pago revertido', responsibility: null, counterpart: '', currencyCode: null, expected: null, executed: null, balance: null, state: 'reverted', parts: [], payments: [], reversals: [], documents: [], notes: [], actions: [], refs: {} }
  ];

  const setup = (history = { rows }) => {
    const pushed = [];
    const API = { assets: { get: jest.fn().mockResolvedValue({ id: 'a1', name: 'Casa Centro' }), history: jest.fn().mockResolvedValue(history) } };
    const Modal = { push: jest.fn((title, body, options) => pushed.push({ title, body, options })), hide: jest.fn() };
    const showToast = jest.fn();
    const loaded = loadBrowser(['js/utils/format.js', 'js/components/dataTable.js', 'js/pages/assetHistory.js', 'js/pages/rentalPeriods.js'], ['MonthlySheet', 'AssetHistory', 'RentalPeriods'], { API, Modal, showToast });
    loaded.context.AssetsPage = { showRentMonthModal: jest.fn() };
    return { ...loaded, API, Modal, pushed };
  };
  const byLabel = (root, label) => root.find(element => element.attributes && element.attributes['aria-label'] === label);

  it('opens as a secondary (stacked) modal and is wired from the ficha button', () => {
    const source = read('js/pages/rentalPeriods.js');
    expect(source).toContain('Modal.push(`Ficha mensual · ${asset.name}`');
    expect(source).not.toContain('Modal.show(`Ficha mensual');
    expect(read('js/pages/assets.js')).toContain('onClick: () => MonthlySheet.open(asset.id)');
    expect(read('js/pages/assets.js')).not.toContain('Cargando ficha mensual');
  });

  it('asks the history endpoint for the from/to range and shows the table columns', async () => {
    const { MonthlySheet, API, pushed } = setup();
    await MonthlySheet.open('a1', { from: '2026-10', to: '2026-11' });
    expect(API.assets.history).toHaveBeenCalledWith('a1', { from: '2026-10', to: '2026-11' });
    expect(pushed[0].title).toBe('Ficha mensual · Casa Centro');
    ['Período', 'Concepto', 'Responsable', 'Esperado', 'Ejecutado', 'Estado', 'Comprobante', 'Acción'].forEach(label => expect(pushed[0].body.textContent).toContain(label));
    expect(pushed[0].body.textContent).toContain('Noviembre 2026');
    expect(pushed[0].body.textContent).toContain('El rango máximo es de 36 meses.');
    expect(pushed[0].body.findAll(element => element.dataset && element.dataset.sheetRow)).toHaveLength(5);
  });

  it('offers the periods-tab actions per row ("Deshacer", "Registrar pago", "Resolver")', async () => {
    const { MonthlySheet, pushed, AssetHistory } = setup();
    const payObligation = jest.spyOn(AssetHistory, 'payObligation').mockResolvedValue();
    const resolveObligation = jest.spyOn(AssetHistory, 'resolveObligation').mockResolvedValue();
    await MonthlySheet.open('a1', { from: '2026-10', to: '2026-11' });
    const sheet = pushed[0].body;
    const row = id => sheet.find(element => element.dataset && element.dataset.sheetRow === id);
    expect(row('r1').textContent).toContain('Deshacer');
    expect(row('r2').textContent).toContain('Registrar pago');
    expect(row('r3').textContent).toContain('Resolver');
    row('r2').find(element => element.dataset && element.dataset.sheetAction === 'Registrar pago').click();
    row('r3').find(element => element.dataset && element.dataset.sheetAction === 'Resolver').click();
    expect(payObligation).toHaveBeenCalledWith(rows[1], expect.any(Function));
    expect(resolveObligation).toHaveBeenCalledWith(rows[2], expect.any(Function));
  });

  it('extends actions through AssetHistory.actionProviders (revert)', async () => {
    const { MonthlySheet, pushed, AssetHistory, context } = setup();
    AssetHistory.actionProviders.push(row => (row.id === 'r2' ? [context.document.createElement('button')] : []));
    await MonthlySheet.open('a1', { from: '2026-10', to: '2026-11' });
    const buttons = pushed[0].body.find(element => element.dataset && element.dataset.sheetRow === 'r2').findAll(element => element.tagName === 'BUTTON' && element.dataset.sheetAction === undefined && element.textContent === '');
    expect(buttons.length).toBeGreaterThan(0);
  });

  describe('filters and totals', () => {
    it('filters by responsible, type, state, modality and free text', () => {
      const { MonthlySheet } = setup();
      expect(MonthlySheet.filterRows(rows, { responsibility: 'tenant' }).map(row => row.id)).toEqual(['r1', 'r3']);
      expect(MonthlySheet.filterRows(rows, { type: 'rent' }).map(row => row.id)).toEqual(['r1']);
      expect(MonthlySheet.filterRows(rows, { type: 'obligation' }).map(row => row.id)).toEqual(['r2', 'r3', 'r4']);
      expect(MonthlySheet.filterRows(rows, { state: 'overdue' }).map(row => row.id)).toEqual(['r2']);
      expect(MonthlySheet.filterRows(rows, { modality: 'locacion' }).map(row => row.id)).toEqual(['r1']);
      expect(MonthlySheet.filterRows(rows, { text: 'asegur' }).map(row => row.id)).toEqual(['r4']);
      expect(MonthlySheet.filterRows(rows, {})).toHaveLength(5);
    });

    it('filters the rendered table when the responsible select changes', async () => {
      const { MonthlySheet, pushed } = setup();
      await MonthlySheet.open('a1', { from: '2026-10', to: '2026-11' });
      const select = byLabel(pushed[0].body, 'Responsable');
      select.value = 'tenant';
      select.dispatch('change');
      const visible = pushed[0].body.findAll(element => element.dataset && element.dataset.sheetRow).map(element => element.dataset.sheetRow);
      expect(visible).toEqual(['r1', 'r3']);
    });

    it('totals expected and executed per currency without conversion, ignoring events and cancelled rows', () => {
      const { MonthlySheet } = setup();
      expect(MonthlySheet.totals([...rows, { ...rows[1], id: 'x', state: 'cancelled' }])).toEqual([
        { currencyCode: 'ARS', expected: 14997500, executed: 14797500 },
        { currencyCode: 'USD', expected: 50, executed: 50 }
      ]);
    });

    it('shows "No hay movimientos en este período." when nothing matches', async () => {
      const { MonthlySheet, pushed } = setup({ rows: [] });
      await MonthlySheet.open('a1', { from: '2026-10', to: '2026-11' });
      expect(pushed[0].body.textContent).toContain('No hay movimientos en este período.');
    });
  });

  describe('range', () => {
    it('shifts and counts months', () => {
      const { MonthlySheet } = setup();
      expect(MonthlySheet.shift('2026-01', -1)).toBe('2025-12');
      expect(MonthlySheet.shift('2026-11', -11)).toBe('2025-12');
      expect(MonthlySheet.monthCount('2025-12', '2026-11')).toBe(12);
    });

    it('does not fetch a range above 36 months and says so', async () => {
      const { MonthlySheet, API, pushed } = setup();
      await MonthlySheet.open('a1', { from: '2022-01', to: '2026-11' });
      await flush();
      expect(API.assets.history).not.toHaveBeenCalled();
      expect(pushed[0].body.textContent).toContain('supera los 36 meses');
    });
  });
});
