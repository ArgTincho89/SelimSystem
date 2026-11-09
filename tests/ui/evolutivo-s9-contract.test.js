const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo S9 UI contract', () => {
  it('exposes the asset file API client', () => {
    expect(read('js/api.js')).toContain('/file');
    expect(read('js/api.js')).toContain('getAssetFile(id');
  });

  it('renders the file summary above the monthly view with the business sections', () => {
    const source = read('js/pages/assets.js');
    expect(source).toContain('renderAssetFile(asset, body)');
    expect(source.indexOf('renderAssetFile(asset, body)')).toBeLessThan(source.indexOf('renderMonthlyView(asset, body)'));
    ['Titulares', 'Inquilino actual', 'Alquiler cobrado este mes', 'Costo de mantenimiento', 'Próximos vencimientos', 'Pendientes', 'Obligaciones', 'Documentos', 'Notas'].forEach(text => expect(source).toContain(text));
    expect(source).toContain('API.getAssetFile(asset.id)');
  });

  it('bumps the service worker cache name to v25 or later', () => {
    const version = Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1]);
    expect(version).toBeGreaterThanOrEqual(25);
  });
});
