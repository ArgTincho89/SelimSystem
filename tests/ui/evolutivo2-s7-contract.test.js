const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

// The inline rental block was replaced by the rental declaration in evolutivo-3 (S3); the obligations section stays.
describe('Evolutivo 2 S7 obligations section UI contract', () => {
  const source = read('js/pages/assets.js');
  const block = source.slice(source.indexOf('identifierLabel(type)'), source.indexOf('showAssetModal(asset = null'));
  const modal = source.slice(source.indexOf('showAssetModal(asset = null'), source.indexOf('legacyLines(asset)'));

  it('offers Titular and Inquilino per obligation and keeps legacy shared read-only', () => {
    expect(block).toContain("[['owner', 'Titular'], ['tenant', 'Inquilino']]");
    expect(block).toContain("['owner', 'tenant'].includes(item.responsibilityType)");
    expect(block).toContain('compartida (solo lectura)');
    expect(block).toContain("'A cargo de'");
  });

  it('only offers Inquilino when the asset has an active contract', () => {
    expect(block).toContain('const hasTenant = Boolean(asset?.activeContract)');
    expect(block).toContain("hasTenant || item.responsibilityType === 'tenant'");
  });

  it('formats obligation lines by identifier type', () => {
    expect(block).toContain("account: 'Cuenta Nº'");
    expect(block).toContain("contract: 'Contrato Nº'");
    expect(block).toContain('`${provider} - ${this.identifierLabel(item.externalIdentifierType)}: ${item.externalIdentifier}`');
  });

  it('shows the obligations header, the shortcut and the unsaved state', () => {
    expect(block).toContain("h4', { textContent: 'Obligaciones del bien' }");
    expect(block).toContain("textContent: 'Nueva obligación', disabled: !asset?.id");
    expect(block).toContain('/obligations?newForAsset=');
    expect(block).toContain('Guardá el bien para asignarle obligaciones.');
  });

  it('no longer renders the inline rental block or its end-contract confirmation', () => {
    expect(block).not.toContain('rentalBlock');
    expect(block).not.toContain('Contrato vigente desde');
    expect(block).not.toContain('Finalizar contrato y guardar');
    expect(modal).not.toContain('endConfirmed');
  });

  it('never uses window.confirm', () => {
    expect(source).not.toContain('window.confirm');
    expect(source).not.toMatch(/\bconfirm\(/);
  });

  it('submits the responsibilities through the composite form', () => {
    expect(modal).toContain('obligationResponsibilities: obligationPart.obligationResponsibilities');
    expect(modal).toContain("slot: 'obligations'");
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
