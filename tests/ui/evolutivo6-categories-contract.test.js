const fs = require('fs');
const path = require('path');
const { FakeElement, loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const flush = async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); };

describe('Evolutivo 6 categories inside Configuración', () => {
  const app = read('js/app.js');

  it('removes the Categorías item from the navbar', () => {
    expect(app).not.toContain('data-route="/categories"');
    expect(app).not.toContain('<span>Categorías</span>');
  });

  it('redirects /categories to the Settings section', () => {
    expect(app).toMatch(/Router\.register\('\/categories'[\s\S]{0,200}Router\.navigate\('\/settings\?section=categories'\)/);
    expect(app).not.toMatch(/Router\.register\('\/categories'[\s\S]{0,200}CategoriesPage\.render/);
    expect(read('js/router.js')).toContain("'/categories': '/settings'");
  });

  it('whitelists and lists the categories section in Settings', () => {
    const settings = read('js/pages/settings.js');
    expect(settings).toMatch(/\['accounts', 'alerts', 'owners', 'tenants', 'providers', 'categories'\]\.includes\(params\.section\)/);
    expect(settings).toContain("['categories', 'Categorías']");
    expect(settings).toContain('CategoriesPage.renderPanel(panel)');
  });

  it('keeps the categories script registered', () => {
    expect(read('index.html')).toContain('/js/pages/categories.js');
  });

  describe('CategoriesPage.renderPanel', () => {
    const setup = categories => {
      const API = { categories: { list: jest.fn().mockResolvedValue(categories), create: jest.fn().mockResolvedValue({}) } };
      const { CategoriesPage } = loadBrowser(['js/pages/categories.js'], ['CategoriesPage'], { API, Modal: { show: jest.fn(), hide: jest.fn() }, showToast: jest.fn() });
      return { CategoriesPage, API };
    };

    it('paints the list and the "Nueva" button inside the given panel', async () => {
      const { CategoriesPage } = setup([{ id: 'c1', nombre: 'Impuestos', color: '#fff' }, { id: 'c2', nombre: 'Sellos' }]);
      const panel = new FakeElement('section');
      await CategoriesPage.renderPanel(panel);
      expect(panel.textContent).toContain('Categorías');
      expect(panel.findAll(node => node.tagName === 'LI').length).toBeGreaterThanOrEqual(2);
      expect(panel.find(node => node.className === 'category-list')).toBeTruthy();
      expect(panel.find(node => node.tagName === 'BUTTON' && node.textContent === '+ Nueva')).toBeTruthy();
    });

    it('shows the empty state and the error inside the panel', async () => {
      const empty = setup([]);
      const panel = new FakeElement('section');
      await empty.CategoriesPage.renderPanel(panel);
      expect(panel.find(node => node.className === 'empty-state').innerHTML).toContain('No tenés categorías creadas');
      const failing = setup([]);
      failing.API.categories.list.mockRejectedValue(new Error('boom'));
      await failing.CategoriesPage.renderPanel(panel);
      await flush();
      expect(panel.innerHTML).toContain('Error: boom');
    });

    it('reloads the same panel after a change', async () => {
      const { CategoriesPage, API } = setup([]);
      const panel = new FakeElement('section');
      await CategoriesPage.renderPanel(panel);
      await CategoriesPage.reload(panel);
      expect(API.categories.list).toHaveBeenCalledTimes(2);
    });
  });
});
