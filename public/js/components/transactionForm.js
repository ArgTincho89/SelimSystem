const TransactionForm = {
  async show(onSave, transaction = null, options = {}) {
    const [categories, accounts, transactions] = await Promise.all([
      API.categories.list(), API.accounts.list(), API.transactions.list()
    ]);
    const isEdit = !!transaction;
    let selectedType = transaction?.tipo || 'expense';
    let selectedCategoryId = transaction?.categoryId || (categories.length > 0 ? categories[0].id : null);

    const form = create('div');

    const typeSelector = create('div', { className: 'type-selector' });
    ['expense', 'income', 'refund'].forEach(type => {
      const labels = { expense: 'Gasto', income: 'Ingreso', refund: 'Reembolso' };
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
        updateRecurringVisibility();
      });
      typeSelector.appendChild(btn);
    });
    form.appendChild(typeSelector);

    const accountGroup = create('div', { className: 'form-group' });
    const accountLabel = create('label', { textContent: 'Cuenta' });
    const accountSelect = create('select', { className: 'form-control', id: 'transaction-account' });
    const activeAccounts = accounts.filter(account => account.activo);
    activeAccounts.forEach(account => accountSelect.appendChild(create('option', { value: account.id, textContent: `${account.nombre} (${account.currency})` })));
    const defaultAccount = transaction?.accountId || options.accountId || activeAccounts.find(account => account.primary)?.id;
    if (defaultAccount) accountSelect.value = defaultAccount;
    accountLabel.setAttribute('for', accountSelect.id);
    accountGroup.appendChild(accountLabel);
    accountGroup.appendChild(accountSelect);
    accountGroup.appendChild(create('p', { className: 'account-status-note', textContent: 'El importe se interpreta en la moneda de la cuenta. Cambiar de cuenta no convierte el importe.' }));
    form.appendChild(accountGroup);

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
      option.textContent = localStorage.getItem('pate_hide_income') === 'true' ? `${item.titulo} · ${item.fecha} · ••••••` : label;
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
      ivaGroup.style.display = selectedType === 'income' && (currentClassification === 'A' || currentClassification === 'Mixto') ? 'block' : 'none';
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
    const amountInput = create('input', {
      className: 'form-control',
      type: 'number',
      step: '0.01',
      min: '0.01',
      placeholder: '0.00',
      value: transaction?.monto ?? '',
      id: 'transaction-amount'
    });
    const updateAmountCurrency = () => {
      const account = activeAccounts.find(item => item.id === accountSelect.value);
      amountLabel.textContent = `Monto (${account?.currency || 'EUR'})`;
      amountInput.step = ['JPY', 'KRW', 'CLP', 'PYG', 'BIF', 'DJF', 'GNF', 'KMF', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'].includes(account?.currency) ? '1' : '0.01';
    };
    on(accountSelect, 'change', updateAmountCurrency);
    updateAmountCurrency();
    amountGroup.appendChild(amountInput);
    form.appendChild(amountGroup);

    const incomeSplitGroup = create('div', { className: 'form-group', style: { display: 'none' } });
    incomeSplitGroup.appendChild(create('label', { textContent: 'Desglose Mixto' }));
    const incomeSplitRow = create('div', { style: { display: 'flex', gap: '8px' } });
    const amountAInput = create('input', { className: 'form-control', type: 'number', step: '0.01', min: '0', placeholder: 'A', 'aria-label': 'Importe A' });
    const amountBInput = create('input', { className: 'form-control', type: 'number', step: '0.01', min: '0', placeholder: 'B', 'aria-label': 'Importe B' });
    incomeSplitRow.appendChild(amountAInput);
    incomeSplitRow.appendChild(amountBInput);
    incomeSplitGroup.appendChild(incomeSplitRow);
    form.appendChild(incomeSplitGroup);

    // Auto-fill B with the remaining total while typing A in Mixto mode.
    on(amountAInput, 'input', () => {
      if (clasifSelect.value !== 'Mixto') return;
      const total = parseFloat(amountInput.value);
      const partA = parseFloat(amountAInput.value);
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(partA) || partA < 0) return;
      const remainder = Math.round((total - partA) * 100) / 100;
      amountBInput.value = remainder >= 0 ? String(remainder) : '';
    });

    const ivaGroup = create('div', { className: 'form-group', style: { display: 'none' } });
    ivaGroup.appendChild(create('label', { textContent: 'IVA (%)' }));
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
      amountAInput.value = transaction.montoA ?? '';
      amountBInput.value = transaction.montoB ?? '';
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

    function updateRecurringVisibility() {
      recurringGroup.style.display = (selectedType === 'expense') ? 'block' : 'none';
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
      let titulo = titleInput.value.trim();
      if (!titulo && selectedType !== 'income') {
        const catOption = categorySelect.options[categorySelect.selectedIndex];
        titulo = catOption ? catOption.textContent.trim() : '';
      }

      const data = {
        tipo: selectedType,
        titulo,
        monto: parseFloat(amountInput.value),
        fecha: dateInput.value,
        comments: commentsInput.value
      };

      if (selectedType === 'expense' || selectedType === 'income') {
        data.clasificacion = clasifSelect.value;
      }

      if (selectedType === 'income' && clasifSelect.value === 'Mixto') {
        data.montoA = parseFloat(amountAInput.value);
        data.montoB = parseFloat(amountBInput.value);
      }

      if (selectedType === 'income' && (clasifSelect.value === 'A' || clasifSelect.value === 'Mixto')) {
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
      }

      if (selectedType !== 'income') {
        data.categoryId = categorySelect.value;
      }
      if (selectedType === 'refund') data.refundSourceId = refundSourceSelect.value || null;
      data.accountId = accountSelect.value;

      if (selectedType === 'expense' && recurringEnabled) {
        data.recurrente = true;
        data.frecuencia = freqSelect.value;
        if (!indeterminadoCheckbox.checked && endDateInput.value) {
          data.fechaFin = endDateInput.value;
        }
      }

      if (!data.monto || data.monto <= 0) return showToast('El monto debe ser positivo', 'error');
      if (selectedType === 'income' && data.clasificacion === 'Mixto' && (!Number.isFinite(data.montoA) || !Number.isFinite(data.montoB) || Math.round((data.montoA + data.montoB) * 100) !== Math.round(data.monto * 100))) {
        return showToast('Los importes A y B deben sumar el monto total', 'error');
      }

      try {
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
        } else {
          await API.transactions.create(data);
        }
        if (onSave) await onSave();
        Modal.hide();
        showToast(isEdit ? 'Transacción actualizada' : 'Transacción guardada');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    Modal.show(isEdit ? 'Editar transacción' : 'Nueva transacción', form, { footer });
    titleInput.focus();
  }
};
