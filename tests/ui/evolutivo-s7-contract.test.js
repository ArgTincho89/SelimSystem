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
    expect(source).toContain('renderMonthlyView(asset, economics)');
    expect(source).toContain('MonthlySheet.open(asset.id)');
    // The table moved to the monthly sheet modal (rentalPeriods.js, evolutivo-5); the ficha only opens it.
    const sheet = read('js/pages/rentalPeriods.js');
    ['Concepto', 'Responsable', 'Esperado', 'Ejecutado', 'Estado', 'Comprobante'].forEach(text => expect(sheet).toContain(`label: '${text}'`));
    expect(sheet).toContain('API.assets.history(assetId, { from: state.from, to: state.to })');
  });

  it('bumps the service worker cache name to v24 or later', () => {
    const version = Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1]);
    expect(version).toBeGreaterThanOrEqual(24);
  });
});
