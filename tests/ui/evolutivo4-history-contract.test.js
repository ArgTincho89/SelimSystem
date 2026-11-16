const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

function loadHistory() {
  const context = { localStorage: { getItem: () => null }, Intl, Date, Object, Set, Map, String, Array, Number };
  vm.createContext(context);
  vm.runInContext(`${read('js/utils/format.js')}\n${read('js/pages/assetHistory.js')}\nthis.page = AssetHistory;`, context);
  return context.page;
}

// Evolutivo 5 moved the history (and the receipt viewer) from assets.js to assetHistory.js.
describe('Evolutivo 4 asset history and receipt viewer contract (re-pointed to assetHistory.js)', () => {
  const source = read('js/pages/assets.js');
  const history = read('js/pages/assetHistory.js');
  const page = loadHistory();

  it('keeps the legacy obligation-history endpoint wrapper and delegates the modal to AssetHistory', () => {
    expect(read('js/api.js')).toContain('/obligation-history');
    expect(source).toContain('showHistory(id) {');
    expect(source).toContain('return AssetHistory.open(id);');
    expect(history).toContain('API.assets.history(assetId');
    expect(history).toContain("{ width: '1100px' }");
  });

  it('wires the buttons: "Ver historial" -> history and "Ficha" -> details', () => {
    expect(source).toContain("textContent: 'Ver historial', onClick: () => this.showHistory(asset.id)");
    expect(source).toContain("textContent: 'Ficha', onClick: () => this.showDetails(asset.id)");
    expect(read('js/app.js')).toContain('AssetsPage.showDetails(params.asset)');
  });

  it('shows the record detail with payments, title, notes and receipts', () => {
    expect(history).toContain('showDetail(row, ctx)');
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
    expect(source).not.toContain('async showReceipt(doc)');
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

  it('formats amounts per currency without conversion', () => {
    expect(page.amountText(123.45, 'ARS')).toContain('123,45');
    expect(page.amountText(500, 'JPY')).toContain('500');
    expect(page.amountText(null, 'ARS')).toBe('—');
  });
});
