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

describe('Modal widths are 30% wider', () => {
  const { loadBrowser } = require('../helpers/fake-dom');
  const { Modal } = loadBrowser(['js/components/modal.js'], ['Modal'], {});

  it('scales pixel widths and keeps other units', () => {
    expect(Modal.scaledWidth()).toBe('572px');
    expect(Modal.scaledWidth('480px')).toBe('624px');
    expect(Modal.scaledWidth('1100px')).toBe('1430px');
    expect(Modal.scaledWidth('90vw')).toBe('90vw');
  });
});
