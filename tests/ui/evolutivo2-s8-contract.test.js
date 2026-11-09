const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const modal = () => {
  const source = read('js/pages/obligations.js');
  return source.slice(source.indexOf('async showCreateModal'), source.indexOf('async editOccurrence'));
};

describe('Evolutivo 2 S8 obligation form contract', () => {
  it('contains the simplified fields and no payment method', () => {
    const form = modal();
    ['Nombre', "'Tipo'", "'Bien'", "'Proveedor'", 'Número de cuenta o contrato', 'Primer vencimiento', 'Último vencimiento (opcional)', "'Aviso'", "'Moneda'", 'Importe estimado', "'Categoría'", "'Responsable'", "'Notas'"].forEach(text => expect(form).toContain(text));
    expect(form).not.toContain('Medio de pago');
    expect(form).not.toContain('paymentMethod');
    expect(form).not.toContain('Cuenta habitual');
    expect(read('js/pages/obligations.js')).not.toContain('item.paymentMethod');
  });

  it('offers all frequency options', () => {
    const form = modal();
    ["'Única vez'", "'Mensual'", "'Cada dos meses'", "'Trimestral'", "'Semestral'", "'Anual'"].forEach(text => expect(form).toContain(text));
  });

  it('uses a Cuenta/Contrato selector that sets externalIdentifierType', () => {
    expect(read('js/pages/obligations.js')).toContain("IDENTIFIER_KINDS: [['account', 'Cuenta'], ['contract', 'Contrato']]");
    expect(modal()).toContain('externalIdentifierType: identifier ? identifierKind.value : null');
  });

  it('prefills the category from the provider and re-prefills only when unchanged', () => {
    const form = modal();
    expect(form).toContain('expenseCategoryId');
    expect(form).toContain('previousProviderCategory');
    expect(form).toContain("on(provider, 'change'");
  });

  it('offers only Titular and Inquilino and keeps legacy responsibility untouched', () => {
    const form = modal();
    expect(form).toContain("['owner', 'Titular'], ['tenant', 'Inquilino']");
    expect(form).toContain('tenantOption.disabled = !activeContract');
    expect(form).toContain('legacyResponsibility');
    expect(form).not.toContain("'Tercero responsable'");
    expect(form).not.toContain('Porcentaje del propietario');
  });

  it('keeps the amount as the first money input and honors the asset shortcut', () => {
    const form = modal();
    expect(form.match(/this\.moneyField\(/g)).toHaveLength(1);
    expect(form).not.toContain("type: 'number'");
    expect(form).toContain('existing?.assetId || defaults.assetId');
    expect(read('js/pages/obligations.js')).toContain('this.showCreateModal(null, { assetId: newForAssetId })');
  });

  it('bumps the service worker cache to v30 or later', () => {
    expect(Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(30);
  });
});
