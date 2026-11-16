const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

function loadAssetsPage() {
  const context = { localStorage: { getItem: () => null }, Intl, Date, Object, Set, Map, String, Array, Number };
  vm.createContext(context);
  vm.runInContext(`${read('js/utils/format.js')}\n${read('js/pages/obligations.js')}\n${read('js/pages/assets.js')}\nthis.page = AssetsPage;`, context);
  return context.page;
}

describe('Evolutivo 5 asset ficha redesign contract', () => {
  const source = read('js/pages/assets.js');
  const ficha = source.slice(source.indexOf('  async showDetails(id) {'), source.indexOf('  async renderRecoveries(asset, container) {'));
  const page = loadAssetsPage();

  it('never offers a button labelled "Alquileres" nor "Editar alquiler" in the list or the ficha', () => {
    expect(source).not.toContain("textContent: 'Alquileres'");
    expect(ficha).not.toContain("'Alquileres'");
    expect(source.slice(source.indexOf('  renderContent('), source.indexOf('  filterInput('))).not.toContain('Editar alquiler');
  });

  it('decides "Ver alquiler" vs "Declarar alquiler" from the active declaration, not from the condition', () => {
    const rentalAccess = source.slice(source.indexOf('  rentalAccessButton(asset'), source.indexOf('  openRental('));
    expect(rentalAccess).toContain('asset.activeDeclarationId');
    expect(rentalAccess).not.toContain("asset.condition === 'rented'");
    expect(rentalAccess).toContain("textContent: 'Ver alquiler'");
    expect(rentalAccess).toContain("textContent: 'Declarar alquiler'");
    expect(source).toContain('actions.appendChild(this.rentalAccessButton(asset');
  });

  it('opens the rental modal directly on the Resumen tab (without the ficha first)', () => {
    expect(source).toContain("RentalModal.open(declarationId, { assetId, tab: 'resumen', ...options })");
  });

  it('has the ficha header with Editar, Ver historial and the rental access', () => {
    const header = ficha.slice(ficha.indexOf('renderFichaHeader(asset) {'), ficha.indexOf('  // "Ver alquiler" when'));
    expect(header).toContain("textContent: 'Editar'");
    expect(header).toContain("textContent: 'Ver historial'");
    expect(header).toContain('this.rentalAccessButton(asset');
    expect(header).toContain('Titular');
  });

  it('shows the blocks: data, obligations, rental, documents and notes, economics, re-homed recoveries and histories', () => {
    ['data', 'obligations', 'rental', 'documents-notes', 'economics', 'recoveries', 'history'].forEach(block => expect(ficha).toContain(`fichaBlock: '${block}'`));
    ['Datos del bien', 'Obligaciones', 'Documentos y notas del bien', 'Economía del bien', 'Historial de titularidad', 'Historial de estados'].forEach(text => expect(ficha).toContain(text));
    expect(source).toContain('Registrar gasto recuperable');
    expect(source).toContain('Análisis económico del bien');
    expect(source).toContain('Evolución mensual y acumulada');
  });

  it('lists obligations compactly with the actions valid for each responsibility', () => {
    expect(ficha).toContain("textContent: 'Ver obligación'");
    expect(ficha).toContain("textContent: 'Registrar pago'");
    expect(ficha).toContain("textContent: 'Resolver'");
    expect(ficha).toContain("textContent: 'Editar obligación'");
    expect(ficha).toContain("textContent: 'Agregar obligación'");
    expect(ficha).toContain('!tenantSide && next.status');
    expect(ficha).toContain('tenantSide && !next.resolution');
    expect(ficha).toContain('ObligationsPage.pay(obligation, occurrence)');
    expect(ficha).toContain('ObligationsPage.showResolveModal(obligation, occurrence)');
  });

  it('shows the empty rental state, the disabled declare action with its hint and the rental history access', () => {
    expect(ficha).toContain('Feedback.MESSAGES.noActiveRental');
    expect(read('js/components/feedback.js')).toContain('Este inmueble no tiene un alquiler activo.');
    expect(ficha).toContain('Finalizá el alquiler vigente antes de declarar uno nuevo');
    expect(ficha).toContain("textContent: 'Declarar alquiler', disabled: true");
    expect(ficha).toContain("textContent: 'Histórico de alquileres'");
  });

  it('does not render the old rental sections inside the ficha', () => {
    expect(ficha.slice(0, ficha.indexOf('renderFichaHeader(asset) {'))).not.toContain('renderRentals');
    expect(ficha).not.toContain('Declarar nuevo alquiler');
  });

  it('summarizes the rental per currency without conversion', () => {
    const declaration = {
      status: 'active', tenants: [{ name: 'Bella Paloma' }],
      modalities: [
        { kind: 'locacion', status: 'active', currencyCode: 'ARS', startDate: '2026-07-01', endDate: '2029-06-30', totalAmount: 11797500,
          occurrences: [{ date: '2026-10-01', rentAmount: 11797500, currencyCode: 'ARS', remainingMinor: 0, remainingAmount: 0, status: 'collected' },
            { date: '2026-11-01', rentAmount: 11797500, currencyCode: 'ARS', remainingMinor: 1179750000, remainingAmount: 11797500, status: 'overdue' },
            { date: '2026-12-01', rentAmount: 11797500, currencyCode: 'ARS', remainingMinor: 1179750000, remainingAmount: 11797500, status: 'pending' }] },
        { kind: 'comodato', status: 'active', currencyCode: 'USD', startDate: '2026-07-01', endDate: '2029-06-30', totalAmount: 500,
          occurrences: [{ date: '2026-11-01', rentAmount: 500, currencyCode: 'USD', remainingMinor: 50000, remainingAmount: 500, status: 'overdue' },
            { date: '2026-12-01', rentAmount: 500, currencyCode: 'USD', remainingMinor: 50000, remainingAmount: 500, status: 'pending' }] }
      ]
    };
    const summary = page.rentalSummary(declaration, '2026-11-16');
    expect(summary.tenants).toEqual(['Bella Paloma']);
    expect(summary).toMatchObject({ from: '2026-07-01', to: '2029-06-30', nextCollection: '2026-12-01' });
    expect(summary.monthlyTotals).toEqual([{ currencyCode: 'ARS', amount: 11797500 }, { currencyCode: 'USD', amount: 500 }]);
    expect(summary.pendingTotals).toEqual([{ currencyCode: 'ARS', amount: 11797500 }, { currencyCode: 'USD', amount: 500 }]);
    expect(summary.composition.map(item => item.modality)).toEqual(['locacion', 'comodato']);
  });

  it('keeps the modal-independent behavior: the list "Ver" and "Ficha" buttons are intact', () => {
    expect(source).toContain("textContent: 'Ficha', onClick: () => this.showDetails(asset.id)");
    expect(source).toContain("textContent: 'Ver historial', onClick: () => this.showHistory(asset.id)");
  });
});
