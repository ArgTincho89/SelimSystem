const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('Evolutivo 10 release contract', () => {
  it('ships service worker cache v51 or later and version 1.18.x or later', () => {
    expect(Number(read('public/sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(51);
    const [major, minor] = JSON.parse(read('package.json')).version.split('.').map(Number);
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(1018);
    expect(JSON.parse(read('package-lock.json')).version).toBe(JSON.parse(read('package.json')).version);
  });

  it('documents the release in the changelog and the functional document', () => {
    const changelog = read('CHANGELOG.md');
    const start = changelog.indexOf('## [1.18.0] - 2026-11-20');
    expect(start).toBeGreaterThan(-1);
    const section = changelog.slice(start, changelog.indexOf('## [1.17.1]'));
    ['Medio de pago', 'Cheques en cuotas', 'Nº cheque', 'Confirmar imputación', 'Compras en cuotas con crédito', 'Excepciones específicas'].forEach(text => expect(section).toContain(text));
    const doc = read('Documento funcional.md');
    expect(doc).toContain(`**Versión del producto:** ${JSON.parse(read('package.json')).version}`);
    expect(doc).toContain('**Fecha del documento:** 20/11/2026');
    ['**Medio de pago**', 'Cheques en cuotas y confirmación', 'Nº cheque', 'Compras en cuotas con crédito', 'Anticipación por tipo de aviso', 'Excepciones específicas'].forEach(text => expect(doc).toContain(text));
    expect(doc).not.toContain('Medio de pago reutilizable');
  });

  it('records the change request with its decisions', () => {
    const request = read('openspec/changes/evolutivo-10/request.md');
    expect(request).toContain('Branch: `evolutivo-10`. Delivery: PR to master');
    ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'].forEach(decision => expect(request).toContain(`- ${decision}:`));
    expect(request).toContain('chequeNumber');
  });
});
