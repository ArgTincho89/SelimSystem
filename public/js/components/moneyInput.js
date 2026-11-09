// Text input for money amounts (es-AR format). Exposes parsed Numbers; the API payloads stay unchanged.
const MoneyInput = {
  INVALID_MESSAGE: 'Importe inválido',

  digits(currency) {
    return typeof currencyDigits === 'function' ? currencyDigits(currency) : 2;
  },

  // Returns { empty, valid, value } for the given text.
  _read(text, currency, allowNegative) {
    let raw = String(text ?? '').replace(/\s/g, '');
    if (raw === '') return { empty: true, valid: true, value: null };
    let sign = 1;
    if (raw.startsWith('-')) {
      if (!allowNegative) return { empty: false, valid: false, value: null };
      sign = -1;
      raw = raw.slice(1);
    }
    const precision = this.digits(currency);
    let normalized = null;
    if (raw.includes(',')) {
      // The comma is the decimal separator; dots can only be thousands groups.
      const parts = raw.split(',');
      if (parts.length === 2 && /^(\d+|\d{1,3}(\.\d{3})+)?$/.test(parts[0]) && /^\d*$/.test(parts[1]) && (parts[0] !== '' || parts[1] !== '')) {
        normalized = `${parts[0].replace(/\./g, '') || '0'}.${parts[1] || '0'}`;
      }
    } else if (/^\d+$/.test(raw)) {
      normalized = raw;
    } else if (precision > 0 && new RegExp(`^\\d+\\.\\d{1,${precision}}$`).test(raw)) {
      normalized = raw;
    } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
      normalized = raw.replace(/\./g, '');
    }
    if (normalized === null) return { empty: false, valid: false, value: null };
    const factor = 10 ** precision;
    const value = sign * Math.round(Number(normalized) * factor) / factor;
    return Number.isFinite(value) ? { empty: false, valid: true, value } : { empty: false, valid: false, value: null };
  },

  // Parses es-AR text to a Number, or null when empty or invalid.
  parse(text, currency, options = {}) {
    return this._read(text, currency, options.allowNegative).value;
  },

  format(number, currency) {
    const digits = this.digits(currency);
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(number);
  },

  create({ currency = 'ARS', value = null, id, ariaLabel, allowNegative = false, required = false, placeholder, className = 'form-control' } = {}) {
    const el = document.createElement('input');
    el.type = 'text';
    el.className = className;
    el.setAttribute('inputmode', 'decimal');
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('data-money-input', '');
    el.setAttribute('data-currency', currency);
    if (allowNegative) el.setAttribute('data-allow-negative', 'true');
    if (id) el.id = id;
    if (ariaLabel) el.setAttribute('aria-label', ariaLabel);
    if (required) el.setAttribute('required', 'required');
    el.placeholder = placeholder || this.format(0, currency);
    if (value !== null && value !== undefined && value !== '') this.setValue(el, Number(value));
    // The text stays as typed while focused (no rewrite on focus, so selection and caret are kept);
    // it is only formatted on blur.
    el.addEventListener('blur', () => this.refresh(el));
    return el;
  },

  // Reads the current value: Number, or null when empty or invalid.
  value(el) {
    return this._read(el.value, el.getAttribute('data-currency'), el.hasAttribute('data-allow-negative')).value;
  },

  // Validates the field, shows or clears the inline message and returns true when usable.
  validate(el) {
    const parsed = this._read(el.value, el.getAttribute('data-currency'), el.hasAttribute('data-allow-negative'));
    this._mark(el, parsed.valid);
    return parsed.valid;
  },

  // True only when every given field passes validation (all are marked).
  validateAll(elements) {
    return elements.filter(Boolean).map(el => this.validate(el)).every(Boolean);
  },

  // Formats a valid value (blur behavior) or flags an invalid one.
  refresh(el) {
    const currency = el.getAttribute('data-currency');
    const parsed = this._read(el.value, currency, el.hasAttribute('data-allow-negative'));
    this._mark(el, parsed.valid);
    if (parsed.valid && !parsed.empty) el.value = this.format(parsed.value, currency);
  },

  setValue(el, number) {
    if (number === null || number === undefined || Number.isNaN(Number(number))) el.value = '';
    else el.value = this.format(Number(number), el.getAttribute('data-currency'));
    this._mark(el, true);
  },

  setCurrency(el, code) {
    const previous = this.value(el);
    el.setAttribute('data-currency', code);
    if (previous !== null) this.setValue(el, previous);
  },

  _mark(el, valid) {
    if (valid) el.removeAttribute('aria-invalid');
    else el.setAttribute('aria-invalid', 'true');
    const parent = el.parentNode;
    if (!parent || typeof parent.querySelector !== 'function') return;
    let message = el._moneyError;
    if (!valid) {
      if (!message) {
        message = document.createElement('small');
        message.className = 'money-input-error';
        message.setAttribute('role', 'alert');
        message.style.color = 'var(--danger, #c0392b)';
        message.textContent = this.INVALID_MESSAGE;
        el._moneyError = message;
      }
      if (message.parentNode !== parent) el.insertAdjacentElement('afterend', message);
    } else if (message && message.parentNode) {
      message.remove();
    }
  }
};
