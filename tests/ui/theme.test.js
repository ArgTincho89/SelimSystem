const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../..', file), 'utf8');

function setupGlobals(stored) {
  const store = new Map(stored ? [['pate_theme', stored]] : []);
  const meta = { content: '', setAttribute(name, value) { this[name] = value; } };
  const events = [];
  global.localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  global.document = {
    documentElement: { dataset: {} },
    querySelector: () => meta,
    dispatchEvent: event => events.push(event)
  };
  global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init.detail; } };
  return { store, meta, events };
}

describe('Theme', () => {
  let Theme;
  beforeEach(() => {
    jest.resetModules();
    Theme = require('../../public/js/utils/theme');
  });
  afterEach(() => { delete global.localStorage; delete global.document; delete global.CustomEvent; });

  it('defaults to dark', () => {
    setupGlobals();
    expect(Theme.current()).toBe('dark');
    expect(Theme.apply()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('saves and applies the light theme, updating the browser color and notifying listeners', () => {
    const { store, meta, events } = setupGlobals();
    Theme.set('light');
    expect(store.get('pate_theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(meta.content).toBe(Theme.META_COLORS.light);
    expect(events[0].type).toBe('themechange');
  });

  it('ignores unknown values', () => {
    setupGlobals('purple');
    expect(Theme.current()).toBe('dark');
    expect(Theme.apply('purple')).toBe('dark');
  });
});

describe('Theme wiring', () => {
  it('loads theme.js in <head> before the stylesheets and caches it', () => {
    const html = read('public/index.html');
    expect(html.indexOf('/js/utils/theme.js')).toBeLessThan(html.indexOf('/css/variables.css'));
    expect(read('public/sw.js')).toContain("'/js/utils/theme.js'");
  });

  it('defines light tokens', () => {
    expect(read('public/css/variables.css')).toMatch(/:root\[data-theme="light"\] \{[^}]*--bg-primary:/);
  });

  it('offers Modo oscuro / Modo claro in Perfil', () => {
    const profile = read('public/js/pages/profile.js');
    expect(profile).toContain("'Apariencia'");
    expect(profile).toContain("['dark', 'Modo oscuro'], ['light', 'Modo claro']");
    expect(profile).toContain('Theme.set(value)');
  });
});
