const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

const flush = async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); };
const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 7 receipts on income and expense movements', () => {
  it('the movement detail lists its receipts and attaches new ones', async () => {
    const API = { documents: {
      listBy: jest.fn(async () => [{ id: 'd1', originalName: 'recibo.pdf', mimeType: 'application/pdf' }]),
      uploadTargets: jest.fn(async () => ({ id: 'd2' })),
      contentUrl: (id, download) => `/api/documents/${id}/content${download ? '?download=1' : ''}`
    } };
    let shown = null;
    const Modal = { show: (title, body, options) => { shown = { title, body, options }; }, hide: jest.fn(), push: jest.fn() };
    const { HomePage, context } = loadBrowser(['js/utils/format.js', 'js/pages/home.js'], ['HomePage'], { API, Modal, localStorage: { getItem: () => null, setItem: () => {} } });
    context.showToast = jest.fn();
    HomePage.showTransactionOptions({ id: 't1', tipo: 'income', titulo: 'Honorarios', monto: 10, fecha: '2025-03-01', currencyCode: 'ARS' }, {});
    await flush();
    expect(API.documents.listBy).toHaveBeenCalledWith({ transactionId: 't1' });
    expect(shown.body.textContent).toContain('Ver documento');
    expect(shown.body.textContent).toContain('Descargar');
    const input = shown.body.find(element => element.attributes && element.attributes['aria-label'] === 'Archivo del comprobante');
    input.files = [{ name: 'otro.png', size: 20 }];
    input.dispatch('change');
    await flush();
    expect(API.documents.uploadTargets).toHaveBeenCalledWith({ transactionId: 't1' }, { name: 'otro.png', size: 20 });
    expect(context.showToast).toHaveBeenCalledWith('Comprobante adjuntado');
  });

  it('the movement detail refuses files the server would reject', async () => {
    const API = { documents: { listBy: jest.fn(async () => []), uploadTargets: jest.fn() } };
    let shown = null;
    const Modal = { show: (title, body) => { shown = { body }; }, hide: jest.fn() };
    const { HomePage, context } = loadBrowser(['js/utils/format.js', 'js/pages/home.js'], ['HomePage'], { API, Modal, localStorage: { getItem: () => null, setItem: () => {} } });
    context.showToast = jest.fn();
    HomePage.showTransactionOptions({ id: 't1', tipo: 'expense', titulo: 'x', monto: 1, fecha: '2025-03-01' }, {});
    const input = shown.body.find(element => element.attributes && element.attributes['aria-label'] === 'Archivo del comprobante');
    input.files = [{ name: 'script.exe', size: 1 }];
    input.dispatch('change');
    await flush();
    expect(API.documents.uploadTargets).not.toHaveBeenCalled();
    expect(context.showToast.mock.calls[0][1]).toBe('error');
  });

  it('the income/expense form validates and uploads receipts after saving the movement', () => {
    const form = read('js/components/transactionForm.js');
    expect(form).toContain("DocumentViewer.fileField({ label: 'Adjuntar comprobante (opcional)', multiple: true })");
    expect(form.indexOf('const attachmentError = attachment.error();')).toBeLessThan(form.indexOf('API.transactions.create(data)'));
    expect(form.indexOf('API.transactions.create(data)')).toBeLessThan(form.indexOf('DocumentViewer.uploadAll(attachment.files(), { transactionId: savedTransactionId })'));
    expect(form).toContain('DocumentViewer.listInto(existingDocuments, { transactionId: transaction.originalId || transaction.id })');
  });

  it('obligation due dates with payments show their receipts', () => {
    const source = read('js/pages/obligations.js');
    expect(source).toContain("textContent: 'Comprobantes'");
    expect(source).toContain("API.documents.listBy({ occurrenceId: occurrence.id })");
    expect(source).toContain("DocumentViewer.fileField({ label: 'Comprobante (opcional)', multiple: true })");
  });
});
