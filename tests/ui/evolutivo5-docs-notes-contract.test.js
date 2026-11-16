const fs = require('fs');
const path = require('path');
const { FakeElement, loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const flush = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };

describe('Evolutivo 5 documents and notes UI contract', () => {
  const setup = (api = {}) => {
    const ConfirmDialog = { open: jest.fn().mockResolvedValue({ confirmed: true, reason: '' }) };
    const fullApi = {
      documents: { remove: jest.fn().mockResolvedValue({}), contentUrl: (id, download) => `/api/documents/${id}/content${download ? '?download=1' : ''}` },
      wealthNotes: { update: jest.fn().mockResolvedValue({}), remove: jest.fn().mockResolvedValue({}), ...api.wealthNotes },
      ...api
    };
    fullApi.documents = { ...fullApi.documents, ...api.documents };
    const { WealthRecords, context } = loadBrowser(['js/utils/wealth-records.js'], ['WealthRecords'], { API: fullApi, ConfirmDialog, Modal: { push: jest.fn(), hide: jest.fn() } });
    return { WealthRecords, ConfirmDialog, API: fullApi, context };
  };
  const byData = (root, key, value) => root.find(element => element.dataset && element.dataset[key] === value);
  const byText = (root, text) => root.find(element => element.tagName === 'BUTTON' && element.textContent === text);

  it('is loaded by the rental modal tabs with includeRelated and a target choice for uploads', () => {
    const source = read('js/pages/rentalModal.js');
    expect(source).toContain("API.documents.list('declaration', ctx.declarationId, { includeRelated: '1' })");
    expect(source).toContain("API.wealthNotes.list('declaration', ctx.declarationId, { includeRelated: '1', ...range })");
    expect(source).toContain("label: 'Todo el alquiler'");
    expect(source).toContain("targetType: 'declaration'");
    expect(read('js/api.js')).toContain('remove(id) { return API.delete(`/documents/${encodeURIComponent(id)}`); }');
    expect(read('js/api.js')).toContain('update(id, data) { return API.put(`/notes/${encodeURIComponent(id)}`, data); }');
  });

  it('never uses the native confirm dialog', () => {
    expect(read('js/utils/wealth-records.js')).not.toMatch(/\bconfirm\(/);
    expect(read('js/utils/wealth-records.js')).toContain('ConfirmDialog.open');
  });

  describe('pure helpers', () => {
    it('filters documents by name, type and upload date', () => {
      const { WealthRecords } = setup();
      const documents = [
        { title: 'Contrato.pdf', contentType: 'application/pdf', uploadedAt: '2026-11-01T10:00:00.000Z' },
        { title: 'Foto', contentType: 'image/png', uploadedAt: '2026-11-20T10:00:00.000Z' },
        { title: 'notas', contentType: 'text/plain; charset=utf-8', uploadedAt: '2026-12-05T10:00:00.000Z' }
      ];
      expect(WealthRecords.filterDocuments(documents, { name: 'CONTR' }).map(item => item.title)).toEqual(['Contrato.pdf']);
      expect(WealthRecords.filterDocuments(documents, { type: 'image' }).map(item => item.title)).toEqual(['Foto']);
      expect(WealthRecords.filterDocuments(documents, { from: '2026-11-15', to: '2026-11-30' }).map(item => item.title)).toEqual(['Foto']);
      expect(WealthRecords.filterDocuments(documents, {})).toHaveLength(3);
    });

    it('sorts notes by date and words the heading as "dd/mm/aaaa · Título"', () => {
      const { WealthRecords } = setup();
      const notes = [{ date: '2026-11-01', content: 'a' }, { date: '2026-11-20', content: 'b' }];
      expect(WealthRecords.sortNotes(notes, 'desc').map(item => item.date)).toEqual(['2026-11-20', '2026-11-01']);
      expect(WealthRecords.sortNotes(notes, 'asc').map(item => item.date)).toEqual(['2026-11-01', '2026-11-20']);
      expect(WealthRecords.noteHeading({ date: '2026-11-16', title: 'Título de la nota' })).toBe('16/11/2026 · Título de la nota');
      expect(WealthRecords.noteHeading({ date: '2026-11-16' })).toBe('16/11/2026');
    });
  });

  describe('documents block', () => {
    it('shows the empty state with the upload action', async () => {
      const { WealthRecords } = setup();
      const root = new FakeElement('div');
      await WealthRecords.renderDocuments(root, { load: async () => [], upload: jest.fn() });
      expect(root.textContent).toContain('No hay documentos cargados.');
      expect(byText(root, 'Cargar documento')).toBeTruthy();
    });

    it('lists the upload date and uploader, tolerates legacy documents and deletes only after confirmation', async () => {
      const { WealthRecords, ConfirmDialog, API } = setup();
      const documents = [
        { id: 'd1', title: 'Recibo', contentType: 'application/pdf', size: 2048, uploadedAt: '2026-11-16T10:00:00.000Z', uploadedByName: 'Martin' },
        { id: 'd2', title: 'Viejo', contentType: 'text/plain', size: 10, uploadedAt: '2020-01-01T00:00:00.000Z' }
      ];
      const load = jest.fn().mockResolvedValue(documents);
      const root = new FakeElement('div');
      await WealthRecords.renderDocuments(root, { load, upload: jest.fn() });
      expect(root.textContent).toContain('Cargado el 16/11/2026 por Martin');
      expect(byData(root, 'documentId', 'd2').textContent).not.toContain(' por ');
      ConfirmDialog.open.mockResolvedValueOnce({ confirmed: false });
      byData(root, 'deleteDocument', 'd1').click();
      await flush();
      expect(API.documents.remove).not.toHaveBeenCalled();
      byData(root, 'deleteDocument', 'd1').click();
      await flush();
      expect(ConfirmDialog.open).toHaveBeenCalledWith(expect.objectContaining({ danger: true, title: 'Eliminar documento' }));
      expect(API.documents.remove).toHaveBeenCalledWith('d1');
      expect(load).toHaveBeenCalledTimes(2);
    });
  });

  describe('notes block', () => {
    const notes = [
      { id: 'n1', date: '2026-11-01', title: 'Visita', content: 'Primera', author: 'Martin', createdAt: '1' },
      { id: 'n2', date: '2026-11-20', content: 'Sin título', author: 'Martin', createdAt: '2' }
    ];

    it('lists date, title and text with Editar and Eliminar, newest first, and toggles the order', async () => {
      const { WealthRecords } = setup();
      const root = new FakeElement('div');
      await WealthRecords.renderNotes(root, { load: async () => notes, create: jest.fn() });
      expect(root.textContent).toContain('01/11/2026 · Visita');
      expect(root.textContent).toContain('20/11/2026');
      const ids = () => root.findAll(element => element.dataset && element.dataset.noteId).map(element => element.dataset.noteId);
      expect(ids()).toEqual(['n2', 'n1']);
      expect(byData(root, 'editNote', 'n1')).toBeTruthy();
      byText(root, 'Más recientes primero').click();
      await flush();
      expect(ids()).toEqual(['n1', 'n2']);
    });

    it('passes the date range to the loader and words the empty range', async () => {
      const { WealthRecords } = setup();
      const load = jest.fn().mockResolvedValue([]);
      const root = new FakeElement('div');
      await WealthRecords.renderNotes(root, { load, create: jest.fn() });
      expect(root.textContent).toContain('No hay notas cargadas.');
      const from = root.find(element => element.attributes && element.attributes['aria-label'] === 'Notas desde');
      from.value = '2026-11-15';
      from.dispatch('change');
      await flush();
      expect(load).toHaveBeenLastCalledWith({ from: '2026-11-15', to: '' });
      expect(root.textContent).toContain('No hay notas en este rango de fechas.');
    });

    it('edits a note through PUT and deletes only after confirmation', async () => {
      const { WealthRecords, ConfirmDialog, API } = setup();
      const load = jest.fn().mockResolvedValue(notes);
      const root = new FakeElement('div');
      await WealthRecords.renderNotes(root, { load, create: jest.fn() });
      byData(root, 'editNote', 'n1').click();
      const row = byData(root, 'noteId', 'n1');
      row.find(element => element.tagName === 'TEXTAREA').value = 'Editada';
      byData(root, 'saveNote', 'n1').click();
      await flush();
      expect(API.wealthNotes.update).toHaveBeenCalledWith('n1', { date: '2026-11-01', title: 'Visita', content: 'Editada' });
      ConfirmDialog.open.mockResolvedValueOnce({ confirmed: false });
      byData(root, 'deleteNote', 'n2').click();
      await flush();
      expect(API.wealthNotes.remove).not.toHaveBeenCalled();
      byData(root, 'deleteNote', 'n2').click();
      await flush();
      expect(API.wealthNotes.remove).toHaveBeenCalledWith('n2');
    });

    it('creates a note with date, title and text', async () => {
      const { WealthRecords } = setup();
      const create = jest.fn().mockResolvedValue({});
      const root = new FakeElement('div');
      await WealthRecords.renderNotes(root, { load: async () => [], create });
      root.find(element => element.attributes && element.attributes['aria-label'] === 'Título de la nota').value = 'Mi título';
      root.find(element => element.tagName === 'TEXTAREA').value = 'Texto';
      byText(root, 'Añadir nota').click();
      await flush();
      expect(create).toHaveBeenCalledWith({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), title: 'Mi título', content: 'Texto' });
    });
  });
});
