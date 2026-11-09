const ObligationsPage = {
  items: [],
  assets: [],
  owners: [],
  categories: [],
  accounts: [],
  paymentMethods: [],
  alerts: [],

  async render(filters = {}) {
    const content = $('#page-content');
    $('#navbar').style.display = '';
    content.style.paddingBottom = '';
    content.innerHTML = '<div class="loading">Cargando obligaciones...</div>';
    try {
      const [items, assets, owners, categories, accounts, alerts, paymentMethods] = await Promise.all([
        API.obligations.list(filters), API.assets.list(), API.owners.list(), API.categories.list(), API.accounts.list(), API.obligations.alerts(), API.finance.paymentMethods()
      ]);
      this.items = items;
      this.assets = assets;
      this.owners = owners;
      this.categories = categories;
      this.accounts = accounts.filter(account => account.activo);
      this.alerts = alerts;
      this.paymentMethods = paymentMethods;
      this.renderContent(content, filters);
    } catch (error) {
      content.replaceChildren(create('div', { className: 'empty-state', textContent: `No se pudieron cargar las obligaciones: ${error.message}` }));
    }
  },

  renderContent(content, filters = {}) {
    content.replaceChildren();
    const header = create('div', { className: 'page-header' }, [
      create('h2', { className: 'page-title', textContent: 'Obligaciones' }),
      create('button', { className: 'btn btn-primary btn-sm', textContent: '+ Nueva obligación', onClick: () => this.showCreateModal() })
    ]);
    content.appendChild(header);

    const overdueAlerts = this.alerts.filter(item => item.status === 'overdue').length;
    const upcomingAlerts = this.alerts.length - overdueAlerts;
    if (this.alerts.length) content.appendChild(create('div', { className: 'card', style: { marginBottom: '12px', borderLeft: `4px solid ${overdueAlerts ? 'var(--danger)' : 'var(--accent)'}` }, textContent: `Avisos: ${overdueAlerts} vencidas · ${upcomingAlerts} próximas a vencer` }));

    const form = create('form', { className: 'card', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '10px', marginBottom: '16px' } });
    const asset = this.filterSelect('Bien', [['', 'Todos los bienes'], ...this.assets.map(item => [item.id, item.name])], filters.assetId || '');
    const provider = this.filterSelect('Proveedor', [['', 'Todos los proveedores'], ...this.owners.filter(item => (item.roles || []).includes('provider')).map(item => [item.id, item.name])], filters.providerEntityId || '');
    const status = this.filterSelect('Estado', [['', 'Todos'], ['expected', 'Previstas'], ['confirmed', 'Confirmadas'], ['partial', 'Parciales'], ['paid', 'Pagadas'], ['overdue', 'Vencidas'], ['cancelled', 'Canceladas']], filters.status || '');
    const type = this.filterInput('Tipo', filters.type || '');
    const from = this.filterInput('Desde (AAAA-MM-DD)', filters.from || '', 'date');
    const to = this.filterInput('Hasta (AAAA-MM-DD)', filters.to || '', 'date');
    [asset, provider, status, type, from, to].forEach(field => form.appendChild(field));
    form.append(create('button', { className: 'btn btn-secondary', type: 'submit', textContent: 'Filtrar' }), create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Limpiar', onClick: () => this.render() }));
    on(form, 'submit', event => {
      event.preventDefault();
      this.render({ assetId: asset.value, providerEntityId: provider.value, status: status.value, type: type.value.trim(), from: from.value, to: to.value });
    });
    content.appendChild(form);

    if (!this.items.length) {
      content.appendChild(create('div', { className: 'empty-state', innerHTML: '<div class="empty-state-icon">📅</div><p class="empty-state-text">No hay obligaciones que coincidan con la búsqueda</p>' }));
      return;
    }
    const list = create('div', { style: { display: 'grid', gap: '12px' } });
    this.items.forEach(obligation => list.appendChild(this.renderObligation(obligation)));
    content.appendChild(list);
  },

  RESPONSIBILITY_TYPES: [['owner', 'Propietario'], ['tenant', 'Inquilino'], ['shared', 'Compartida'], ['third', 'Tercero'], ['none', 'Sin responsable']],

  responsibilityLabel(item) {
    const label = this.RESPONSIBILITY_TYPES.find(([value]) => value === (item.responsibilityType || 'owner'))?.[1] || 'Propietario';
    if (item.responsibilityType === 'third') {
      const third = this.owners.find(record => record.id === item.responsibleThirdEntityId)?.name;
      return third ? `${label}: ${third}` : label;
    }
    const split = item.responsibilitySplit;
    if (item.responsibilityType === 'shared' && split?.type === 'percentage') return `${label} (${split.ownerPercent}% / ${split.tenantPercent}%)`;
    if (item.responsibilityType === 'shared' && split?.type === 'fixed') return `${label} (importes fijos)`;
    return label;
  },

  IDENTIFIER_TYPES: [['account', 'Cuenta'], ['contract', 'Contrato'], ['meter', 'Medidor'], ['policy', 'Póliza'], ['client', 'Cliente'], ['other', 'Otro']],

  identifierTypeLabel(type) {
    return this.IDENTIFIER_TYPES.find(([value]) => value === type)?.[1] || 'Identificador';
  },

  renderObligation(item) {
    const asset = this.assets.find(record => record.id === item.assetId)?.name;
    const provider = this.owners.find(record => record.id === item.providerEntityId)?.name;
    const details = create('div', {}, [
      create('h3', { textContent: item.title, style: { marginBottom: '4px' } }),
      create('div', { className: 'text-muted', textContent: [item.type, asset, provider, item.paymentMethod].filter(Boolean).join(' · ') }),
      create('div', { className: 'text-muted', textContent: `Responsabilidad: ${this.responsibilityLabel(item)}` }),
      ...(item.externalIdentifier ? [create('div', { className: 'text-muted', textContent: `${this.identifierTypeLabel(item.externalIdentifierType)}: ${item.externalIdentifier}` })] : []),
      create('div', { className: 'text-muted', textContent: `${item.estimatedAmount} ${item.currencyCode} estimado · ${item.recurrenceFrequency ? this.frequencyLabel(item.recurrenceFrequency) : 'Única vez'} · Aviso ${item.reminderLeadDays} días` })
    ]);
    const card = create('article', { className: 'card', style: { display: 'grid', gap: '10px' } }, [details]);
    const occurrences = (item.occurrences || []).filter(occurrence => occurrence.status !== 'cancelled').slice(-8);
    if (occurrences.length) {
      const table = create('div', { style: { display: 'grid', gap: '6px' } });
      occurrences.forEach(occurrence => {
        const label = create('span', { textContent: `${occurrence.date} · ${this.statusLabel(occurrence.status)} · Pagado ${occurrence.totalPaid}/${occurrence.actualDueAmount} ${occurrence.currencyCode}` });
        const row = create('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } }, [label]);
        const actions = create('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
        if (!['paid', 'cancelled'].includes(occurrence.status)) {
          actions.append(
            create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Confirmar', onClick: () => this.runAction(() => API.obligations.confirm(item.id, occurrence.id)) }),
            create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Editar', onClick: () => this.editOccurrence(item, occurrence) }),
            create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Pagar', onClick: () => this.pay(item, occurrence) }),
            create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Cancelar', onClick: () => this.runAction(() => API.obligations.cancelOccurrence(item.id, occurrence.id)) })
          );
        }
        row.appendChild(actions);
        table.appendChild(row);
      });
      card.appendChild(table);
    } else {
      card.appendChild(create('div', { className: 'text-muted', textContent: 'No hay vencimientos generados para el período seleccionado.' }));
    }
    const controls = create('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
      create('button', { className: 'btn btn-secondary btn-sm', textContent: 'Nota', onClick: () => this.addNote(item) }),
      create('button', { className: 'btn btn-secondary btn-sm', textContent: 'Adjuntar documento', onClick: () => this.addDocument(item) }),
      create('button', { className: 'btn btn-secondary btn-sm', textContent: 'Ver notas y documentos', onClick: () => this.viewAttachments(item) }),
      create('button', { className: 'btn btn-secondary btn-sm', textContent: 'Editar', onClick: () => this.showCreateModal(item) }),
      create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Cancelar obligación', onClick: () => this.runAction(() => API.obligations.delete(item.id)) })
    ]);
    card.appendChild(controls);
    const allocationPanel = create('details', { style: { marginTop: '4px' } }, [create('summary', { textContent: 'Movimientos atribuidos' })]);
    const allocationRows = create('div', { style: { display: 'grid', gap: '6px', marginTop: '6px' } });
    API.finance.allocations({ obligationId: item.id }).then(allocations => {
      if (!allocations.length) allocationRows.appendChild(create('small', { textContent: 'No hay atribuciones adicionales.' }));
      allocations.forEach(allocation => {
        const row = create('div', { className: 'card', style: { padding: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } });
        row.appendChild(create('span', { textContent: `${allocation.transaction.titulo} · ${allocation.transaction.fecha} · ${allocation.amount} ${allocation.currencyCode}` }));
        row.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Editar atribuciones', disabled: Boolean(allocation.transaction.obligationOccurrenceId), onClick: () => TransactionForm.show(() => this.render(), allocation.transaction) }));
        allocationRows.appendChild(row);
      });
    }).catch(error => allocationRows.appendChild(create('small', { textContent: `No se pudieron cargar las atribuciones: ${error.message}` })));
    allocationPanel.appendChild(allocationRows);
    card.appendChild(allocationPanel);
    return card;
  },

  async showCreateModal(existing = null) {
    const form = create('form', { style: { display: 'grid', gap: '10px', maxHeight: '70vh', overflowY: 'auto' } });
    const title = this.field(form, 'Nombre', { required: true, value: existing?.title || '' });
    const type = this.select([['utility', 'Servicios'], ['insurance', 'Seguro'], ['tax', 'Impuesto'], ['loan', 'Préstamo'], ['maintenance', 'Mantenimiento'], ['subscription', 'Suscripción'], ['other', 'Otro']], existing?.type || 'utility');
    this.fieldWrap(form, 'Tipo', type);
    const asset = this.select([['', 'Sin bien vinculado'], ...this.assets.map(item => [item.id, item.name])], existing?.assetId || '');
    this.fieldWrap(form, 'Bien', asset);
    const providers = this.owners.filter(item => (item.roles || []).includes('provider'));
    const provider = this.select([['', 'Sin proveedor'], ...providers.map(item => [item.id, item.name])], existing?.providerEntityId || '');
    this.fieldWrap(form, 'Proveedor', provider);
    const responsible = this.select([['', 'Sin responsable'], ...this.owners.map(item => [item.id, item.name])], existing?.responsibleEntityId || '');
    this.fieldWrap(form, 'Persona u organización responsable', responsible);
    const account = this.select([['', 'Sin cuenta habitual'], ...this.accounts.map(item => [item.id, `${item.nombre} (${item.currency})`])], existing?.accountId || '');
    this.fieldWrap(form, 'Cuenta habitual', account);
    const category = this.select([['', 'Sin categoría'], ...this.categories.map(item => [item.id, item.nombre])], existing?.categoryId || '');
    this.fieldWrap(form, 'Categoría', category);
    const currencies = ['ARS', 'EUR', 'USD'];
    const currency = this.select(currencies.map(code => [code, code]), existing?.currencyCode || 'ARS');
    if (existing?.currencyCode && !currencies.includes(existing.currencyCode)) {
      const legacyCurrency = create('option', { value: existing.currencyCode, textContent: `${existing.currencyCode} (histórica)`, disabled: true });
      currency.prepend(legacyCurrency);
      currency.value = existing.currencyCode;
    }
    this.fieldWrap(form, 'Moneda', currency);
    const amount = this.field(form, 'Importe estimado', { type: 'number', min: '0.01', step: '0.01', required: true, value: existing?.estimatedAmount ?? '' });
    const paymentMethod = this.field(form, 'Medio de pago (texto libre)', { value: existing?.paymentMethod || '' });
    const paymentMethodId = this.select([['', 'Sin medio reutilizable'], ...this.paymentMethods.map(item => [item.id, `${item.name}${item.lastFour ? ` ···· ${item.lastFour}` : ''}`])], existing?.paymentMethodId || '');
    this.fieldWrap(form, 'Medio de pago reutilizable', paymentMethodId);
    paymentMethodId.addEventListener('change', () => {
      const selected = this.paymentMethods.find(item => item.id === paymentMethodId.value);
      if (selected) paymentMethod.value = selected.name;
    });
    const date = this.field(form, 'Primer vencimiento', { type: 'date', required: true, value: existing?.startDate || new Date().toISOString().slice(0, 10) });
    const endDate = this.field(form, 'Último vencimiento (opcional)', { type: 'date', value: existing?.endDate || '' });
    const frequency = this.select([['', 'Única vez'], ['monthly', 'Mensual'], ['bimonthly', 'Cada dos meses'], ['quarterly', 'Trimestral'], ['semiannual', 'Semestral'], ['annual', 'Anual']], existing?.recurrenceFrequency || '');
    this.fieldWrap(form, 'Frecuencia', frequency);
    const reminderValues = ['0', '7', '15', '30'];
    const reminder = this.select([['0', 'El mismo día'], ['7', '7 días antes'], ['15', '15 días antes'], ['30', '30 días antes'], ['custom', 'Personalizado']], reminderValues.includes(String(existing?.reminderLeadDays ?? 7)) ? String(existing?.reminderLeadDays ?? 7) : 'custom');
    this.fieldWrap(form, 'Aviso', reminder);
    const customLead = this.field(form, 'Días de anticipación personalizados', { type: 'number', min: '0', max: '90', value: existing?.reminderLeadDays ?? 7 });
    const externalIdentifierType = this.select([['', 'Sin tipo de identificador'], ...this.IDENTIFIER_TYPES], existing?.externalIdentifierType || '');
    this.fieldWrap(form, 'Tipo de identificador externo', externalIdentifierType);
    const externalIdentifier = this.field(form, 'Identificador externo (cuenta, contrato, medidor, póliza...)', { value: existing?.externalIdentifier || '' });
    const responsibilityType = this.select(this.RESPONSIBILITY_TYPES, existing?.responsibilityType || 'owner');
    this.fieldWrap(form, 'Responsabilidad de pago', responsibilityType);
    const split = existing?.responsibilitySplit || {};
    const splitType = this.select([['percentage', 'Porcentajes'], ['fixed', 'Importes fijos'], ['other', 'Regla acordada']], split.type || 'percentage');
    const splitTypeWrap = this.fieldWrap(form, 'Tipo de reparto', splitType);
    const ownerPercent = this.field(form, 'Porcentaje del propietario', { type: 'number', min: '0', max: '100', step: '0.01', value: split.ownerPercent ?? 50 });
    const tenantPercent = this.field(form, 'Porcentaje del inquilino', { type: 'number', min: '0', max: '100', step: '0.01', value: split.tenantPercent ?? 50 });
    const ownerFixed = this.field(form, 'Importe fijo del propietario', { type: 'number', min: '0', step: '0.01', value: split.ownerFixedMinor === undefined ? '' : split.ownerFixedMinor / 100 });
    const tenantFixed = this.field(form, 'Importe fijo del inquilino', { type: 'number', min: '0', step: '0.01', value: split.tenantFixedMinor === undefined ? '' : split.tenantFixedMinor / 100 });
    const ruleText = this.field(form, 'Regla acordada', { value: split.ruleText || '' });
    const third = this.select([['', 'Seleccioná un tercero'], ...this.owners.map(item => [item.id, item.name])], existing?.responsibleThirdEntityId || '');
    const thirdWrap = this.fieldWrap(form, 'Tercero responsable', third);
    const rentalContract = this.select([['', 'Sin contrato de alquiler']], '');
    this.fieldWrap(form, 'Contrato de alquiler (opcional)', rentalContract);
    this.loadRentalContracts(rentalContract, asset, existing?.rentalContractId || '');
    const splitControls = [[splitType, null], [ownerPercent, 'percentage'], [tenantPercent, 'percentage'], [ownerFixed, 'fixed'], [tenantFixed, 'fixed'], [ruleText, 'other']];
    const syncResponsibility = () => {
      splitControls.forEach(([control, kind]) => {
        control.closest('.form-group').style.display = responsibilityType.value === 'shared' && (!kind || kind === splitType.value) ? '' : 'none';
      });
      thirdWrap.style.display = responsibilityType.value === 'third' ? '' : 'none';
    };
    on(responsibilityType, 'change', syncResponsibility);
    on(splitType, 'change', syncResponsibility);
    syncResponsibility();
    const notes = this.field(form, 'Notas', { multiline: true, value: existing?.notes || '' });
    on(reminder, 'change', () => { customLead.disabled = reminder.value !== 'custom'; });
    customLead.disabled = reminder.value !== 'custom';
    let effectiveFromDate;
    if (existing) effectiveFromDate = this.field(form, 'Aplicar cambios desde (obligatorio si hay pagos)', { type: 'date' });
    const submit = create('button', { className: 'btn btn-primary', type: 'submit', textContent: existing ? 'Guardar cambios' : 'Crear obligación' });
    form.appendChild(submit);
    on(form, 'submit', async event => {
      event.preventDefault();
      try {
        const data = {
          title: title.value, type: type.value, assetId: asset.value || null, providerEntityId: provider.value || null,
          responsibleEntityId: responsible.value || null, accountId: account.value || null, categoryId: category.value || null,
          currencyCode: currency.value, estimatedAmount: Number(amount.value), paymentMethod: paymentMethod.value, paymentMethodId: paymentMethodId.value || null,
          startDate: date.value, endDate: endDate.value || null, recurrenceFrequency: frequency.value || null,
          reminderLeadDays: Number(reminder.value === 'custom' ? customLead.value : reminder.value), notes: notes.value,
          externalIdentifier: externalIdentifier.value.trim() || null, externalIdentifierType: externalIdentifierType.value || null,
          responsibilityType: responsibilityType.value, responsibilitySplit: null,
          responsibleThirdEntityId: responsibilityType.value === 'third' ? third.value || null : null,
          rentalContractId: rentalContract.value || null
        };
        if (responsibilityType.value === 'shared') {
          const minor = input => (input.value === '' ? undefined : Math.round(Number(input.value) * 100));
          if (splitType.value === 'percentage') data.responsibilitySplit = { type: 'percentage', ownerPercent: Number(ownerPercent.value), tenantPercent: Number(tenantPercent.value) };
          else if (splitType.value === 'fixed') data.responsibilitySplit = { type: 'fixed', ownerFixedMinor: minor(ownerFixed), tenantFixedMinor: minor(tenantFixed) };
          else data.responsibilitySplit = { type: 'other', ruleText: ruleText.value };
        }
        if (existing && effectiveFromDate.value) {
          data.effectiveFromDate = effectiveFromDate.value;
          if (frequency.value !== (existing.recurrenceFrequency || '') && date.value === existing.startDate) {
            data.startDate = effectiveFromDate.value;
          }
        }
        if (existing) await API.obligations.update(existing.id, data);
        else await API.obligations.create(data);
        Modal.hide();
        await this.render();
      } catch (error) { alert(error.message); }
    });
    Modal.show(existing ? 'Editar obligación' : 'Nueva obligación', form);
  },

  async editOccurrence(obligation, occurrence) {
    const amount = prompt('Importe real del vencimiento', String(occurrence.actualDueAmount));
    if (amount === null) return;
    const scopeInput = prompt('Escribe "this" para editar solo este vencimiento o "future" para este y los futuros', 'this');
    if (scopeInput === null) return;
    const scope = scopeInput.trim().toLowerCase();
    await this.runAction(() => API.obligations.updateOccurrence(obligation.id, occurrence.id, { actualDueAmount: Number(amount), scope }));
  },

  async pay(obligation, occurrence) {
    const amount = prompt(`Importe pagado (restante: ${occurrence.remainingAmount} ${occurrence.currencyCode})`, String(occurrence.remainingAmount));
    if (amount === null) return;
    const selectedAccount = obligation.accountId || this.accounts.find(account => account.currency === obligation.currencyCode)?.id;
    const selectedCategory = obligation.categoryId || this.categories[0]?.id;
    await this.runAction(() => API.obligations.pay(obligation.id, occurrence.id, {
      amount: Number(amount), accountId: selectedAccount, categoryId: selectedCategory,
      idempotencyKey: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
    }));
  },

  async addNote(obligation) {
    const content = prompt('Nota para esta obligación');
    if (!content?.trim()) return;
    await this.runAction(() => API.wealthNotes.create({ targetType: 'obligation', targetId: obligation.id, content: content.trim() }));
  },

  async addDocument(obligation) {
    const input = create('input', { type: 'file', accept: '.pdf,.png,.jpg,.jpeg,.webp,.txt' });
    on(input, 'change', async () => {
      if (!input.files?.[0]) return;
      try { await API.documents.upload('obligation', obligation.id, input.files[0]); alert('Documento adjuntado.'); }
      catch (error) { alert(error.message); }
    });
    input.click();
  },

  async viewAttachments(obligation) {
    try {
      const [documents, notes] = await Promise.all([
        API.documents.list('obligation', obligation.id), API.wealthNotes.list('obligation', obligation.id)
      ]);
      const content = create('div', { style: { display: 'grid', gap: '12px' } });
      content.appendChild(create('h4', { textContent: 'Notas' }));
      if (!notes.length) content.appendChild(create('p', { className: 'text-muted', textContent: 'No hay notas.' }));
      notes.forEach(note => content.appendChild(create('p', { textContent: `${note.date}: ${note.content}` })));
      content.appendChild(create('h4', { textContent: 'Documentos' }));
      if (!documents.length) content.appendChild(create('p', { className: 'text-muted', textContent: 'No hay documentos.' }));
      documents.forEach(document => {
        const link = create('a', { href: API.documents.contentUrl(document.id), target: '_blank', rel: 'noopener', textContent: document.title || document.fileName });
        content.appendChild(link);
      });
      Modal.show('Notas y documentos', content);
    } catch (error) { alert(error.message); }
  },

  async runAction(action) {
    try { await action(); await this.render(); }
    catch (error) { alert(error.message); }
  },

  field(container, label, options = {}) {
    const control = create(options.multiline ? 'textarea' : 'input', {
      className: 'form-control', ...(options.multiline ? { rows: 3 } : { type: options.type || 'text' }),
      min: options.min, max: options.max, step: options.step, required: options.required || false,
      value: options.value ?? '', placeholder: label
    });
    this.fieldWrap(container, label, control);
    return control;
  },

  fieldWrap(container, label, control) {
    const wrap = create('div', { className: 'form-group' }, [create('label', { textContent: label }), control]);
    container.appendChild(wrap);
    return wrap;
  },

  async loadRentalContracts(select, assetSelect, selected) {
    const fill = async () => {
      select.replaceChildren(create('option', { value: '', textContent: 'Sin contrato de alquiler' }));
      if (assetSelect.value) {
        try {
          const contracts = await API.get(`/rentals?assetId=${encodeURIComponent(assetSelect.value)}`);
          contracts.forEach(contract => select.appendChild(create('option', { value: contract.id, textContent: `Contrato ${contract.startDate} a ${contract.endDate || 'sin fin'}` })));
        } catch { /* contracts are optional; keep the empty choice */ }
      }
      select.value = [...select.options].some(option => option.value === selected) ? selected : '';
      selected = '';
    };
    on(assetSelect, 'change', fill);
    await fill();
  },

  select(options, selected = '') {
    const control = create('select', { className: 'form-control' });
    options.forEach(([value, label]) => control.appendChild(create('option', { value, textContent: label })));
    control.value = selected;
    return control;
  },

  filterSelect(label, options, selected) {
    const control = this.select(options, selected);
    control.setAttribute('aria-label', label);
    return control;
  },

  filterInput(label, value, type = 'text') {
    return create('input', { className: 'form-control', type, value, placeholder: label, 'aria-label': label });
  },

  frequencyLabel(value) {
    return ({ monthly: 'Mensual', bimonthly: 'Cada dos meses', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual' })[value] || value;
  },

  statusLabel(value) {
    return ({ expected: 'Previsto', confirmed: 'Confirmado', paid: 'Pagado', partial: 'Parcial', overdue: 'Vencido', cancelled: 'Cancelado' })[value] || value;
  }
};
