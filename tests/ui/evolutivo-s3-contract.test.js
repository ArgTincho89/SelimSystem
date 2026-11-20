const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo S3 UI contract', () => {
  it('exposes the installments API client', () => {
    const source = read('js/api.js');
    ['installments:', 'createPlan', '/installments/occurrences?month=', 'postOccurrence', 'cancelOccurrence'].forEach(text => expect(source).toContain(text));
  });

  // Evolutivo 10: the form creates "Crédito" installments as transactions; legacy plans stay in Inicio and Avisos.
  it('no longer creates credit-card plans from the transaction form', () => {
    const source = read('js/components/transactionForm.js');
    expect(source).not.toContain('API.installments.createPlan');
    ['Cuotas', 'Interés (%)'].forEach(label => expect(source).toContain(label));
    expect(source).toContain('data.creditInstallments = collected');
    expect(source).toContain("data.attributionAssetId = targets[0].split(':')[1]");
  });

  it('shows scheduled installments in the transactions page as non-total items', () => {
    const source = read('js/pages/home.js');
    expect(source).toContain('API.installments.occurrences(this.currentMonth)');
    expect(source).toContain('renderInstallmentSection');
    expect(source).toContain('no incluidas en los totales');
    expect(source).toContain('installment-item');
    expect(source).toContain('Contabilizar cuota');
    expect(read('css/components.css')).toContain('.installment-item');
  });

  it('bumps the service worker cache name to v21 or later', () => {
    const version = Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1]);
    expect(version).toBeGreaterThanOrEqual(21);
  });
});
