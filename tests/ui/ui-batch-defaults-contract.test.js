const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

function storage(initial = {}) {
  const data = { ...initial };
  return { getItem: key => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); } };
}

describe('UI batch: defaults, money inputs, obligation form and nav highlight', () => {
  describe('login experience default', () => {
    const loadApp = initial => {
      const context = { localStorage: storage(initial), document: { addEventListener: () => {}, body: { classList: { toggle: () => {}, remove: () => {} } } }, console };
      vm.createContext(context);
      vm.runInContext(`${read('js/app.js')}\nthis.App = App;`, context);
      return context.App;
    };

    it('preselects Escritorio when nothing is remembered', () => {
      expect(loadApp().getExperience()).toBe('desktop');
    });

    it('keeps a remembered choice', () => {
      expect(loadApp({ pate_experience: 'mobile' }).getExperience()).toBe('mobile');
      expect(loadApp({ pate_experience: 'desktop' }).getExperience()).toBe('desktop');
    });
  });

  describe('currency selects default to ARS on create', () => {
    it('rental declaration ignores the app currency for new records and keeps the saved one on edit', () => {
      const source = read('js/pages/rentalDeclaration.js');
      expect(source).toContain("const currencyValue = data.currencyCode || 'ARS';");
      expect(source).not.toMatch(/currencyValue = [^;]*pate_app_currency/);
    });

    it('obligation and account forms default to ARS', () => {
      expect(read('js/pages/obligations.js')).toContain("existing?.currencyCode || 'ARS'");
      expect(read('js/pages/settings.js')).toContain("let currencyValue = account?.currency || 'ARS';");
    });
  });

  describe('obligation form custom lead days', () => {
    const source = read('js/pages/obligations.js');
    const form = source.slice(source.indexOf('  async showCreateModal('), source.indexOf('  async editOccurrence('));

    it('only shows the custom days field when Aviso is Personalizado', () => {
      expect(form).toContain("const customLeadWrap = customLead.parentNode;");
      expect(form).toMatch(/customLeadWrap\.style\.display = isCustom \? '' : 'none'/);
      expect(form).toContain("on(reminder, 'change', syncCustomLead);");
    });

    it('only validates and submits the custom days when Personalizado is selected', () => {
      expect(form).toContain("const isCustomLead = reminder.value === 'custom';");
      expect(form).toMatch(/if \(isCustomLead && !/);
      expect(form).toContain('reminderLeadDays: Number(isCustomLead ? customLead.value : reminder.value)');
    });
  });

  describe('money inputs everywhere', () => {
    it('uses MoneyInput for recoverable claims and the manual rent update', () => {
      const assets = read('js/pages/assets.js');
      expect(assets).toContain("MoneyInput.create({ currency: claim.currencyCode, value: claim.outstandingAmount, required: true, ariaLabel: 'Importe recibido' })");
      expect(assets).toContain("MoneyInput.create({ currency: 'ARS', required: true, ariaLabel: 'Importe recuperable' })");
      expect(assets).toContain('MoneyInput.create({ currency: contract.currencyCode, ariaLabel: amountLabel })');
      expect(assets).not.toMatch(/Number\(amount\.value\)/);
      expect(assets).not.toMatch(/placeholder: 'Importe recuperable'/);
    });

    it('parses amount prompts with the es-AR format', () => {
      expect(read('js/pages/obligations.js')).toContain('MoneyInput.parse(amountText, occurrence.currencyCode)');
      expect(read('js/pages/alerts.js')).toContain('MoneyInput.parse(amountText, alert.currencyCode)');
    });

    it('formats 100000 as 100.000,00 and parses it back', () => {
      const context = { localStorage: storage(), Intl, Number, String, Math, RegExp };
      vm.createContext(context);
      vm.runInContext(`${read('js/utils/format.js')}\n${read('js/components/moneyInput.js')}\nthis.MoneyInput = MoneyInput;`, context);
      expect(context.MoneyInput.format(100000, 'ARS')).toBe('100.000,00');
      expect(context.MoneyInput.parse('100.000,00', 'ARS')).toBe(100000);
      expect(context.MoneyInput.parse('100000', 'ARS')).toBe(100000);
    });
  });

  describe('router nav highlight', () => {
    const loadRouter = hash => {
      const items = ['/home', '/assets', '/obligations', '/settings'].map(route => {
        const classes = new Set();
        return { dataset: { route }, classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) }, active: () => classes.has('active') };
      });
      const window = { location: { hash }, addEventListener: () => {} };
      const context = {
        window, console,
        $$: () => items,
        App: { user: {}, isDesktop: () => false, refreshAlertIndicator: () => {} },
        HomePage: {},
        document: { body: { classList: { toggle: () => {}, remove: () => {} } } }
      };
      vm.createContext(context);
      vm.runInContext(`${read('js/router.js')}\nthis.Router = Router;`, context);
      const activeRoute = () => items.find(item => item.active())?.dataset.route || null;
      return { Router: context.Router, window, activeRoute };
    };

    it('highlights the programmatically navigated screen even while its handler is still running', async () => {
      const { Router, window, activeRoute } = loadRouter('#/assets');
      let finishObligations;
      Router.register('/assets', () => {});
      Router.register('/obligations', () => new Promise(resolve => { finishObligations = resolve; }));
      await Router.handleRoute();
      expect(activeRoute()).toBe('/assets');
      window.location.hash = '#/obligations?newForAsset=a1';
      const pending = Router.handleRoute();
      expect(activeRoute()).toBe('/obligations');
      finishObligations();
      await pending;
      expect(activeRoute()).toBe('/obligations');
    });

    it('does not let a slow, older handler overwrite the highlight of a newer navigation', async () => {
      const { Router, window, activeRoute } = loadRouter('#/assets');
      let finishAssets;
      Router.register('/assets', () => new Promise(resolve => { finishAssets = resolve; }));
      Router.register('/obligations', () => {});
      const slow = Router.handleRoute();
      window.location.hash = '#/obligations';
      await Router.handleRoute();
      finishAssets();
      await slow;
      expect(activeRoute()).toBe('/obligations');
    });

    it('highlights the screen a handler redirected to, and survives a failing handler', async () => {
      const { Router, window, activeRoute } = loadRouter('#/entities');
      Router.register('/entities', () => { window.location.hash = '#/settings?section=owners'; });
      await Router.handleRoute();
      expect(activeRoute()).toBe('/settings');
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      Router.register('/home', () => { throw new Error('boom'); });
      window.location.hash = '#/home';
      await Router.handleRoute();
      errorSpy.mockRestore();
      expect(activeRoute()).toBe('/home');
    });
  });
});
