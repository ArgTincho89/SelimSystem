const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadBrowser } = require('../helpers/fake-dom');

const publicDir = path.join(__dirname, '../../public');
const read = file => fs.readFileSync(path.join(publicDir, file), 'utf8');

// format.js alone, with the given timezone in the user preferences.
function loadFormat(timezone = 'UTC') {
  const context = { localStorage: { getItem: key => (key === 'pate_timezone' ? timezone : null) }, Intl, Date, Object, Set, Map, String, Array, Number };
  vm.createContext(context);
  vm.runInContext(`${read('js/utils/format.js')}\nthis.api = { formatDate, formatDateTime, formatFechaLarga };`, context);
  return context.api;
}

const allText = node => [node.textContent || '', ...(node.children || []).map(allText)].join(' ');

describe('Evolutivo 15 shared date formatter', () => {
  it('formats YYYY-MM-DD dates as DD-MM-AAAA', () => {
    const { formatDate } = loadFormat();
    expect(formatDate('2026-11-20')).toBe('20-11-2026');
    expect(formatDate('2026-01-05')).toBe('05-01-2026');
    expect(formatDate(' 2025-12-31 ')).toBe('31-12-2025');
  });

  it('formats ISO timestamps as the day in the user timezone', () => {
    expect(loadFormat('UTC').formatDate('2026-11-20T02:30:00.000Z')).toBe('20-11-2026');
    expect(loadFormat('America/Argentina/Buenos_Aires').formatDate('2026-11-20T02:30:00.000Z')).toBe('19-11-2026');
    expect(loadFormat('Europe/Madrid').formatDate('2026-11-19T23:30:00.000Z')).toBe('20-11-2026');
  });

  it('returns an empty string for empty or invalid values', () => {
    const { formatDate, formatDateTime } = loadFormat();
    [undefined, null, '', '   ', 'hoy', '2026-11', '20/11/2026', '2026-13-45T99:00:00Z'].forEach(value => expect(formatDate(value)).toBe(''));
    [undefined, null, '', 'not a date'].forEach(value => expect(formatDateTime(value)).toBe(''));
  });

  it('formats date-times as DD-MM-AAAA HH:mm (24 hours) in the user timezone', () => {
    expect(loadFormat('UTC').formatDateTime('2026-11-09T13:35:00.000Z')).toBe('09-11-2026 13:35');
    expect(loadFormat('Europe/Madrid').formatDateTime('2026-11-09T23:05:00.000Z')).toBe('10-11-2026 00:05');
  });

  it('keeps the weekday in the day headers of the movement lists', () => {
    expect(loadFormat().formatFechaLarga('2026-11-20')).toMatch(/^\S+, 20-11-2026$/);
  });

  it('leaves no ad-hoc date rendering in the client code', () => {
    const files = ['components', 'pages', 'utils'].flatMap(dir => fs.readdirSync(path.join(publicDir, 'js', dir)).map(file => `js/${dir}/${file}`));
    files.forEach(file => {
      const source = read(file);
      expect({ file, reversed: /reverse\(\)\.join\('\/'\)/.test(source) }).toEqual({ file, reversed: false });
      expect({ file, locale: /toLocaleDateString\(\)/.test(source) }).toEqual({ file, locale: false });
      expect({ file, helpers: /formatLogDateTime|formatFechaCorta|dueDateLabel|shortDate\(|\.dmy\(/.test(source) }).toEqual({ file, helpers: false });
    });
    expect(read('js/pages/login.js')).not.toMatch(/date: '\d{2}\/\d{2}\/\d{4}'/);
  });
});

describe('Evolutivo 15 date call sites', () => {
  it('Avisos: the alert card shows its date as DD-MM-AAAA', () => {
    const { AlertsPage } = loadBrowser(['js/utils/format.js', 'js/pages/alerts.js'], ['AlertsPage'], { API: {}, Router: { navigate: jest.fn() } });
    const pending = AlertsPage.renderAlert({ id: 'a1', type: 'obligation_due', title: 'Luz', message: 'Luz vence el 01-12-2026.', date: '2026-12-01', status: 'pending', actions: [] });
    expect(allText(pending)).toContain('01-12-2026');
    expect(allText(pending)).not.toContain('2026-12-01');
    const overdue = AlertsPage.renderAlert({ id: 'a2', type: 'obligation_overdue', title: 'Gas', message: 'x', date: '2026-10-15', status: 'overdue', actions: [] });
    expect(allText(overdue)).toContain('Vencido · 15-10-2026');
  });

  it('Inicio: transfer details and scheduled installments use DD-MM-AAAA', () => {
    const Modal = { show: jest.fn(), hide: jest.fn() };
    const { HomePage } = loadBrowser(['js/utils/format.js', 'js/pages/home.js'], ['HomePage'], { API: {}, Modal, Router: { navigate: jest.fn() }, localStorage: { getItem: () => null, setItem: () => {} } });
    HomePage.showTransferDetails({ titulo: 'Cambio', accountName: 'Caja', fecha: '2026-11-20', status: 'posted', monto: 100, fromCurrency: 'EUR', receivedAmount: 110, toCurrency: 'USD', totalDebit: 100 });
    const details = Modal.show.mock.calls[0][1];
    expect(allText(details)).toContain('20-11-2026 · Contabilizada');
    const source = read('js/pages/home.js');
    expect(source).toContain('textContent: `Programada · vence ${formatDate(item.dueDate)}` }');
    expect(source).toContain("['Fecha', formatDate(tx.fecha)]");
    expect(source).toContain('` - ${formatDate(tx.fecha)}`');
  });

  it('Logs: each row shows "DD-MM-AAAA HH:mm" on the left', () => {
    const { LogsPage } = loadBrowser(['js/utils/format.js', 'js/pages/logs.js'], ['LogsPage'], {
      API: {}, UndoDialog: { open: jest.fn() }, Router: { navigate: jest.fn() }, localStorage: { getItem: key => (key === 'pate_timezone' ? 'UTC' : null) }
    });
    const row = LogsPage.renderRow({ id: 'l1', timestamp: '2026-11-20T14:35:00.000Z', message: 'Creaste la cuenta Caja', outcome: 'success' });
    expect(row.children[0].textContent).toBe('20-11-2026 14:35');
  });

  it('Formulario de transacción: due dates and rent periods read DD-MM-AAAA', () => {
    const { TransactionForm } = loadBrowser(['js/utils/format.js', 'js/components/moneyInput.js', 'js/components/transactionForm.js'], ['TransactionForm']);
    const obligations = [{ id: 'o1', title: 'Seguro', assetId: 'a1', currencyCode: 'ARS', occurrences: [{ id: 'oc1', date: '2026-11-01', remainingAmount: 500, status: 'expected', currencyCode: 'ARS' }] }];
    const rentals = [{ id: 'r1', assetId: 'a1', tenants: [{ name: 'Ana' }], occurrences: [{ id: 'p1', date: '2026-12-01' }] }];
    const expense = TransactionForm.attributionDetailOptions({ assetId: 'a1', type: 'expense', obligations, rentals });
    expect(expense[2].label).toMatch(/^Vencimiento · Seguro · 01-11-2026 · pendiente /);
    const income = TransactionForm.attributionDetailOptions({ assetId: 'a1', type: 'income', obligations, rentals });
    expect(income[2].label).toBe('Período de alquiler · 01-12-2026');
  });
});
