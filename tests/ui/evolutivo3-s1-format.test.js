const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadFormat() {
  const source = fs.readFileSync(path.join(__dirname, '../../public/js/utils/format.js'), 'utf8');
  const context = { localStorage: { getItem: () => null }, Intl, Date, Object, Set, Map, String, Array };
  vm.createContext(context);
  vm.runInContext(`${source}\nthis.api = { statusLabel, currencyDigits, orderAccountsAsTree };`, context);
  return context.api;
}

describe('Evolutivo 3 S1 format helpers', () => {
  const { statusLabel, currencyDigits, orderAccountsAsTree } = loadFormat();

  it.each([
    ['pending', 'Pendiente'], ['overdue', 'Vencido'], ['partially_collected', 'Parcial'], ['partial', 'Parcial'],
    ['collected', 'Cobrado'], ['paid', 'Pagado'], ['resolved', 'Resuelto'], ['cancelled', 'Cancelado'],
    ['expected', 'Esperado'], ['confirmed', 'Confirmado'], ['posted', 'Contabilizado'], ['active', 'Activo'],
    ['ended', 'Finalizado'], ['draft', 'Borrador'], ['expiring', 'Por vencer'], ['scheduled', 'Programado'], ['reversed', 'Anulado']
  ])('maps %s to %s', (code, label) => {
    expect(statusLabel(code)).toBe(label);
  });

  it('falls back to "Sin estado" and never returns the raw code', () => {
    ['mystery_code', '', undefined, null, 'open', 'toString'].forEach(value => {
      expect(statusLabel(value)).toBe('Sin estado');
    });
  });

  it('returns currency digits', () => {
    expect(currencyDigits('ARS')).toBe(2);
    expect(currencyDigits('USD')).toBe(2);
    expect(currencyDigits('JPY')).toBe(0);
    expect(currencyDigits('jpy')).toBe(0);
    expect(currencyDigits(undefined)).toBe(2);
  });

  it('orders accounts parent first and prefixes children', () => {
    const accounts = [
      { id: 'a', name: 'Caja' },
      { id: 'c1', name: 'Dólares', parentId: 'a' },
      { id: 'b', name: 'Banco' },
      { id: 'c2', name: 'Ahorro', parentId: 'b' },
      { id: 'c3', name: 'Viaje', parentId: 'a' },
      { id: 'o', name: 'Huérfana', parentId: 'missing' }
    ];
    const tree = orderAccountsAsTree(accounts);
    expect(tree.map(item => item.account.id)).toEqual(['a', 'c1', 'c3', 'b', 'c2', 'o']);
    expect(tree[0].label).toBe('Caja');
    expect(tree[1].label).toBe('↳ Dólares');
    expect(tree.map(item => item.depth)).toEqual([0, 1, 1, 0, 1, 0]);
  });

  it('accepts a label builder', () => {
    const tree = orderAccountsAsTree([{ id: 'a', name: 'Caja', currency: 'ARS' }], account => `${account.name} (${account.currency})`);
    expect(tree[0].label).toBe('Caja (ARS)');
  });
});
