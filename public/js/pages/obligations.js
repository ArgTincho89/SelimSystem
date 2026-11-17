// Obligation types (value, Spanish label). Unknown or empty types read as "Otro".
const OBLIGATION_TYPES = [['utility', 'Servicios'], ['insurance', 'Seguro'], ['tax', 'Impuesto'], ['loan', 'Préstamo'], ['maintenance', 'Mantenimiento'], ['subscription', 'Suscripción'], ['other', 'Otro']];

function obligationTypeLabel(value) {
  return OBLIGATION_TYPES.find(([code]) => code === value)?.[1] || 'Otro';
}

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
    const status = this.filterSelect('Estado', [['', 'Todos'], ['pending', 'Pendientes'], ['partial', 'Parciales'], ['paid', 'Pagadas'], ['resolved', 'Resueltas por inquilino'], ['overdue', 'Vencidas']], filters.status || '');
    const type = this.filterSelect('Tipo', [['', 'Todos los tipos'], ...OBLIGATION_TYPES], filters.type || '');
    const from = this.filterInput('Desde (AAAA-MM-DD)', filters.from || '', 'date');
    const to = this.filterInput('Hasta (AAAA-MM-DD)', filters.to || '', 'date');
    [asset, provider, status, type, from, to].forEach(field => form.appendChild(field));
    form.append(create('button', { className: 'btn btn-secondary', type: 'submit', textContent: 'Filtrar' }), create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Limpiar', onClick: () => this.render() }));
    on(form, 'submit', event => {
      event.preventDefault();
      this.render({ assetId: asset.value, providerEntityId: provider.value, status: status.value, type: type.value, from: from.value, to: to.value });
    });
    content.appendChild(form);

    const visibleItems = this.items.filter(item => item.status !== 'cancelled');
    if (!visibleItems.length) {
      content.appendChild(create('div', { className: 'empty-state', innerHTML: '<div class="empty-state-icon">📅</div><p class="empty-state-text">No hay obligaciones que coincidan con la búsqueda</p>' }));
      return;
    }
    const list = create('div', { style: { display: 'grid', gap: '12px' } });
    visibleItems.forEach(obligation => list.appendChild(this.renderObligation(obligation)));
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

  // One "Label: value" line (bold label); null when there is no value.
  labelValue(label, value) {
    if (value === undefined || value === null || value === '') return null;
    return create('div', { className: 'label-value' }, [
      create('strong', { textContent: `${label}:` }),
      create('span', { textContent: value })
    ]);
  },

  // Occurrences shown on a card: every unpaid overdue one, plus the first pending one from today on.
  selectOccurrences(occurrences, today = getToday()) {
    const open = (occurrences || []).filter(occurrence => !['paid', 'resolved', 'cancelled'].includes(occurrence.status));
    const sorted = [...open].sort((a, b) => a.date.localeCompare(b.date));
    const overdue = sorted.filter(occurrence => occurrence.status === 'overdue');
    const next = sorted.find(occurrence => occurrence.status !== 'overdue' && occurrence.date >= today);
    return next ? [...overdue, next] : overdue;
  },

  // The occurrence a card-level "Registrar pago" pays: the oldest unpaid one shown.
  oldestPayable(shown) {
    return [...shown].sort((a, b) => a.date.localeCompare(b.date)).find(occurrence => !this.isPaidOccurrence(occurrence)) || null;
  },

  isPaidOccurrence(occurrence) {
    return ['paid', 'resolved', 'cancelled'].includes(occurrence.status);
  },

  reminderLabel(days) {
    const value = Number(days);
    if (!value) return 'El mismo día';
    return `${value} ${value === 1 ? 'día' : 'días'}`;
  },

  renderObligation(item) {
    const asset = this.assets.find(record => record.id === item.assetId)?.name;
    const provider = this.owners.find(record => record.id === item.providerEntityId)?.name;
    const account = this.accounts.find(record => record.id === item.accountId);
    const amount = Number.isFinite(Number(item.estimatedAmount)) ? formatearMonedaConCodigo(item.estimatedAmount, item.currencyCode) : '';
    const identifier = item.externalIdentifier ? `${this.identifierTypeLabel(item.externalIdentifierType)}: ${item.externalIdentifier}` : '';
    const lines = [
      this.labelValue('Tipo', obligationTypeLabel(item.type)),
      this.labelValue('Inmueble', asset),
      this.labelValue('Proveedor', provider),
      this.labelValue('Responsabilidad', this.responsibilityLabel(item)),
      this.labelValue('Cuenta', account ? (account.nombre || account.name) : ''),
      this.labelValue('Identificador', identifier),
      this.labelValue('Monto estimado', amount),
      this.labelValue('Frecuencia', item.recurrenceFrequency ? this.frequencyLabel(item.recurrenceFrequency) : 'Única vez'),
      this.labelValue('Aviso', this.reminderLabel(item.reminderLeadDays))
    ].filter(Boolean);
    const details = create('div', { style: { display: 'grid', gap: '2px' } }, [
      create('h3', { textContent: item.title, style: { marginBottom: '4px' } }),
      ...lines
    ]);
    const card = create('article', { className: 'card', style: { display: 'grid', gap: '10px' }, dataset: { obligationId: item.id } }, [details]);
    const occurrences = this.selectOccurrences(item.occurrences);
    if (occurrences.length) {
      const table = create('div', { style: { display: 'grid', gap: '6px' } });
      occurrences.forEach(occurrence => {
        const portions = occurrence.tenantDueAmount !== undefined
          ? ` · Propietario ${occurrence.ownerDueAmount} (pendiente ${occurrence.remainingAmount}) · Inquilino ${occurrence.tenantDueAmount} (${occurrence.resolution ? 'resuelto' : 'pendiente'})`
          : '';
        const badge = dueBadge(occurrence);
        const label = create('span', {}, [
          create('span', { textContent: `${occurrence.date} · ` }),
          create('span', { className: badge.className, textContent: badge.label }),
          create('span', { textContent: ` · Pagado ${occurrence.totalPaid}/${occurrence.actualDueAmount} ${occurrence.currencyCode}${portions}` })
        ]);
        const row = create('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } }, [label]);
        const actions = create('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
        const hasTenantPortion = occurrence.tenantDueAmount !== undefined;
        const tenantOnly = this.isTenantOnly(item, occurrence);
        if (!this.isPaidOccurrence(occurrence)) {
          if (!occurrence.resolution) actions.append(create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Editar', onClick: () => this.editOccurrence(item, occurrence) }));
          if (!tenantOnly && (!hasTenantPortion || occurrence.remainingAmount > 0)) actions.append(create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Registrar pago', onClick: () => this.pay(item, occurrence) }));
          if (!occurrence.resolution) actions.append(create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Cancelar', onClick: () => this.runAction(() => API.obligations.cancelOccurrence(item.id, occurrence.id)) }));
        }
        if (hasTenantPortion && !occurrence.resolution && occurrence.status !== 'cancelled') {
          actions.append(create('button', { className: 'btn btn-secondary btn-sm', textContent: tenantOnly ? 'Resolver' : 'Resolver (pagó el inquilino)', onClick: () => this.showResolveModal(item, occurrence) }));
        }
        if (!tenantOnly && !occurrence.resolution) (occurrence.paymentIds || []).forEach((paymentId, index, all) => actions.append(create('button', {
          className: 'btn btn-ghost btn-sm', textContent: all.length > 1 ? `Revertir pago ${index + 1}` : 'Revertir pago', 'aria-label': `Revertir pago de ${occurrence.date}`, dataset: { revertPayment: paymentId },
          onClick: () => this.revertPayment({ obligationId: item.id, occurrenceId: occurrence.id, transactionId: paymentId }, () => this.refresh())
        })));
        if (occurrence.resolution || Number(occurrence.totalPaid) > 0) {
          actions.append(create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Adjuntar comprobante', onClick: () => this.attachReceiptTo(occurrence) }));
          actions.append(create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Comprobantes', 'aria-label': `Ver comprobantes de ${occurrence.date}`, dataset: { occurrenceReceipts: occurrence.id }, onClick: () => this.showReceipts(occurrence) }));
        }
        if (occurrence.resolution) {
          actions.append(create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Anular resolución', onClick: () => this.voidResolution(item, occurrence) }));
        }
        row.appendChild(actions);
        table.appendChild(row);
      });
      card.appendChild(table);
    } else {
      card.appendChild(create('div', { className: 'text-muted', textContent: 'No hay vencimientos pendientes.' }));
    }
    const payable = this.oldestPayable(occurrences);
    const controls = create('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
      ...(payable ? [create('button', { className: 'btn btn-primary btn-sm', textContent: 'Registrar pago', onClick: () => this.pay(item, payable) })] : []),
      create('button', { className: 'btn btn-secondary btn-sm', textContent: 'Editar', onClick: () => this.showCreateModal(item) }),
      create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Eliminar', style: { color: 'var(--danger)' }, onClick: () => this.deleteObligation(item) }),
      create('button', { className: 'btn btn-secondary btn-sm', textContent: 'Nota', onClick: () => this.addNote(item) }),
      create('button', { className: 'btn btn-secondary btn-sm', textContent: 'Adjuntar documento', onClick: () => this.addDocument(item) }),
      create('button', { className: 'btn btn-secondary btn-sm', textContent: 'Ver notas y documentos', onClick: () => this.viewAttachments(item) })
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

  // "Nueva obligación" stacked on top of the rental declaration (same form, no navigation). `context`:
  // { assetId, tenantNames, pendingDeclarationToken, activeContractId, onCreated(obligation, responsibilityType) }.
  async showStackedCreate(context) {
    try {
      const [assets, owners, categories] = await Promise.all([API.assets.list(), API.owners.list(), API.categories.list()]);
      this.assets = assets;
      this.owners = owners;
      this.categories = categories;
    } catch (error) { showToast(error.message, 'error'); return; }
    await this.showCreateModal(null, { assetId: context.assetId }, { stacked: context });
  },

  async showCreateModal(existing = null, defaults = {}, options = {}) {
    const stacked = options.stacked || null;
    const form = create('form', { style: { display: 'grid', gap: '10px', maxHeight: '70vh', overflowY: 'auto' } });
    const title = this.field(form, 'Nombre', { required: true, value: existing?.title || '' });
    const type = this.select(OBLIGATION_TYPES, existing?.type || 'utility');
    this.fieldWrap(form, 'Tipo', type);
    const asset = this.select([['', 'Sin bien vinculado'], ...this.assets.map(item => [item.id, item.name])], existing?.assetId || defaults.assetId || '');
    if (stacked) asset.disabled = true;
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
    const customLeadWrap = customLead.parentNode;
    // The custom lead days are only shown (and submitted) when "Aviso" is "Personalizado".
    const syncCustomLead = () => {
      const isCustom = reminder.value === 'custom';
      customLeadWrap.style.display = isCustom ? '' : 'none';
      customLead.disabled = !isCustom;
      customLead.required = isCustom;
    };
    on(reminder, 'change', syncCustomLead);
    syncCustomLead();
    const currencies = ['ARS', 'EUR', 'USD'];
    const currency = this.select(currencies.map(code => [code, code]), existing?.currencyCode || 'ARS');
    if (existing?.currencyCode && !currencies.includes(existing.currencyCode)) {
      const legacyCurrency = create('option', { value: existing.currencyCode, textContent: `${existing.currencyCode} (histórica)`, disabled: true });
      currency.prepend(legacyCurrency);
      currency.value = existing.currencyCode;
    }
    this.fieldWrap(form, 'Moneda', currency);
    const amount = this.moneyField(form, 'Importe estimado', { currency: currency.value, value: existing?.estimatedAmount });
    on(currency, 'change', () => MoneyInput.setCurrency(amount, currency.value));
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
      if (stacked) {
        // The tenant typed in the (maybe unsaved) declaration can be responsible; it is confirmed when the declaration is saved.
        const names = (stacked.tenantNames || []).join(', ');
        const tenantOption = [...responsibilityType.options].find(option => option.value === 'tenant');
        tenantOption.textContent = names ? `Inquilino (${names})` : 'Inquilino';
        tenantOption.disabled = !names;
        activeContract = stacked.activeContractId ? { id: stacked.activeContractId } : null;
        if (names && !existing) responsibilityType.value = 'tenant';
        responsibilityHint.textContent = !names ? 'Elegí el inquilino en la declaración para poder asignarle la obligación.'
          : activeContract ? '' : 'Queda a cargo del inquilino al guardar la declaración de alquiler; si la cancelás, queda a cargo del propietario.';
        return;
      }
      activeContract = await this.activeContractFor(asset.value);
      const tenantOption = [...responsibilityType.options].find(option => option.value === 'tenant');
      tenantOption.disabled = !activeContract;
      responsibilityHint.textContent = activeContract ? '' : 'El bien no tiene un contrato de alquiler activo; solo el titular puede ser responsable.';
      if (!activeContract && responsibilityType.value === 'tenant' && storedResponsibility !== 'tenant') responsibilityType.value = 'owner';
    };
    on(asset, 'change', syncResponsibility);
    await syncResponsibility();
    const notes = this.field(form, 'Notas', { multiline: true, value: existing?.notes || '' });
    let effectiveFromDate;
    if (existing) effectiveFromDate = this.field(form, 'Aplicar cambios desde (obligatorio si hay pagos)', { type: 'date' });
    const submit = create('button', { className: 'btn btn-primary', type: 'submit', textContent: existing ? 'Guardar cambios' : 'Crear obligación' });
    form.appendChild(submit);
    on(form, 'submit', async event => {
      event.preventDefault();
      if (!this.validMoney(amount)) return;
      const isCustomLead = reminder.value === 'custom';
      if (isCustomLead && !/^\d+$/.test(String(customLead.value).trim())) { alert('Ingresá los días de anticipación'); return; }
      try {
        const identifier = externalIdentifier.value.trim();
        const data = {
          title: title.value, type: type.value, assetId: asset.value || null, providerEntityId: provider.value || null,
          categoryId: category.value || null,
          currencyCode: currency.value, estimatedAmount: MoneyInput.value(amount),
          startDate: date.value, endDate: endDate.value || null, recurrenceFrequency: frequency.value || null,
          reminderLeadDays: Number(isCustomLead ? customLead.value : reminder.value), notes: notes.value,
          externalIdentifier: identifier || null, externalIdentifierType: identifier ? identifierKind.value : null
        };
        // Legacy shared/third/none stay untouched unless the user picks Titular or Inquilino.
        if (!legacyResponsibility || responsibilityType.value !== legacyResponsibility) {
          data.responsibilityType = responsibilityType.value;
          data.responsibilitySplit = null;
          data.responsibleThirdEntityId = null;
          data.rentalContractId = responsibilityType.value === 'tenant' ? activeContract?.id || null : null;
        }
        if (stacked && responsibilityType.value === 'tenant' && stacked.pendingDeclarationToken && !activeContract) data.pendingDeclarationToken = stacked.pendingDeclarationToken;
        if (existing && effectiveFromDate.value) {
          data.effectiveFromDate = effectiveFromDate.value;
          if (frequency.value !== (existing.recurrenceFrequency || '') && date.value === existing.startDate) {
            data.startDate = effectiveFromDate.value;
          }
        }
        if (stacked) {
          const created = await API.obligations.create(data);
          Modal.hide();
          stacked.onCreated(created, responsibilityType.value);
          showToast('Obligación creada');
          return;
        }
        if (existing && (existing.occurrences || []).some(occurrence => Number(occurrence.totalPaid) > 0)) {
          const { confirmed } = await ConfirmDialog.open({ title: 'Editar obligación con pagos', confirmLabel: 'Guardar cambios', message: 'Esta obligación tiene pagos registrados. Los cambios no modifican los pagos ya hechos. ¿Querés continuar?' });
          if (!confirmed) return;
        }
        if (existing) await API.obligations.update(existing.id, data);
        else await API.obligations.create(data);
        Modal.hide();
        await this.render();
      } catch (error) { alert(error.message); }
    });
    (stacked ? Modal.push : Modal.show).call(Modal, existing ? 'Editar obligación' : 'Nueva obligación', form);
  },

  async editOccurrence(obligation, occurrence) {
    const amountText = prompt('Importe real del vencimiento', MoneyInput.format(occurrence.actualDueAmount, occurrence.currencyCode));
    if (amountText === null) return;
    const amount = MoneyInput.parse(amountText, occurrence.currencyCode);
    if (amount === null) { alert(MoneyInput.INVALID_MESSAGE); return; }
    const scopeInput = prompt('Escribe "this" para editar solo este vencimiento o "future" para este y los futuros', 'this');
    if (scopeInput === null) return;
    const scope = scopeInput.trim().toLowerCase();
    await this.runAction(() => API.obligations.updateOccurrence(obligation.id, occurrence.id, { actualDueAmount: amount, scope }));
  },

  // Tenants offered by the resolve modal: those of the obligation's contract, else of the asset's active contract,
  // else every tenant. The first one is preselected.
  async resolveTenants(obligation) {
    const allTenants = this.owners.filter(owner => (owner.roles || []).includes('tenant'));
    let contract = null;
    if (obligation.rentalContractId) {
      try { contract = await API.rentals.get(obligation.rentalContractId); } catch { contract = null; }
    }
    if (!contract && obligation.assetId) contract = await this.activeContractFor(obligation.assetId);
    const fromContract = contract ? allTenants.filter(owner => (contract.tenantIds || []).includes(owner.id)) : [];
    return fromContract.length ? fromContract : allTenants;
  },

  async showResolveModal(obligation, occurrence) {
    const tenants = await this.resolveTenants(obligation);
    if (!tenants.length) { alert('Primero registrá un inquilino en Entidades.'); return; }
    const form = create('form', { style: { display: 'grid', gap: '10px', maxHeight: '70vh', overflowY: 'auto' } });
    const tenant = this.select(tenants.map(owner => [owner.id, owner.name]), tenants[0].id);
    this.fieldWrap(form, 'Inquilino', tenant);
    const period = this.field(form, 'Período (AAAA-MM)', { type: 'month', required: true, value: occurrence.date.slice(0, 7) });
    const amount = this.moneyField(form, 'Importe pagado por el inquilino', { currency: occurrence.currencyCode, value: occurrence.tenantDueAmount });
    const resolvedAt = this.field(form, 'Fecha de resolución', { type: 'date', required: true, value: new Date().toISOString().slice(0, 10) });
    const existingDocuments = create('div', { style: { display: 'grid', gap: '4px' } });
    this.fieldWrap(form, 'Comprobantes existentes de esta ocurrencia', existingDocuments);
    try {
      const documents = await API.documents.listBy({ occurrenceId: occurrence.id });
      if (!documents.length) existingDocuments.appendChild(create('small', { className: 'text-muted', textContent: 'No hay comprobantes cargados.' }));
      documents.forEach(document => {
        const checkbox = create('input', { type: 'checkbox', value: document.id });
        existingDocuments.appendChild(create('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } }, [
          create('label', { style: { display: 'flex', gap: '6px' } }, [checkbox, create('span', { textContent: document.title || document.fileName })]),
          ...DocumentViewer.actions(document)
        ]));
      });
    } catch { existingDocuments.appendChild(create('small', { className: 'text-muted', textContent: 'No se pudieron cargar los comprobantes.' })); }
    const files = create('input', { className: 'form-control', type: 'file', multiple: true, accept: '.pdf,.png,.jpg,.jpeg,.webp,.txt' });
    this.fieldWrap(form, 'Subir comprobantes nuevos', files);
    const notes = this.field(form, 'Notas', { multiline: true, required: true });
    notes.maxLength = 2000;
    form.appendChild(create('p', { className: 'text-muted', textContent: 'No crea ningún movimiento: no afecta saldos, KPIs ni gastos del propietario.' }));
    form.appendChild(create('button', { className: 'btn btn-primary', type: 'submit', textContent: 'Registrar resolución' }));
    on(form, 'submit', async event => {
      event.preventDefault();
      if (!this.validNotes(notes)) return;
      if (!this.validMoney(amount)) return;
      const invalidFile = [...(files.files || [])].map(file => DocumentViewer.fileError(file)).find(Boolean);
      if (invalidFile) { alert(invalidFile); return; }
      try {
        const documentIds = [...existingDocuments.querySelectorAll('input:checked')].map(input => input.value);
        for (const file of [...(files.files || [])]) {
          const uploaded = await API.documents.uploadTargets({ occurrenceId: occurrence.id, tenantEntityId: tenant.value }, file);
          documentIds.push(uploaded.id);
        }
        await API.obligations.createResolution(obligation.id, occurrence.id, {
          tenantEntityId: tenant.value, period: period.value, amount: MoneyInput.value(amount), resolvedAt: resolvedAt.value, documentIds, notes: notes.value.trim()
        });
        Modal.hide();
        await this.refresh();
      } catch (error) { alert(error.message); }
    });
    Modal.show('Resolver obligación pagada por el inquilino', form);
  },

  async voidResolution(obligation, occurrence) {
    await UndoDialog.open({
      type: 'obligation.resolution', obligationId: obligation.id, occurrenceId: occurrence.id, title: 'Anular resolución', confirmLabel: 'Anular resolución',
      message: 'Vas a anular la resolución. La obligación volverá a figurar como pendiente.'
    }, { onDone: () => this.refresh() });
  },

  isTenantOnly(obligation, occurrence) {
    return (occurrence.responsibilityType || obligation.responsibilityType) === 'tenant' || (occurrence.tenantDueAmount !== undefined && occurrence.ownerDueAmount === 0);
  },

  // Receipts of one due date (owner payments and tenant resolutions) with "Ver documento" and "Descargar".
  async showReceipts(occurrence) {
    let documents = [];
    try { documents = await API.documents.listBy({ occurrenceId: occurrence.id }); } catch (error) { showToast(error.message, 'error'); return; }
    Modal.push(`Comprobantes · ${occurrence.date}`, DocumentViewer.list(documents, { empty: 'No hay comprobantes cargados.' }), { width: '560px' });
  },

  // Uploads a receipt linked to the occurrence (and the payment transaction when there is one).
  async uploadReceipt(occurrence, file, transactionId = null) {
    return API.documents.uploadTargets({ occurrenceId: occurrence.id, transactionId }, file);
  },

  // Row action used when a receipt is missing or its upload failed (payments and resolutions).
  attachReceiptTo(occurrence) {
    const input = create('input', { type: 'file', accept: '.pdf,.png,.jpg,.jpeg,.webp,.txt' });
    on(input, 'change', async () => {
      if (!input.files?.[0]) return;
      try { await this.uploadReceipt(occurrence, input.files[0]); showToast('Comprobante adjuntado'); await this.refresh(); }
      catch (error) { showToast(error.message, 'error'); }
    });
    input.click();
  },

  REVERT_COPY: 'Estás por revertir un pago registrado. Se anulará el gasto asociado y el vencimiento volverá a pendiente. Esta acción no se puede deshacer. ¿Querés continuar?',

  // "Revertir pago": shared by every entry point (obligations, asset history, periods, alerts, transaction detail).
  // Shows the payment, asks for an optional reason and sends nothing until the user confirms.
  async revertPayment({ obligationId, occurrenceId, transactionId }, onDone = null) {
    let detail;
    try { detail = await API.obligations.payment(obligationId, occurrenceId, transactionId); } catch (error) { showToast(error.message, 'error'); return false; }
    if (!detail.revertible) {
      await ConfirmDialog.open({ title: 'Revertir pago', message: detail.dependent ? `No se puede revertir este pago porque tiene movimientos dependientes. ${detail.dependent}` : 'Este pago no se puede revertir.', confirmLabel: 'Entendido', cancelLabel: 'Cerrar' });
      return false;
    }
    const receipts = detail.documents.length ? detail.documents.map(item => item.title || item.fileName).join(', ') : 'Sin comprobante';
    return UndoDialog.open({
      type: 'obligation.payment', obligationId, occurrenceId, transactionId, title: 'Revertir pago', confirmLabel: 'Revertir pago', message: this.REVERT_COPY,
      details: [
        ['Fecha', detail.payment.date], ['Importe', formatearMonedaConCodigo(detail.payment.amount, detail.payment.currencyCode)],
        ['Cuenta', detail.account?.name || ''], ['Medio de pago', detail.paymentMethod], ['Obligación', detail.obligation.title],
        ['Vencimiento', detail.occurrence.date], ['Comprobante', receipts],
        ['Atención', detail.reconciliationWillReset ? 'La conciliación de la cuenta se va a reiniciar.' : '']
      ]
    }, { onDone });
  },

  // For entry points that only know the occurrence: reverts its only payment, or asks which one when there are several.
  async revertFromOccurrence(obligation, occurrence, onDone = null) {
    const ids = occurrence.paymentIds || [];
    if (!ids.length) { showToast('Este vencimiento no tiene pagos registrados', 'error'); return false; }
    const run = transactionId => this.revertPayment({ obligationId: obligation.id, occurrenceId: occurrence.id, transactionId }, onDone);
    if (ids.length === 1) return run(ids[0]);
    const list = create('div', { style: { display: 'grid', gap: '8px' } }, ids.map((id, index) => create('button', {
      className: 'btn btn-secondary', type: 'button', textContent: `Revertir el pago ${index + 1} de ${ids.length}`, onClick: () => { Modal.hide(); run(id); }
    })));
    Modal.push('¿Qué pago querés revertir?', list, { width: '420px' });
    return null;
  },

  async pay(obligation, occurrence) {
    let context;
    try { context = await API.obligations.paymentContext(obligation.id, occurrence.id); } catch (error) { alert(error.message); return; }
    const form = create('form', { style: { display: 'grid', gap: '10px', maxHeight: '70vh', overflowY: 'auto' } });
    if (context.blocked) {
      form.appendChild(create('p', { className: 'text-muted', textContent: context.blockedReason || 'No se puede registrar el pago' }));
      Modal.show('Registrar pago', form);
      return;
    }
    const remaining = occurrence.remainingAmount ?? occurrence.actualDueAmount;
    const amount = this.moneyField(form, `Importe pagado (restante: ${remaining} ${occurrence.currencyCode})`, { currency: occurrence.currencyCode, value: remaining });
    if (context.warning) form.appendChild(create('div', { className: 'card', role: 'alert', style: { borderLeft: '4px solid var(--danger)', padding: '8px' }, textContent: context.warning }));
    const accountSelect = create('select', { className: 'form-control', required: true });
    const titular = context.accounts.filter(item => item.ownerId);
    const others = context.accounts.filter(item => !item.ownerId);
    [['Cuentas de los titulares', titular], ['Otras cuentas', others]].forEach(([label, group]) => {
      if (!group.length) return;
      const optgroup = create('optgroup', { label });
      accountTreeOptions(group).forEach(({ account: item, label }) => optgroup.appendChild(create('option', { value: item.id, textContent: `${label.replace(/ (w+)$/, '')}${item.ownerName ? ` · ${item.ownerName}` : ''} (${item.currency})` })));
      accountSelect.appendChild(optgroup);
    });
    accountSelect.value = context.suggestedAccountId || '';
    this.fieldWrap(form, 'Cuenta', accountSelect);
    const date = this.field(form, 'Fecha de pago', { type: 'date', required: true, value: new Date().toISOString().slice(0, 10) });
    const category = this.select([['', 'Seleccionar categoría'], ...this.categories.map(item => [item.id, item.nombre])], context.categoryId || obligation.categoryId || '');
    category.required = true;
    this.fieldWrap(form, 'Categoría', category);
    const method = this.select([['', 'Sin medio de pago'], ...this.paymentMethods.map(item => [item.id, `${item.name}${item.lastFour ? ` ···· ${item.lastFour}` : ''}`])], context.suggestedPaymentMethodId || '');
    this.fieldWrap(form, 'Medio de pago (opcional)', method);
    const payTitle = this.field(form, 'Título (opcional)', { value: occurrence.title || obligation.title || '' });
    payTitle.maxLength = 100;
    const payNotes = this.field(form, 'Notas', { multiline: true, required: true });
    payNotes.maxLength = 1000;
    const attachment = DocumentViewer.fileField({ label: 'Comprobante (opcional)', multiple: true });
    form.appendChild(attachment.element);
    const submit = create('button', { className: 'btn btn-primary', type: 'submit', textContent: 'Registrar pago' });
    form.appendChild(submit);
    const idempotencyKey = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    on(form, 'submit', async event => {
      event.preventDefault();
      if (!category.value) { alert('Seleccioná una categoría'); return; }
      if (!this.validNotes(payNotes)) return;
      if (!this.validMoney(amount)) return;
      const attachmentError = attachment.error();
      if (attachmentError) { showToast(attachmentError, 'error'); return; }
      submit.disabled = true;
      let result;
      try {
        result = await API.obligations.pay(obligation.id, occurrence.id, {
          amount: MoneyInput.value(amount), accountId: accountSelect.value, categoryId: category.value, date: date.value,
          ...(method.value ? { paymentMethodId: method.value } : {}),
          ...(payTitle.value.trim() ? { title: payTitle.value.trim() } : {}),
          notes: payNotes.value.trim(), idempotencyKey
        });
      } catch (error) { submit.disabled = false; alert(error.message); return; }
      Modal.hide();
      for (const receipt of attachment.files()) {
        try { await this.uploadReceipt(occurrence, receipt, result.transaction?.id || null); }
        catch (error) { showToast(`El pago se registró, pero no se pudo adjuntar el comprobante: ${error.message}. Usá "Adjuntar comprobante" en la fila.`, 'error'); break; }
      }
      await this.refresh();
    });
    Modal.show('Registrar pago', form);
  },

  // Soft delete: the obligation is cancelled (payment history stays) and disappears from the list.
  async deleteObligation(obligation) {
    const { confirmed } = await ConfirmDialog.open({ title: 'Eliminar obligación', danger: true, confirmLabel: 'Eliminar obligación', message: `Vas a eliminar la obligación "${obligation.title}". Se conservará el historial de pagos. ¿Querés continuar?` });
    if (!confirmed) return;
    await this.runAction(() => API.obligations.delete(obligation.id));
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
      if (documents.length) content.appendChild(DocumentViewer.list(documents, { empty: '' }));
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

  // Money amount field (es-AR formatted text input); read it with MoneyInput.value().
  moneyField(container, label, { currency = 'ARS', value = null } = {}) {
    const control = MoneyInput.create({ currency, value, required: true, ariaLabel: label });
    this.fieldWrap(container, label, control);
    return control;
  },

  // A required note: shows the inline error and blocks submit when it is empty after trimming.
  validNotes(control) {
    const empty = !control.value.trim();
    if (!control.errorElement) {
      control.errorElement = create('small', { className: 'text-danger', role: 'alert', dataset: { notesError: 'true' }, textContent: 'Las notas son obligatorias' });
      control.errorElement.hidden = true;
      if (control.parentNode) control.parentNode.appendChild(control.errorElement);
    }
    control.errorElement.hidden = !empty;
    control.setAttribute('aria-invalid', empty ? 'true' : 'false');
    return !empty;
  },

  // A required positive amount: shows the inline error and blocks submit otherwise.
  validMoney(control) {
    if (!MoneyInput.validate(control)) return false;
    const amount = MoneyInput.value(control);
    if (amount === null || amount <= 0) { alert('Ingresá un importe mayor a 0'); return false; }
    return true;
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
    return ({ expected: 'Pendiente', confirmed: 'Pendiente', paid: 'Pagado', resolved: 'Resuelto por inquilino', partial: 'Parcial', overdue: 'Vencido', cancelled: 'Cancelado' })[value] || statusLabel(value);
  }
};
