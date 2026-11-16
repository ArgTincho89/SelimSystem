const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 4 Registrar pago contract', () => {
  const source = read('js/pages/obligations.js');
  const pay = source.slice(source.indexOf('  async pay(obligation, occurrence) {'), source.indexOf('  // Soft delete'));

  it('asks for the expense-like fields', () => {
    ['Importe pagado', "'Cuenta'", 'Fecha de pago', "'Categoría'", 'Medio de pago (opcional)', 'Título (opcional)', "'Notas'", 'Comprobante (opcional)'].forEach(label => {
      expect(pay).toContain(label);
    });
  });

  it('preselects the suggested payment method and sends title and notes', () => {
    expect(pay).toContain("context.suggestedPaymentMethodId || ''");
    expect(pay).toContain('title: payTitle.value.trim()');
    expect(pay).toContain('notes: payNotes.value.trim()');
    expect(pay).toContain('occurrence.title || obligation.title');
  });

  it('uploads the receipt after the payment and keeps the payment when the upload fails', () => {
    expect(pay.indexOf('API.obligations.pay(')).toBeLessThan(pay.indexOf('this.uploadReceipt(occurrence'));
    expect(pay).toContain('result.transaction?.id');
    expect(pay).toContain('El pago se registró, pero no se pudo adjuntar el comprobante');
    expect(source).toContain('API.documents.uploadTargets({ occurrenceId: occurrence.id, transactionId }, file)');
    expect(pay).toMatch(/await this\.refresh\(\);\s*\}\);/);
  });

  it('renames the row action to Registrar pago and drops "Pagar"', () => {
    expect(source).not.toContain("textContent: 'Pagar'");
    expect((source.match(/textContent: 'Registrar pago'/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('pays the oldest unpaid shown occurrence from the card', () => {
    const context = { localStorage: { getItem: () => null }, Intl, Date, Object, Set, Map, String, Array, Number };
    vm.createContext(context);
    vm.runInContext(`${read('js/utils/format.js')}\n${source}\nthis.page = ObligationsPage;`, context);
    const shown = [
      { id: 'paid', date: '2026-09-10', status: 'paid' },
      { id: 'old', date: '2026-10-10', status: 'overdue' },
      { id: 'new', date: '2026-11-10', status: 'expected' }
    ];
    expect(context.page.oldestPayable(shown).id).toBe('old');
    expect(context.page.oldestPayable([shown[0]])).toBeNull();
    expect(source).toContain('const payable = this.oldestPayable(occurrences);');
    expect(source).toContain('this.pay(item, payable)');
  });
});
