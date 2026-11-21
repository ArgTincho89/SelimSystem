const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

function loadFormatter(timezone) {
  const context = { localStorage: { getItem: () => timezone }, Intl, Date, Object, Set, Map, String, Array, Number };
  vm.createContext(context);
  vm.runInContext(`${read('js/utils/format.js')}\nthis.api = { formatDateTime };`, context);
  return context.api.formatDateTime;
}

describe('Evolutivo 3 S5 LOGS UI contract (moved to the Logs screen in evolutivo-4)', () => {
  const logs = read('js/pages/logs.js');

  it('keeps the Logs screen out of Perfil', () => {
    const profile = read('js/pages/profile.js');
    expect(profile).not.toContain('renderLogsSection');
    expect(logs).toContain("textContent: 'Logs'");
  });

  it('filters by date and reads every page through the API', () => {
    expect(logs).toContain("id: 'logs-from'");
    expect(logs).toContain("id: 'logs-to'");
    expect(logs).toContain('from, to, timezone');
    expect(read('js/api.js')).toMatch(/query\.set\('from'[\s\S]*query\.set\('to'/);
  });

  it('has the empty state, pagination and no raw outcome codes', () => {
    expect(logs).toContain('Todavía no hay acciones registradas');
    expect(logs).toContain('API.activityLogs.list');
    expect(logs).toContain('formatDateTime(item.timestamp)');
    expect(logs).toContain('No se completó');
    expect(logs).not.toMatch(/textContent: item\.(outcome|statusCode)/);
  });

  it('exposes the API client', () => {
    expect(read('js/api.js')).toContain('activityLogs: {');
    expect(read('js/api.js')).toContain('/activity-logs');
  });

  it('formats dd-mm-aaaa hh:mm in the configured timezone', () => {
    expect(loadFormatter('Europe/Madrid')('2026-11-09T13:35:00.000Z')).toBe('09-11-2026 14:35');
    expect(loadFormatter('America/Argentina/Buenos_Aires')('2026-11-09T13:35:00.000Z')).toBe('09-11-2026 10:35');
    expect(loadFormatter('UTC')('2026-11-09T00:05:00.000Z')).toBe('09-11-2026 00:05');
    expect(loadFormatter('UTC')('not a date')).toBe('');
  });

  it('bumps the service worker cache to v40 or later', () => {
    expect(Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(40);
  });
});
