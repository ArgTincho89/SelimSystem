const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

const source = fs.readFileSync(path.join(__dirname, '../../public/js/pages/assets.js'), 'utf8');

describe('Evolutivo 9: Bienes filter bar and asset cards', () => {
  const { AssetsPage } = loadBrowser(['js/pages/assets.js'], ['AssetsPage'], { API: {}, Modal: {}, ConfirmDialog: {} });
  AssetsPage.kinds = [{ key: 'oficina', name: 'Oficina' }];
  const bold = line => line.findAll(node => node.tagName && node.tagName.toLowerCase() === 'strong').map(node => node.textContent);

  it('keeps only Tipo de bien, Tipo de inmueble, Titular legal and Estado in the filter bar', () => {
    ['Tipo de bien', 'Tipo de inmueble', 'Titular legal', 'Estado'].forEach(label => expect(source).toContain(`labeledField('${label}', `));
    ["'Buscar nombre o detalle'", "this.filterInput('Ubicación'", "this.filterSelect('Uso'"].forEach(text => expect(source).not.toContain(text));
    expect(source).toContain("[['', 'Todos'], ['rented', 'Alquilado'], ['not_rented', 'No alquilado']]");
    expect(source).toContain("propertyKindField.style.display = visible ? '' : 'none'");
    expect(source).toContain("propertyKind: type.value === 'immovable' ? propertyKind.value : ''");
  });

  it('offers the existing property kinds, including the ones added by the user', () => {
    expect(AssetsPage.propertyKindOptions().map(([, label]) => label)).toEqual(expect.arrayContaining(['Departamento', 'Casa', 'Galpón', 'Oficina']));
  });

  it('renders the card lines with bold parameter names and the rental state', () => {
    const [first, second] = AssetsPage.assetCardLines({
      type: 'immovable', propertyKind: 'galpon', condition: 'rented', location: 'Av. Circunvalación Sur 1790', status: 'active',
      owners: [{ name: 'Mandatos y Servicios S.A' }]
    });
    expect(first.textContent).toBe('Inmueble · Tipo: Galpón · Ubicación: Av. Circunvalación Sur 1790');
    expect(bold(first)).toEqual(['Inmueble', 'Tipo:', 'Ubicación:']);
    expect(second.textContent).toBe('Estado: Alquilado · Titular: Mandatos y Servicios S.A');
    expect(bold(second)).toEqual(['Estado:', 'Titular:']);
    expect(second.textContent).not.toContain('Activo');
  });

  it('shows No alquilado for everything that is not rented and skips empty parameters', () => {
    const [first, second] = AssetsPage.assetCardLines({ type: 'immovable', condition: 'usufruct', owners: [] });
    expect(first.textContent).toBe('Inmueble');
    expect(second.textContent).toBe('Estado: No alquilado');
    expect(AssetsPage.assetCardLines({ type: 'movable', brand: 'Ford', owners: [] })[1].textContent).toBe('Estado: No alquilado');
  });
});
