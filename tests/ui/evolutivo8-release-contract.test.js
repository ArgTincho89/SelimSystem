const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('Evolutivo 8 release contract', () => {
  it('ships service worker cache v49 or later and version 1.17.x or later', () => {
    expect(Number(read('public/sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(49);
    const [major, minor] = JSON.parse(read('package.json')).version.split('.').map(Number);
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(1017);
  });

  it('documents the release in the changelog and the functional document', () => {
    const changelog = read('CHANGELOG.md');
    const start = changelog.indexOf('## [1.17.0] - 2026-11-18');
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(changelog.indexOf('## [1.16.0]'));
    ['Débito fiscal', 'Crédito fiscal', 'Factura a nombre de', 'Bienes'].forEach(text => expect(changelog.slice(start, changelog.indexOf('## [1.16.0]'))).toContain(text));
    const doc = read('Documento funcional.md');
    ['Débito fiscal', 'Crédito fiscal', 'Factura a nombre de', 'Tipo de bien'].forEach(text => expect(doc).toContain(text));
  });

  it('labeledField renders a visible label linked to the control', () => {
    const context = loadBrowser([], ['create', 'labeledField']);
    const select = context.create('select', { className: 'form-control' });
    const field = context.labeledField('Tipo de bien', select);
    const label = field.children[0];
    expect(label.tagName.toLowerCase()).toBe('label');
    expect(label.textContent).toBe('Tipo de bien');
    expect(label.getAttribute('for')).toBe(select.id);
    expect(field.children[1]).toBe(select);
  });

  it('the Bienes, Obligaciones and Avisos filter bars use visible labels', () => {
    const assets = read('public/js/pages/assets.js');
    ['Buscar', 'Tipo de bien', 'Titular legal', 'Estado', 'Uso', 'Ubicación'].forEach(label => expect(assets).toContain(`['${label}', `));
    expect(assets).toContain('labeledField(label, field)');
    expect(read('public/js/pages/obligations.js')).toContain("[['Bien', asset], ['Proveedor', provider], ['Estado', status], ['Tipo', type], ['Desde', from], ['Hasta', to]]");
    expect(read('public/js/pages/alerts.js')).toContain("labeledField('Tipo de aviso', type), labeledField('Responsable', responsibility), labeledField('Bien', asset)");
  });
});
