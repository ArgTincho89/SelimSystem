const fs = require('fs');
const path = require('path');
const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const dialogSource = () => {
  const assets = read('js/pages/assets.js');
  return assets.slice(assets.indexOf('async showRentCollectionModal('));
};

describe('Evolutivo 3 S2 rent collection UI contract', () => {
  it('Avisos opens the single-occurrence dialog', () => {
    expect(read('js/pages/alerts.js')).toContain('{ single: true }');
  });
  it('the collection dialog has no reusable payment method and uses MoneyInput', () => {
    const dialog = dialogSource();
    expect(dialog).not.toContain('Medio reutilizable');
    expect(dialog).not.toContain('paymentMethodId');
    expect(dialog).toContain('Medio de cobro (opcional)');
    expect(dialog).toContain('MoneyInput.create');
    expect(dialog).toContain('Clasificación');
  });
  it('generates the idempotency key once per dialog open', () => {
    const dialog = dialogSource();
    expect(dialog.match(/const idempotencyKey =/g)).toHaveLength(1);
    expect(dialog.indexOf('const idempotencyKey =')).toBeLessThan(dialog.indexOf('onClick'));
  });
  it('offers Anular cobro with inline confirmation and no window.confirm', () => {
    const assets = read('js/pages/assets.js');
    expect(assets).toContain('Anular cobro');
    expect(assets).toContain('Confirmar anulación');
    expect(assets.slice(assets.indexOf('reverseButtons('), assets.indexOf('contractTypeLabel(type)'))).not.toContain('confirm(');
    expect(read('js/api.js')).toContain('reverseCollection');
  });
  it('the Transacciones delete explains the period returns to pending', () => {
    expect(read('js/pages/home.js')).toContain('el período vuelve a quedar pendiente de cobro');
  });
  it('bumps the service worker cache to v33 or later', () => {
    expect(Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(33);
  });
});
