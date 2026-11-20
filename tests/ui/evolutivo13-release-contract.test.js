const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('Evolutivo 13 release contract', () => {
  it('ships service worker cache v54 or later and version 1.19.x or later', () => {
    expect(Number(read('public/sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(54);
    const [major, minor] = JSON.parse(read('package.json')).version.split('.').map(Number);
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(1019);
    expect(JSON.parse(read('package-lock.json')).version).toBe(JSON.parse(read('package.json')).version);
  });

  it('documents the release in the changelog and the functional document', () => {
    const changelog = read('CHANGELOG.md');
    const start = changelog.indexOf('## [1.19.0] - 2026-11-20');
    expect(start).toBeGreaterThan(-1);
    const section = changelog.slice(start, changelog.indexOf('## [1.18.2]'));
    ['Elegir un titular existente', 'Gasto espejo automático', 'Cuenta del inquilino (titular)', 'crédito fiscal', 'Gasto espejo del cobro de alquiler', 'no puede alquilar su propio bien'].forEach(text => expect(section).toContain(text));
    const doc = read('Documento funcional.md');
    expect(doc).toContain(`**Versión del producto:** ${JSON.parse(read('package.json')).version}`);
    expect(doc).toContain('**Fecha del documento:** 20/11/2026');
    ['Agregar desde un registro existente', 'Inquilino titular: gasto espejo automático', 'Cuenta del inquilino (titular)', 'Un titular no puede alquilar su propio bien', 'IVA por titular en un alquiler entre titulares', '| **Gasto espejo** |'].forEach(text => expect(doc).toContain(text));
  });

  it('records the change request with its decisions', () => {
    const request = read('openspec/changes/evolutivo-13/request.md');
    expect(request).toContain('Branch: `evolutivo-13`. Delivery: PR to master');
    ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'].forEach(decision => expect(request).toContain(`- ${decision}:`));
    expect(request).toContain('mirrorRentCollectionId');
  });
});
