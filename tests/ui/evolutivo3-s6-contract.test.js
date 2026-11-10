const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

function loadFormat() {
  const context = { localStorage: { getItem: () => null }, Intl, Date, Object, Set, Map, String, Array, Number };
  vm.createContext(context);
  vm.runInContext(`${read('js/utils/format.js')}\nthis.api = { accountTreeOptions };`, context);
  return context.api.accountTreeOptions;
}

describe('Evolutivo 3 S6 sub-accounts UI contract', () => {
  it('builds tree options with the arrow prefix and the currency', () => {
    const options = loadFormat()([
      { id: 'c', nombre: 'Caja USD', currency: 'USD', parentId: 'p' },
      { id: 'p', nombre: 'Banco Nación', currency: 'ARS', parentId: null },
      { id: 'o', nombre: 'Otra', currency: 'EUR' }
    ]);
    expect(options.map(item => item.label)).toEqual(['Banco Nación (ARS)', '↳ Caja USD (USD)', 'Otra (EUR)']);
  });

  it('offers "Agregar sub-cuenta" only on top-level accounts and sends parentId', () => {
    const settings = read('js/pages/settings.js');
    expect(settings).toContain("textContent: 'Agregar sub-cuenta'");
    expect(settings).toContain('...(parent ? { parentId: parent.id } : {})');
    expect(settings).toContain('if (!isChild && account.activo)');
  });

  it('uses the account tree in every account select', () => {
    expect(read('js/components/transactionForm.js')).toContain('accountTreeOptions(activeAccounts)');
    expect(read('js/pages/obligations.js')).toContain('accountTreeOptions(group)');
    expect(read('js/pages/assets.js').match(/accountTreeOptions\(/g).length).toBe(3);
    expect(read('js/pages/settings.js')).toContain('accountTreeOptions(activeAccounts)');
  });

  it('bumps the service worker cache to v38', () => {
    expect(read('sw.js')).toContain("CACHE_NAME = 'selimsystem-v38'");
  });
});
