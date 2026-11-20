const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../../public/js/components/modal.js'), 'utf8');

describe('Modal closes only through its own buttons', () => {
  it('does not close when clicking the backdrop', () => {
    expect(source).not.toMatch(/on\(overlay,\s*'click'/);
  });

  it('swallows Escape without closing the dialog', () => {
    const escapeBlock = source.slice(source.indexOf("event.key === 'Escape'"), source.indexOf("event.key !== 'Tab'"));
    expect(escapeBlock).toContain('preventDefault');
    expect(escapeBlock).not.toContain('this.hide()');
  });

  it('keeps the close (X) button wired to hide', () => {
    expect(source).toContain("'aria-label': 'Cerrar'");
  });
});
