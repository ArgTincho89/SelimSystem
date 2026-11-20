const TransactionForm = {
  // "Medio de pago" values (stored as-is in `paymentMethod`). "Crédito" is only for expenses; "Cheque" not for refunds.
  PAYMENT_METHODS: ['Transferencia', 'Efectivo', 'Débito', 'Crédito', 'Cheque'],
  METHODS_BY_TYPE: {
    expense: ['Transferencia', 'Efectivo', 'Débito', 'Crédito', 'Cheque'],
    income: ['Transferencia', 'Efectivo', 'Débito', 'Cheque'],
    refund: ['Transferencia', 'Efectivo', 'Débito']
  },
  CHEQUE_MAX: 24,
  CREDIT_MAX: 36,
  CHEQUE_NUMBER_MAX: 30,

  // [value, label] options of the "Medio de pago" select for a type; a legacy value is kept as an extra option.
  paymentMethodOptions(type, legacyValue = '') {
    const methods = TransactionForm.METHODS_BY_TYPE[type] || [];
    return [['', 'Seleccionar'], ...methods.map(method => [method, method]), ...(legacyValue ? [[legacyValue, `${legacyValue} (anterior)`]] : [])];
  },

  minorFactor(currency) {
    return 10 ** (typeof MoneyInput !== 'undefined' && MoneyInput.digits ? MoneyInput.digits(currency) : 2);
  },

  // Even split in minor units; the last part absorbs the rounding remainder.
  splitEvenly(totalMinor, count) {
    const base = Math.floor(totalMinor / count);
    return Array.from({ length: count }, (_, index) => (index === count - 1 ? totalMinor - base * (count - 1) : base));
  },

  // Same day of month `months` later, clamped to the last day of that month (Jan 31 + 1 → Feb 28/29).
  addMonthsClamped(date, months) {
    const [year, month, day] = String(date).split('-').map(Number);
    const index = year * 12 + (month - 1) + months;
    const targetYear = Math.floor(index / 12);
    const targetMonth = index % 12;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  },

  validChequeNumber(value) {
    const text = String(value || '').trim();
    return Boolean(text) && text.length <= TransactionForm.CHEQUE_NUMBER_MAX && /^[A-Za-z0-9-]+$/.test(text);
  },

  // Credit purchase: total = amount × (1 + interest/100), split evenly (minor units, last absorbs rounding).
  creditPreview(amount, count, interestPercent, currency) {
    const factor = TransactionForm.minorFactor(currency);
    const baseMinor = Math.round(Number(amount) * factor);
    const basisPoints = Math.round(Number(interestPercent || 0) * 100);
    const totalMinor = Math.round(baseMinor * (10000 + basisPoints) / 10000);
    const parts = TransactionForm.splitEvenly(totalMinor, count);
    return { total: totalMinor / factor, installment: parts[0] / factor, last: parts[parts.length - 1] / factor, count };
  },

  // Opens the dialog at the top: focus on the active type button (not "Título") and every scroll container at 0.
  openAtTop(form, typeButtons = []) {
    const target = typeButtons.find(button => button.classList.contains('active')) || typeButtons[0];
    if (target) {
      try { target.focus({ preventScroll: true }); } catch { target.focus(); }
    }
    for (let node = form; node && node.nodeType === 1; node = node.parentNode) node.scrollTop = 0;
  },

  // "Cuotas" (1–24) and one row per cheque: "Vencimiento cuota Nº x", "Monto" and "Nº cheque".
  // setTotal() re-splits the amount evenly; collect(total) -> { rows } | { error }.
  renderChequeFields({ currency = 'ARS' } = {}) {
    let activeCurrency = currency;
    let lastTotal = null;
    let baseDate = '';
    const root = create('div', { className: 'form-group cheque-installments', dataset: { chequeInstallments: 'true' } });
    const countInput = create('input', { className: 'form-control', type: 'number', min: '1', max: String(TransactionForm.CHEQUE_MAX), step: '1', value: '1', id: 'transaction-cheque-count' });
    const rowsHost = create('div', { className: 'cheque-rows', style: { display: 'grid', gap: '8px', marginTop: '8px' } });
    root.append(create('label', { textContent: 'Cuotas', for: countInput.id }), countInput, rowsHost);
    const rows = [];
    const count = () => {
      const value = Number(countInput.value);
      return Number.isInteger(value) ? Math.min(TransactionForm.CHEQUE_MAX, Math.max(1, value)) : 1;
    };
    const prefill = () => {
      if (!(lastTotal > 0)) return;
      const factor = TransactionForm.minorFactor(activeCurrency);
      TransactionForm.splitEvenly(Math.round(lastTotal * factor), rows.length).forEach((minor, index) => MoneyInput.setValue(rows[index].amount, minor / factor));
    };
    const render = () => {
      const wanted = count();
      while (rows.length > wanted) rows.pop().element.remove();
      while (rows.length < wanted) {
        const number = rows.length + 1;
        const due = create('input', { className: 'form-control', type: 'date', id: `cheque-due-${number}`, value: baseDate ? TransactionForm.addMonthsClamped(baseDate, number - 1) : '' });
        const amount = MoneyInput.create({ currency: activeCurrency, id: `cheque-amount-${number}`, ariaLabel: `Monto de la cuota Nº ${number}` });
        const chequeNumber = create('input', { className: 'form-control', type: 'text', maxlength: String(TransactionForm.CHEQUE_NUMBER_MAX), id: `cheque-number-${number}`, placeholder: '0001-23456789', autocomplete: 'off' });
        const cell = (label, control) => create('div', { className: 'cheque-cell', style: { flex: '1 1 140px', minWidth: '0' } }, [create('label', { textContent: label, for: control.id }), control]);
        const element = create('div', { className: 'cheque-row', dataset: { chequeRow: String(number) }, style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, [
          cell(`Vencimiento cuota Nº ${number}`, due), cell('Monto', amount), cell('Nº cheque', chequeNumber)
        ]);
        rows.push({ element, due, amount, chequeNumber });
        rowsHost.appendChild(element);
      }
      prefill();
    };
    on(countInput, 'input', render);
    on(countInput, 'change', render);
    render();
    return {
      element: root,
      countInput,
      rows,
      setCount(value) { countInput.value = String(value); render(); },
      setTotal(total, date) {
        lastTotal = total;
        if (date) baseDate = date;
        rows.forEach((row, index) => { if (!row.due.value && baseDate) row.due.value = TransactionForm.addMonthsClamped(baseDate, index); });
        prefill();
      },
      setCurrency(code) {
        activeCurrency = code;
        rows.forEach(row => MoneyInput.setCurrency(row.amount, code));
      },
      collect(total) {
        const factor = TransactionForm.minorFactor(activeCurrency);
        const result = [];
        let sumMinor = 0;
        for (const [index, row] of rows.entries()) {
          const number = index + 1;
          if (!row.due.value) return { error: `Indicá el vencimiento de la cuota Nº ${number}` };
          const amount = MoneyInput.value(row.amount);
          if (!(amount > 0)) return { error: `El monto de la cuota Nº ${number} debe ser mayor a cero` };
          if (!TransactionForm.validChequeNumber(row.chequeNumber.value)) return { error: `Indicá el Nº de cheque de la cuota Nº ${number} (hasta ${TransactionForm.CHEQUE_NUMBER_MAX} caracteres: letras, números y guiones)` };
          sumMinor += Math.round(amount * factor);
          result.push({ dueDate: row.due.value, amount, chequeNumber: row.chequeNumber.value.trim() });
        }
        if (sumMinor !== Math.round(Number(total) * factor)) return { error: 'La suma de las cuotas debe ser igual al monto' };
        return { rows: result };
      }
    };
  },

  // "Cuotas" (1–36), "Interés (%)" and a live preview "N cuotas de $X (total $Y)". collect() -> { count, interestPercent } | { error }.
  renderCreditFields({ currency = 'ARS' } = {}) {
    let activeCurrency = currency;
    let lastTotal = null;
    const root = create('div', { className: 'form-group credit-installments', dataset: { creditInstallments: 'true' } });
    const countInput = create('input', { className: 'form-control', type: 'number', min: '1', max: String(TransactionForm.CREDIT_MAX), step: '1', value: '1', id: 'transaction-installments-count' });
    const interestInput = create('input', { className: 'form-control', type: 'number', min: '0', step: '0.01', value: '0', id: 'transaction-installments-interest' });
    const preview = create('p', { className: 'account-status-note', dataset: { creditPreview: 'true' }, 'aria-live': 'polite' });
    const note = create('small', { textContent: 'Con más de una cuota, cada cuota se registra como gasto en el mismo día de los meses siguientes (la primera, el mes próximo).' });
    root.append(
      create('label', { textContent: 'Cuotas', for: countInput.id }), countInput,
      create('label', { textContent: 'Interés (%)', for: interestInput.id }), interestInput,
      preview, note
    );
    const read = () => {
      const count = Number(countInput.value);
      const interestRaw = String(interestInput.value || '').trim();
      const interestPercent = interestRaw === '' ? 0 : Number(interestRaw);
      if (!Number.isInteger(count) || count < 1 || count > TransactionForm.CREDIT_MAX) return { error: `Las cuotas deben ser entre 1 y ${TransactionForm.CREDIT_MAX}` };
      if (!Number.isFinite(interestPercent) || interestPercent < 0 || interestPercent > 1000) return { error: 'El interés debe ser un número mayor o igual a 0' };
      return { count, interestPercent };
    };
    const refresh = () => {
      const values = read();
      if (values.error || !(lastTotal > 0)) { preview.textContent = values.error || ''; return; }
      const result = TransactionForm.creditPreview(lastTotal, values.count, values.interestPercent, activeCurrency);
      preview.textContent = `${values.count} ${values.count === 1 ? 'cuota' : 'cuotas'} de ${formatearMoneda(result.installment, activeCurrency)} (total ${formatearMoneda(result.total, activeCurrency)})`;
    };
    on(countInput, 'input', refresh);
    on(interestInput, 'input', refresh);
    refresh();
    return {
      element: root,
      countInput,
      interestInput,
      preview,
      setTotal(total) { lastTotal = total; refresh(); },
      setCurrency(code) { activeCurrency = code; refresh(); },
      collect: read
    };
  },

  // True when the two chosen accounts exist and use different currencies (the received amount is then asked).
  transferNeedsReceived(accounts, fromId, toId) {
    const from = (accounts || []).find(account => account.id === fromId);
    const to = (accounts || []).find(account => account.id === toId);
    return Boolean(from && to && from.currency !== to.currency);
  },

  // Payload of POST /transfers: posted, no fee and no allocations. Title goes to `reference`, the note to `notes`.
  buildTransferPayload({ fromAccountId, toAccountId, sentAmount, receivedAmount, fecha, title, notes, needsReceived }) {
    return {
      fromAccountId, toAccountId, sentAmount, fecha, status: 'posted',
      ...(needsReceived ? { receivedAmount } : {}),
      reference: String(title || '').trim(), notes: String(notes || '').trim()
    };
  },

  // "Atribución del movimiento": a first select "Bien" (assets only) and a second, optional one with what belongs to
  // the chosen asset. Obligations without an asset are reached through the "Obligaciones sin bien" entry.
  NO_ASSET: '__no-asset__',
  PAYMENT_HINT: 'Se registrará como pago de este vencimiento',
  EDIT_PAYMENT_HINT: 'Para registrar el pago de un movimiento existente usá Registrar pago',

  // "2026-03-05" -> "05/03/2026".
  dueDateLabel(date) {
    const [year, month, day] = String(date || '').split('-');
    return day ? `${day}/${month}/${year}` : String(date || '');
  },

  // [value, label] options of "Bien". "Obligaciones sin bien" only for expenses and when such obligations exist.
  attributionAssetOptions(assets = [], obligations = [], type = 'expense') {
    const options = [['', 'Sin atribución'], ...assets.map(asset => [asset.id, asset.name])];
    if (type === 'expense' && obligations.some(item => !item.assetId)) options.push([TransactionForm.NO_ASSET, 'Obligaciones sin bien']);
    return options;
  },

  // { value, label, disabled, dueDate } options of "Obligación o período (opcional)" for the chosen asset. Expenses list the
  // obligations of the asset and their pending due dates; incomes list its rental contracts and rent periods. Due dates
  // only become payments on a new expense: when editing they stay informational and only the stored one (`keep`) is enabled.
  attributionDetailOptions({ assetId, type, obligations = [], rentals = [], isEdit = false, keep = '' }) {
    if (!assetId) return [];
    const noAsset = assetId === TransactionForm.NO_ASSET;
    const options = [{ value: '', label: noAsset ? 'Elegí una obligación' : 'Solo el bien', disabled: false }];
    if (type === 'expense') {
      obligations.filter(item => (noAsset ? !item.assetId : item.assetId === assetId)).forEach(item => {
        options.push({ value: `obligation:${item.id}`, label: `Obligación · ${item.title}`, disabled: false });
        (item.occurrences || []).forEach(occurrence => {
          const value = `obligationOccurrence:${item.id}:${occurrence.id}`;
          const pending = Number(occurrence.remainingAmount) || 0;
          if ((occurrence.status === 'cancelled' || pending <= 0) && value !== keep) return;
          options.push({
            value, disabled: isEdit && value !== keep, dueDate: true,
            label: `Vencimiento · ${item.title} · ${TransactionForm.dueDateLabel(occurrence.date)} · pendiente ${formatearMoneda(pending, occurrence.currencyCode || item.currencyCode || 'ARS')}`
          });
        });
      });
    }
    if (type === 'income' && !noAsset) {
      rentals.filter(item => item.assetId === assetId).forEach(item => {
        options.push({ value: `contract:${item.id}`, label: `Contrato · ${item.tenants?.map(tenant => tenant.name).join(', ') || item.asset?.name || 'Alquiler'}`, disabled: false });
        (item.occurrences || []).forEach(occurrence => options.push({ value: `rentOccurrence:${item.id}:${occurrence.id}`, label: `Período de alquiler · ${TransactionForm.dueDateLabel(occurrence.date)}`, disabled: false }));
      });
    }
    return options;
  },

  // Hint under the detail select: a due date chosen on a new expense becomes a payment; when editing it cannot.
  attributionHint({ type, isEdit, detail = '', hasDueDates = false }) {
    if (type !== 'expense') return '';
    if (isEdit) return hasDueDates ? TransactionForm.EDIT_PAYMENT_HINT : '';
    return String(detail).startsWith('obligationOccurrence:') ? TransactionForm.PAYMENT_HINT : '';
  },

  // Stored allocation -> { assetId, detail } of the two selects.
  attributionSelection(record = {}) {
    const detail = record.occurrenceId ? `obligationOccurrence:${record.obligationId}:${record.occurrenceId}`
      : record.rentOccurrenceId ? `rentOccurrence:${record.contractId}:${record.rentOccurrenceId}`
        : record.obligationId ? `obligation:${record.obligationId}`
          : record.contractId ? `contract:${record.contractId}` : '';
    const assetId = record.assetId || (record.obligationId ? TransactionForm.NO_ASSET : '');
    return { assetId, detail };
  },

  // Rows [{ assetId, detail, amount }] -> { allocations } (payloads of the allocations API) or { error }.
  // Rows without a target or without an amount are skipped, as before.
  allocationPayloads(entries = []) {
    const allocations = [];
    for (const entry of entries) {
      if (!entry.assetId || entry.amount === null || entry.amount === undefined) continue;
      if (entry.assetId === TransactionForm.NO_ASSET && !entry.detail) return { error: 'Elegí la obligación o el vencimiento de «Obligaciones sin bien»' };
      const payload = entry.assetId === TransactionForm.NO_ASSET ? {} : { assetId: entry.assetId };
      const [kind, id, childId] = String(entry.detail || '').split(':');
      if (kind === 'obligation') payload.obligationId = id;
      if (kind === 'obligationOccurrence') Object.assign(payload, { obligationId: id, occurrenceId: childId });
      if (kind === 'contract') payload.contractId = id;
      if (kind === 'rentOccurrence') Object.assign(payload, { contractId: id, rentOccurrenceId: childId });
      allocations.push({ ...payload, amount: entry.amount });
    }
    return { allocations };
  },

  // A new expense whose attribution points at a due date is saved as a payment of it ("Registrar pago" rules).
  // The whole movement is the payment: one due date per expense, as the only attribution and for the full amount.
  // Returns {} (no payment), { obligationId, occurrenceId } or { error }.
  obligationPaymentFor({ type, isEdit, entries = [], total, currency = 'ARS' }) {
    if (type !== 'expense' || isEdit) return {};
    const used = entries.filter(entry => entry.assetId);
    const payments = used.filter(entry => String(entry.detail || '').startsWith('obligationOccurrence:'));
    if (!payments.length) return {};
    if (payments.length > 1) return { error: 'Un gasto puede pagar un solo vencimiento: registrá un gasto por cada vencimiento' };
    if (used.length > 1) return { error: 'El pago de un vencimiento debe ser la única atribución del gasto' };
    const factor = TransactionForm.minorFactor(currency);
    if (!(payments[0].amount > 0) || Math.round(payments[0].amount * factor) !== Math.round(Number(total) * factor)) {
      return { error: 'El importe atribuido al vencimiento debe ser igual al monto: el gasto completo se registra como pago' };
    }
    const [, obligationId, occurrenceId] = payments[0].detail.split(':');
    return { obligationId, occurrenceId };
  },

  async show(onSave, transaction = null, options = {}) {
    const [categories, accounts, transactions, assets, obligations, rentals, owners, associationData] = await Promise.all([
      API.categories.list(), API.accounts.list(), API.transactions.list(), API.assets.list(),
      API.obligations.list(), API.rentals.list(),
      API.owners.list().catch(() => []),
      transaction && !transaction.isRecurringInstance ? API.finance.associations(transaction.id).catch(() => null) : Promise.resolve(null)
    ]);
    const isEdit = !!transaction;
    let selectedType = transaction?.tipo || 'expense';
    let selectedCategoryId = transaction?.categoryId || (categories.length > 0 ? categories[0].id : null);
    // Wrapper of the regular fields; the transfer sub-form replaces it when "Transferencia" is selected.
    let regularBody = null;
    let transferBody = null;

    const form = create('div');

    const typeSelector = create('div', { className: 'type-selector' });
    ['expense', 'income', 'refund', ...(isEdit ? [] : ['transfer'])].forEach(type => {
      const labels = { expense: 'Gasto', income: 'Ingreso', refund: 'Reembolso', transfer: 'Transferencia' };
      const btn = create('button', {
        className: `type-btn ${type === selectedType ? 'active' : ''}`,
        type: 'button',
        textContent: labels[type],
        dataset: { type },
        'aria-pressed': String(type === selectedType),
        disabled: Boolean(transaction?.isRecurringInstance)
      });
      on(btn, 'click', () => {
        selectedType = type;
        $$('.type-btn', form).forEach(b => b.classList.remove('active'));
        $$('.type-btn', form).forEach(b => b.setAttribute('aria-pressed', 'false'));
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        updateCategoryVisibility();
        updateClasifVisibility();
        refreshPaymentMethodOptions();
        updateInstallmentVisibility();
        updateTransferMode();
        refreshAllocationRows();
      });
      typeSelector.appendChild(btn);
    });
    form.appendChild(typeSelector);

    const accountGroup = create('div', { className: 'form-group' });
    const accountLabel = create('label', { textContent: 'Cuenta' });
    const accountSelect = create('select', { className: 'form-control', id: 'transaction-account' });
    const activeAccounts = accounts.filter(account => account.activo);
    accountTreeOptions(activeAccounts).forEach(({ account, label }) => accountSelect.appendChild(create('option', { value: account.id, textContent: label })));
    const defaultAccount = transaction?.accountId || options.accountId || activeAccounts.find(account => account.primary)?.id;
    if (defaultAccount) accountSelect.value = defaultAccount;
    accountLabel.setAttribute('for', accountSelect.id);
    accountGroup.appendChild(accountLabel);
    accountGroup.appendChild(accountSelect);
    accountGroup.appendChild(create('p', { className: 'account-status-note', textContent: 'El importe se interpreta en la moneda de la cuenta. Cambiar de cuenta no convierte el importe.' }));
    form.appendChild(accountGroup);

    // "Medio de pago": a fixed list stored as text. A legacy free-text value is kept as an extra option.
    const paymentMethodGroup = create('div', { className: 'form-group' });
    const paymentMethodSelect = create('select', { className: 'form-control', id: 'transaction-payment-method' });
    const legacyPaymentMethod = transaction?.paymentMethod && !TransactionForm.PAYMENT_METHODS.includes(transaction.paymentMethod) ? transaction.paymentMethod : '';
    let chosenPaymentMethod = transaction?.paymentMethod || '';
    function refreshPaymentMethodOptions() {
      const options = TransactionForm.paymentMethodOptions(selectedType, legacyPaymentMethod);
      paymentMethodSelect.replaceChildren(...options.map(([value, label]) => create('option', { value, textContent: label })));
      if (!options.some(([value]) => value === chosenPaymentMethod)) chosenPaymentMethod = '';
      paymentMethodSelect.value = chosenPaymentMethod;
    }
    on(paymentMethodSelect, 'change', () => {
      chosenPaymentMethod = paymentMethodSelect.value;
      updateInstallmentVisibility();
    });
    refreshPaymentMethodOptions();
    paymentMethodGroup.append(create('label', { textContent: 'Medio de pago', for: paymentMethodSelect.id }), paymentMethodSelect);
    form.appendChild(paymentMethodGroup);

    // Installments of a new transaction: cheque rows (Gasto/Ingreso + Cheque) or a credit purchase (Gasto + Crédito).
    // Appended after the date field (below) so "Monto" stays the first numeric input of the form.
    const accountCurrency = () => activeAccounts.find(account => account.id === accountSelect.value)?.currency || 'ARS';
    const chequeFields = TransactionForm.renderChequeFields({ currency: accountCurrency() });
    const creditFields = TransactionForm.renderCreditFields({ currency: accountCurrency() });
    chequeFields.element.style.display = 'none';
    creditFields.element.style.display = 'none';
    const chequeMode = () => !isEdit && ['expense', 'income'].includes(selectedType) && chosenPaymentMethod === 'Cheque';
    const creditMode = () => !isEdit && selectedType === 'expense' && chosenPaymentMethod === 'Crédito';
    function updateInstallmentVisibility() {
      chequeFields.element.style.display = chequeMode() ? '' : 'none';
      creditFields.element.style.display = creditMode() ? '' : 'none';
      updateRecurringVisibility();
    }

    const allocationSection = create('section', { className: 'form-group', style: { borderTop: '1px solid var(--border-color)', paddingTop: '10px' } });
    allocationSection.appendChild(create('strong', { textContent: 'Atribución del movimiento' }));
    allocationSection.appendChild(create('small', { textContent: 'Las asignaciones describen el destino del importe; no crean movimientos ni alteran los totales. En un gasto nuevo, elegir un vencimiento lo registra como pago de ese vencimiento.' }));
    const allocationRows = create('div', { style: { display: 'grid', gap: '10px', marginTop: '8px' } });
    let allocationSeq = 0;
    // One row: "Bien" + "Importe" + "Quitar", and below "Obligación o período (opcional)" once a bien is chosen.
    // The fields wrap, so they stack at phone width.
    const addAllocationRow = (record = {}) => {
      const initial = TransactionForm.attributionSelection(record);
      const number = allocationSeq += 1;
      const row = create('div', { className: 'attribution-row', dataset: { attributionRow: String(number) }, style: { display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'flex-end' } });
      const assetSelect = create('select', { className: 'form-control', id: `attribution-asset-${number}` });
      const detailSelect = create('select', { className: 'form-control', id: `attribution-detail-${number}` });
      const hint = create('small', { className: 'account-status-note', dataset: { attributionHint: 'true' }, 'aria-live': 'polite' });
      const amount = MoneyInput.create({ currency: accountCurrency(), value: record.amount != null ? record.amount : null, placeholder: 'Importe', ariaLabel: 'Importe atribuido', id: `attribution-amount-${number}` });
      const remove = create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Quitar', onClick: () => row.remove() });
      const cell = (label, control, flex) => create('div', { style: { flex, minWidth: '0' } }, [create('label', { textContent: label, for: control.id }), control]);
      const detailGroup = create('div', { dataset: { attributionDetail: 'true' }, style: { flex: '1 1 100%', minWidth: '0' } }, [
        create('label', { textContent: 'Obligación o período (opcional)', for: detailSelect.id }), detailSelect, hint
      ]);
      row.append(cell('Bien', assetSelect, '1 1 200px'), cell('Importe', amount, '1 1 120px'), remove, detailGroup);
      let detailOptions = [];
      const updateHint = () => {
        hint.textContent = TransactionForm.attributionHint({ type: selectedType, isEdit, detail: detailSelect.value, hasDueDates: detailOptions.some(option => option.dueDate) });
        hint.style.display = hint.textContent ? '' : 'none';
      };
      const renderAssets = current => {
        const assetOptions = TransactionForm.attributionAssetOptions(assets, obligations, selectedType);
        assetSelect.replaceChildren(...assetOptions.map(([value, label]) => create('option', { value, textContent: label })));
        assetSelect.value = assetOptions.some(([value]) => value === current) ? current : '';
      };
      const renderDetail = keepValue => {
        detailOptions = TransactionForm.attributionDetailOptions({ assetId: assetSelect.value, type: selectedType, obligations, rentals, isEdit, keep: initial.detail });
        detailSelect.replaceChildren(...detailOptions.map(option => create('option', { value: option.value, textContent: option.label, disabled: Boolean(option.disabled) })));
        detailSelect.value = detailOptions.some(option => option.value === keepValue && !option.disabled) ? keepValue : '';
        detailGroup.style.display = assetSelect.value ? '' : 'none';
        updateHint();
      };
      on(assetSelect, 'change', () => renderDetail(''));
      on(detailSelect, 'change', () => {
        // A due date on a new expense is paid with the whole movement: the amount follows the "Monto" of the form.
        if (TransactionForm.attributionHint({ type: selectedType, isEdit, detail: detailSelect.value }) === TransactionForm.PAYMENT_HINT && MoneyInput.value(amount) === null && MoneyInput.value(amountInput) > 0) {
          MoneyInput.setValue(amount, MoneyInput.value(amountInput));
        }
        updateHint();
      });
      renderAssets(initial.assetId);
      renderDetail(initial.detail);
      row._allocationFields = { asset: assetSelect, detail: detailSelect, amount, hint, refresh: () => { renderAssets(assetSelect.value); renderDetail(detailSelect.value); } };
      allocationRows.appendChild(row);
    };
    // Rows of the form as { assetId, detail, amount } (amount null when empty).
    const allocationEntries = () => [...allocationRows.children].filter(row => row._allocationFields).map(row => ({
      assetId: row._allocationFields.asset.value, detail: row._allocationFields.detail.value, amount: MoneyInput.value(row._allocationFields.amount)
    }));
    // The type changes what the detail select offers (obligations for expenses, rentals for incomes).
    function refreshAllocationRows() {
      [...allocationRows.children].forEach(row => row._allocationFields?.refresh());
    }
    // Idempotency key of the payment a new expense may register (a double click replays instead of paying twice).
    const paymentKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    (associationData?.allocations || []).forEach(addAllocationRow);
    const addAllocation = create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: '+ Añadir atribución', onClick: () => addAllocationRow() });
    const allocationCompleteLabel = create('label', { className: 'checkbox-label' });
    const allocationComplete = create('input', { type: 'checkbox', className: 'form-checkbox', checked: (associationData?.allocations || []).some(item => item.complete) });
    allocationCompleteLabel.append(allocationComplete, document.createTextNode(' Asignación completa (debe cubrir el total)'));
    allocationSection.append(allocationRows, addAllocation, allocationCompleteLabel);
    if (transaction?.isRecurringInstance) allocationSection.style.display = 'none';
    form.appendChild(allocationSection);

    const categoryGroup = create('div', { className: 'form-group' });
    const categoryLabel = create('label', { textContent: 'Categoría' });
    const categorySelect = create('select', { className: 'form-control' });

    const parents = categories.filter(c => !c.parentId);
    const childrenMap = {};
    categories.forEach(c => {
      if (c.parentId) {
        if (!childrenMap[c.parentId]) childrenMap[c.parentId] = [];
        childrenMap[c.parentId].push(c);
      }
    });

    parents.forEach(cat => {
      categorySelect.appendChild(create('option', { value: cat.id, textContent: cat.nombre }));
      (childrenMap[cat.id] || []).forEach(child => {
        categorySelect.appendChild(create('option', { value: child.id, textContent: `  └ ${child.nombre}` }));
      });
    });

    if (selectedCategoryId) categorySelect.value = selectedCategoryId;
    categorySelect.id = 'transaction-category';
    categoryLabel.setAttribute('for', categorySelect.id);
    categoryGroup.appendChild(categoryLabel);
    categoryGroup.appendChild(categorySelect);
    form.appendChild(categoryGroup);

    const refundSourceGroup = create('div', { className: 'form-group' });
    const refundSourceLabel = create('label', { textContent: 'Gasto de origen (opcional)', for: 'refund-source' });
    const refundSourceSelect = create('select', { className: 'form-control', id: 'refund-source' });
    refundSourceSelect.appendChild(create('option', { value: '', textContent: 'Sin vincular a un gasto' }));
    transactions.filter(item => item.tipo === 'expense').forEach(item => {
      const option = create('option', { value: item.id });
      const label = `${item.titulo} · ${item.fecha} · ${formatearMoneda(item.monto, item.currencyCode || 'EUR')}`;
      option.dataset.publicValue = label;
      option.textContent = localStorage.getItem('pate_hide_home_stats') === 'true' ? `${item.titulo} · ${item.fecha} · ••••••` : label;
      refundSourceSelect.appendChild(option);
    });
    refundSourceSelect.value = transaction?.refundSourceId || '';
    on(refundSourceSelect, 'change', () => {
      const source = transactions.find(item => item.id === refundSourceSelect.value);
      if (source?.accountId && activeAccounts.some(account => account.id === source.accountId)) {
        accountSelect.value = source.accountId;
        updateAmountCurrency();
      }
    });
    refundSourceGroup.appendChild(refundSourceLabel);
    refundSourceGroup.appendChild(refundSourceSelect);
    form.appendChild(refundSourceGroup);

    function updateCategoryVisibility() {
      categoryGroup.style.display = (selectedType === 'income') ? 'none' : 'block';
      refundSourceGroup.style.display = selectedType === 'refund' ? 'block' : 'none';
    }
    function updateClasifVisibility() {
      clasifGroup.style.display = selectedType === 'income' || selectedType === 'expense' ? 'block' : 'none';
      const validClassifications = selectedType === 'income' ? ['A', 'B', 'Mixto'] : ['fijo', 'variable'];
      const currentClassification = validClassifications.includes(clasifSelect.value)
        ? clasifSelect.value
        : (selectedType === 'income' ? 'A' : 'variable');
      clasifSelect.value = currentClassification;
      Object.entries(classificationCheckboxes).forEach(([value, checkbox]) => {
        checkbox.parentElement.style.display = validClassifications.includes(value) ? 'inline-flex' : 'none';
        checkbox.checked = value === currentClassification;
      });
      incomeSplitGroup.style.display = selectedType === 'income' && currentClassification === 'Mixto' ? 'block' : 'none';
      const incomeIva = selectedType === 'income' && (currentClassification === 'A' || currentClassification === 'Mixto');
      ivaGroup.style.display = incomeIva || selectedType === 'expense' ? 'block' : 'none';
      ivaLabel.textContent = selectedType === 'expense' ? 'IVA (%) de la factura — crédito fiscal' : 'IVA (%) — débito fiscal';
      ivaHolderGroup.style.display = selectedType === 'expense' ? 'block' : 'none';
    }
    updateCategoryVisibility();

    const titleGroup = create('div', { className: 'form-group' });
    const titleLabel = create('label', { textContent: 'Título (opcional)', for: 'transaction-title' });
    titleGroup.appendChild(titleLabel);
    const titleInput = create('input', {
      className: 'form-control',
      type: 'text',
      placeholder: 'Si se deja vacío, se usa el nombre de la categoría',
      value: transaction?.titulo || '',
      id: 'transaction-title'
    });
    titleGroup.appendChild(titleInput);
    form.appendChild(titleGroup);

    const amountGroup = create('div', { className: 'form-group' });
    const amountLabel = create('label', { textContent: 'Monto', for: 'transaction-amount' });
    amountGroup.appendChild(amountLabel);
    const initialCurrency = activeAccounts.find(item => item.id === accountSelect.value)?.currency || 'EUR';
    const amountInput = MoneyInput.create({ currency: initialCurrency, value: transaction?.monto ?? null, id: 'transaction-amount' });
    const updateAmountCurrency = () => {
      const account = activeAccounts.find(item => item.id === accountSelect.value);
      amountLabel.textContent = `Monto (${account?.currency || 'EUR'})`;
      MoneyInput.setCurrency(amountInput, account?.currency || 'EUR');
      (regularBody || form).querySelectorAll('[data-money-input]').forEach(input => MoneyInput.setCurrency(input, account?.currency || 'EUR'));
    };
    on(accountSelect, 'change', updateAmountCurrency);
    updateAmountCurrency();
    amountGroup.appendChild(amountInput);
    form.appendChild(amountGroup);

    const incomeSplitGroup = create('div', { className: 'form-group', style: { display: 'none' } });
    incomeSplitGroup.appendChild(create('label', { textContent: 'Desglose Mixto' }));
    const incomeSplitRow = create('div', { style: { display: 'flex', gap: '8px' } });
    const amountAInput = MoneyInput.create({ currency: initialCurrency, placeholder: 'A', ariaLabel: 'Importe A' });
    const amountBInput = MoneyInput.create({ currency: initialCurrency, placeholder: 'B', ariaLabel: 'Importe B' });
    incomeSplitRow.appendChild(amountAInput);
    incomeSplitRow.appendChild(amountBInput);
    incomeSplitGroup.appendChild(incomeSplitRow);
    form.appendChild(incomeSplitGroup);

    // Auto-fill B with the remaining total while typing A in Mixto mode.
    on(amountAInput, 'input', () => {
      if (clasifSelect.value !== 'Mixto') return;
      const total = MoneyInput.value(amountInput);
      const partA = MoneyInput.value(amountAInput);
      if (total === null || total <= 0 || partA === null || partA < 0) return;
      const remainder = Math.round((total - partA) * 100) / 100;
      MoneyInput.setValue(amountBInput, remainder >= 0 ? remainder : null);
    });

    const ivaGroup = create('div', { className: 'form-group', style: { display: 'none' } });
    const ivaLabel = create('label', { textContent: 'IVA (%)' });
    ivaGroup.appendChild(ivaLabel);
    const ivaInput = create('input', {
      className: 'form-control',
      type: 'number',
      step: '0.01',
      min: '0',
      max: '100',
      placeholder: '21',
      id: 'transaction-iva'
    });
    ivaGroup.querySelector('label').setAttribute('for', ivaInput.id);
    ivaInput.value = transaction?.ivaPorcentaje ?? '';
    ivaGroup.appendChild(ivaInput);
    // Expenses only: the owner the invoice is issued to; that owner receives the credit VAT.
    const ivaHolderGroup = create('div', { style: { display: 'none', marginTop: '8px' } });
    const ivaHolderLabel = create('label', { textContent: 'Factura a nombre de', for: 'transaction-iva-holder' });
    const ivaHolderSelect = create('select', { className: 'form-control', id: 'transaction-iva-holder' });
    ivaHolderSelect.appendChild(create('option', { value: '', textContent: 'Titular de la cuenta' }));
    (owners || []).filter(owner => (owner.roles || ['owner']).includes('owner')).forEach(owner => ivaHolderSelect.appendChild(create('option', { value: owner.id, textContent: owner.name })));
    if (transaction?.ivaHolderId && ![...ivaHolderSelect.options].some(option => option.value === transaction.ivaHolderId)) {
      ivaHolderSelect.appendChild(create('option', { value: transaction.ivaHolderId, textContent: transaction.ivaHolderName || 'Titular archivado' }));
    }
    ivaHolderSelect.value = transaction?.ivaHolderId || '';
    ivaHolderGroup.appendChild(ivaHolderLabel);
    ivaHolderGroup.appendChild(ivaHolderSelect);
    ivaGroup.appendChild(ivaHolderGroup);
    form.appendChild(ivaGroup);

    const dateGroup = create('div', { className: 'form-group' });
    const dateLabel = create('label', { textContent: 'Fecha', for: 'transaction-date' });
    dateGroup.appendChild(dateLabel);
    const dateInput = create('input', {
      className: 'form-control',
      type: 'date',
      value: transaction?.fecha || options.defaultDate || getToday(),
      id: 'transaction-date'
    });
    dateGroup.appendChild(dateInput);
    form.appendChild(dateGroup);
    form.appendChild(chequeFields.element);
    form.appendChild(creditFields.element);
    // Cheque rows and the credit preview follow the amount, the date and the account currency.
    const syncInstallments = () => {
      chequeFields.setCurrency(accountCurrency());
      creditFields.setCurrency(accountCurrency());
      chequeFields.setTotal(MoneyInput.value(amountInput), dateInput.value);
      creditFields.setTotal(MoneyInput.value(amountInput));
    };
    on(amountInput, 'input', syncInstallments);
    on(amountInput, 'change', syncInstallments);
    on(dateInput, 'change', syncInstallments);
    on(accountSelect, 'change', syncInstallments);
    syncInstallments();

    const clasifGroup = create('div', { className: 'form-group' });
    clasifGroup.appendChild(create('label', { textContent: 'Clasificación' }));
    const clasifSelect = create('select', { className: 'form-control', style: { display: 'none' } });
    clasifSelect.id = 'transaction-classification';
    clasifGroup.querySelector('label').setAttribute('for', clasifSelect.id);
    const classificationCheckboxes = {};
    [['A', 'A'], ['B', 'B'], ['Mixto', 'Mixto'], ['variable', 'Variable'], ['fijo', 'Fijo']].forEach(([value, label]) => {
      clasifSelect.appendChild(create('option', { value, textContent: label }));
    });
    const classificationOptions = create('div', { className: 'classification-options', style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } });
    [['A', 'A'], ['B', 'B'], ['Mixto', 'Mixto'], ['variable', 'Variable'], ['fijo', 'Fijo']].forEach(([value, label]) => {
      const optionLabel = create('label', { className: 'checkbox-label' });
      const checkbox = create('input', { type: 'checkbox', className: 'form-checkbox' });
      checkbox.checked = value === (selectedType === 'income' ? (transaction?.clasificacion || 'A') : (transaction?.clasificacion || 'variable'));
      on(checkbox, 'change', () => {
        if (checkbox.checked) {
          Object.entries(classificationCheckboxes).forEach(([otherValue, otherCheckbox]) => {
            if (otherValue !== value) otherCheckbox.checked = false;
          });
          clasifSelect.value = value;
        } else if (!Object.values(classificationCheckboxes).some(input => input.checked)) {
          checkbox.checked = true;
        }
        updateClasifVisibility();
      });
      classificationCheckboxes[value] = checkbox;
      optionLabel.appendChild(checkbox);
      optionLabel.appendChild(document.createTextNode(` ${label}`));
      classificationOptions.appendChild(optionLabel);
    });
    clasifGroup.appendChild(classificationOptions);
    clasifGroup.appendChild(clasifSelect);
    form.appendChild(clasifGroup);
    if (transaction?.clasificacion === 'Mixto') {
      MoneyInput.setValue(amountAInput, transaction.montoA ?? null);
      MoneyInput.setValue(amountBInput, transaction.montoB ?? null);
    }
    on(clasifSelect, 'change', updateClasifVisibility);
    updateClasifVisibility();

    const recurringGroup = create('div', { className: 'form-group recurring-section' });
    const recurringLabel = create('label', { className: 'checkbox-label' });
    const recurringCheckbox = create('input', { type: 'checkbox', className: 'form-checkbox' });
    recurringLabel.appendChild(recurringCheckbox);
    recurringLabel.appendChild(document.createTextNode(' Recurrente'));
    recurringGroup.appendChild(recurringLabel);

    const freqGroup = create('div', { className: 'recurring-options', style: { display: 'none', marginTop: '12px' } });

    const freqSelectGroup = create('div', { className: 'form-group' });
    freqSelectGroup.appendChild(create('label', { textContent: 'Frecuencia' }));
    const freqSelect = create('select', { className: 'form-control' });
    freqSelect.appendChild(create('option', { value: 'monthly', textContent: 'Mensual' }));
    freqSelect.appendChild(create('option', { value: 'bimonthly', textContent: 'Bimensual' }));
    freqSelect.appendChild(create('option', { value: 'quarterly', textContent: 'Trimestral' }));
    freqSelect.appendChild(create('option', { value: 'semiannual', textContent: 'Semestral' }));
    freqSelect.appendChild(create('option', { value: 'annual', textContent: 'Anual' }));
    freqSelectGroup.appendChild(freqSelect);
    freqSelect.id = 'transaction-frequency';
    freqSelectGroup.querySelector('label').setAttribute('for', freqSelect.id);
    freqGroup.appendChild(freqSelectGroup);

    const endDateGroup = create('div', { className: 'form-group' });
    endDateGroup.appendChild(create('label', { textContent: 'Fecha fin' }));
    const endDateInput = create('input', {
      className: 'form-control',
      type: 'date',
      id: 'transaction-end-date'
    });
    endDateGroup.querySelector('label').setAttribute('for', endDateInput.id);
    endDateGroup.appendChild(endDateInput);

    const indeterminadoLabel = create('label', { className: 'checkbox-label', style: { marginTop: '8px' } });
    const indeterminadoCheckbox = create('input', { type: 'checkbox', className: 'form-checkbox' });
    indeterminadoLabel.appendChild(indeterminadoCheckbox);
    indeterminadoLabel.appendChild(document.createTextNode(' Indeterminado'));
    endDateGroup.appendChild(indeterminadoLabel);

    on(indeterminadoCheckbox, 'change', () => {
      endDateInput.disabled = indeterminadoCheckbox.checked;
      endDateInput.value = '';
      endDateInput.style.opacity = indeterminadoCheckbox.checked ? '0.4' : '1';
    });

    freqGroup.appendChild(endDateGroup);

    recurringGroup.appendChild(freqGroup);
    form.appendChild(recurringGroup);

    let occurrenceScope = null;
    if (transaction?.isRecurringInstance) {
      const scopeGroup = create('div', { className: 'form-group' });
      scopeGroup.appendChild(create('label', { textContent: 'Aplicar cambios' }));
      occurrenceScope = create('select', { className: 'form-control' });
      occurrenceScope.appendChild(create('option', { value: 'occurrence', textContent: 'Solo esta ocurrencia' }));
      occurrenceScope.appendChild(create('option', { value: 'future', textContent: 'Esta ocurrencia y las futuras' }));
      scopeGroup.appendChild(occurrenceScope);
      form.appendChild(scopeGroup);
    }

    let recurringEnabled = transaction?.recurrente || false;
    if (recurringEnabled) {
      recurringCheckbox.checked = true;
      freqGroup.style.display = 'block';
      if (transaction?.frecuencia) freqSelect.value = transaction.frecuencia;
      if (transaction?.fechaFin) {
        endDateInput.value = transaction.fechaFin;
      } else {
        indeterminadoCheckbox.checked = true;
        endDateInput.disabled = true;
        endDateInput.style.opacity = '0.4';
      }
    }
    on(recurringCheckbox, 'change', () => {
      recurringEnabled = recurringCheckbox.checked;
      freqGroup.style.display = recurringEnabled ? 'block' : 'none';
    });

    // Recurrence is not available for installments (cheque or credit).
    function updateRecurringVisibility() {
      const available = selectedType === 'expense' && !chequeMode() && !creditMode();
      recurringGroup.style.display = available ? 'block' : 'none';
      if (!available && recurringEnabled) {
        recurringEnabled = false;
        recurringCheckbox.checked = false;
        freqGroup.style.display = 'none';
      }
    }
    updateRecurringVisibility();

    const commentsGroup = create('div', { className: 'form-group' });
    const commentsLabel = create('label', { textContent: 'Comentarios' });
    const commentsInput = create('textarea', {
      className: 'form-control',
      rows: '3',
      id: 'transaction-comments'
    });
    commentsLabel.setAttribute('for', commentsInput.id);
    commentsInput.value = transaction?.comments ?? '';
    commentsGroup.appendChild(commentsLabel);
    commentsGroup.appendChild(commentsInput);
    form.appendChild(commentsGroup);

    // Receipts of the movement: the existing ones (edit) with "Ver documento" / "Descargar", and new files to attach.
    const attachment = DocumentViewer.fileField({ label: 'Adjuntar comprobante (opcional)', multiple: true });
    if (isEdit && (transaction.originalId || transaction.id)) {
      const existingDocuments = create('div', { dataset: { existingDocuments: 'true' } });
      form.appendChild(existingDocuments);
      DocumentViewer.listInto(existingDocuments, { transactionId: transaction.originalId || transaction.id });
    }
    form.appendChild(attachment.element);

    const footer = create('div', { style: { display: 'flex', gap: '8px' } });
    const cancelBtn = create('button', {
      className: 'btn btn-ghost',
      textContent: 'Cancelar',
      onClick: () => Modal.hide()
    });
    const saveBtn = create('button', {
      className: 'btn btn-primary',
      textContent: 'Guardar'
    });
    on(saveBtn, 'click', async () => {
      if (selectedType === 'transfer') return saveTransfer();
      let titulo = titleInput.value.trim();
      if (!titulo && selectedType !== 'income') {
        const catOption = categorySelect.options[categorySelect.selectedIndex];
        titulo = catOption ? catOption.textContent.trim() : '';
      }

      const moneyInputs = [amountInput, ...(selectedType === 'income' && clasifSelect.value === 'Mixto' ? [amountAInput, amountBInput] : []), ...allocationRows.querySelectorAll('[data-money-input]')];
      if (!MoneyInput.validateAll(moneyInputs)) return showToast('Importe inválido', 'error');

      const data = {
        tipo: selectedType,
        titulo,
        monto: MoneyInput.value(amountInput) ?? NaN,
        fecha: dateInput.value,
        comments: commentsInput.value
      };

      if (selectedType === 'expense' || selectedType === 'income') {
        data.clasificacion = clasifSelect.value;
      }

      if (selectedType === 'income' && clasifSelect.value === 'Mixto') {
        data.montoA = MoneyInput.value(amountAInput) ?? NaN;
        data.montoB = MoneyInput.value(amountBInput) ?? NaN;
      }

      if (selectedType === 'expense' || (selectedType === 'income' && (clasifSelect.value === 'A' || clasifSelect.value === 'Mixto'))) {
        const ivaRaw = ivaInput.value.trim();
        if (ivaRaw === '') {
          data.ivaPorcentaje = null;
        } else {
          const ivaValue = parseFloat(ivaRaw);
          if (!Number.isFinite(ivaValue) || ivaValue < 0 || ivaValue > 100) {
            return showToast('El IVA debe estar entre 0 y 100', 'error');
          }
          data.ivaPorcentaje = ivaValue;
        }
        if (selectedType === 'expense') data.ivaHolderId = data.ivaPorcentaje > 0 ? (ivaHolderSelect.value || null) : null;
      }

      if (selectedType !== 'income') {
        data.categoryId = categorySelect.value;
      }
      if (selectedType === 'refund') data.refundSourceId = refundSourceSelect.value || null;
      data.accountId = accountSelect.value;
      data.paymentMethod = paymentMethodSelect.value || '';

      if (selectedType === 'expense' && recurringEnabled) {
        data.recurrente = true;
        data.frecuencia = freqSelect.value;
        if (!indeterminadoCheckbox.checked && endDateInput.value) {
          data.fechaFin = endDateInput.value;
        }
      }

      if (!data.monto || data.monto <= 0) return showToast('El monto debe ser positivo', 'error');
      const attachmentError = attachment.error();
      if (attachmentError) return showToast(attachmentError, 'error');
      if (selectedType === 'income' && data.clasificacion === 'Mixto' && (!Number.isFinite(data.montoA) || !Number.isFinite(data.montoB) || Math.round((data.montoA + data.montoB) * 100) !== Math.round(data.monto * 100))) {
        return showToast('Los importes A y B deben sumar el monto total', 'error');
      }

      const installmentMode = chequeMode() || creditMode();
      if (installmentMode) {
        if (data.clasificacion === 'Mixto') return showToast('La clasificación Mixto no admite cuotas', 'error');
        // Installments only take one asset-level attribution (no obligation, due date or rental detail).
        const targets = allocationEntries().filter(entry => entry.assetId).map(entry => (entry.detail || entry.assetId === TransactionForm.NO_ASSET ? `detail:${entry.detail}` : `asset:${entry.assetId}`));
        if (targets.some(value => !value.startsWith('asset:')) || targets.length > 1) return showToast('Las cuotas solo admiten la atribución a un bien', 'error');
        if (targets[0]) data.attributionAssetId = targets[0].split(':')[1];
        const collected = chequeMode() ? chequeFields.collect(data.monto) : creditFields.collect();
        if (collected.error) return showToast(collected.error, 'error');
        if (chequeMode()) data.chequeInstallments = collected.rows;
        else data.creditInstallments = collected;
      }

      const allocationResult = TransactionForm.allocationPayloads(allocationEntries());
      if (allocationResult.error) return showToast(allocationResult.error, 'error');
      // Second payment path: a new expense attributed to a due date is registered as a payment of it.
      const payment = TransactionForm.obligationPaymentFor({ type: selectedType, isEdit, entries: allocationEntries(), total: data.monto, currency: accountCurrency() });
      if (payment.error) return showToast(payment.error, 'error');
      if (payment.occurrenceId) {
        if (data.recurrente) return showToast('El pago de un vencimiento no puede ser recurrente', 'error');
        if (!String(data.comments || '').trim()) return showToast('Los comentarios son obligatorios para registrar el pago de un vencimiento', 'error');
        // An empty title takes the due date title, as in "Registrar pago".
        data.titulo = titleInput.value.trim();
        data.obligationPayment = { occurrenceId: payment.occurrenceId, idempotencyKey: paymentKey };
      }

      try {
        let savedTransactionId;
        if (isEdit) {
          if (transaction.isRecurringInstance && occurrenceScope?.value === 'occurrence') {
            await API.transactions.updateOccurrence(transaction.originalId, transaction.fecha, data);
          } else {
            if (transaction.isRecurringInstance) {
              data.fecha = transaction.originalDate || transaction.fecha;
              data.effectiveFromDate = transaction.fecha;
            }
            await API.transactions.update(transaction.originalId || transaction.id, data);
          }
          savedTransactionId = transaction.originalId || transaction.id;
        } else {
          const created = await API.transactions.create(data);
          savedTransactionId = created.id;
        }
        // A payment carries no movement allocation (it would block "Revertir pago"): the payment link attributes it.
        if (!transaction?.isRecurringInstance && selectedType !== 'refund' && !installmentMode && !payment.occurrenceId) {
          await API.finance.setAllocations(savedTransactionId, { allocations: allocationResult.allocations, complete: allocationComplete.checked });
        }
        if (attachment.files().length && savedTransactionId) {
          // Receipts of a payment also belong to its due date, as with "Registrar pago".
          const uploaded = payment.occurrenceId
            ? await DocumentViewer.uploadAll(attachment.files(), { transactionId: savedTransactionId, occurrenceId: payment.occurrenceId })
            : await DocumentViewer.uploadAll(attachment.files(), { transactionId: savedTransactionId });
          DocumentViewer.reportFailures(uploaded.failed, 'El movimiento');
        }
        if (onSave) await onSave();
        Modal.hide();
        showToast(isEdit ? 'Transacción actualizada' : installmentMode ? 'Cuotas guardadas' : payment.occurrenceId ? 'Pago del vencimiento registrado' : 'Transacción guardada');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Wraps the regular fields and adds the transfer sub-form next to them (new transactions only).
    regularBody = create('div');
    [...form.children].filter(child => child !== typeSelector).forEach(child => regularBody.appendChild(child));
    form.appendChild(regularBody);
    const transfer = isEdit ? null : TransactionForm.renderTransferFields(activeAccounts, { defaultAccountId: defaultAccount, dateValue: dateInput.value });
    transferBody = transfer?.element || null;
    if (transferBody) {
      transferBody.style.display = 'none';
      form.appendChild(transferBody);
    }
    updateInstallmentVisibility();
    function updateTransferMode() {
      if (!transferBody) return;
      const isTransfer = selectedType === 'transfer';
      regularBody.style.display = isTransfer ? 'none' : '';
      transferBody.style.display = isTransfer ? '' : 'none';
    }
    async function saveTransfer() {
      const result = transfer.collect();
      if (result.error) return showToast(result.error, 'error');
      try {
        await API.transfers.create(result.payload);
        if (onSave) await onSave();
        Modal.hide();
        showToast('Transferencia guardada');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    Modal.show(isEdit ? 'Editar transacción' : 'Nueva transacción', form, { footer });
    TransactionForm.openAtTop(form, [...typeSelector.children]);
  },

  // Transfer sub-form: source and destination accounts, amount, received amount (only when the currencies
  // differ), date, title and note. Returns { element, collect() } where collect() -> { payload } | { error }.
  renderTransferFields(accounts, { defaultAccountId, dateValue } = {}) {
    const root = create('div', { className: 'transfer-fields' });
    const group = (label, control, id) => {
      if (id) control.id = id;
      root.appendChild(create('div', { className: 'form-group' }, [create('label', { textContent: label, for: control.id }), control]));
    };
    const accountSelect = id => {
      const select = create('select', { className: 'form-control' });
      accountTreeOptions(accounts).forEach(({ account, label }) => select.appendChild(create('option', { value: account.id, textContent: label })));
      select.id = id;
      return select;
    };
    const from = accountSelect('transfer-from');
    const to = accountSelect('transfer-to');
    if (defaultAccountId) from.value = defaultAccountId;
    to.value = (accounts.find(account => account.id !== from.value) || {}).id || '';
    group('Cuenta de salida', from);
    group('Cuenta de ingreso', to);
    const currencyOf = select => accounts.find(account => account.id === select.value)?.currency || 'ARS';
    const amount = MoneyInput.create({ currency: currencyOf(from), id: 'transfer-amount', ariaLabel: 'Monto a transferir' });
    const amountLabel = create('label', { textContent: 'Monto', for: 'transfer-amount' });
    root.appendChild(create('div', { className: 'form-group' }, [amountLabel, amount]));
    const received = MoneyInput.create({ currency: currencyOf(to), id: 'transfer-received', ariaLabel: 'Monto recibido' });
    const receivedLabel = create('label', { textContent: 'Monto recibido', for: 'transfer-received' });
    const receivedGroup = create('div', { className: 'form-group', style: { display: 'none' } }, [receivedLabel, received]);
    root.appendChild(receivedGroup);
    const date = create('input', { className: 'form-control', type: 'date', value: dateValue || getToday(), max: getToday() });
    group('Fecha', date, 'transfer-date');
    const title = create('input', { className: 'form-control', type: 'text', maxlength: '120', placeholder: 'Título del movimiento (opcional)' });
    group('Título (opcional)', title, 'transfer-title');
    const notes = create('textarea', { className: 'form-control', rows: '3', maxlength: '1000' });
    group('Nota (opcional)', notes, 'transfer-notes');
    const sync = () => {
      const needsReceived = TransactionForm.transferNeedsReceived(accounts, from.value, to.value);
      receivedGroup.style.display = needsReceived ? '' : 'none';
      amountLabel.textContent = `Monto (${currencyOf(from)})`;
      receivedLabel.textContent = `Monto recibido (${currencyOf(to)})`;
      MoneyInput.setCurrency(amount, currencyOf(from));
      MoneyInput.setCurrency(received, currencyOf(to));
    };
    on(from, 'change', sync);
    on(to, 'change', sync);
    sync();
    const collect = () => {
      if (!from.value || !to.value || from.value === to.value) return { error: 'Seleccioná dos cuentas distintas' };
      const needsReceived = TransactionForm.transferNeedsReceived(accounts, from.value, to.value);
      if (!MoneyInput.validateAll(needsReceived ? [amount, received] : [amount])) return { error: 'Importe inválido' };
      const sentAmount = MoneyInput.value(amount);
      const receivedAmount = MoneyInput.value(received);
      if (!sentAmount || sentAmount <= 0) return { error: 'El monto debe ser positivo' };
      if (needsReceived && (!receivedAmount || receivedAmount <= 0)) return { error: 'Indicá el monto recibido' };
      if (!date.value || date.value > getToday()) return { error: 'La fecha no puede ser futura' };
      return {
        payload: TransactionForm.buildTransferPayload({
          fromAccountId: from.value, toAccountId: to.value, sentAmount, receivedAmount, fecha: date.value,
          title: title.value, notes: notes.value, needsReceived
        })
      };
    };
    return { element: root, collect };
  }
};
