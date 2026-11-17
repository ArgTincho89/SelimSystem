const fs = require('fs');
const path = require('path');
const { FakeElement, loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 6 IVA mensual por titular', () => {
  const { SummaryPage } = loadBrowser(['js/pages/summary.js'], ['SummaryPage'], {
    formatearMoneda: (value, currency) => `${currency} ${value}`, API: {}, Router: {}
  });
  const owners = [{ id: 'o1', name: 'Marta' }, { id: 'o2', name: 'Juan' }, { id: 'o3', name: 'Sin IVA' }];
  const summary = {
    activeCurrency: 'ARS',
    ivaByHolder: [
      { ownerId: 'o1', ownerName: 'Marta', currency: 'ARS', amount: 150 },
      { ownerId: 'o2', ownerName: 'Juan', currency: 'ARS', amount: 0 },
      { ownerId: 'o2', ownerName: 'Juan', currency: 'USD', amount: 20 }
    ]
  };
  const rows = card => card.findAll(node => node.className === 'account-alert-row');
  const text = row => row.textContent;

  it('keeps the title and the favorite attributes', () => {
    const card = SummaryPage.renderIvaByOwner(summary, owners);
    expect(card.dataset.favoriteType).toBe('trend-iva');
    expect(card.dataset.favoriteKey).toBe('trend-iva');
    expect(card.dataset.favoriteLabel).toBe('IVA mensual por titular');
    expect(card.textContent).toContain('IVA mensual por titular');
  });

  it('lists every owner with the month total on the right and 0 when absent', () => {
    const lines = rows(SummaryPage.renderIvaByOwner(summary, owners));
    expect(lines.map(text)).toEqual(['MartaARS 150', 'JuanUSD 20', 'Sin IVAARS 0']);
    expect(lines[0].children[1].className).toBe('iva-owner-amount');
  });

  it('follows the selected month: the rows come from the summary of that month', () => {
    const other = { activeCurrency: 'ARS', ivaByHolder: [{ ownerId: 'o3', ownerName: 'Sin IVA', currency: 'ARS', amount: 42 }] };
    expect(rows(SummaryPage.renderIvaByOwner(other, owners)).map(text)).toEqual(['MartaARS 0', 'JuanARS 0', 'Sin IVAARS 42']);
    expect(rows(SummaryPage.renderIvaByOwner({ activeCurrency: 'ARS' }, owners)).map(text)).toEqual(['MartaARS 0', 'JuanARS 0', 'Sin IVAARS 0']);
  });

  it('never shows a historical months list', () => {
    const card = SummaryPage.renderIvaByOwner(summary, owners);
    expect(card.textContent).not.toMatch(/Sin ingresos con IVA|enero|febrero|\d{4}-\d{2}/i);
  });

  it('appends holders that are not in the owners list so no IVA is hidden', () => {
    const lines = rows(SummaryPage.renderIvaByOwner({ activeCurrency: 'ARS', ivaByHolder: [{ ownerId: 'gone', ownerName: 'Ex titular', currency: 'ARS', amount: 5 }] }, [{ id: 'o1', name: 'Marta' }]));
    expect(lines.map(text)).toEqual(['MartaARS 0', 'Ex titularARS 5']);
  });

  it('shows an empty state without owners', () => {
    const card = SummaryPage.renderIvaByOwner({ activeCurrency: 'ARS', ivaByHolder: [] }, []);
    expect(rows(card)).toHaveLength(0);
    expect(card.textContent).toContain('Todavía no hay titulares cargados.');
  });

  it('Home loads the owners and renders the section from the selected month summary', () => {
    const home = read('js/pages/home.js');
    expect(home).toContain('API.owners.list()');
    expect(home).not.toContain('renderIvaChart');
    expect(home.match(/SummaryPage\.renderIvaByOwner\(summary, /g)).toHaveLength(2);
    expect(home).toContain("(owner.roles || ['owner']).includes('owner')");
    expect(home).toContain('API.summary.get(this.currentMonth)');
  });

  it('is a FakeElement tree', () => {
    expect(SummaryPage.renderIvaByOwner(summary, owners)).toBeInstanceOf(FakeElement);
  });
});
