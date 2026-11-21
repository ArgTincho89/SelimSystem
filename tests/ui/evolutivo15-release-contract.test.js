const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('Evolutivo 15 release contract', () => {
  it('ships service worker cache v56 or later and version 1.21.x or later', () => {
    expect(Number(read('public/sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(56);
    const [major, minor] = JSON.parse(read('package.json')).version.split('.').map(Number);
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(1021);
    const lock = JSON.parse(read('package-lock.json'));
    expect(lock.version).toBe(JSON.parse(read('package.json')).version);
    expect(lock.packages[''].version).toBe(JSON.parse(read('package.json')).version);
  });

  it('documents the release in the changelog and the functional document', () => {
    const changelog = read('CHANGELOG.md');
    const start = changelog.indexOf('## [1.21.0] - 2026-11-20');
    expect(start).toBeGreaterThan(-1);
    const section = changelog.slice(start, changelog.indexOf('## [1.20.0]'));
    ['### Changed', 'DD-MM-AAAA', '"20-11-2026"', 'dd-mm-aaaa hh:mm', 'Ventanas un 15% más anchas', '572 px a 658 px', 'Ver alquiler', '1430 px'].forEach(text => expect(section).toContain(text));
    const doc = read('Documento funcional.md');
    expect(doc).toContain(`**Versión del producto:** ${JSON.parse(read('package.json')).version}`);
    expect(doc).toContain('### 14.10 Formato de fechas y ancho de las ventanas');
    ['**DD-MM-AAAA**', '"20-11-2026 14:35"', '"Vencimiento · <título> · dd-mm-aaaa · pendiente $X"', 'vence el dd-mm-aaaa', '"16-11-2026 · Título de la nota"', '1430 px', '658 px'].forEach(text => expect(doc).toContain(text));
    expect(doc).not.toContain('dd/mm/aaaa');
  });

  it('keeps "Ver alquiler" as the only dialog with its own width factor', () => {
    const modal = read('public/js/components/modal.js');
    expect(modal).toContain('WIDTH_SCALE: 1.495,');
    expect(modal).toContain('this.scaledWidth(options.width, options.widthScale)');
    const users = ['public/js/pages', 'public/js/components', 'public/js/utils']
      .flatMap(dir => fs.readdirSync(path.join(root, dir)).map(file => `${dir}/${file}`))
      .filter(file => read(file).includes('widthScale:'));
    expect(users).toEqual(['public/js/pages/rentalModal.js']);
    expect(read('public/js/pages/rentalModal.js').match(/widthScale:/g)).toHaveLength(1);
  });

  it('records the change request with its decisions', () => {
    const request = read('openspec/changes/evolutivo-15/request.md');
    expect(request).toContain('Branch: `evolutivo-15`. Delivery: PR to master');
    ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].forEach(decision => expect(request).toContain(`- ${decision}:`));
    expect(request).toContain('src/utils/date-format.js');
  });
});
