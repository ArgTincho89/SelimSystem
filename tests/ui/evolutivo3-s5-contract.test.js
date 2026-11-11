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
  const accountActions = profile.slice(profile.indexOf('  showAccountActionsModal() {'), profile.indexOf('  LOGS_PAGE_SIZE:'));
  const renderContent = profile.slice(profile.indexOf('  renderContent(content, user) {'), profile.indexOf('  showAccountActionsModal() {'));
  const logsModal = profile.slice(profile.indexOf('  LOGS_PAGE_SIZE:'), profile.indexOf('  showChangeEmailModal() {'));

  it('shows LOGS as its own Perfil section, outside Acciones de cuenta', () => {
    expect(accountActions).not.toContain("textContent: 'LOGS'");
    expect(accountActions).not.toContain('account-action-logs');
    expect(renderContent).toContain('this.renderLogsSection()');
    expect(logsModal).toContain("textContent: 'LOGS'");
  });

  it('filters by date and groups entries into collapsed day panels', () => {
    expect(logsModal).toContain("id: 'activity-log-from'");
    expect(logsModal).toContain("id: 'activity-log-to'");
    expect(logsModal).toContain('from, to, timezone');
    expect(logsModal).toContain("create('details', { className: 'activity-log-day");
    expect(logsModal).not.toMatch(/create\('details'[^)]*open: true/);
    expect(logsModal).toMatch(/on\(panel, 'toggle'[\s\S]*panel\.open/);
    expect(read('js/api.js')).toMatch(/query\.set\('from'[\s\S]*query\.set\('to'/);
  });

  it('groups entries by day in the configured timezone, newest day first', () => {
    const context = { localStorage: { getItem: () => 'America/Argentina/Buenos_Aires' }, Intl, Date, Object, Set, Map, String, Array, Number };
    vm.createContext(context);
    vm.runInContext(`${read('js/utils/format.js')}\n${profile}\nthis.page = ProfilePage;`, context);
    const groups = context.page.groupLogsByDay([
      { timestamp: '2026-03-02T12:00:00.000Z', message: 'c' },
      { timestamp: '2026-03-02T02:30:00.000Z', message: 'b' },
      { timestamp: '2026-03-01T10:00:00.000Z', message: 'a' }
    ]);
    expect(groups.map(group => [group.day, group.entries.map(item => item.message).join('')])).toEqual([['2026-03-02', 'c'], ['2026-03-01', 'ba']]);
    expect(context.page.formatDayLabel('2026-03-01')).toBe('01/03/2026');
    expect(context.page.shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('has the empty state, pagination and no raw outcome codes', () => {
    expect(logsModal).toContain('Todavía no hay acciones registradas');
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
