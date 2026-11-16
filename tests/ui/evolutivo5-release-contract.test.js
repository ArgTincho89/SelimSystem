const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('Evolutivo 5 release contract', () => {
  it('ships service worker cache v42 or later', () => {
    const version = Number(read('public/sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1]);
    expect(version).toBeGreaterThanOrEqual(42);
  });

  it('registers every new script in index.html and the service worker static assets', () => {
    const html = read('public/index.html');
    const sw = read('public/sw.js');
    ['js/pages/assetHistory.js', 'js/pages/rentalModal.js', 'js/pages/rentalPeriods.js', 'js/components/tabs.js', 'js/components/feedback.js', 'js/components/dataTable.js', 'js/components/confirmDialog.js'].forEach(file => {
      expect(html).toContain(`/${file}`);
      expect(sw).toContain(`'/${file}'`);
    });
  });

  it('keeps the package version at 1.13.x or later in package.json and the lockfile', () => {
    const version = JSON.parse(read('package.json')).version;
    const [major, minor] = version.split('.').map(Number);
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(1013);
    const lock = JSON.parse(read('package-lock.json'));
    expect(lock.version).toBe(version);
    expect(lock.packages[''].version).toBe(version);
  });

  it('documents the release at the top of the changelog, in Spanish', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog.indexOf('## [1.13.0] - 2026-11-16')).toBeGreaterThan(-1);
    expect(changelog.indexOf('## [1.13.0]')).toBeLessThan(changelog.indexOf('## [1.12.0]'));
    const entry = changelog.slice(changelog.indexOf('## [1.13.0]'), changelog.indexOf('## [1.12.0]'));
    expect(entry).toContain('### Added');
    expect(entry).toContain('### Changed');
    expect(entry).toContain('Revertir pago');
  });

  it('describes the new UI in the functional document', () => {
    const doc = read('Documento funcional.md');
    expect(doc).toContain(`**Versión del producto:** ${JSON.parse(read('package.json')).version}`);
    ['Ver ficha mensual', 'A cargo de titulares', 'A cargo de inquilinos', 'Revertir un pago', 'Ver historial de alquileres', 'Documentos y notas del alquiler', 'Ventana del alquiler'].forEach(text => expect(doc).toContain(text));
    expect(doc).not.toContain('1.12.0');
  });
});
