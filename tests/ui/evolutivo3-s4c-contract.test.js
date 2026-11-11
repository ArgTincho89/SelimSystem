const fs = require('fs');
const path = require('path');
const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const monthDialog = () => {
  const assets = read('js/pages/assets.js');
  return assets.slice(assets.indexOf('async showRentMonthModal('), assets.indexOf('// Multi-period collection for one contract'));
};

describe('Evolutivo 3 S4c month-level rent UI contract', () => {
  it('Avisos collects the whole declaration month', () => {
    const alerts = read('js/pages/alerts.js');
    expect(alerts).toContain('showRentMonthModal(alert.assetId, alert.monthKey');
    expect(alerts).not.toContain('{ single: true }');
  });
  // Rental batch: each modality now has its own date, payment method and destination account.
  it('the month dialog has one MoneyInput + A/B line per modality with its own date, method and account', () => {
    const dialog = monthDialog();
    expect(dialog).toContain('MoneyInput.create');
    expect(dialog).toContain("'A (declarado)'");
    expect(dialog).toContain("'B (sin facturar)'");
    expect(dialog).toContain('Cuenta de destino (${currency})');
    expect(dialog).toContain("'Fecha de cobro'");
    expect(dialog).toContain("'Medio de cobro'");
    expect(dialog).toContain("part.modality === 'locacion' ? 'A' : 'B'");
    expect(dialog).toContain('incluido');
    expect(dialog).toContain('kind.value === \'A\' && part.ivaPercent > 0');
  });
  it('sends every modality in one grouped request with one idempotency key per dialog', () => {
    const dialog = monthDialog();
    expect(dialog).toContain('const idempotencyKey = crypto.randomUUID');
    expect(dialog).toContain('API.rentals.collectMonth({ idempotencyKey, lines: payload })');
    expect(dialog).toContain('seleccioná la cuenta de destino');
  });
  it('shows month rows in the history with the per-modality lines collapsed', () => {
    const assets = read('js/pages/assets.js');
    expect(assets).toContain('renderRentMonths(');
    expect(assets).toContain('Meses de alquiler');
    expect(assets).toContain("create('details'");
    expect(assets).toContain('Cobrar mes');
    expect(read('js/api.js')).toContain('/rentals/months');
  });
  it('uses "Deshacer cobro" with inline confirmation on months, occurrences and the collections list', () => {
    const assets = read('js/pages/assets.js');
    expect(assets).not.toContain('Anular cobro');
    expect(assets.match(/this\.undoCollections\(/g).length).toBeGreaterThanOrEqual(3);
    expect(assets).toContain('La conciliación de la cuenta quedó pendiente de revisar');
  });
  it('Transacciones deletes a rent collection as "Deshacer cobro"', () => {
    const home = read('js/pages/home.js');
    expect(home).toContain("tx.rentCollectionId ? 'Deshacer cobro'");
    expect(home).toContain('La conciliación de la cuenta quedó pendiente de revisar');
    expect(home).toContain('el período vuelve a quedar pendiente de cobro');
  });
  it('bumps the service worker cache to v36 or later', () => {
    expect(Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(36);
  });
});
