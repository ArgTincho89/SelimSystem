const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

function loadPage() {
  const context = { localStorage: { getItem: () => null }, Intl, Date, Object, Set, Map, String, Array, Number };
  vm.createContext(context);
  vm.runInContext(`${read('js/utils/format.js')}\n${read('js/pages/obligations.js')}\nthis.page = ObligationsPage; this.types = OBLIGATION_TYPES; this.typeLabel = obligationTypeLabel;`, context);
  return context;
}

describe('Evolutivo 4 obligation card contract', () => {
  const source = read('js/pages/obligations.js');
  const { page, types, typeLabel } = loadPage();

  it('renders bold label/value lines for every datum of the obligation', () => {
    expect(source).toContain("className: 'label-value'");
    expect(source).toContain("create('strong', { textContent: `${label}:` })");
    ['Tipo', 'Inmueble', 'Proveedor', 'Responsabilidad', 'Cuenta', 'Monto estimado', 'Frecuencia'].forEach(label => {
      expect(source).toContain(`this.labelValue('${label}'`);
    });
  });

  it('shares OBLIGATION_TYPES between the card, the type filter and the form', () => {
    expect(types.map(([code]) => code)).toEqual(['utility', 'insurance', 'tax', 'loan', 'maintenance', 'subscription', 'other']);
    expect(typeLabel('tax')).toBe('Impuesto');
    expect(typeLabel('mystery')).toBe('Otro');
    expect(typeLabel(undefined)).toBe('Otro');
    expect(source).toContain("this.filterSelect('Tipo', [['', 'Todos los tipos'], ...OBLIGATION_TYPES]");
    expect(source).toContain('this.select(OBLIGATION_TYPES, existing?.type');
    expect(source).toContain("this.labelValue('Tipo', obligationTypeLabel(item.type))");
  });

  it('has no "Confirmar" button and no "Previsto" wording', () => {
    expect(source).not.toContain("textContent: 'Confirmar'");
    expect(source).not.toContain('API.obligations.confirm');
    expect(source).not.toContain('Previsto');
    expect(source).not.toContain('Previstas');
    expect(source).not.toContain('Confirmadas');
    expect(page.statusLabel('expected')).toBe('Pendiente');
    expect(page.statusLabel('confirmed')).toBe('Pendiente');
    expect(page.statusLabel('overdue')).toBe('Vencido');
  });

  it('offers Editar, Eliminar (with confirm) and Registrar pago', () => {
    expect(source).toContain("textContent: 'Eliminar'");
    expect(source).toContain("textContent: 'Registrar pago'");
    expect(source).toMatch(/async deleteObligation\(obligation\) \{\s*const \{ confirmed \} = await ConfirmDialog\.open\(/);
    expect(source).toContain('API.obligations.delete(obligation.id)');
    expect(source).not.toContain("textContent: 'Cancelar obligación'");
  });

  it('hides cancelled obligations and drops the "Canceladas" filter', () => {
    expect(source).toContain("this.items.filter(item => item.status !== 'cancelled')");
    expect(source).not.toContain('Canceladas');
    expect(source).toContain("['pending', 'Pendientes']");
  });

  it('shows unpaid overdue occurrences plus the first one from today on', () => {
    const occurrences = [
      { id: 'a', date: '2026-09-10', status: 'overdue' },
      { id: 'b', date: '2026-10-10', status: 'paid' },
      { id: 'c', date: '2026-10-20', status: 'overdue' },
      { id: 'd', date: '2026-11-10', status: 'partial' },
      { id: 'e', date: '2026-12-10', status: 'expected' },
      { id: 'f', date: '2027-01-10', status: 'expected' },
      { id: 'g', date: '2026-11-15', status: 'cancelled' }
    ];
    expect(page.selectOccurrences(occurrences, '2026-11-05').map(item => item.id)).toEqual(['a', 'c', 'd']);
    expect(page.selectOccurrences(occurrences, '2026-11-11').map(item => item.id)).toEqual(['a', 'c', 'e']);
    expect(page.selectOccurrences([{ id: 'x', date: '2026-12-01', status: 'paid' }], '2026-11-11')).toEqual([]);
    expect(page.selectOccurrences(undefined, '2026-11-11')).toEqual([]);
  });

  it('badges every row with dueBadge', () => {
    expect(source).toContain('dueBadge(occurrence)');
    expect(source).toContain('className: badge.className');
  });

  it('pays the oldest unpaid shown occurrence from the card', () => {
    const shown = [{ id: 'late', date: '2026-10-10', status: 'overdue' }, { id: 'next', date: '2026-11-10', status: 'expected' }];
    expect(page.oldestPayable([shown[1], shown[0]]).id).toBe('late');
    expect(page.oldestPayable([])).toBeNull();
  });
});
