const fs = require('fs');
const path = require('path');
const { FakeElement, loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('IVA mensual por titular (débito, crédito y saldo)', () => {
  const { SummaryPage } = loadBrowser(['js/pages/summary.js'], ['SummaryPage'], {
    formatearMoneda: (value, currency) => `${currency} ${value}`, API: {}, Router: {}
  });
  const owners = [{ id: 'o1', name: 'Marta' }, { id: 'o2', name: 'Juan' }, { id: 'o3', name: 'Sin IVA' }];
  const summary = {
    activeCurrency: 'ARS',
    ivaByHolder: [
      { ownerId: 'o1', ownerName: 'Marta', currency: 'ARS', amount: 210000, debit: 210000, credit: 210000, balance: 0 },
      { ownerId: 'o2', ownerName: 'Juan', currency: 'ARS', amount: 0, debit: 0, credit: 0, balance: 0 },
      { ownerId: 'o2', ownerName: 'Juan', currency: 'USD', amount: 20, debit: 20, credit: 5, balance: -15 }
    ]
  };
  const rows = card => card.findAll(node => String(node.className).split(' ').includes('account-alert-row'));
  const cells = row => row.children.map(child => child.textContent);

  it('keeps the title and the favorite attributes', () => {
    const card = SummaryPage.renderIvaByOwner(summary, owners);
    expect(card.dataset.favoriteType).toBe('trend-iva');
    expect(card.dataset.favoriteKey).toBe('trend-iva');
    expect(card.dataset.favoriteLabel).toBe('IVA mensual por titular');
    expect(card.textContent).toContain('IVA mensual por titular');
  });

  it('shows the four columns Titular, Débito fiscal, Crédito fiscal and Saldo', () => {
    const card = SummaryPage.renderIvaByOwner(summary, owners);
    const header = card.findAll(node => String(node.className).includes('iva-owner-header'))[0];
    expect(cells(header)).toEqual(['Titular', 'Débito fiscal', 'Crédito fiscal', 'Saldo']);
  });

  it('lists every owner with debit, credit and balance (credit minus debit), 0 when absent', () => {
    const lines = rows(SummaryPage.renderIvaByOwner(summary, owners));
    expect(lines.map(cells)).toEqual([
      ['Marta', 'ARS 210000', 'ARS 210000', 'ARS 0'],
      ['Juan', 'USD 20', 'USD 5', 'USD -15'],
      ['Sin IVA', 'ARS 0', 'ARS 0', 'ARS 0']
    ]);
    expect(lines[0].children[1].className).toContain('iva-owner-amount');
    expect(lines[1].children[3].className).toContain('is-negative');
  });

  it('accepts older payloads that only carry the debit as amount', () => {
    const other = { activeCurrency: 'ARS', ivaByHolder: [{ ownerId: 'o3', ownerName: 'Sin IVA', currency: 'ARS', amount: 42 }] };
    expect(rows(SummaryPage.renderIvaByOwner(other, owners)).map(cells)[2]).toEqual(['Sin IVA', 'ARS 42', 'ARS 0', 'ARS -42']);
    expect(rows(SummaryPage.renderIvaByOwner({ activeCurrency: 'ARS' }, owners)).map(row => cells(row)[0])).toEqual(['Marta', 'Juan', 'Sin IVA']);
  });

  it('shows a holder with only credit VAT', () => {
    const credit = { activeCurrency: 'ARS', ivaByHolder: [{ ownerId: 'o1', ownerName: 'Marta', currency: 'ARS', amount: 0, debit: 0, credit: 30, balance: 30 }] };
    const line = rows(SummaryPage.renderIvaByOwner(credit, owners))[0];
    expect(cells(line)).toEqual(['Marta', 'ARS 0', 'ARS 30', 'ARS 30']);
    expect(line.children[3].className).toContain('is-positive');
  });

  it('never shows a historical months list', () => {
    const card = SummaryPage.renderIvaByOwner(summary, owners);
    expect(card.textContent).not.toMatch(/Sin ingresos con IVA|enero|febrero|\d{4}-\d{2}/i);
  });

  it('appends holders that are not in the owners list so no IVA is hidden', () => {
    const lines = rows(SummaryPage.renderIvaByOwner({ activeCurrency: 'ARS', ivaByHolder: [{ ownerId: 'gone', ownerName: 'Ex titular', currency: 'ARS', amount: 5, debit: 5, credit: 0, balance: -5 }] }, [{ id: 'o1', name: 'Marta' }]));
    expect(lines.map(row => cells(row)[0])).toEqual(['Marta', 'Ex titular']);
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

  it('the transaction form offers IVA and "Factura a nombre de" on expenses', () => {
    const form = read('js/components/transactionForm.js');
    expect(form).toContain('Factura a nombre de');
    expect(form).toContain('crédito fiscal');
    expect(form).toContain('data.ivaHolderId');
  });

  it('is a FakeElement tree', () => {
    expect(SummaryPage.renderIvaByOwner(summary, owners)).toBeInstanceOf(FakeElement);
  });
});
