const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('Evolutivo 6 release contract', () => {
  it('ships service worker cache v47 or later', () => {
    const version = Number(read('public/sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1]);
    expect(version).toBeGreaterThanOrEqual(47);
  });

  it('registers the new undo dialog in index.html and the service worker static assets', () => {
    const html = read('public/index.html');
    const sw = read('public/sw.js');
    ['js/components/undoDialog.js'].forEach(file => {
      expect(html).toContain(`/${file}`);
      expect(sw).toContain(`'/${file}'`);
    });
  });

  it('keeps the package version at 1.15.x or later in package.json and the lockfile', () => {
    const version = JSON.parse(read('package.json')).version;
    const [major, minor] = version.split('.').map(Number);
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(1015);
    const lock = JSON.parse(read('package-lock.json'));
    expect(lock.version).toBe(version);
    expect(lock.packages[''].version).toBe(version);
  });

  it('documents the release in Spanish in the changelog, above the previous release', () => {
    const changelog = read('CHANGELOG.md');
    const start = changelog.indexOf('## [1.15.0] - 2026-11-16');
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(changelog.indexOf('## [1.14.0]'));
    const entry = changelog.slice(start, changelog.indexOf('## [1.14.0]'));
    ['### Added', '### Changed', '### Fixed', 'Deshacer', 'Eliminar', 'Agregar tipo'].forEach(text => expect(entry).toContain(text));
  });

  it('describes the new behaviors in the functional document and drops the fixed gap', () => {
    const doc = read('Documento funcional.md');
    const version = JSON.parse(read('package.json')).version;
    expect(doc).toContain(`**Versión del producto:** ${version}`);
    ['Agregar tipo…', 'Nueva cuenta principal', 'Configuración > Categorías', 'Ver documento', 'Limpiar filtros', 'Motivo', 'Protección contra doble clic'].forEach(text => expect(doc).toContain(text));
    expect(doc).not.toContain('Bienes sin baja');
    expect(doc).not.toContain('No hay una opción para eliminar bienes');
  });
});
