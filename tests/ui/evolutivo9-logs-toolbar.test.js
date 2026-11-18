const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 9: compact Logs filter toolbar', () => {
  it('renders every Logs filter in one toolbar section', () => {
    const logs = read('js/pages/logs.js');
    expect(logs).toContain("className: 'logs-filters logs-toolbar'");
    expect(logs.match(/content\.appendChild\(toolbar\)/g)).toHaveLength(1);
    ["field('Buscar', searchInput, 'search')", "field('Desde', fromInput, 'date')", "field('Hasta', toInput, 'date')", 'field(label, select)', 'toolbar.appendChild(clearButton)']
      .forEach(text => expect(logs).toContain(text));
    expect(logs).not.toContain("style: { flex: '1 1 160px'");
  });

  it('uses compact controls and a single row on wide screens', () => {
    const css = read('css/pages.css');
    expect(css).toMatch(/\.logs-toolbar \.form-control \{[^}]*height: 32px;/);
    expect(css).toMatch(/@media \(min-width: 1200px\) \{\s*\.logs-toolbar \{\s*grid-template-columns: minmax\(150px, 1\.4fr\) repeat\(2, minmax\(118px, 0\.8fr\)\) repeat\(4, minmax\(100px, 1fr\)\) auto;/);
  });
});
