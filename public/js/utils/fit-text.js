// Keeps placeholders and the selected text of selectors fully visible: when the text is wider than the
// control, the font size of that control (placeholder only, for inputs) shrinks until it fits, down to MIN_PX.
// Controls are discovered with a MutationObserver and refitted when their size changes (ResizeObserver).
const FitText = {
  MIN_PX: 10,
  SELECTOR: 'input[placeholder], select',
  canvas: null,
  fittedWidth: new WeakMap(),
  observed: new WeakSet(),
  resizeObserver: null,
  scheduled: false,

  measure(text, font) {
    this.canvas = this.canvas || document.createElement('canvas');
    const context = this.canvas.getContext('2d');
    if (!context) return 0;
    context.font = font;
    return context.measureText(text).width;
  },

  textFor(element) {
    if (element.tagName === 'SELECT') {
      const option = element.options[element.selectedIndex];
      return option ? option.text : '';
    }
    return element.getAttribute('placeholder') || '';
  },

  // Pure sizing rule: the largest size (<= base) whose text width fits the available width, never below MIN_PX.
  fittedSize(baseSize, textWidth, available) {
    if (!textWidth || available <= 0 || textWidth <= available) return null;
    return Math.max(this.MIN_PX, Math.floor(baseSize * (available / textWidth) * 0.97 * 10) / 10);
  },

  apply(element, size) {
    const isSelect = element.tagName === 'SELECT';
    const value = size ? `${size}px` : '';
    if (isSelect) {
      if (element.style.fontSize !== value) element.style.fontSize = value;
    } else if (element.style.getPropertyValue('--fit-font-size') !== value) {
      if (value) element.style.setProperty('--fit-font-size', value);
      else element.style.removeProperty('--fit-font-size');
    }
  },

  fit(element) {
    if (!element.isConnected || !element.clientWidth) return;
    const text = this.textFor(element);
    this.apply(element, null);
    if (!text) return;
    const style = getComputedStyle(element);
    const available = element.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0);
    const baseSize = parseFloat(style.fontSize);
    const font = `${style.fontStyle} ${style.fontWeight} ${baseSize}px ${style.fontFamily}`;
    this.apply(element, this.fittedSize(baseSize, this.measure(text, font), available));
    this.fittedWidth.set(element, element.clientWidth);
  },

  watch(element) {
    if (this.observed.has(element)) return;
    this.observed.add(element);
    if (element.tagName === 'SELECT') element.addEventListener('change', () => this.fit(element));
    if (this.resizeObserver) this.resizeObserver.observe(element);
  },

  refreshAll() {
    this.scheduled = false;
    document.querySelectorAll(this.SELECTOR).forEach(element => {
      this.watch(element);
      this.fit(element);
    });
  },

  schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => this.refreshAll());
  },

  init() {
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(entries => entries.forEach(entry => {
        const element = entry.target;
        if (Math.abs((this.fittedWidth.get(element) || 0) - element.clientWidth) > 1) this.fit(element);
      }));
    }
    new MutationObserver(() => this.schedule()).observe(document.body, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['placeholder', 'hidden', 'class']
    });
    window.addEventListener('resize', () => this.schedule());
    this.schedule();
  }
};

if (typeof module !== 'undefined') module.exports = FitText;
else document.addEventListener('DOMContentLoaded', () => FitText.init());
