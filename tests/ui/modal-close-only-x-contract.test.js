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

describe('Modal widths are 49.5% wider (30%, then 15% more), except "Ver alquiler"', () => {
  const { loadBrowser } = require('../helpers/fake-dom');
  const { Modal } = loadBrowser(['js/components/modal.js'], ['Modal'], {});

  it('scales pixel widths and keeps other units', () => {
    expect(Modal.WIDTH_SCALE).toBe(1.495);
    expect(Modal.scaledWidth()).toBe('658px');
    expect(Modal.scaledWidth('480px')).toBe('718px');
    expect(Modal.scaledWidth('1100px')).toBe('1645px');
    expect(Modal.scaledWidth('90vw')).toBe('90vw');
  });

  it('lets one dialog keep its own factor: "Ver alquiler" stays at 1100px × 1.3 = 1430px', () => {
    expect(Modal.scaledWidth('1100px', 1.3)).toBe('1430px');
    expect(Modal.scaledWidth('1100px', 0)).toBe('1645px');
    expect(Modal.scaledWidth('1100px', 'x')).toBe('1645px');
  });
});
