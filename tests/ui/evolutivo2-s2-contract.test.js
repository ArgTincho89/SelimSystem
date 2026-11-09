const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 2 S2 party UI contract', () => {
  const settings = read('js/pages/settings.js');
  const entities = read('js/pages/entities.js');
  const app = read('js/app.js');

  it('shows the five settings tabs in order with exact names', () => {
    expect(settings).toContain("[['accounts', 'Cuentas'], ['alerts', 'Avisos'], ['owners', 'Titular'], ['tenants', 'Inquilino'], ['providers', 'Proveedor']]");
    expect(settings).toContain("owners: 'owner', tenants: 'tenant', providers: 'provider'");
    expect(settings).toContain('EntitiesPage.renderPanel(panel');
  });

  it('exposes renderPanel and the person/organization fields', () => {
    expect(entities).toContain('async renderPanel(panel, role)');
    ['Nombre', 'Apellido', 'DNI', 'Razón social', 'CUIL/CUIT', 'Teléfono', 'Correo electrónico', 'Dirección'].forEach(label => {
      expect(entities).toContain(`'${label}'`);
    });
    expect(entities).toContain("'Organización'");
  });

  it('requires an expense category for organization providers', () => {
    expect(entities).toContain('La categoría de gasto es obligatoria para proveedores');
    expect(entities).toContain('expenseCategoryId');
  });

  it('filters by role and offers delete through the API', () => {
    expect(entities).toContain('.includes(role)');
    expect(entities).toContain('API.owners.delete(entity.id)');
    expect(read('js/api.js')).toContain('delete(id) { return API.delete(`/owners/${id}`); }');
  });

  it('only lists role owner parties in the account titular select', () => {
    expect(settings).toContain(".includes('owner')");
    expect(settings).toContain('Titular de la cuenta');
  });

  it('redirects /entities to settings and drops the Contactos navbar item', () => {
    expect(app).toContain("Router.navigate('/settings?section=owners')");
    expect(app).not.toContain('<span>Contactos</span>');
    expect(app).not.toContain('data-route="/entities"');
  });

  it('bumps the service worker cache to v27', () => {
    expect(read('sw.js')).toContain("CACHE_NAME = 'selimsystem-v27'");
  });
});
