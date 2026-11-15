const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

function loadForm() {
  const context = { localStorage: { getItem: () => null }, Intl, Date, Object, Set, Map, String, Array, Number };
  vm.createContext(context);
  vm.runInContext(`${read('js/utils/format.js')}\n${read('js/components/transactionForm.js')}\nthis.form = TransactionForm;`, context);
  return context.form;
}

describe('Evolutivo 4 Transferencia transaction type', () => {
  const source = read('js/components/transactionForm.js');
  const home = read('js/pages/home.js');
  const form = loadForm();

  it('adds the "Transferencia" type button for new transactions only', () => {
    expect(source).toContain("['expense', 'income', 'refund', ...(isEdit ? [] : ['transfer'])]");
    expect(source).toContain("transfer: 'Transferencia'");
    expect(source).toContain('dataset: { type }');
    expect(source).toContain('const transfer = isEdit ? null : TransactionForm.renderTransferFields(');
  });

  it('asks for source, destination, amount, received, date, title and note', () => {
    ['Cuenta de salida', 'Cuenta de ingreso', "'Monto'", 'Monto recibido', "group('Fecha'", 'Título (opcional)', 'Nota (opcional)'].forEach(text => {
      expect(source).toContain(text);
    });
    expect(source).toContain('max: getToday()');
    expect(source).toContain('MoneyInput.create({ currency: currencyOf(from), id: \'transfer-amount\'');
  });

  it('posts a posted transfer without fee or allocations, title as reference and note as notes', () => {
    const payload = form.buildTransferPayload({
      fromAccountId: 'a', toAccountId: 'b', sentAmount: 100, receivedAmount: 90, fecha: '2026-11-15', title: '  Ahorro ', notes: ' nota ', needsReceived: false
    });
    expect(payload).toEqual({ fromAccountId: 'a', toAccountId: 'b', sentAmount: 100, fecha: '2026-11-15', status: 'posted', reference: 'Ahorro', notes: 'nota' });
    expect(payload).not.toHaveProperty('feeAmount');
    expect(payload).not.toHaveProperty('allocations');
    expect(payload).not.toHaveProperty('receivedAmount');
    const converted = form.buildTransferPayload({ fromAccountId: 'a', toAccountId: 'b', sentAmount: 100, receivedAmount: 90, fecha: '2026-11-15', needsReceived: true });
    expect(converted.receivedAmount).toBe(90);
    expect(source).toContain('API.transfers.create(result.payload)');
    expect(source).toContain('if (selectedType === \'transfer\') return saveTransfer();');
  });

  it('asks for the received amount only when the currencies differ', () => {
    const accounts = [{ id: 'a', currency: 'ARS' }, { id: 'b', currency: 'ARS' }, { id: 'c', currency: 'USD' }];
    expect(form.transferNeedsReceived(accounts, 'a', 'b')).toBe(false);
    expect(form.transferNeedsReceived(accounts, 'a', 'c')).toBe(true);
    expect(form.transferNeedsReceived(accounts, 'a', 'missing')).toBe(false);
    expect(form.transferNeedsReceived(undefined, 'a', 'b')).toBe(false);
  });

  it('keeps the regular money inputs isolated from the transfer fields', () => {
    expect(source).toContain("(regularBody || form).querySelectorAll('[data-money-input]')");
  });

  it('removes the Home "Movimientos entre cuentas" block', () => {
    expect(home).not.toContain('renderEconomicContext');
    expect(home).not.toContain('Movimientos entre cuentas');
    expect(home).not.toContain('Movimiento entre cuentas');
    expect(home).not.toContain('Pendiente, fuera de los importes reales');
  });

  it('shows the transfer title and note in the details dialog', () => {
    expect(home).toContain("create('strong', { textContent: tx.titulo })");
    expect(home).toContain('Nota: ${tx.notes}');
  });
});
