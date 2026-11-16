const fs = require('fs');
const path = require('path');
const { FakeElement, loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 5 alerts by responsibility UI contract', () => {
  const alert = (id, type, responsibility, extra = {}) => ({ id, type, responsibility, title: id, message: `${id} message`, date: '2026-11-20', status: 'pending', assetId: 'a1', obligationId: 'o1', occurrenceId: 'occ1', ...extra });
  const setup = alerts => {
    const { AlertsPage } = loadBrowser(['js/utils/format.js', 'js/pages/alerts.js'], ['AlertsPage'], { Router: { navigate: jest.fn() }, API: {}, App: {} });
    AlertsPage.alerts = alerts;
    AlertsPage.assets = [{ id: 'a1', name: 'Casa' }];
    const root = new FakeElement('div');
    AlertsPage.renderContent(root);
    return { AlertsPage, root };
  };
  const group = (root, key) => root.find(element => element.dataset && element.dataset.alertResponsibility === key);
  const labels = element => element.findAll(item => item.tagName === 'BUTTON').map(button => button.textContent);

  it('shows "A cargo de titulares" and "A cargo de inquilinos" with their counters', () => {
    const { root } = setup([
      alert('a', 'obligation_overdue', 'owner'), alert('b', 'obligation_due', 'owner'), alert('c', 'card_installment_due', 'owner', { assetId: null }),
      alert('d', 'rent_due', 'tenant'), alert('e', 'tenant_obligation_pending', 'tenant')
    ]);
    expect(group(root, 'owner').textContent).toContain('A cargo de titulares (3)');
    expect(group(root, 'tenant').textContent).toContain('A cargo de inquilinos (2)');
  });

  it('keeps the data-alert-group sections (used by the e2e) inside each responsibility group', () => {
    const { root } = setup([alert('a', 'obligation_overdue', 'owner'), alert('d', 'rent_due', 'tenant')]);
    expect(group(root, 'owner').find(element => element.dataset && element.dataset.alertGroup === 'obligation_overdue')).toBeTruthy();
    expect(group(root, 'tenant').find(element => element.dataset && element.dataset.alertGroup === 'rent_due')).toBeTruthy();
    expect(group(root, 'owner').find(element => element.dataset && element.dataset.alertGroup === 'rent_due')).toBeNull();
  });

  it('shows an empty message in a group without alerts', () => {
    const { root } = setup([alert('a', 'obligation_overdue', 'owner')]);
    expect(group(root, 'tenant').textContent).toContain('A cargo de inquilinos (0)');
    expect(group(root, 'tenant').textContent).toContain('No hay obligaciones a cargo del inquilino.');
    expect(group(root, 'owner').textContent).not.toContain('No hay obligaciones a cargo de los titulares.');
  });

  it('treats alerts from an older server (no responsibility) as owner alerts', () => {
    const { root } = setup([{ ...alert('x', 'obligation_due', 'owner'), responsibility: undefined }]);
    expect(group(root, 'owner').textContent).toContain('(1)');
  });

  it('offers the owner actions and the tenant actions per group', () => {
    const { root } = setup([alert('a', 'obligation_overdue', 'owner'), alert('d', 'rent_due', 'tenant'), alert('e', 'tenant_obligation_pending', 'tenant')]);
    expect(labels(group(root, 'owner'))).toEqual(expect.arrayContaining(['Registrar pago', 'Adjuntar comprobante', 'Ver obligación', 'Ver bien']));
    const tenant = labels(group(root, 'tenant'));
    expect(tenant).toEqual(expect.arrayContaining(['Registrar cobro', 'Ver bien', 'Resolver', 'Adjuntar comprobante', 'Ver obligación']));
    expect(tenant).not.toContain('Registrar pago');
  });

  it('adds the "Responsable" filter and sends it to the alerts API', () => {
    const { root } = setup([alert('a', 'obligation_overdue', 'owner')]);
    const select = root.find(element => element.attributes && element.attributes['aria-label'] === 'Responsable');
    expect(select.textContent).toContain('Titular');
    expect(select.textContent).toContain('Inquilino');
    const source = read('js/pages/alerts.js');
    expect(source).toContain('responsibility: responsibility.value');
    expect(read('js/api.js')).toContain('getAlerts(filters = {})');
  });

  it('shows only the chosen group when the responsibility filter is set', () => {
    const { AlertsPage } = setup([]);
    AlertsPage.filters.responsibility = 'tenant';
    AlertsPage.alerts = [alert('d', 'rent_due', 'tenant')];
    const root = new FakeElement('div');
    AlertsPage.renderContent(root);
    expect(group(root, 'tenant')).toBeTruthy();
    expect(group(root, 'owner')).toBeNull();
  });
});
