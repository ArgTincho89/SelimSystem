const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 5 periods tab contract', () => {
  const source = read('js/pages/rentalPeriods.js');
  const { RentalPeriods } = loadBrowser(['js/utils/format.js', 'js/pages/rentalPeriods.js'], ['RentalPeriods']);
  const part = (modality, state = 'pending', expected = 100) => ({ modality, modalityLabel: modality, currencyCode: 'ARS', expected, state });
  const obligation = (concept, responsibility, extra = {}) => ({ concept, responsibility, counterpart: 'Municipalidad', currencyCode: 'ARS', expected: 10, state: 'pending', ...extra });
  const period = (key, state, parts, obligations = []) => ({ period: key, state, parts, obligations });

  describe('table columns and states', () => {
    it('has the columns Período, Vencimiento, one per modality, Obligaciones, Total, Estado, Acción', () => {
      ['Período', 'Vencimiento', 'Obligaciones', 'Total', 'Estado', 'Acción'].forEach(label => expect(source).toContain(`label: '${label}'`));
      expect(source).toContain('...this.MODALITIES.map(kind => ({ key: kind, label: modalityLabel(kind)');
      expect(RentalPeriods.MODALITIES).toEqual(['locacion', 'comodato', 'mutuo']);
    });

    it('keeps the data-rent-month hook and exposes expandable rows', () => {
      expect(source).toContain('rentMonth: row.monthKey || row.period');
      expect(source).toContain('expand: row => this.detail(row, ctx)');
    });

    it('separates owner and tenant obligations in the cell', () => {
      expect(source).toContain("['owner', 'tenant'].forEach(side");
      expect(RentalPeriods.RESPONSIBILITY).toEqual({ owner: 'Titular', tenant: 'Inquilino' });
    });

    it('adds rent and obligations per currency without conversion in the total', () => {
      const row = { parts: [{ ...part('locacion'), expected: 11797500 }, { ...part('comodato'), expected: 3000000 }, { ...part('mutuo', 'cancelled'), expected: 5 }], obligations: [obligation('Impuesto municipal', 'owner', { expected: 100000 }), { ...obligation('USD fee', 'owner'), currencyCode: 'USD', expected: 7 }] };
      expect(RentalPeriods.periodTotals(row)).toEqual([{ currencyCode: 'ARS', amount: 14897500 }, { currencyCode: 'USD', amount: 7 }]);
    });
  });

  describe('filters', () => {
    const rows = [
      period('2026-10', 'collected', [part('locacion', 'collected'), part('comodato', 'collected')], [obligation('Impuesto municipal', 'owner')]),
      period('2026-11', 'overdue', [part('locacion', 'overdue'), part('comodato', 'overdue')], [obligation('Impuesto municipal', 'owner'), obligation('Expensas', 'tenant', { counterpart: 'Consorcio' })]),
      period('2026-12', 'pending', [part('locacion')], [])
    ];
    const keys = filters => RentalPeriods.applyFilters(rows, filters).map(item => item.period);

    it('filters by year-month, state, type, responsible, modality, provider and free text', () => {
      expect(keys({})).toEqual(['2026-10', '2026-11', '2026-12']);
      expect(keys({ month: '11' })).toEqual(['2026-11']);
      expect(keys({ status: 'collected' })).toEqual(['2026-10']);
      expect(keys({ type: 'obligation' })).toEqual(['2026-10', '2026-11']);
      expect(keys({ type: 'rent' })).toEqual(['2026-10', '2026-11', '2026-12']);
      expect(keys({ responsibility: 'tenant' })).toEqual(['2026-11']);
      expect(keys({ modality: 'comodato' })).toEqual(['2026-10', '2026-11']);
      expect(keys({ provider: 'Consorcio' })).toEqual(['2026-11']);
      expect(keys({ text: 'expensas' })).toEqual(['2026-11']);
      expect(keys({ status: 'overdue', responsibility: 'owner' })).toEqual(['2026-11']);
    });

    it('hides the filtered-out parts and obligations of the visible rows', () => {
      const [row] = RentalPeriods.applyFilters(rows, { month: '11', responsibility: 'tenant', modality: 'locacion' });
      expect(row.visibleObligations.map(item => item.concept)).toEqual(['Expensas']);
      expect(row.visibleParts.map(item => item.modality)).toEqual(['locacion']);
      expect(RentalPeriods.applyFilters(rows, { type: 'obligation' })[0].visibleParts).toEqual([]);
      expect(RentalPeriods.applyFilters(rows, { type: 'rent' })[0].visibleObligations).toEqual([]);
    });

    it('returns nothing (so the empty state with its suggested action shows) when no row matches', () => {
      expect(keys({ text: 'zzz' })).toEqual([]);
      expect(source).toContain('No hay períodos que coincidan con estos filtros.');
      expect(source).toContain("textContent: 'Limpiar filtros'");
    });
  });

  describe('actions', () => {
    it('offers collect, undo collection, cancel period and the obligation actions, all with confirmation where destructive', () => {
      ['Registrar cobro', 'Deshacer cobro', 'Cancelar período', 'Registrar pago', 'Resolver', 'Anular resolución', 'Ver detalle', 'Actualizar alquiler'].forEach(label => expect(source).toContain(label));
      expect(source).toContain("period.actions.includes('cancel-period')");
      expect(source).toContain('ConfirmDialog.open(');
      expect(source).toContain('UndoDialog.open({ type: \'rental.collection\'');
      expect(source).toContain('API.rentals.cancelOccurrence(part.contractId, part.occurrenceId)');
      expect(source).toContain("type: 'obligation.resolution'");
    });

    it('moved the collection dialogs out of assets.js, which keeps thin delegates', () => {
      const assets = read('js/pages/assets.js');
      ['async collectMonth(', 'async collectContract(', 'async showCollectionView(', 'undoCollections('].forEach(name => expect(source).toContain(name));
      expect(assets).toContain('return RentalPeriods.collectMonth(assetId, monthKey, onDone);');
      expect(assets).toContain('return RentalPeriods.collectContract(asset, contract, selectedOccurrenceId, onDone);');
      expect(assets).not.toContain('API.rentals.collectMonth(');
      ['renderSchedule', 'renderRentMonths', 'renderRentals', 'Cobros y saldos no aplicados', 'Otros movimientos atribuidos al contrato'].forEach(removed => expect(assets).not.toContain(removed));
    });

    it('keeps no window.confirm / prompt / alert in the new rental files', () => {
      ['js/pages/rentalPeriods.js', 'js/pages/rentalModal.js', 'js/components/dataTable.js', 'js/components/tabs.js', 'js/components/confirmDialog.js', 'js/pages/assetHistory.js'].forEach(file => {
        expect(read(file)).not.toMatch(/(^|[^.\w])(confirm|prompt|alert)\(/m);
      });
    });
  });

  describe('DataTable', () => {
    const { context, DataTable } = loadBrowser(['js/components/dataTable.js'], ['DataTable']);
    const build = options => DataTable.create({ columns: [{ key: 'name', label: 'Nombre' }, { key: 'amount', label: 'Importe', render: row => `$${row.amount}` }], rowId: row => row.name, ...options });

    it('renders header cells, labelled cells (stacked on phones) and the empty state', () => {
      const table = build({ emptyMessage: 'Nada.' });
      expect(table.element.find(element => element.tagName === 'P').hidden).toBe(false);
      table.setRows([{ name: 'a', amount: 1 }, { name: 'b', amount: 2 }]);
      const cells = table.element.findAll(element => element.tagName === 'TD');
      expect(cells.map(cell => [cell.dataset.label, cell.textContent])).toEqual([['Nombre', 'a'], ['Importe', '$1'], ['Nombre', 'b'], ['Importe', '$2']]);
      expect(table.element.findAll(element => element.tagName === 'TH').map(cell => cell.textContent)).toEqual(['Nombre', 'Importe']);
      expect(table.element.find(element => element.tagName === 'P').hidden).toBe(true);
    });

    it('expands a row lazily and keeps the toggle accessible', () => {
      let renders = 0;
      const table = build({ expand: row => { renders += 1; const node = context.document.createElement('div'); node.textContent = `detalle ${row.name}`; return node; } });
      table.setRows([{ name: 'a', amount: 1 }]);
      const toggle = table.element.find(element => element.tagName === 'BUTTON');
      expect(toggle.attributes['aria-expanded']).toBe('false');
      const detail = table.element.find(element => element.dataset.detailFor === 'a');
      expect(detail.hidden).toBe(true);
      toggle.click();
      expect(toggle.attributes['aria-expanded']).toBe('true');
      expect(detail.hidden).toBe(false);
      expect(detail.textContent).toBe('detalle a');
      toggle.click(); toggle.click();
      expect(renders).toBe(1);
    });

    it('adds row data attributes through rowDataset', () => {
      const table = build({ rowDataset: row => ({ rentMonth: row.name }) });
      table.setRows([{ name: 'x', amount: 1 }]);
      expect(table.element.find(element => element.className === 'data-row').dataset.rentMonth).toBe('x');
    });
  });

  describe('ConfirmDialog', () => {
    const open = options => {
      const calls = [];
      const modal = { push: (title, body, config) => calls.push({ title, body, config }), hide: () => { calls.at(-1).config.onClose(); } };
      const { ConfirmDialog } = loadBrowser(['js/components/confirmDialog.js'], ['ConfirmDialog'], { Modal: modal });
      return { promise: ConfirmDialog.open(options), calls };
    };

    it('resolves { confirmed: true, reason } with the optional reason', async () => {
      const { promise, calls } = open({ title: 'Revertir', message: 'Línea 1\nLínea 2', reasonField: true, danger: true, details: [['Importe', '100']] });
      const body = calls[0].body;
      expect(body.findAll(element => element.tagName === 'P').map(item => item.textContent)).toEqual(['Línea 1', 'Línea 2']);
      expect(body.textContent).toContain('Importe:');
      body.find(element => element.tagName === 'TEXTAREA').value = '  me equivoqué ';
      calls[0].config.footer.find(element => element.dataset.confirmAction).click();
      expect(await promise).toEqual({ confirmed: true, reason: 'me equivoqué' });
    });

    it('resolves { confirmed: false } on cancel and when the dialog is dismissed', async () => {
      const first = open({ title: 'x' });
      first.calls[0].config.footer.findAll(element => element.tagName === 'BUTTON')[0].click();
      expect(await first.promise).toEqual({ confirmed: false, reason: '' });
      const second = open({ title: 'x' });
      second.calls[0].config.onClose();
      expect(await second.promise).toEqual({ confirmed: false, reason: '' });
    });
  });

  it('registers the new scripts in the page and the service worker', () => {
    ['/js/components/dataTable.js', '/js/components/confirmDialog.js', '/js/pages/rentalPeriods.js'].forEach(script => {
      expect(read('index.html')).toContain(script);
      expect(read('sw.js')).toContain(`'${script}'`);
    });
  });
});
