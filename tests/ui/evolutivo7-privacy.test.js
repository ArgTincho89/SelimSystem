const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

// Evolutivo 7: "Ocultar importes" (Configuración / Cuentas) and the eye toggle of Inicio are independent.
describe('Evolutivo 7 independent privacy toggles', () => {
  const setup = (initial = {}) => {
    const store = { ...initial };
    const localStorage = { getItem: key => (key in store ? store[key] : null), setItem: (key, value) => { store[key] = String(value); } };
    const { context, HomePage } = loadBrowser(['js/utils/format.js', 'js/pages/home.js'], ['HomePage'], { localStorage });
    const elements = [];
    context.document.querySelectorAll = selector => elements.filter(element => {
      if (selector === '.stat-value') return element.className.split(' ').includes('stat-value');
      const scope = /data-privacy-scope="(\w+)"/.exec(selector);
      if (scope) return element.dataset.privacyScope === scope[1];
      if (selector === '[data-private-aria-label]') return element.dataset.privateAriaLabel !== undefined;
      return false;
    });
    const make = className => { const element = context.document.createElement('p'); element.className = className; elements.push(element); return element; };
    return { HomePage, store, make };
  };

  it('hides only the account balances with the accounts toggle', () => {
    const { HomePage, store, make } = setup();
    const balance = make('account-card-balance');
    HomePage.markSensitive(balance, '$ 100', 'accounts');
    const movement = make('transaction-amount');
    HomePage.markSensitive(movement, '+$ 50');
    const stat = make('stat-value');
    HomePage.applyPrivacy(true);
    expect(store.pate_hide_income).toBe('true');
    expect(balance.textContent).toBe('••••••');
    expect(movement.textContent).toBe('+$ 50');
    expect(stat.className).not.toContain('income-blurred');
    HomePage.applyPrivacy(false);
    expect(balance.textContent).toBe('$ 100');
  });

  it('hides the summary cards and movements with the Inicio toggle without touching account balances', () => {
    const { HomePage, store, make } = setup();
    const balance = make('account-card-balance');
    HomePage.markSensitive(balance, '$ 100', 'accounts');
    const movement = make('transaction-amount');
    HomePage.markSensitive(movement, '+$ 50');
    movement.dataset.privateAriaLabel = 'oculto';
    movement.dataset.publicAriaLabel = 'visible';
    const stat = make('stat-value');
    HomePage.applyStatsPrivacy(true);
    expect(store.pate_hide_home_stats).toBe('true');
    expect(store.pate_hide_income).toBeUndefined();
    expect(stat.className).toContain('income-blurred');
    expect(movement.textContent).toBe('••••••');
    expect(movement.getAttribute('aria-label')).toBe('oculto');
    expect(balance.textContent).toBe('$ 100');
  });

  it('reads each scope from its own key', () => {
    const { HomePage } = setup({ pate_hide_income: 'true' });
    expect(HomePage.isHidden('accounts')).toBe(true);
    expect(HomePage.isHidden('home')).toBe(false);
  });

  it('never blurs the Inicio cards from the stored account preference', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../public/js/pages/home.js'), 'utf8');
    expect(source).toContain("const incomeHidden = this.isHidden('home');");
    expect(source).toContain("let hidden = this.isHidden('home');");
    expect(source).not.toMatch(/getItem\('pate_hide_income'\)/);
  });
});
