const fs = require('fs');
const path = require('path');
const FitText = require('../../public/js/utils/fit-text');

const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

describe('FitText sizing rule', () => {
  it('keeps the base size when the text fits', () => {
    expect(FitText.fittedSize(16, 100, 120)).toBeNull();
  });

  it('shrinks the font so the text fits the available width', () => {
    const size = FitText.fittedSize(20, 200, 150);
    expect(size * 200 / 20).toBeLessThanOrEqual(150);
    expect(size).toBeGreaterThanOrEqual(FitText.MIN_PX);
  });

  it('shrinks proportionally when there is room above the minimum', () => {
    const size = FitText.fittedSize(16, 150, 120);
    expect(size).toBeLessThan(16);
    expect(size * 150 / 16).toBeLessThanOrEqual(120);
  });

  it('never goes below the minimum readable size', () => {
    expect(FitText.fittedSize(16, 1000, 50)).toBe(FitText.MIN_PX);
  });
});

describe('FitText wiring', () => {
  it('is loaded by index.html and cached by the service worker', () => {
    expect(read('public/index.html')).toContain('<script src="/js/utils/fit-text.js"></script>');
    expect(read('public/sw.js')).toContain("'/js/utils/fit-text.js'");
  });

  it('lets placeholders use the fitted font size', () => {
    expect(read('public/css/components.css')).toMatch(/input::placeholder \{\s*font-size: var\(--fit-font-size, inherit\);/);
  });
});
