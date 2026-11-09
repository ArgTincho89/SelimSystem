const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo S7 UI contract', () => {
  it('exposes the monthly view API client', () => {
    expect(read('js/api.js')).toContain('/monthly-view');
    expect(read('js/api.js')).toContain('monthlyView(id');
  });

  it('renders the monthly table with the business columns', () => {
    const source = read('js/pages/assets.js');
    expect(source).toContain('renderMonthlyView(asset, body)');
    ['Concepto', 'Responsable', 'Esperado', 'Pagado o cobrado', 'Estado', 'Comprobante', 'Pagado por inquilino'].forEach(text => expect(source).toContain(text));
    expect(source).toContain('API.assets.monthlyView(asset.id)');
  });

  it('bumps the service worker cache name to v24 or later', () => {
    const version = Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1]);
    expect(version).toBeGreaterThanOrEqual(24);
  });
});
