const fs = require('fs');
const path = require('path');
const { FakeElement, loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const flush = async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); };

describe('Evolutivo 6 logs screen: filter panel and undo', () => {
  const entries = [
    { message: 'Pagaste la expensa', outcome: 'success', timestamp: '2026-05-01T10:00:00.000Z', undoable: true, undo: { type: 'obligation.payment', obligationId: 'o1', occurrenceId: 'c1', transactionId: 't1' } },
    { message: 'Ya revertido', outcome: 'success', timestamp: '2026-04-01T10:00:00.000Z', undoable: false, undo: { type: 'obligation.payment', obligationId: 'o2', occurrenceId: 'c2', transactionId: 't2' } },
    { message: 'Intento fallido', outcome: 'failure', timestamp: '2026-03-01T10:00:00.000Z', undoable: false, undo: null },
    { message: 'Creaste el bien X', outcome: 'success', timestamp: '2026-02-01T10:00:00.000Z', undoable: false, undo: null }
  ];

  const setup = (overrides = {}) => {
    const calls = [];
    const API = {
      activityLogs: { list: jest.fn(async params => { calls.push(params); return { items: params.assetId === 'a1' ? [entries[0]] : params.assetId === 'none' ? [] : entries, nextBefore: null }; }) },
      assets: { list: jest.fn().mockResolvedValue([{ id: 'a1', name: 'Casa Centro' }, { id: 'a2', name: 'Anexo' }]) },
      owners: { list: jest.fn().mockResolvedValue([{ id: 'ow1', name: 'Marta', roles: ['owner'] }, { id: 'tn1', name: 'Juan', roles: ['tenant'] }, { id: 'both', name: 'Ambos', roles: ['owner', 'tenant'] }]) },
      categories: { list: jest.fn().mockResolvedValue([{ id: 'c1', nombre: 'Impuestos' }]) },
      ...overrides
    };
    const UndoDialog = { open: jest.fn().mockResolvedValue(true) };
    const content = new FakeElement('div');
    const navbar = new FakeElement('nav');
    const { LogsPage, context } = loadBrowser(['js/pages/logs.js'], ['LogsPage'], {
      API, UndoDialog, Router: { navigate: jest.fn() }, showToast: jest.fn(), formatLogDateTime: value => value, localStorage: { getItem: () => 'UTC' }
    });
    context.document.registry['#page-content'] = content;
    context.document.registry['#navbar'] = navbar;
    return { LogsPage, API, UndoDialog, content, calls };
  };
  const byId = (content, id) => content.find(node => node.attributes && node.attributes.id === id);
  const rows = content => content.findAll(node => node.className === 'log-row');
  const undoButtons = content => content.findAll(node => node.dataset && node.attributes['data-log-action'] === 'undo');

  it('renders Bien, Titular, Inquilino and Categoría selectors with "Limpiar filtros"', async () => {
    const { LogsPage, content } = setup();
    await LogsPage.render();
    await flush();
    const labels = content.findAll(node => node.tagName === 'LABEL').map(node => node.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Bien', 'Titular', 'Inquilino', 'Categoría']));
    expect(byId(content, 'logs-clear-filters').textContent).toBe('Limpiar filtros');
    const options = id => byId(content, id).children.map(option => option.textContent);
    expect(options('logs-filter-assetId')).toEqual(['Todos los bienes', 'Anexo', 'Casa Centro']);
    expect(options('logs-filter-ownerId')).toEqual(['Todos los titulares', 'Ambos', 'Marta']);
    expect(options('logs-filter-tenantId')).toEqual(['Todos los inquilinos', 'Ambos', 'Juan']);
    expect(options('logs-filter-categoryId')).toEqual(['Todas las categorías', 'Impuestos']);
  });

  it('reloads from the server when a filter changes and restores the list on "Limpiar filtros"', async () => {
    const { LogsPage, content, calls } = setup();
    await LogsPage.render();
    await flush();
    expect(rows(content)).toHaveLength(4);
    const asset = byId(content, 'logs-filter-assetId');
    asset.value = 'a1';
    asset.dispatch('change');
    await flush();
    expect(calls[calls.length - 1].assetId).toBe('a1');
    expect(rows(content)).toHaveLength(1);
    byId(content, 'logs-clear-filters').click();
    await flush();
    expect(asset.value).toBe('');
    expect(calls[calls.length - 1].assetId).toBeUndefined();
    expect(rows(content)).toHaveLength(4);
  });

  it('shows an empty state when no entry matches a filter', async () => {
    const { LogsPage, content } = setup();
    await LogsPage.render();
    await flush();
    const asset = byId(content, 'logs-filter-assetId');
    asset.value = 'none';
    asset.dispatch('change');
    await flush();
    expect(rows(content)).toHaveLength(0);
    expect(content.textContent).toContain('No hay acciones que coincidan con la búsqueda');
  });

  it('shows "Deshacer" only on successful undoable rows and opens the UndoDialog with the descriptor', async () => {
    const { LogsPage, content, UndoDialog, calls } = setup();
    await LogsPage.render();
    await flush();
    const buttons = undoButtons(content);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('Deshacer');
    buttons[0].click();
    expect(UndoDialog.open).toHaveBeenCalledWith(entries[0].undo, expect.objectContaining({ onDone: expect.any(Function) }));
    const before = calls.length;
    UndoDialog.open.mock.calls[0][1].onDone();
    await flush();
    expect(calls.length).toBe(before + 1);
  });

  it('never shows "Deshacer" on failed rows even if they carry a descriptor', () => {
    const { LogsPage } = setup();
    const row = LogsPage.renderRow({ message: 'x', outcome: 'failure', timestamp: 't', undoable: true, undo: { type: 'rental.collection', collectionId: 'c' } });
    expect(row.findAll(node => node.attributes && node.attributes['data-log-action'] === 'undo')).toHaveLength(0);
  });

  it('API.activityLogs.list forwards the four filters', () => {
    const calls = [];
    const { API } = loadBrowser(['js/api.js'], ['API'], { fetch: jest.fn(), URLSearchParams });
    API.get = url => { calls.push(url); return Promise.resolve({}); };
    API.activityLogs.list({ assetId: 'a', ownerId: 'o', tenantId: 't', categoryId: 'c' });
    expect(calls[0]).toBe('/activity-logs?assetId=a&ownerId=o&tenantId=t&categoryId=c');
    API.activityLogs.list({});
    expect(calls[1]).toBe('/activity-logs');
  });

  it('keeps the page registered in the app shell', () => {
    expect(read('index.html')).toContain('/js/pages/logs.js');
    expect(read('index.html')).toContain('/js/components/undoDialog.js');
  });
});
