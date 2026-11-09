const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public/js', file), 'utf8');

function loadMoneyInput() {
  const context = { Intl, Number, Math, String, Object, RegExp, Set, Map, Array, localStorage: { getItem: () => null } };
  vm.createContext(context);
  vm.runInContext(`${read('utils/format.js')}\n${read('components/moneyInput.js')}\nthis.MoneyInput = MoneyInput;`, context);
  return context.MoneyInput;
}

const fakeInput = (text, currency = 'ARS', extra = {}) => {
  const attrs = { 'data-currency': currency, ...extra };
  return {
    value: text,
    getAttribute: name => (name in attrs ? attrs[name] : null),
    hasAttribute: name => name in attrs,
    setAttribute: (name, value) => { attrs[name] = value; },
    removeAttribute: name => { delete attrs[name]; },
    parentNode: null
  };
};

describe('Evolutivo 3 S1 MoneyInput', () => {
  const MoneyInput = loadMoneyInput();

  it('formats on blur using es-AR separators', () => {
    const cases = [['211392', '211.392,00'], ['211.392,50', '211.392,50'], ['1234,5', '1.234,50']];
    cases.forEach(([typed, shown]) => {
      const el = fakeInput(typed);
      MoneyInput.refresh(el);
      expect(el.value).toBe(shown);
    });
  });

  it('parses dot and comma forms', () => {
    expect(MoneyInput.parse('12.5', 'ARS')).toBe(12.5);
    expect(MoneyInput.parse('211392.00', 'ARS')).toBe(211392);
    expect(MoneyInput.parse('1.234', 'ARS')).toBe(1234);
    expect(MoneyInput.parse('1.234.567', 'ARS')).toBe(1234567);
    expect(MoneyInput.parse('211.392,50', 'ARS')).toBe(211392.5);
    expect(MoneyInput.parse('0,5', 'ARS')).toBe(0.5);
  });

  it('returns null for empty or invalid text', () => {
    expect(MoneyInput.parse('', 'ARS')).toBeNull();
    expect(MoneyInput.parse('   ', 'ARS')).toBeNull();
    expect(MoneyInput.parse('12,3,4', 'ARS')).toBeNull();
    expect(MoneyInput.parse('abc', 'ARS')).toBeNull();
    expect(MoneyInput.parse('12.34.5', 'ARS')).toBeNull();
  });

  it('flags invalid text and treats empty as valid', () => {
    const bad = fakeInput('12,3,4');
    expect(MoneyInput.validate(bad)).toBe(false);
    expect(bad.hasAttribute('aria-invalid')).toBe(true);
    expect(MoneyInput.INVALID_MESSAGE).toBe('Importe inválido');
    const empty = fakeInput('');
    expect(MoneyInput.validate(empty)).toBe(true);
    expect(MoneyInput.value(empty)).toBeNull();
    expect(MoneyInput.validateAll([fakeInput('1'), bad])).toBe(false);
  });

  it('uses zero decimals for JPY', () => {
    const el = fakeInput('1500', 'JPY');
    MoneyInput.refresh(el);
    expect(el.value).toBe('1.500');
    expect(MoneyInput.parse('12.5', 'JPY')).toBeNull();
  });

  it('accepts negatives only with allowNegative', () => {
    expect(MoneyInput.parse('-50', 'ARS')).toBeNull();
    expect(MoneyInput.parse('-50,25', 'ARS', { allowNegative: true })).toBe(-50.25);
    expect(MoneyInput.value(fakeInput('-10', 'ARS'))).toBeNull();
    expect(MoneyInput.value(fakeInput('-10', 'ARS', { 'data-allow-negative': 'true' }))).toBe(-10);
  });

  it('value() returns a Number and setValue/setCurrency reformat', () => {
    const el = fakeInput('');
    MoneyInput.setValue(el, 211392);
    expect(el.value).toBe('211.392,00');
    expect(typeof MoneyInput.value(el)).toBe('number');
    expect(MoneyInput.value(el)).toBe(211392);
    MoneyInput.setCurrency(el, 'JPY');
    expect(el.value).toBe('211.392');
    MoneyInput.setValue(el, null);
    expect(el.value).toBe('');
  });
});
