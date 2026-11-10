const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 3 S4b rental declaration modal UI contract', () => {
  const modal = read('js/pages/rentalDeclaration.js');
  const assets = read('js/pages/assets.js');
  const format = vm.runInNewContext(`${read('js/utils/format.js')}; ({ modalityLabel, totalWithIva })`, {});

  it('offers the three modality checkboxes and the shared blocks once', () => {
    ['Contrato de locación', 'Comodato', 'Mutuo'].forEach(label => expect(modal).toContain(`'${label}'`));
    expect(modal).toContain("'Declaración de alquiler'");
    expect(modal.match(/renderObligations\(/g)).toHaveLength(1);
    expect(modal.match(/'Notas'/g).length).toBeGreaterThanOrEqual(1);
    expect(modal.match(/this\.field\(body, 'Notas'/g)).toHaveLength(1);
    expect(modal).toContain("this.field(body, 'Inquilino'");
  });

  it('renders the per-modality fields and IVA only for locación', () => {
    ['Fecha de inicio', 'Fecha de finalización', 'Monto original', 'Moneda', 'Frecuencia de ajuste (meses)', 'Criterio de ajuste'].forEach(label => expect(modal).toContain(`'${label}'`));
    expect(modal.match(/'IVA \(%\)'/g).length).toBeGreaterThanOrEqual(1);
    expect(modal).toContain("if (kind === 'locacion') {");
    expect(modal.indexOf("'IVA (%)'")).toBeGreaterThan(modal.indexOf("if (kind === 'locacion')"));
    expect(modal).toContain('Total con IVA:');
  });

  it('uses MoneyInput for the amount and keeps IVA and frequency as numbers', () => {
    expect(modal).toContain('MoneyInput.create');
    expect(modal).toContain('MoneyInput.value(amount)');
    expect(modal).toContain("type: 'number', min: '0', max: '100'");
    expect(modal).toContain("type: 'number', min: '1', step: '1'");
  });

  it('validates an empty selection and confirms before saving or discarding', () => {
    expect(modal).toContain('Seleccioná al menos una modalidad');
    expect(modal).toContain('Estás por modificar la declaración de alquiler');
    expect(modal).toContain('Confirmar y guardar');
    expect(modal).toContain('Se descartarán los datos cargados');
    expect(modal).not.toContain('window.confirm');
    expect(modal).not.toMatch(/[^.\w]confirm\(/);
  });

  it('surfaces server errors inline and supports the read-only view', () => {
    expect(modal).toContain('showError(error.message)');
    expect(modal).toContain("role: 'alert'");
    expect(modal).toContain('Ver declaración de alquiler');
    expect(modal).toContain('control.disabled = true');
  });

  it('sends the declaration through the API pass-through', () => {
    expect(modal).toContain('API.rentals.declarations.update(');
    expect(modal).toContain('API.rentals.declarations.create(');
    const api = read('js/api.js');
    ['list(assetId)', 'create(data)', 'update(id, data)', 'end(id)'].forEach(signature => expect(api).toContain(signature));
  });

  it('wires the actions in the assets page and loads the script', () => {
    expect(assets).toContain('Declarar alquiler');
    expect(assets).toContain('Editar alquiler');
    expect(assets).toContain('Finalizar alquiler');
    expect(assets).toContain('API.rentals.declarations.end(');
    expect(assets).not.toContain('showRentalContractModal');
    expect(assets).toContain('options.allowTenant');
    expect(read('index.html')).toContain('/js/pages/rentalDeclaration.js');
    expect(read('sw.js')).toContain('/js/pages/rentalDeclaration.js');
  });

  it('labels rent occurrences by modality and never shows the raw code', () => {
    expect(format.modalityLabel('locacion')).toBe('Locación');
    expect(format.modalityLabel('comodato')).toBe('Comodato');
    expect(format.modalityLabel('mutuo')).toBe('Mutuo');
    expect(format.modalityLabel('rental')).toBe('');
    expect(format.modalityLabel(undefined)).toBe('');
    expect(assets).toContain('modalityLabel(item.modality)');
    expect(read('js/pages/alerts.js')).toContain('modalityLabel(alert.modality)');
  });

  it('computes the IVA total added to the original amount', () => {
    expect(format.totalWithIva(100000, 21, 'ARS')).toBe(121000);
    expect(format.totalWithIva(100000, '', 'ARS')).toBe(100000);
    expect(format.totalWithIva(100.5, 10.5, 'ARS')).toBe(111.05);
    expect(format.totalWithIva('x', 21)).toBeNull();
  });

  it('keeps fillAmount on the first money field and bumps the cache to v35 or later', () => {
    const page = fs.readFileSync(path.join(__dirname, '../../e2e/pages/TransactionForm.ts'), 'utf8');
    expect(page).toContain('#transaction-amount');
    expect(Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(35);
  });
});
