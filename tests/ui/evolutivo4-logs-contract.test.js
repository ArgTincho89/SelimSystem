const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

function loadLogsPage(pages) {
  const calls = [];
  const context = {
    localStorage: { getItem: () => 'UTC' }, Intl, Date, Object, Set, Map, String, Array, Number,
    API: { activityLogs: { list: async params => { calls.push(params); return pages.shift(); } } }
  };
  vm.createContext(context);
  vm.runInContext(`${read('js/pages/logs.js')}\nthis.page = LogsPage;`, context);
  return { page: context.page, calls };
}

describe('Evolutivo 4 Logs screen contract', () => {
  const logs = read('js/pages/logs.js');
  const profile = read('js/pages/profile.js');

  it('registers the /logs route, highlights Perfil and loads the script', () => {
    expect(read('js/app.js')).toMatch(/Router\.register\('\/logs'[\s\S]*LogsPage\.render\(\)/);
    expect(read('js/router.js')).toContain("'/logs': '/profile'");
    expect(read('index.html')).toContain('<script src="/js/pages/logs.js"></script>');
    expect(read('sw.js')).toContain("'/js/pages/logs.js'");
  });

  it('replaces the Perfil section with a Logs button', () => {
    expect(profile).not.toContain('renderLogsSection');
    expect(profile).not.toContain('groupLogsByDay');
    expect(profile).toMatch(/textContent: 'Logs'[\s\S]{0,200}navigate\('\/logs'\)/);
  });

  it('has search, optional date filters and the two-column layout', () => {
    expect(logs).toContain("id: 'logs-search'");
    expect(logs).toContain("id: 'logs-from'");
    expect(logs).toContain("id: 'logs-to'");
    expect(logs).toContain("className: 'log-row'");
    expect(logs).toContain('formatLogDateTime(item.timestamp)');
    expect(logs).toContain('No se completó');
    expect(logs).toContain('Todavía no hay acciones registradas');
    expect(logs).not.toMatch(/textContent: item\.(outcome|statusCode)/);
  });

  it('filters accent- and case-insensitively', () => {
    const { page } = loadLogsPage([]);
    const items = [{ message: 'Creó la obligación Impuesto Municipal' }, { message: 'Registró un pago' }, { message: 'Eliminó el bien' }];
    expect(page.filterItems(items, 'OBLIGACION').map(item => item.message)).toEqual(['Creó la obligación Impuesto Municipal']);
    expect(page.filterItems(items, 'creo obligacion')).toHaveLength(1);
    expect(page.filterItems(items, 'registro pago')).toHaveLength(1);
    expect(page.filterItems(items, '   ')).toHaveLength(3);
    expect(page.filterItems(items, 'inexistente')).toHaveLength(0);
  });

  it('follows nextBefore across pages', async () => {
    const { page, calls } = loadLogsPage([
      { items: [{ message: 'a' }], nextBefore: 'x1' },
      { items: [{ message: 'b' }], nextBefore: 'x2' },
      { items: [{ message: 'c' }], nextBefore: null }
    ]);
    const items = await page.loadAll('2026-01-01', '');
    expect(items.map(item => item.message)).toEqual(['a', 'b', 'c']);
    expect(calls.map(call => call.before)).toEqual([null, 'x1', 'x2']);
    expect(calls[0].limit).toBe(200);
    expect(calls[0].from).toBe('2026-01-01');
  });

  it('caps the pagination at 50 pages', async () => {
    let served = 0;
    const context = {
      localStorage: { getItem: () => null }, Intl, Date, Object, Set, Map, String, Array, Number,
      API: { activityLogs: { list: async () => { served += 1; return { items: [], nextBefore: `n${served}` }; } } }
    };
    vm.createContext(context);
    vm.runInContext(`${read('js/pages/logs.js')}\nthis.page = LogsPage;`, context);
    await context.page.loadAll('', '');
    expect(served).toBe(50);
  });
});
