const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 2 S5 asset form UI contract', () => {
  const source = read('js/pages/assets.js');
  const api = read('js/api.js');
  const sw = read('sw.js');
  const modal = source.slice(source.indexOf('showAssetModal(asset = null'), source.indexOf('legacyLines(asset)'));

  it('shows the requested movable labels', () => {
    ['Titular', 'Título', 'Tipo', 'Marca', 'Dominio', 'KMs', 'Color', 'Notas'].forEach(label => {
      expect(modal).toContain(`'${label}'`);
    });
    expect(modal).toContain("[['automovil', 'Automóvil']]");
    expect(modal).toContain('Agregar titular');
  });

  it('shows the requested immovable labels and enums', () => {
    ['Características', 'Ubicación', 'Superficie cubierta (m²)', 'Superficie libre (m²)', 'Identificación catastral', 'Fecha de construcción'].forEach(label => {
      expect(modal).toContain(`'${label}'`);
    });
    expect(source).toContain("[['departamento', 'Departamento'], ['casa', 'Casa'], ['galpon', 'Galpón'], ['lote', 'Lote']]");
    expect(source).toContain("[['rented', 'Alquilado'], ['not_rented', 'No alquilado'], ['usufruct', 'Usufructo']]");
    expect(modal).not.toContain("'Condición'");
    expect(modal).not.toContain('fields.condition');
  });

  it('keeps integer-only number inputs and the obligations slot', () => {
    expect(modal).toContain("min: 0, step: '1'");
    expect(source).toContain('/^\\d+$/');
    expect(modal).toContain("slot: 'obligations'");
  });

  it('hides legacy inputs from the form', () => {
    ['Fecha de adquisición', 'Valor de adquisición', 'Subtipo', 'Dirección', 'Localidad', 'Provincia', 'Descripción', 'Uso actual'].forEach(label => {
      expect(modal).not.toContain(label);
    });
  });

  it('submits through the composite form endpoints', () => {
    expect(modal).toContain('API.assets.saveForm(editing ? asset.id : null');
    expect(modal).not.toContain('rental:');
    expect(modal).toContain('obligationResponsibilities: obligationPart.obligationResponsibilities');
    expect(modal).not.toContain('API.assets.create(');
    expect(api).toContain("API.put(`/assets/${encodeURIComponent(id)}/form`, payload) : API.post('/assets/form', payload)");
  });

  it('shows legacy values read-only under Datos anteriores only when present', () => {
    expect(source).toContain("textContent: 'Datos anteriores'");
    expect(source).toContain('if (!lines.length) return;');
    expect(source).toContain('this.renderLegacyData(asset, body);');
  });

  it('keeps existing detail sections', () => {
    ['Ficha del bien', 'Ficha mensual', 'Análisis económico del bien'].forEach(heading => expect(source).toContain(heading));
  });

  it('uses a versioned service worker cache (v28 or later)', () => {
    expect(sw).toMatch(/CACHE_NAME = 'selimsystem-v(2[8-9]|[3-9]\d)'/);
  });
});
