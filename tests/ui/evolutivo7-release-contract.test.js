const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('Evolutivo 7 release contract', () => {
  it('ships service worker cache v48 or later', () => {
    const version = Number(read('public/sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1]);
    expect(version).toBeGreaterThanOrEqual(48);
  });

  it('registers the document viewer in index.html and the service worker static assets', () => {
    const html = read('public/index.html');
    const sw = read('public/sw.js');
    expect(html).toContain('/js/components/documentViewer.js');
    expect(sw).toContain("'/js/components/documentViewer.js'");
    expect(html.indexOf('/js/components/modal.js')).toBeLessThan(html.indexOf('/js/components/documentViewer.js'));
  });

  it('keeps the package version at 1.16.x or later in package.json and the lockfile', () => {
    const version = JSON.parse(read('package.json')).version;
    const [major, minor] = version.split('.').map(Number);
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(1016);
    const lock = JSON.parse(read('package-lock.json'));
    expect(lock.version).toBe(version);
    expect(lock.packages[''].version).toBe(version);
  });

  it('documents the release in Spanish in the changelog, above the previous release', () => {
    const changelog = read('CHANGELOG.md');
    const start = changelog.indexOf('## [1.16.0] - 2026-11-17');
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(changelog.indexOf('## [1.15.0]'));
    const entry = changelog.slice(start, changelog.indexOf('## [1.15.0]'));
    ['### Added', '### Changed', 'Parcialmente cancelado', 'Cheque', 'Ver documento', 'Ocultar importes'].forEach(text => expect(entry).toContain(text));
  });

  it('describes the new behaviors in the functional document', () => {
    const doc = read('Documento funcional.md');
    ['Parcialmente cancelado', 'Cheques por cobrar', 'Marcar como cobrado', 'lista desplegable de años'].forEach(text => expect(doc).toContain(text));
  });
});
