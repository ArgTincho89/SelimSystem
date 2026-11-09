const ObligationsPage = {
  items: [],
  assets: [],
  owners: [],
  categories: [],
  accounts: [],
  paymentMethods: [],
  alerts: [],
  onChange: null,

  // Loads the lookups the payment/resolution dialogs need, so they can run from the alerts center.
  async loadLookups() {
    const [owners, categories, accounts, paymentMethods] = await Promise.all([API.owners.list(), API.categories.list(), API.accounts.list(), API.finance.paymentMethods()]);
    this.owners = owners;
    this.categories = categories;
    this.accounts = accounts.filter(account => account.activo);
    this.paymentMethods = paymentMethods;
  },

  // After a change, either re-render this page or call the hook installed by another page.
  async refresh() {
    if (this.onChange) {
      const callback = this.onChange;
      this.onChange = null;
      await callback();
    } else await this.render();
  },

  async render(filters = {}, focusId = null, newForAssetId = null) {
    this.onChange = null;
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
      if (focusId) this.focusObligation(content, focusId);
      if (newForAssetId) this.showCreateModal(null, { assetId: newForAssetId });
    } catch (error) {
      content.replaceChildren(create('div', { className: 'empty-state', textContent: `No se pudieron cargar las obligaciones: ${error.message}` }));
    }
  },

  focusObligation(content, id) {
    const card = [...content.querySelectorAll('[data-obligation-id]')].find(item => item.dataset.obligationId === id);
    if (!card) return;
    card.style.outline = '2px solid var(--accent)';
    card.scrollIntoView?.({ block: 'center' });
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
    const status = this.filterSelect('Estado', [['', 'Todos'], ['expected', 'Previstas'], ['confirmed', 'Confirmadas'], ['partial', 'Parciales'], ['paid', 'Pagadas'], ['resolved', 'Resueltas por inquilino'], ['overdue', 'Vencidas'], ['cancelled', 'Canceladas']], filters.status || '');
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

  IDENTIFIER_KINDS: [['account', 'Cuenta'], ['contract', 'Contrato']],

  IDENTIFIER_TYPES: [['account', 'Cuenta'], ['contract', 'Contrato'], ['meter', 'Medidor'], ['policy', 'Póliza'], ['client', 'Cliente'], ['other', 'Otro']],

  identifierTypeLabel(type) {
    return this.IDENTIFIER_TYPES.find(([value]) => value === type)?.[1] || 'Identificador';
  },

  renderObligation(item) {
    const asset = this.assets.find(record => record.id === item.assetId)?.name;
    const provider = this.owners.find(record => record.id === item.providerEntityId)?.name;
    const details = create('div', {}, [
      create('h3', { textContent: item.title, style: { marginBottom: '4px' } }),
      create('div', { className: 'text-muted', textContent: [item.type, asset, provider].filter(Boolean).join(' · ') }),
      create('div', { className: 'text-muted', textContent: `Responsabilidad: ${this.responsibilityLabel(item)}` }),
      ...(item.externalIdentifier ? [create('div', { className: 'text-muted', textContent: `${this.identifierTypeLabel(item.externalIdentifierType)}: ${item.externalIdentifier}` })] : []),
      create('div', { className: 'text-muted', textContent: `${item.estimatedAmount} ${item.currencyCode} estimado · ${item.recurrenceFrequency ? this.frequencyLabel(item.recurrenceFrequency) : 'Única vez'} · Aviso ${item.reminderLeadDays} días` })
    ]);
    const card = create('article', { className: 'card', style: { display: 'grid', gap: '10px' }, dataset: { obligationId: item.id } }, [details]);
    const occurrences = (item.occurrences || []).filter(occurrence => occurrence.status !== 'cancelled').slice(-8);
    if (occurrences.length) {
      const table = create('div', { style: { display: 'grid', gap: '6px' } });
      occurrences.forEach(occurrence => {
        const portions = occurrence.tenantDueAmount !== undefined
          ? ` · Propietario ${occurrence.ownerDueAmount} (pendiente ${occurrence.remainingAmount}) · Inquilino ${occurrence.tenantDueAmount} (${occurrence.resolution ? 'resuelto' : 'pendiente'})`
          : '';
        const label = create('span', { className: occurrence.status === 'resolved' ? 'badge-resolved' : '', textContent: `${occurrence.date} · ${this.statusLabel(occurrence.status)} · Pagado ${occurrence.totalPaid}/${occurrence.actualDueAmount} ${occurrence.currencyCode}${portions}` });
        const row = create('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } }, [label]);
        const actions = create('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
        const hasTenantPortion = occurrence.tenantDueAmount !== undefined;
        if (!['paid', 'resolved', 'cancelled'].includes(occurrence.status)) {
          if (!occurrence.resolution) actions.append(create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Confirmar', onClick: () => this.runAction(() => API.obligations.confirm(item.id, occurrence.id)) }));
          if (!occurrence.resolution) actions.append(create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Editar', onClick: () => this.editOccurrence(item, occurrence) }));
          if (!hasTenantPortion || occurrence.remainingAmount > 0) actions.append(create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Pagar', onClick: () => this.pay(item, occurrence) }));
          if (!occurrence.resolution) actions.append(create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Cancelar', onClick: () => this.runAction(() => API.obligations.cancelOccurrence(item.id, occurrence.id)) }));
        }
        if (hasTenantPortion && !occurrence.resolution && occurrence.status !== 'cancelled') {
          actions.append(create('button', { className: 'btn btn-secondary btn-sm', textContent: 'Resolver (pagó el inquilino)', onClick: () => this.showResolveModal(item, occurrence) }));
        }
        if (occurrence.resolution) {
          actions.append(create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Anular resolución', onClick: () => this.voidResolution(item, occurrence) }));
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

  // Responsibility options offered by the form. Legacy values (shared/third/none) are only kept when already stored.
  async activeContractFor(assetId) {
    if (!assetId) return null;
    try {
      const contracts = await API.get(`/rentals?assetId=${encodeURIComponent(assetId)}`);
      return contracts.find(contract => contract.status === 'active') || null;
    } catch { return null; }
  },

  async showCreateModal(existing = null, defaults = {}) {
    const form = create('form', { style: { display: 'grid', gap: '10px', maxHeight: '70vh', overflowY: 'auto' } });
    const title = this.field(form, 'Nombre', { required: true, value: existing?.title || '' });
    const type = this.select([['utility', 'Servicios'], ['insurance', 'Seguro'], ['tax', 'Impuesto'], ['loan', 'Préstamo'], ['maintenance', 'Mantenimiento'], ['subscription', 'Suscripción'], ['other', 'Otro']], existing?.type || 'utility');
    this.fieldWrap(form, 'Tipo', type);
    const asset = this.select([['', 'Sin bien vinculado'], ...this.assets.map(item => [item.id, item.name])], existing?.assetId || defaults.assetId || '');
    this.fieldWrap(form, 'Bien', asset);
    const providers = this.owners.filter(item => (item.roles || []).includes('provider'));
    const providerCategory = id => providers.find(item => item.id === id)?.expenseCategoryId || '';
    const provider = this.select([['', 'Sin proveedor'], ...providers.map(item => [item.id, item.name])], existing?.providerEntityId || '');
    this.fieldWrap(form, 'Proveedor', provider);
    const identifierKind = this.select(this.IDENTIFIER_KINDS, existing?.externalIdentifierType || 'account');
    if (existing?.externalIdentifierType && !this.IDENTIFIER_KINDS.some(([value]) => value === existing.externalIdentifierType)) {
      identifierKind.prepend(create('option', { value: existing.externalIdentifierType, textContent: `${this.identifierTypeLabel(existing.externalIdentifierType)} (anterior)` }));
      identifierKind.value = existing.externalIdentifierType;
    }
    this.fieldWrap(form, 'Cuenta o contrato', identifierKind);
    const externalIdentifier = this.field(form, 'Número de cuenta o contrato', { value: existing?.externalIdentifier || '' });
    const frequency = this.select([['', 'Única vez'], ['monthly', 'Mensual'], ['bimonthly', 'Cada dos meses'], ['quarterly', 'Trimestral'], ['semiannual', 'Semestral'], ['annual', 'Anual']], existing?.recurrenceFrequency || '');
    this.fieldWrap(form, 'Frecuencia', frequency);
    const date = this.field(form, 'Primer vencimiento', { type: 'date', required: true, value: existing?.startDate || new Date().toISOString().slice(0, 10) });
    const endDate = this.field(form, 'Último vencimiento (opcional)', { type: 'date', value: existing?.endDate || '' });
    const reminderValues = ['0', '7', '15', '30'];
    const reminder = this.select([['0', 'El mismo día'], ['7', '7 días antes'], ['15', '15 días antes'], ['30', '30 días antes'], ['custom', 'Personalizado']], reminderValues.includes(String(existing?.reminderLeadDays ?? 7)) ? String(existing?.reminderLeadDays ?? 7) : 'custom');
    this.fieldWrap(form, 'Aviso', reminder);
    const customLead = this.field(form, 'Días de anticipación personalizados', { type: 'text', value: existing?.reminderLeadDays ?? 7 });
    const currencies = ['ARS', 'EUR', 'USD'];
    const currency = this.select(currencies.map(code => [code, code]), existing?.currencyCode || 'ARS');
    if (existing?.currencyCode && !currencies.includes(existing.currencyCode)) {
      const legacyCurrency = create('option', { value: existing.currencyCode, textContent: `${existing.currencyCode} (histórica)`, disabled: true });
      currency.prepend(legacyCurrency);
      currency.value = existing.currencyCode;
    }
    this.fieldWrap(form, 'Moneda', currency);
    const amount = this.field(form, 'Importe estimado', { type: 'number', min: '0.01', step: '0.01', required: true, value: existing?.estimatedAmount ?? '' });
    const category = this.select([['', 'Sin categoría'], ...this.categories.map(item => [item.id, item.nombre])], existing?.categoryId || (existing ? '' : providerCategory(provider.value)));
    this.fieldWrap(form, 'Categoría', category);
    // Re-prefill only while the category is still the previous provider's one (or empty).
    let previousProviderCategory = providerCategory(provider.value);
    on(provider, 'change', () => {
      if (!category.value || category.value === previousProviderCategory) category.value = providerCategory(provider.value);
      previousProviderCategory = providerCategory(provider.value);
    });
    const storedResponsibility = existing?.responsibilityType || 'owner';
    const legacyResponsibility = !['owner', 'tenant'].includes(storedResponsibility) && existing ? storedResponsibility : null;
    const responsibilityType = this.select([['owner', 'Titular'], ['tenant', 'Inquilino'], ...(legacyResponsibility ? [[legacyResponsibility, `${this.responsibilityLabel(existing)} (anterior)`]] : [])], legacyResponsibility || storedResponsibility);
    const responsibilityHint = create('small', { className: 'text-muted' });
    const responsibilityWrap = this.fieldWrap(form, 'Responsable', responsibilityType);
    responsibilityWrap.appendChild(responsibilityHint);
    let activeContract = null;
    const syncResponsibility = async () => {
      activeContract = await this.activeContractFor(asset.value);
      const tenantOption = [...responsibilityType.options].find(option => option.value === 'tenant');
      tenantOption.disabled = !activeContract;
      responsibilityHint.textContent = activeContract ? '' : 'El bien no tiene un contrato de alquiler activo; solo el titular puede ser responsable.';
      if (!activeContract && responsibilityType.value === 'tenant' && storedResponsibility !== 'tenant') responsibilityType.value = 'owner';
    };
    on(asset, 'change', syncResponsibility);
    await syncResponsibility();
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
        const identifier = externalIdentifier.value.trim();
        const data = {
          title: title.value, type: type.value, assetId: asset.value || null, providerEntityId: provider.value || null,
          categoryId: category.value || null,
          currencyCode: currency.value, estimatedAmount: Number(amount.value),
          startDate: date.value, endDate: endDate.value || null, recurrenceFrequency: frequency.value || null,
          reminderLeadDays: Number(reminder.value === 'custom' ? customLead.value : reminder.value), notes: notes.value,
          externalIdentifier: identifier || null, externalIdentifierType: identifier ? identifierKind.value : null
        };
        // Legacy shared/third/none stay untouched unless the user picks Titular or Inquilino.
        if (!legacyResponsibility || responsibilityType.value !== legacyResponsibility) {
          data.responsibilityType = responsibilityType.value;
          data.responsibilitySplit = null;
          data.responsibleThirdEntityId = null;
          data.rentalContractId = responsibilityType.value === 'tenant' ? activeContract?.id || null : null;
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

  async showResolveModal(obligation, occurrence) {
    const tenants = this.owners.filter(owner => (owner.roles || []).includes('tenant'));
    if (!tenants.length) { alert('Primero registrá un inquilino en Entidades.'); return; }
    const form = create('form', { style: { display: 'grid', gap: '10px', maxHeight: '70vh', overflowY: 'auto' } });
    const tenant = this.select(tenants.map(owner => [owner.id, owner.name]), tenants[0].id);
    this.fieldWrap(form, 'Inquilino', tenant);
    const period = this.field(form, 'Período (AAAA-MM)', { type: 'month', required: true, value: occurrence.date.slice(0, 7) });
    const amount = this.field(form, 'Importe pagado por el inquilino', { type: 'number', min: '0.01', step: occurrence.currencyCode === 'JPY' ? '1' : '0.01', required: true, value: occurrence.tenantDueAmount });
    const resolvedAt = this.field(form, 'Fecha de resolución', { type: 'date', required: true, value: new Date().toISOString().slice(0, 10) });
    const existingDocuments = create('div', { style: { display: 'grid', gap: '4px' } });
    this.fieldWrap(form, 'Comprobantes existentes de esta ocurrencia', existingDocuments);
    try {
      const documents = await API.documents.listBy({ occurrenceId: occurrence.id });
      if (!documents.length) existingDocuments.appendChild(create('small', { className: 'text-muted', textContent: 'No hay comprobantes cargados.' }));
      documents.forEach(document => {
        const checkbox = create('input', { type: 'checkbox', value: document.id });
        existingDocuments.appendChild(create('label', { style: { display: 'flex', gap: '6px' } }, [checkbox, create('span', { textContent: document.title || document.fileName })]));
      });
    } catch { existingDocuments.appendChild(create('small', { className: 'text-muted', textContent: 'No se pudieron cargar los comprobantes.' })); }
    const files = create('input', { className: 'form-control', type: 'file', multiple: true, accept: '.pdf,.png,.jpg,.jpeg,.webp,.txt' });
    this.fieldWrap(form, 'Subir comprobantes nuevos', files);
    const notes = this.field(form, 'Notas', { multiline: true });
    form.appendChild(create('p', { className: 'text-muted', textContent: 'No crea ningún movimiento: no afecta saldos, KPIs ni gastos del propietario.' }));
    form.appendChild(create('button', { className: 'btn btn-primary', type: 'submit', textContent: 'Registrar resolución' }));
    on(form, 'submit', async event => {
      event.preventDefault();
      try {
        const documentIds = [...existingDocuments.querySelectorAll('input:checked')].map(input => input.value);
        for (const file of [...(files.files || [])]) {
          const uploaded = await API.documents.uploadTargets({ occurrenceId: occurrence.id, tenantEntityId: tenant.value }, file);
          documentIds.push(uploaded.id);
        }
        await API.obligations.createResolution(obligation.id, occurrence.id, {
          tenantEntityId: tenant.value, period: period.value, amount: Number(amount.value), resolvedAt: resolvedAt.value, documentIds, notes: notes.value
        });
        Modal.hide();
        await this.refresh();
      } catch (error) { alert(error.message); }
    });
    Modal.show('Resolver obligación pagada por el inquilino', form);
  },

  async voidResolution(obligation, occurrence) {
    if (!confirm('¿Anular la resolución? La obligación volverá a figurar como pendiente.')) return;
    await this.runAction(() => API.obligations.voidResolution(obligation.id, occurrence.id));
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
    try { await action(); await this.refresh(); }
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
    return ({ expected: 'Previsto', confirmed: 'Confirmado', paid: 'Pagado', resolved: 'Resuelto por inquilino', partial: 'Parcial', overdue: 'Vencido', cancelled: 'Cancelado' })[value] || value;
  }
};
