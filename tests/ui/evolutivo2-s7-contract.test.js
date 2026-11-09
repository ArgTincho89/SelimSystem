const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 2 S7 rental block and obligations section UI contract', () => {
  const source = read('js/pages/assets.js');
  const block = source.slice(source.indexOf('identifierLabel(type)'), source.indexOf('showAssetModal(asset = null)'));
  const modal = source.slice(source.indexOf('showAssetModal(asset = null)'), source.indexOf('legacyLines(asset)'));

  it('renders the requested rental block labels', () => {
    ['Inquilino', 'Contrato vigente desde', 'Hasta', 'Monto original', 'Frecuencia ajuste (meses)', 'Criterio ajuste', 'A cargo de'].forEach(label => {
      expect(block).toContain(label);
    });
    expect(block).toContain("['ARS', 'EUR', 'USD']");
    expect(block).toContain("contract?.currencyCode || 'ARS'");
    expect(block).toContain("(owner.roles || []).includes('tenant')");
  });

  it('shows the block only for Alquilado or Usufructo', () => {
    expect(block).toContain("['rented', 'usufruct'].includes(conditionSelect.value)");
    expect(block).toContain("block.style.display = rented() ? '' : 'none'");
    expect(block).toContain("on(conditionSelect, 'change', refresh)");
  });

  it('renders locked contracts read-only with the explanatory hint', () => {
    expect(block).toContain('[tenant, startDate, amount, currency].forEach(control => { control.disabled = true; })');
    expect(block).toContain('Para cambiar el inquilino, marcá el bien como No alquilado y volvé a declararlo');
  });

  it('offers Titular and Inquilino per obligation and keeps legacy shared read-only', () => {
    expect(block).toContain("[['owner', 'Titular'], ['tenant', 'Inquilino']]");
    expect(block).toContain("['owner', 'tenant'].includes(item.responsibilityType)");
    expect(block).toContain('compartida (solo lectura)');
  });

  it('formats obligation lines by identifier type', () => {
    expect(block).toContain("account: 'Cuenta Nº'");
    expect(block).toContain("contract: 'Contrato Nº'");
    expect(block).toContain('`${provider} - ${this.identifierLabel(item.externalIdentifierType)}: ${item.externalIdentifier}`');
  });

  it('shows the cadastral header, the shortcut and the unsaved state', () => {
    expect(block).toContain("h4', { textContent: 'Identificación catastral' }");
    expect(block).toContain("textContent: 'Nueva obligación', disabled: !asset?.id");
    expect(block).toContain('/obligations?newForAsset=');
    expect(block).toContain('Guardá el bien para asignarle obligaciones.');
  });

  it('confirms inline before ending an active contract (no window.confirm)', () => {
    expect(block).toContain('Al marcar el bien como No alquilado se finaliza el contrato vigente');
    expect(modal).toContain('rentalUi.needsEndConfirmation() && !endConfirmed');
    expect(source).not.toContain('window.confirm');
    expect(source).not.toMatch(/\bconfirm\(/);
  });

  it('submits the rental and responsibilities through the composite form', () => {
    expect(modal).toContain('rental: rentalPart.rental, obligationResponsibilities: rentalPart.obligationResponsibilities');
    expect(modal).toContain('slot: \'rental-and-obligations\'');
    expect(block).toContain('currencyCode: currency.value');
    expect(block).toContain('adjustmentFrequencyMonths: parsedFrequency.value');
  });

  it('prefills the obligation form from the asset shortcut', () => {
    expect(read('js/app.js')).toContain('ObligationsPage.render({}, params.focus, params.newForAsset)');
    const obligations = read('js/pages/obligations.js');
    expect(obligations).toContain('if (newForAssetId) this.showCreateModal(null, { assetId: newForAssetId })');
    expect(obligations).toContain('existing?.assetId || defaults.assetId');
    expect(read('js/api.js')).toContain('setResponsibility(id, responsibilityType)');
  });

  it('bumps the service worker cache to v29 or later', () => {
    expect(Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(29);
  });
});
