const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '../../public/css/pages.css'), 'utf8');

describe('Evolutivo 9: active menu entry in light mode', () => {
  it('tints the active entry and adds an accent bar only in the light theme', () => {
    expect(css).toMatch(/:root\[data-theme="light"\] \.navbar-item\.active \{[^}]*background: var\(--accent-light\);[^}]*font-weight: 600;/);
    expect(css).toMatch(/:root\[data-theme="light"\] \.navbar-item\.active::before \{[^}]*background: var\(--accent\);/);
    expect(css).toMatch(/:root\[data-theme="light"\] body\.desktop-mode \.navbar-item\.active::before \{[^}]*left: 0;[^}]*width: 4px;/);
  });

  it('keeps the dark theme active entry unchanged (accent color only)', () => {
    expect(css).toMatch(/\n\.navbar-item\.active \{\s*color: var\(--accent\);\s*\}/);
  });
});
