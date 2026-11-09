const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const payDialog = () => {
  const source = read('js/pages/obligations.js');
  return source.slice(source.indexOf('async pay(obligation, occurrence)'), source.indexOf('async addNote'));
};

describe('Evolutivo 2 S10 pay dialog and receipts contract', () => {
  it('replaces the prompt() pay flow with a modal dialog', () => {
    const dialog = payDialog();
    expect(dialog).not.toContain('prompt(');
    expect(dialog).toContain('API.obligations.paymentContext(');
    expect(dialog).toContain("Modal.show('Registrar pago'");
  });

  it('keeps the amount as the first and only number input', () => {
    const dialog = payDialog();
    expect(dialog.match(/type: 'number'/g)).toHaveLength(1);
    expect(dialog.indexOf("type: 'number'")).toBeLessThan(dialog.indexOf('accountSelect'));
  });

  it('offers the dialog fields, warning, blocked message and required category', () => {
    const dialog = payDialog();
    ['Cuentas de los titulares', 'Otras cuentas', 'Fecha de pago', 'Categoría', 'Medio de pago (opcional)', 'Comprobante (opcional)'].forEach(text => expect(dialog).toContain(text));
    expect(dialog).toContain('context.warning');
    expect(dialog).toContain('context.blockedReason');
    expect(dialog).toContain('context.suggestedAccountId');
    expect(dialog).toContain('category.required = true');
  });

  it('uploads the receipt after the payment and keeps the payment when the upload fails', () => {
    const dialog = payDialog();
    expect(dialog.indexOf('API.obligations.pay(')).toBeLessThan(dialog.indexOf('this.uploadReceipt('));
    expect(dialog).toContain('El pago se registró, pero no se pudo adjuntar el comprobante');
    const source = read('js/pages/obligations.js');
    expect(source).toContain('API.documents.uploadTargets({ occurrenceId: occurrence.id, transactionId }, file)');
    expect(source).toContain("textContent: 'Adjuntar comprobante'");
  });

  it('shows Resolver instead of Pagar for tenant-only occurrences', () => {
    const source = read('js/pages/obligations.js');
    expect(source).toContain('!tenantOnly &&');
    expect(source).toContain("tenantOnly ? 'Resolver'");
  });

  it('reuses the same dialog from the alerts page', () => {
    expect(read('js/pages/alerts.js')).toContain('ObligationsPage.pay(obligation, occurrence)');
  });

  it('builds view and download receipt links in the api and the asset views', () => {
    const api = read('js/api.js');
    expect(api).toContain("download ? '?download=1' : ''");
    expect(api).toContain('paymentContext(id, occurrenceId)');
    expect(api).toContain("'Sin comprobante'");
    expect(api).toContain("textContent: 'Ver'");
    expect(api).toContain("textContent: 'Descargar'");
    const assets = read('js/pages/assets.js');
    expect(assets.match(/API\.documents\.receiptLinks\(/g).length).toBeGreaterThanOrEqual(4);
  });

  it('bumps the service worker cache to v31 or later', () => {
    expect(Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(31);
  });
});
