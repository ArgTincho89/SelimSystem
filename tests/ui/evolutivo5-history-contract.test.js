const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

function load() {
  const context = { localStorage: { getItem: () => null }, Intl, Date, Object, Set, Map, String, Array, Number };
  vm.createContext(context);
  vm.runInContext(`${read('js/utils/format.js')}\n${read('js/pages/assetHistory.js')}\nthis.history = AssetHistory; this.badge = statusBadge;`, context);
  return context;
}

describe('Evolutivo 5 asset history timeline contract', () => {
  const source = read('js/pages/assetHistory.js');
  const { history, badge } = load();

  it('offers separate "Año" and "Mes" selectors, "Todo el año" and a "Hoy" button', () => {
    expect(source).toContain("aria-label', 'Año'");
    expect(source).toContain("aria-label', 'Mes'");
    expect(source).toContain("['all', 'Todo el año']");
    expect(source).toContain("textContent: 'Hoy'");
    expect(source).toContain('API.assets.history(assetId, { year: state.year, month: state.month })');
    expect(read('js/api.js')).toContain('/history');
  });

  it('refreshes the list in place when the selectors change (no page reload)', () => {
    expect(source).toContain("on(yearSelect, 'change'");
    expect(source).toContain("on(monthSelect, 'change'");
    expect(source).not.toContain('location.reload');
  });

  it('renders the compact table columns and the empty state', () => {
    ['Fecha', 'Concepto', 'Tipo', 'Responsable', 'Proveedor / inquilino', 'Esperado', 'Ejecutado', 'Saldo', 'Estado', 'Acción'].forEach(column => expect(source).toContain(`'${column}'`));
    expect(source).toContain('No hay movimientos en este período.');
    expect(source).toContain("'Ver detalle'");
  });

  it('shows the modality breakdown and the status of each row with text and icon', () => {
    expect(source).toContain('part.modalityLabel');
    expect(source).toContain('part.classification');
    expect(badge('overdue')).toEqual({ label: 'Vencido', icon: '⚠', className: 'status-overdue' });
    ['pending', 'ending-soon', 'overdue', 'partial', 'paid', 'collected', 'resolved', 'reverted', 'cancelled'].forEach(state => {
      const info = badge(state);
      expect(info.label).toBeTruthy();
      expect(info.icon).toBeTruthy();
    });
    expect(badge('reverted').label).toBe('Revertido');
    expect(badge('unknown').label).toBe('Pendiente');
  });

  it('opens a detail dialog with an actions slot and the contextual actions chosen by the server', () => {
    expect(source).toContain("dataset: { actionsSlot: 'true' }");
    expect(source).toContain('actionProviders');
    ['Registrar pago', 'Resolver', 'Registrar cobro', 'Adjuntar comprobante', 'Agregar nota', 'Ver comprobante', 'Descargar comprobante'].forEach(label => expect(source).toContain(label));
    expect(source).toContain("actions.includes('pay')");
    expect(source).toContain("actions.includes('resolve')");
    expect(source).toContain("actions.includes('collect')");
    expect(source).toContain("actions.includes('undo-collect')");
    expect(source).not.toMatch(/\bconfirm\(|\bprompt\(|\balert\(/);
  });

  it('groups rows by month when a whole year is shown', () => {
    const groups = history.groupByMonth([{ date: '2026-02-01' }, { date: '2026-02-10' }, { date: '2026-03-01' }]);
    expect(groups.map(group => [group.month, group.rows.length])).toEqual([['2026-02', 2], ['2026-03', 1]]);
  });

  it('registers the script in the page and the service worker', () => {
    expect(read('index.html')).toContain('/js/pages/assetHistory.js');
    expect(read('sw.js')).toContain("'/js/pages/assetHistory.js'");
  });
});
