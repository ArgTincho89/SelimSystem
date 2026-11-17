const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

const flush = async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); };
const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 7 shared document viewer', () => {
  const setup = (globals = {}) => {
    const API = {
      documents: {
        contentUrl: (id, download) => `/api/documents/${id}/content${download ? '?download=1' : ''}`,
        uploadTargets: jest.fn(async (targets, file) => { if (file.fail) throw new Error('rechazado'); return { id: `doc-${file.name}`, ...targets }; }),
        listBy: jest.fn(async () => [{ id: 'd1', title: 'Recibo' }])
      }
    };
    const Modal = { push: jest.fn() };
    const showToast = jest.fn();
    const loaded = loadBrowser(['js/components/documentViewer.js'], ['DocumentViewer'], { API, Modal, showToast, ...globals });
    return { ...loaded, API, Modal, showToast };
  };
  const byAction = (root, action) => root.findAll(item => item.dataset && item.dataset.documentAction === action);

  it('offers "Ver documento" and "Descargar" for every attached document', () => {
    const { DocumentViewer } = setup();
    const list = DocumentViewer.list([{ id: 'd1', title: 'Recibo enero' }, { id: 'd2', fileName: 'transferencia.pdf' }]);
    const views = byAction(list, 'view');
    const downloads = byAction(list, 'download');
    expect(views.map(item => item.textContent)).toEqual(['Ver documento', 'Ver documento']);
    expect(downloads.map(item => item.textContent)).toEqual(['Descargar', 'Descargar']);
    expect(downloads[1].attributes.href).toBe('/api/documents/d2/content?download=1');
    expect(DocumentViewer.list([]).textContent).toBe('Sin documentos adjuntos.');
    expect(DocumentViewer.list([], { empty: '' }).children).toHaveLength(0);
  });

  it('opens the stacked viewer from "Ver documento"', () => {
    const { DocumentViewer, Modal } = setup({ fetch: jest.fn(() => new Promise(() => {})) });
    const [view] = DocumentViewer.actions({ id: 'd1', title: 'Recibo' });
    view.click();
    expect(Modal.push).toHaveBeenCalledWith('Recibo', expect.anything(), expect.objectContaining({ width: '960px' }));
  });

  it('renders allowed documents in a zoomable iframe with zoom in, zoom out and reset', async () => {
    const blob = { type: 'application/pdf' };
    const fetch = jest.fn(async () => ({ ok: true, blob: async () => blob }));
    const URL = { createObjectURL: jest.fn(() => 'blob:doc'), revokeObjectURL: jest.fn() };
    const { DocumentViewer, Modal } = setup({ fetch, URL, Blob: function Blob(parts, options) { this.type = options.type; } });
    await DocumentViewer.open({ id: 'd1', title: 'Contrato', contentType: 'application/pdf' });
    const viewer = Modal.push.mock.calls[0][1];
    const frame = viewer.find(item => item.tagName === 'IFRAME');
    expect(frame.attributes.src || frame.src).toBe('blob:doc');
    const zoom = name => viewer.find(item => item.dataset && item.dataset.zoom === name);
    zoom('in').click();
    expect(frame.style.transform).toBe('scale(1.25)');
    zoom('out').click();
    zoom('out').click();
    expect(frame.style.transform).toBe('scale(0.75)');
    zoom('reset').click();
    expect(frame.style.transform).toBe('scale(1)');
    Modal.push.mock.calls[0][2].onClose();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:doc');
  });

  it('never renders disallowed types inline and offers the download instead', async () => {
    const fetch = jest.fn(async () => ({ ok: true, blob: async () => ({ type: 'text/html' }) }));
    const { DocumentViewer, Modal } = setup({ fetch });
    await DocumentViewer.open({ id: 'd1', title: 'Página', contentType: 'text/html' });
    const viewer = Modal.push.mock.calls[0][1];
    expect(viewer.find(item => item.tagName === 'IFRAME')).toBeNull();
    expect(viewer.textContent).toContain('no se puede mostrar');
  });

  it('shows the load error when the content cannot be fetched', async () => {
    const { DocumentViewer, Modal } = setup({ fetch: jest.fn(async () => ({ ok: false })) });
    await DocumentViewer.open({ id: 'd1' });
    expect(Modal.push.mock.calls[0][1].textContent).toContain('No se pudo cargar el documento');
  });

  it('keeps zoom and MIME rules strict', () => {
    const { DocumentViewer } = setup();
    expect(DocumentViewer.clampZoom(10)).toBe(4);
    expect(DocumentViewer.clampZoom(0)).toBe(0.25);
    expect(DocumentViewer.clampZoom('x')).toBe(1);
    expect(DocumentViewer.mimeOf('image/PNG; q=1')).toBe('image/png');
    expect(DocumentViewer.mimeOf('image/svg+xml')).toBe('');
  });

  it('validates attachments like the server (type and 20 MiB)', () => {
    const { DocumentViewer } = setup();
    expect(DocumentViewer.fileError({ name: 'recibo.PDF', size: 10 })).toBe('');
    expect(DocumentViewer.fileError({ name: 'virus.exe', size: 10 })).toContain('formato no admitido');
    expect(DocumentViewer.fileError({ name: 'grande.png', size: 21 * 1024 * 1024 })).toContain('20 MiB');
    const field = DocumentViewer.fileField({ multiple: true });
    expect(field.input.attributes.accept || field.input.accept).toBe('.pdf,.png,.jpg,.jpeg,.webp,.txt');
    field.input.files = [{ name: 'a.exe', size: 1 }];
    expect(field.error()).toContain('a.exe');
  });

  it('uploads every file to its targets and reports failures without throwing', async () => {
    const { DocumentViewer, API, context } = setup();
    const showToast = jest.fn();
    context.showToast = showToast;
    const result = await DocumentViewer.uploadAll([{ name: 'ok.pdf' }, { name: 'bad.pdf', fail: true }], { transactionId: 't1' });
    expect(API.documents.uploadTargets).toHaveBeenCalledWith({ transactionId: 't1' }, { name: 'ok.pdf' });
    expect(result.uploaded).toHaveLength(1);
    expect(result.failed[0].message).toBe('rechazado');
    DocumentViewer.reportFailures(result.failed, 'El cobro');
    expect(showToast.mock.calls[0][0]).toContain('El cobro se registró, pero no se pudo adjuntar: bad.pdf');
  });

  it('fills a slot with the documents of a target', async () => {
    const { DocumentViewer, API, context } = setup();
    const slot = context.document.createElement('div');
    await DocumentViewer.listInto(slot, { transactionId: 't1' });
    expect(API.documents.listBy).toHaveBeenCalledWith({ transactionId: 't1' });
    expect(byAction(slot, 'view')).toHaveLength(1);
    API.documents.listBy.mockRejectedValueOnce(new Error('x'));
    expect(await DocumentViewer.listInto(slot, { transactionId: 't2' })).toEqual([]);
    await flush();
  });

  it('is loaded by the app shell and precached by the service worker', () => {
    expect(read('index.html')).toContain('<script src="/js/components/documentViewer.js"></script>');
    expect(read('sw.js')).toContain("'/js/components/documentViewer.js'");
  });
});
