const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '../../public');

function loadFormat() {
  const source = fs.readFileSync(path.join(root, 'js/utils/format.js'), 'utf8');
  const context = { localStorage: { getItem: () => null }, Intl, Date, Object, Set, Map, String, Array };
  vm.createContext(context);
  vm.runInContext(`${source}\nthis.api = { dueBadge, statusLabel };`, context);
  return context.api;
}

describe('Evolutivo 4 dueBadge', () => {
  const { dueBadge, statusLabel } = loadFormat();

  it.each([
    ['paid', 'Pagado', 'badge-resolved'],
    ['overdue', 'Vencido', 'due-overdue'],
    ['due-soon', 'Pendiente', 'due-soon'],
    ['pending', 'Pendiente', 'due-pending'],
    ['cancelled', 'Cancelado', 'due-cancelled']
  ])('maps %s to %s', (dueState, label, className) => {
    expect(dueBadge({ dueState })).toEqual({ label, className });
  });

  it('falls back to Pendiente for unknown or missing state', () => {
    expect(dueBadge({}).label).toBe('Pendiente');
    expect(dueBadge(null).label).toBe('Pendiente');
    expect(dueBadge({ dueState: 'mystery' }).label).toBe('Pendiente');
  });

  it('collapses expected/confirmed to Pendiente', () => {
    expect(statusLabel('expected')).toBe('Pendiente');
    expect(statusLabel('confirmed')).toBe('Pendiente');
  });

  it('ships the due CSS contract', () => {
    const css = fs.readFileSync(path.join(root, 'css/components.css'), 'utf8');
    const vars = fs.readFileSync(path.join(root, 'css/variables.css'), 'utf8');
    expect(vars).toContain('--due-soon: #FF9F43');
    ['.due-soon', '.due-overdue', '.label-value', '.log-row', '.receipt-viewer'].forEach(cls => expect(css).toContain(cls));
    expect(css).toMatch(/\.due-overdue \{[^}]*font-weight: 700/);
  });
});
