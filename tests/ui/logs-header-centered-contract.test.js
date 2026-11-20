const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Logs page title is centered', () => {
  it('renders the header with the logs-header layout', () => {
    expect(read('js/pages/logs.js')).toContain("className: 'page-header logs-header'");
  });

  it('centers the title in the middle grid column', () => {
    const css = read('css/pages.css');
    expect(css).toMatch(/\.logs-header\s*\{[^}]*grid-template-columns:\s*1fr auto 1fr/);
    expect(css).toMatch(/\.logs-header > \.page-title\s*\{[^}]*text-align:\s*center/);
  });
});
