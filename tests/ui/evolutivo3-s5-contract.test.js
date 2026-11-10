const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

function loadFormatter(timezone) {
  const context = { localStorage: { getItem: () => timezone }, Intl, Date, Object, Set, Map, String, Array, Number };
  vm.createContext(context);
  vm.runInContext(`${read('js/utils/format.js')}\nthis.api = { formatLogDateTime };`, context);
  return context.api.formatLogDateTime;
}

describe('Evolutivo 3 S5 LOGS UI contract', () => {
  const profile = read('js/pages/profile.js');
  const accountActions = profile.slice(profile.indexOf('  showAccountActionsModal() {'), profile.indexOf('  showLogsModal() {'));
  const logsModal = profile.slice(profile.indexOf('  showLogsModal() {'), profile.indexOf('  showChangeEmailModal() {'));

  it('shows LOGS inside Acciones de cuenta', () => {
    expect(accountActions).toContain("textContent: 'LOGS'");
    expect(accountActions).toContain('this.showLogsModal()');
  });

  it('has the empty state, pagination and no raw outcome codes', () => {
    expect(logsModal).toContain('Todavía no hay acciones registradas');
    expect(logsModal).toContain('Cargar más');
    expect(logsModal).toContain('API.activityLogs.list');
    expect(logsModal).toContain('formatLogDateTime(item.timestamp)');
    expect(logsModal).toContain('No se completó');
    expect(logsModal).not.toMatch(/textContent: item\.(outcome|statusCode)/);
  });

  it('exposes the API client', () => {
    expect(read('js/api.js')).toContain('activityLogs: {');
    expect(read('js/api.js')).toContain('/activity-logs');
  });

  it('formats dd/mm/aaaa hh:mm in the configured timezone', () => {
    expect(loadFormatter('Europe/Madrid')('2026-11-09T13:35:00.000Z')).toBe('09/11/2026 14:35');
    expect(loadFormatter('America/Argentina/Buenos_Aires')('2026-11-09T13:35:00.000Z')).toBe('09/11/2026 10:35');
    expect(loadFormatter('UTC')('2026-11-09T00:05:00.000Z')).toBe('09/11/2026 00:05');
    expect(loadFormatter('UTC')('not a date')).toBe('');
  });

  it('bumps the service worker cache to v37 or later', () => {
    expect(Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(37);
  });
});
