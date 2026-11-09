const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 3 S1 money input contract', () => {
  it('loads MoneyInput after format.js and caches it in the service worker', () => {
    const html = read('index.html');
    expect(html.indexOf('/js/utils/format.js')).toBeLessThan(html.indexOf('/js/components/moneyInput.js'));
    const sw = read('sw.js');
    expect(sw).toContain("'/js/components/moneyInput.js'");
    expect(sw).toContain("'/js/pages/settings.js'");
    expect(Number(sw.match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(32);
  });

  it('declares the money input attributes', () => {
    const source = read('js/components/moneyInput.js');
    expect(source).toContain("el.type = 'text'");
    expect(source).toContain("'inputmode', 'decimal'");
    expect(source).toContain("'data-money-input'");
    expect(source).toContain("'data-currency'");
  });

  it('uses MoneyInput for transaction form amounts', () => {
    const form = read('js/components/transactionForm.js');
    expect(form).toContain("id: 'transaction-amount'");
    expect(form.match(/MoneyInput\.create\(/g).length).toBeGreaterThanOrEqual(4);
    expect(form).not.toMatch(/placeholder: '0\.00'/);
  });

  it('keeps non-money numbers as number inputs', () => {
    const form = read('js/components/transactionForm.js');
    expect(form).toContain("id: 'transaction-iva'");
    expect(form).toMatch(/type: 'number',\s+step: '0\.01',\s+min: '0',\s+max: '100'/);
    expect(form).toContain("id: 'transaction-installments-count'");
    expect(read('js/pages/settings.js')).toContain("id: 'alert-lead', className: 'form-control', type: 'number'");
  });

  it('uses MoneyInput on home filters, obligations and settings', () => {
    const home = read('js/pages/home.js');
    expect(home.match(/MoneyInput\.create\(/g)).toHaveLength(2);
    const obligations = read('js/pages/obligations.js');
    expect(obligations.match(/this\.moneyField\(/g)).toHaveLength(3);
    const settings = read('js/pages/settings.js');
    ['opening-balance', 'transfer-sent', 'transfer-received', 'transfer-fee'].forEach(id => {
      expect(settings).toContain(`MoneyInput.create({ id: '${id}'`);
    });
    expect(settings).toContain("ariaLabel: 'Importe del ingreso asignado'");
  });

  it('does not read valueAsNumber or parse the text of money inputs directly', () => {
    const files = ['js/components/transactionForm.js', 'js/pages/home.js', 'js/pages/obligations.js', 'js/pages/settings.js'];
    files.forEach(file => {
      const source = read(file);
      expect(source).not.toContain('valueAsNumber');
      expect(source).not.toMatch(/Number\((amount|sent|received|fee)\.value\)/);
      expect(source).not.toMatch(/parseFloat\((amountInput|amountAInput|amountBInput|minInput|maxInput)\.value\)/);
    });
    expect(read('js/pages/settings.js')).toContain('MoneyInput.value(sent)');
    expect(read('js/pages/obligations.js')).toContain('MoneyInput.value(amount)');
  });

  it('updates the e2e page objects for the money fields', () => {
    const page = fs.readFileSync(path.join(__dirname, '../../e2e/pages/TransactionForm.ts'), 'utf8');
    expect(page).toContain("locator('#transaction-amount').fill");
    expect(page).toContain('[data-money-input]');
    expect(page).toContain("input[type=\"number\"]').fill(String(iva))");
  });
});
