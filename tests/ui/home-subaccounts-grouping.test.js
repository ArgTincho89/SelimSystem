const { loadBrowser } = require('../helpers/fake-dom');

describe('Inicio shows sub-accounts under their parent account', () => {
  const load = () => loadBrowser(['js/utils/format.js', 'js/pages/home.js'], ['HomePage'], { API: {}, Router: { navigate: jest.fn() } });
  const accounts = [
    { id: 'a', nombre: 'Banco', currency: 'ARS', primary: true, balanceStatus: 'verified', balance: 10 },
    { id: 'b', nombre: 'Caja', currency: 'ARS', balanceStatus: 'unverified' },
    { id: 'a1', nombre: 'Ahorro', currency: 'USD', parentId: 'a', balanceStatus: 'verified', balance: 5 },
    { id: 'a2', nombre: 'Plazo fijo', currency: 'ARS', parentId: 'a', balanceStatus: 'verified', balance: 7 },
    { id: 'x1', nombre: 'Huérfana', currency: 'ARS', parentId: 'archived', balanceStatus: 'verified', balance: 1 }
  ];

  it('groups each top-level account with its sub-accounts, keeping orphans as their own group', () => {
    const { HomePage } = load();
    const groups = HomePage.groupAccounts(accounts);
    expect(groups.map(group => group.account.id)).toEqual(['a', 'b', 'x1']);
    expect(groups[0].children.map(child => child.id)).toEqual(['a1', 'a2']);
    expect(groups[1].children).toEqual([]);
  });

  it('renders the sub-account cards stacked inside the parent group', () => {
    const { HomePage } = load();
    const section = HomePage.renderAccountCards(accounts);
    const grid = section.find(element => (element.className || '').includes('account-card-grid'));
    const groups = grid.children.filter(child => child.className === 'account-group');
    expect(groups).toHaveLength(3);
    const subList = groups[0].find(element => element.className === 'account-subcards');
    const subCards = subList.findAll(element => (element.className || '').includes('account-card-sub'));
    expect(subCards).toHaveLength(2);
    const names = subList.findAll(element => element.className === 'account-card-name').map(element => element.textContent);
    expect(names).toEqual(['↳ Ahorro', '↳ Plazo fijo']);
    expect(groups[1].find(element => element.className === 'account-subcards')).toBeFalsy();
  });
});
