const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo S6 UI contract', () => {
  it('exposes the unified alerts API client', () => {
    const source = read('js/api.js');
    ['getAlerts', 'API.get(`/alerts${', 'alerts: {'].forEach(text => expect(source).toContain(text));
  });

  it('registers the Avisos route, nav entry, badge and page script', () => {
    const app = read('js/app.js');
    expect(app).toContain("Router.register('/avisos'");
    expect(app).toContain('AlertsPage.render(params)');
    expect(app).toContain('data-route="/avisos"');
    expect(app).toContain('<span>Avisos</span>');
    expect(app).toContain('setAlertBadge');
    expect(app).toContain('ObligationsPage.render({}, params.focus, params.newForAsset)');
    expect(read('index.html')).toContain('/js/pages/alerts.js');
    expect(read('sw.js')).toContain("'/js/pages/alerts.js'");
    expect(read('css/pages.css')).toContain('.nav-badge');
  });

  it('groups alerts by type and offers direct actions that reuse existing flows', () => {
    const source = read('js/pages/alerts.js');
    ['Obligaciones vencidas', 'Próximos vencimientos', 'Comprobantes pendientes de inquilinos', 'Alquileres pendientes de cobro', 'Cuotas de tarjeta', 'Documentos pendientes', 'Saldo insuficiente en cuentas'].forEach(text => expect(source).toContain(text));
    ['Registrar pago', 'Resolver', 'Contabilizar cuota', 'Registrar cobro', 'Adjuntar comprobante', 'Ver obligación', 'Ver bien'].forEach(text => expect(source).toContain(`'${text}'`));
    expect(source).toContain('ObligationsPage.pay(');
    expect(source).toContain('ObligationsPage.showResolveModal(');
    expect(source).toContain('API.installments.postOccurrence(');
    expect(source).toContain('AssetsPage.showRentMonthModal(');
    expect(source).toContain('API.documents.uploadTargets(');
    expect(source).toContain('API.getAlerts(');
  });

  it('keeps the per-source alert widgets', () => {
    expect(read('js/pages/obligations.js')).toContain('API.obligations.alerts()');
    expect(read('js/pages/assets.js')).toContain('API.rentals.alerts()');
    expect(read('js/pages/obligations.js')).toContain('async refresh()');
    expect(read('js/pages/obligations.js')).toContain('dataset: { obligationId: item.id }');
  });

  it('bumps the service worker cache name to v23 or later', () => {
    const version = Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1]);
    expect(version).toBeGreaterThanOrEqual(23);
  });
});
