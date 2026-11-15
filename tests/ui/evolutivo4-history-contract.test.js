const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

function loadAssetsPage() {
  const context = { localStorage: { getItem: () => null }, Intl, Date, Object, Set, Map, String, Array, Number };
  vm.createContext(context);
  vm.runInContext(`${read('js/utils/format.js')}\n${read('js/pages/obligations.js')}\n${read('js/pages/assets.js')}\nthis.page = AssetsPage;`, context);
  return context.page;
}

describe('Evolutivo 4 asset obligation history contract', () => {
  const source = read('js/pages/assets.js');
  const history = source.slice(source.indexOf('  async showHistory(id) {'), source.indexOf('  async showDetails(id) {'));
  const page = loadAssetsPage();

  it('opens the lean history modal with the wide layout and the API endpoint', () => {
    expect(source).toContain('async showHistory(id)');
    expect(history).toContain('API.assets.obligationHistory(id)');
    expect(history).toContain("{ width: '760px' }");
    expect(read('js/api.js')).toContain('/obligation-history');
  });

  it('wires the buttons: "Ver historial" -> history, "Ficha" and "Alquileres" -> details', () => {
    expect(source).toContain("textContent: 'Ver historial', onClick: () => this.showHistory(asset.id)");
    expect(source).toContain("textContent: 'Ficha', onClick: () => this.showDetails(asset.id)");
    expect(source).toContain("textContent: 'Alquileres', onClick: () => this.showDetails(asset.id)");
    expect(read('js/app.js')).toContain('AssetsPage.showDetails(params.asset)');
  });

  it('offers a month selector with "Todos los meses" and one option per month, grouped by month and type', () => {
    expect(history).toContain("['', 'Todos los meses']");
    expect(history).toContain('history.months.map(item => [item.month, formatMonth(item.month)])');
    expect(history).toContain('this.groupHistoryMonths(months)');
    expect(history).toContain('dueBadge(row)');
    const groups = page.groupHistoryMonths([
      { month: '2026-11', rows: [{ type: 'tax', id: 1 }, { type: 'utility', id: 2 }, { type: 'tax', id: 3 }, { type: 'weird', id: 4 }] },
      { month: '2026-10', rows: [] }
    ]);
    expect(groups.map(group => group.month)).toEqual(['2026-11']);
    expect(groups[0].types.map(item => [item.label, item.rows.length])).toEqual([['Impuesto', 2], ['Servicios', 1], ['Otro', 1]]);
  });

  it('shows the record detail with payments, title, notes and receipts', () => {
    expect(history).toContain('showHistoryDetail(row, container)');
    expect(history).toContain('payment.title');
    expect(history).toContain('payment.notes');
    expect(history).toContain('this.showReceipt(doc)');
  });

  it('shows receipts from a Blob object URL in a stacked 900px viewer, revoked on close, no sandbox attribute', () => {
    expect(history).toContain('async showReceipt(doc)');
    expect(history).toContain("width: '900px', onClose: revoke");
    expect(history).toContain('URL.createObjectURL');
    expect(history).toContain('URL.revokeObjectURL(objectUrl)');
    expect(history).toContain("create('iframe', { src: objectUrl");
    expect(history).not.toMatch(/sandbox/i);
    expect(history).toContain('Modal.push(');
  });

  it('renders only allow-listed MIME types and zooms images with CSS scale', () => {
    expect(page.receiptMime('application/pdf')).toBe('application/pdf');
    expect(page.receiptMime('image/PNG; charset=binary')).toBe('image/png');
    expect(page.receiptMime('text/plain; charset=utf-8')).toBe('text/plain');
    expect(page.receiptMime('image/jpeg')).toBe('image/jpeg');
    expect(page.receiptMime('image/webp')).toBe('image/webp');
    expect(page.receiptMime('text/html')).toBe('');
    expect(page.receiptMime('image/svg+xml')).toBe('');
    expect(page.receiptMime(undefined)).toBe('');
    expect(history).toContain('img.style.scale');
    expect(history).toContain('zoom(0.25)');
    expect(history).toContain('zoom(-0.25)');
    expect(history).toContain('textContent: \'Abrir\'');
    expect(history).toContain('textContent: \'Descargar\'');
  });

  it('formats history amounts from minor units', () => {
    expect(page.historyMoney(12345, 'ARS')).toContain('123,45');
    expect(page.historyMoney(500, 'JPY')).toContain('500');
  });
});
