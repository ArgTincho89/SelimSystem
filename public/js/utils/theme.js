// Light / dark appearance. The choice lives in localStorage (per device) and is applied as
// <html data-theme="...">; variables.css redefines the color tokens for the light theme. Loaded in <head>
// so the saved theme is applied before the first paint.
const Theme = {
  STORAGE_KEY: 'pate_theme',
  THEMES: ['dark', 'light'],
  META_COLORS: { dark: '#1a1a2e', light: '#f4f6fb' },

  current() {
    try {
      return localStorage.getItem(this.STORAGE_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  },

  apply(theme = this.current()) {
    const value = this.THEMES.includes(theme) ? theme : 'dark';
    document.documentElement.dataset.theme = value;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', this.META_COLORS[value]);
    return value;
  },

  set(theme) {
    const value = this.apply(theme);
    try { localStorage.setItem(this.STORAGE_KEY, value); } catch { /* the theme still applies for this visit */ }
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: value } }));
    return value;
  },

  // Reads a color token for canvas drawing (charts), with a fallback.
  color(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }
};

if (typeof module !== 'undefined') module.exports = Theme;
else Theme.apply();
