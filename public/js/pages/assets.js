const AssetsPage = {
  assets: [],
  owners: [],
  rentalAlerts: [],

  async render(filters = {}) {
    const content = $('#page-content');
    $('#navbar').style.display = '';
    content.style.paddingBottom = '';
    content.innerHTML = '<div class="loading">Cargando bienes...</div>';
    try {
      const [assets, owners, rentalAlerts] = await Promise.all([API.assets.list(filters), API.owners.list(), API.rentals.alerts()]);
      this.assets = assets;
      this.owners = owners;
      this.rentalAlerts = rentalAlerts;
      this.renderContent(content, filters);
    } catch (error) {
      content.replaceChildren(create('div', { className: 'empty-state', textContent: `No se pudieron cargar los bienes: ${error.message}` }));
    }
  },

  renderContent(content, filters = {}) {
    content.replaceChildren();
    const header = create('div', { className: 'page-header' }, [
      create('h2', { className: 'page-title', textContent: 'Bienes' }),
      create('button', { className: 'btn btn-primary btn-sm', textContent: '+ Nuevo bien', onClick: () => this.showAssetModal() })
    ]);
    content.appendChild(header);
    if (this.rentalAlerts.length) {
      const reminders = create('section', { className: 'card', style: { marginBottom: '12px' } }, [create('h3', { textContent: 'Avisos de alquiler' })]);
      this.rentalAlerts.forEach(alert => reminders.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', style: { display: 'block', textAlign: 'left', width: '100%' }, textContent: alert.type === 'rent_due' ? `${alert.date} · Alquiler pendiente de ${alert.assetName}: ${alert.amount} ${alert.currencyCode}` : `${alert.date} · Vence el contrato de ${alert.assetName}`, onClick: () => this.showDetails(alert.assetId) })));
      content.appendChild(reminders);
    }

    const form = create('form', { className: 'card', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '10px', marginBottom: '16px' } });
    const q = this.filterInput('Buscar nombre o detalle', filters.q || '');
    const type = this.filterSelect('Tipo', [['', 'Todos'], ['movable', 'Mueble'], ['immovable', 'Inmueble']], filters.type || '');
    const owner = this.filterSelect('Titular legal', [['', 'Todos'], ...this.owners.filter(item => (item.roles || ['owner']).includes('owner')).map(item => [item.id, item.name])], filters.ownerId || '');
    const status = this.filterInput('Estado', filters.status || '');
    const usage = this.filterSelect('Uso', [['', 'Todos'], ...this.usageOptions()], filters.usage || '');
    const location = this.filterInput('Ubicación', filters.location || '');
    [q, type, owner, status, usage, location].forEach(field => form.appendChild(field));
    form.appendChild(create('button', { className: 'btn btn-secondary', type: 'submit', textContent: 'Filtrar' }));
    form.appendChild(create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Limpiar', onClick: () => this.render() }));
    on(form, 'submit', event => {
      event.preventDefault();
      this.render({ q: q.value.trim(), type: type.value, ownerId: owner.value, status: status.value.trim(), usage: usage.value, location: location.value.trim() });
    });
    content.appendChild(form);

    if (!this.assets.length) {
      content.appendChild(create('div', { className: 'empty-state', innerHTML: '<div class="empty-state-icon">🏠</div><p class="empty-state-text">No hay bienes que coincidan con la búsqueda</p>' }));
      return;
    }
    const list = create('div', { style: { display: 'grid', gap: '10px' } });
    this.assets.forEach(asset => {
      const meta = asset.type === 'immovable'
        ? [this.optionLabel(this.propertyKindOptions(), asset.propertyKind) || asset.propertyType, this.optionLabel(this.conditionOptions(), asset.condition) || this.usageLabel(asset.usageStatus), asset.location || [asset.locality, asset.province, asset.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
        : [asset.brand, asset.plate, asset.subtype, asset.location].filter(Boolean).join(' · ');
      const card = create('article', { className: 'card', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } });
      const details = create('div', {}, [
        create('strong', { textContent: asset.name }),
        create('div', { textContent: `${asset.type === 'immovable' ? 'Inmueble' : 'Mueble'}${meta ? ` · ${meta}` : ''}`, style: { color: 'var(--text-muted)', fontSize: 'var(--font-sm)', marginTop: '4px' } }),
        create('div', { textContent: `Estado: ${asset.status || 'active'}${asset.owners?.length ? ` · Titular: ${asset.owners.map(item => item.name).join(', ')}` : ''}`, style: { color: 'var(--text-muted)', fontSize: 'var(--font-sm)', marginTop: '3px' } })
      ]);
      const actions = create('div', { style: { display: 'flex', gap: '8px' } }, [
        create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Ver historial', onClick: () => this.showDetails(asset.id) }),
        create('button', { className: 'btn btn-secondary btn-sm', textContent: 'Editar', onClick: async () => { try { this.showAssetModal(await API.assets.get(asset.id)); } catch (error) { showToast(error.message, 'error'); } } })
      ]);
      if (asset.type === 'immovable') actions.appendChild(create('button', { className: 'btn btn-secondary btn-sm', textContent: 'Alquileres', onClick: () => this.showDetails(asset.id) }));
      card.append(details, actions);
      list.appendChild(card);
    });
    content.appendChild(list);
  },

  filterInput(label, value) {
    const input = create('input', { className: 'form-control', type: 'text', value, placeholder: label, 'aria-label': label });
    return input;
  },

  filterSelect(label, options, selected) {
    const select = this.select(options, selected);
    select.setAttribute('aria-label', label);
    return select;
  },

  select(options, selected = '') {
    const select = create('select', { className: 'form-control' });
    options.forEach(([value, text]) => select.appendChild(create('option', { value, textContent: text })));
    select.value = selected;
    return select;
  },

  usageOptions() {
    return [['rented', 'Alquilado'], ['family_home', 'Uso familiar / vivienda'], ['own_use', 'Uso propio'], ['vacant', 'Vacío'], ['renovation', 'En reforma'], ['own_commercial', 'Uso comercial / industrial propio'], ['other', 'Otro']];
  },

  usageLabel(value) {
    return this.usageOptions().find(([key]) => key === value)?.[1] || value || '';
  },

  addField(container, labelText, options = {}) {
    const group = create('div', { className: 'form-group' });
    const label = create('label', { textContent: labelText });
    const control = create(options.multiline ? 'textarea' : 'input', {
      className: 'form-control',
      ...(options.multiline ? { rows: options.rows || 3 } : { type: options.type || 'text' }),
      placeholder: options.placeholder || ''
    });
    control.value = options.value ?? '';
    if (options.step) control.step = options.step;
    if (options.min !== undefined) control.min = options.min;
    if (options.required) control.required = true;
    group.append(label, control);
    container.appendChild(group);
    return control;
  },

  propertyKindOptions() {
    return [['departamento', 'Departamento'], ['casa', 'Casa'], ['galpon', 'Galpón'], ['lote', 'Lote']];
  },

  conditionOptions() {
    return [['rented', 'Alquilado'], ['not_rented', 'No alquilado'], ['usufruct', 'Usufructo']];
  },

  optionLabel(options, value) {
    return options.find(([key]) => key === value)?.[1] || '';
  },

  parseIntegerField(control, label) {
    const raw = control.value.trim();
    if (raw === '') return { value: null };
    if (!/^\d+$/.test(raw)) return { error: `${label} debe ser un número entero igual o mayor que cero` };
    return { value: Number(raw) };
  },

  identifierLabel(type) {
    return ({ account: 'Cuenta Nº', contract: 'Contrato Nº', meter: 'Medidor Nº', policy: 'Póliza Nº', client: 'Cliente Nº' })[type] || 'Identificador';
  },

  obligationLine(item) {
    const provider = item.providerName || 'Sin proveedor';
    return item.externalIdentifier ? `${provider} - ${this.identifierLabel(item.externalIdentifierType)}: ${item.externalIdentifier}` : `${provider} - ${item.title}`;
  },

  // Rental block + cadastral identification + obligations list (evolutivo-2 S7). Returns a controller used by the save handler.
  renderRentalAndObligations(slot, asset, conditionSelect) {
    slot.replaceChildren();
    const contract = asset?.activeContract || null;
    const locked = Boolean(contract?.locked);
    const items = asset?.obligations || [];
    const tenants = this.owners.filter(owner => (owner.roles || []).includes('tenant'));
    const block = create('section', { className: 'card', style: { padding: '10px', marginBottom: '10px' }, dataset: { rentalBlock: 'true' } });
    const tenant = this.select([['', 'Seleccionar inquilino'], ...tenants.map(item => [item.id, item.name])], contract?.tenantIds?.[0] || '');
    const startDate = create('input', { className: 'form-control', type: 'date', value: contract?.startDate || '' });
    const endDate = create('input', { className: 'form-control', type: 'date', value: contract?.endDate || '' });
    const amount = create('input', { className: 'form-control', type: 'number', min: '1', step: '1', value: contract?.initialRent ?? '' });
    const currency = this.select(['ARS', 'EUR', 'USD'].map(code => [code, code]), contract?.currencyCode || 'ARS');
    const frequency = create('input', { className: 'form-control', type: 'text', inputMode: 'numeric', value: contract?.adjustmentFrequencyMonths ?? '' });
    const criterion = create('input', { className: 'form-control', type: 'text', placeholder: 'Ej.: porcentaje, IPC', value: contract?.adjustmentCriterion || '' });
    if (locked) [tenant, startDate, amount, currency].forEach(control => { control.disabled = true; });
    const labelled = (text, control) => create('div', { className: 'form-group' }, [create('label', { textContent: text }), control]);
    block.append(labelled('Inquilino', tenant), labelled('Contrato vigente desde', startDate), labelled('Hasta', endDate), labelled('Monto original', amount), labelled('Moneda', currency), labelled('Frecuencia ajuste (meses)', frequency), labelled('Criterio ajuste', criterion));
    if (locked) block.appendChild(create('small', { className: 'text-muted', textContent: 'Para cambiar el inquilino, marcá el bien como No alquilado y volvé a declararlo' }));
    const responsibilities = create('div', { style: { display: 'grid', gap: '6px', marginTop: '8px' } });
    responsibilities.appendChild(create('strong', { textContent: 'Obligaciones del bien' }));
    if (!items.length) responsibilities.appendChild(create('small', { className: 'text-muted', textContent: 'Este bien todavía no tiene obligaciones asignadas.' }));
    const selectors = new Map();
    items.forEach(item => {
      const row = create('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, [create('span', { textContent: this.obligationLine(item) })]);
      if (['owner', 'tenant'].includes(item.responsibilityType)) {
        const selector = this.select([['owner', 'Titular'], ['tenant', 'Inquilino']], item.responsibilityType);
        selector.setAttribute('aria-label', 'A cargo de');
        selectors.set(item.id, selector);
        row.appendChild(create('label', {}, [create('span', { textContent: 'A cargo de: ' }), selector]));
      } else row.appendChild(create('small', { className: 'text-muted', textContent: 'A cargo de: compartida (solo lectura)' }));
      responsibilities.appendChild(row);
    });
    block.appendChild(responsibilities);

    const catastral = create('section', { style: { marginBottom: '10px' } }, [create('h4', { textContent: 'Identificación catastral' })]);
    if (!asset?.id) catastral.appendChild(create('small', { className: 'text-muted', textContent: 'Guardá el bien para asignarle obligaciones.' }));
    else if (!items.length) catastral.appendChild(create('small', { className: 'text-muted', textContent: 'Sin obligaciones asignadas.' }));
    items.forEach(item => catastral.appendChild(create('p', { style: { margin: '4px 0' }, textContent: this.obligationLine(item) })));
    catastral.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Nueva obligación', disabled: !asset?.id,
      onClick: () => { Modal.hide(); Router.navigate(`/obligations?newForAsset=${encodeURIComponent(asset.id)}`); } }));
    const confirmBox = create('div', { className: 'card', style: { display: 'none', padding: '10px', marginBottom: '10px' }, dataset: { endContractConfirm: 'true' } });
    slot.append(block, confirmBox, catastral);

    const rented = () => ['rented', 'usufruct'].includes(conditionSelect.value);
    const refresh = () => { block.style.display = rented() ? '' : 'none'; confirmBox.style.display = 'none'; };
    on(conditionSelect, 'change', refresh);
    refresh();
    return {
      needsEndConfirmation: () => Boolean(contract) && !rented(),
      askEndConfirmation: onConfirm => {
        confirmBox.replaceChildren(
          create('p', { textContent: 'Al marcar el bien como No alquilado se finaliza el contrato vigente y las obligaciones a cargo del inquilino vuelven al titular.' }),
          create('button', { className: 'btn btn-danger btn-sm', type: 'button', textContent: 'Finalizar contrato y guardar', onClick: onConfirm }),
          create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Cancelar', onClick: () => { confirmBox.style.display = 'none'; } })
        );
        confirmBox.style.display = '';
      },
      collect: () => {
        if (!rented()) return { rental: null, obligationResponsibilities: [] };
        const obligationResponsibilities = [...selectors].map(([obligationId, selector]) => ({ obligationId, responsibilityType: selector.value }));
        const parsedFrequency = this.parseIntegerField(frequency, 'La frecuencia de ajuste');
        if (parsedFrequency.error) return { error: parsedFrequency.error };
        const adjustment = { adjustmentFrequencyMonths: parsedFrequency.value, adjustmentCriterion: criterion.value.trim() || null };
        if (locked) return { rental: { tenantId: contract.tenantIds[0], startDate: contract.startDate, endDate: endDate.value || null, amount: contract.initialRent, currencyCode: contract.currencyCode, ...adjustment }, obligationResponsibilities };
        if (!tenant.value) return { error: 'Seleccioná un inquilino' };
        if (!startDate.value) return { error: 'Indicá desde cuándo rige el contrato' };
        if (!/^\d+$/.test(amount.value.trim()) || Number(amount.value) <= 0) return { error: 'El monto original debe ser un número entero positivo' };
        return { rental: { tenantId: tenant.value, startDate: startDate.value, endDate: endDate.value || null, amount: Number(amount.value), currencyCode: currency.value, ...adjustment }, obligationResponsibilities };
      }
    };
  },

  showAssetModal(asset = null) {
    const editing = Boolean(asset);
    const form = create('div', { style: { maxHeight: '65vh', overflowY: 'auto', paddingRight: '4px' } });
    const typeControl = this.select([['movable', 'Mueble'], ['immovable', 'Inmueble']], asset?.type || 'movable');
    if (editing) typeControl.disabled = true;
    form.appendChild(create('div', { className: 'form-group' }, [create('label', { textContent: 'Clasificación' }), typeControl]));

    // Titular block (shared by both types)
    const ownersSection = create('section', { className: 'form-group' });
    ownersSection.appendChild(create('label', { textContent: 'Titular' }));
    const ownerRows = create('div', { style: { display: 'grid', gap: '8px' } });
    const ownerHint = create('small', { className: 'text-muted' });
    const ownerChoices = [['', 'Seleccionar titular'], ...this.owners.filter(owner => (owner.roles || ['owner']).includes('owner')).map(owner => [owner.id, owner.name])];
    const prefilled = new Map();
    const refreshOwners = () => {
      const rows = [...ownerRows.querySelectorAll('[data-owner-row]')];
      const multiple = rows.length > 1;
      rows.forEach(row => {
        row._fields.percentageGroup.style.display = multiple ? '' : 'none';
        row._fields.remove.style.display = multiple ? '' : 'none';
      });
      const sum = rows.reduce((total, row) => total + (Number(row._fields.percentage.value) || 0), 0);
      ownerHint.textContent = multiple ? `Total: ${Math.round(sum * 100) / 100}% (debe sumar 100%)` : '';
    };
    const addOwnerRow = (record = {}) => {
      const row = create('div', { className: 'card', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', padding: '10px' } });
      const select = this.select(ownerChoices, record.ownerId || '');
      select.setAttribute('aria-label', 'Titular');
      const percentage = create('input', { className: 'form-control', type: 'text', inputMode: 'decimal', placeholder: '%', value: record.percentage ?? '', 'aria-label': 'Porcentaje' });
      const percentageGroup = create('label', {}, [create('span', { textContent: 'Porcentaje (%)' }), percentage]);
      const remove = create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Quitar', onClick: () => { row.remove(); refreshOwners(); } });
      row.append(create('label', {}, [create('span', { textContent: 'Titular' }), select]), percentageGroup, remove);
      row.dataset.ownerRow = 'true';
      row._fields = { select, percentage, percentageGroup, remove };
      on(percentage, 'input', refreshOwners);
      ownerRows.appendChild(row);
      refreshOwners();
    };
    const openHolders = (asset?.ownerships || []).filter(record => !record.endDate);
    openHolders.forEach(record => prefilled.set(record.ownerId, record.percentage ?? null));
    if (openHolders.length) openHolders.forEach(record => addOwnerRow({ ownerId: record.ownerId, percentage: record.percentage }));
    else addOwnerRow();
    ownersSection.append(ownerRows, ownerHint, create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Agregar titular', style: { marginTop: '8px' }, onClick: () => addOwnerRow() }));
    form.appendChild(ownersSection);

    const title = this.addField(form, 'Título', { value: asset?.name || '', required: true });
    const kindFields = create('div');
    form.appendChild(kindFields);
    const fields = {};
    let rentalUi = null;
    let endConfirmed = false;
    const renderKind = () => {
      kindFields.replaceChildren();
      rentalUi = null;
      Object.keys(fields).forEach(key => delete fields[key]);
      const same = asset?.type === typeControl.value;
      if (typeControl.value === 'movable') {
        const group = create('div', { className: 'form-group' }, [create('label', { textContent: 'Tipo' })]);
        fields.vehicleType = this.select([['automovil', 'Automóvil']], asset?.vehicleType || 'automovil');
        group.appendChild(fields.vehicleType);
        kindFields.appendChild(group);
        fields.brand = this.addField(kindFields, 'Marca', { value: same ? asset.brand || '' : '' });
        fields.plate = this.addField(kindFields, 'Dominio', { value: same ? asset.plate || '' : '' });
        fields.mileage = this.addField(kindFields, 'KMs', { value: same ? asset.mileage || '' : '' });
        fields.color = this.addField(kindFields, 'Color', { value: same ? asset.color || '' : '' });
      } else {
        const group = create('div', { className: 'form-group' }, [create('label', { textContent: 'Tipo' })]);
        fields.propertyKind = this.select([['', 'Seleccionar tipo'], ...this.propertyKindOptions()], same ? asset.propertyKind || '' : '');
        group.appendChild(fields.propertyKind);
        kindFields.appendChild(group);
        fields.characteristics = this.addField(kindFields, 'Características', { value: same ? asset.characteristics || '' : '', multiline: true });
        fields.location = this.addField(kindFields, 'Ubicación', { value: same ? asset.location || '' : '' });
        fields.coveredAreaM2 = this.addField(kindFields, 'Superficie cubierta (m²)', { type: 'number', min: 0, step: '1', value: same ? asset.coveredAreaM2 ?? '' : '' });
        fields.freeAreaM2 = this.addField(kindFields, 'Superficie libre (m²)', { type: 'number', min: 0, step: '1', value: same ? asset.freeAreaM2 ?? '' : '' });
        fields.ageYears = this.addField(kindFields, 'Antigüedad', { type: 'number', min: 0, step: '1', value: same ? asset.ageYears ?? '' : '' });
        const conditionGroup = create('div', { className: 'form-group' }, [create('label', { textContent: 'Condición' })]);
        fields.condition = this.select(this.conditionOptions(), same ? asset.condition || 'not_rented' : 'not_rented');
        conditionGroup.appendChild(fields.condition);
        kindFields.appendChild(conditionGroup);
        const slot = create('div', { dataset: { slot: 'rental-and-obligations' } });
        kindFields.appendChild(slot);
        rentalUi = this.renderRentalAndObligations(slot, same ? asset : null, fields.condition);
      }
    };
    typeControl.addEventListener('change', renderKind);
    renderKind();
    const notes = this.addField(form, 'Notas', { value: asset?.notes || '', multiline: true });

    const footer = create('div', { style: { display: 'flex', gap: '8px' } }, [
      create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cancelar', onClick: () => Modal.hide() }),
      create('button', { className: 'btn btn-primary', type: 'button', textContent: editing ? 'Guardar cambios' : 'Crear bien' })
    ]);
    on(footer.lastChild, 'click', async () => {
      const payload = { type: typeControl.value, name: title.value.trim(), notes: notes.value.trim() };
      if (!payload.name) return showToast('El título es obligatorio', 'error');
      if (typeControl.value === 'movable') {
        payload.vehicleType = fields.vehicleType.value;
        ['brand', 'plate', 'mileage', 'color'].forEach(key => { payload[key] = fields[key].value.trim(); });
      } else {
        if (!fields.propertyKind.value) return showToast('El tipo de inmueble es obligatorio', 'error');
        payload.propertyKind = fields.propertyKind.value;
        payload.characteristics = fields.characteristics.value.trim();
        payload.location = fields.location.value.trim();
        payload.condition = fields.condition.value;
        const labels = { coveredAreaM2: 'La superficie cubierta', freeAreaM2: 'La superficie libre', ageYears: 'La antigüedad' };
        for (const key of Object.keys(labels)) {
          const parsed = this.parseIntegerField(fields[key], labels[key]);
          if (parsed.error) return showToast(parsed.error, 'error');
          payload[key] = parsed.value;
        }
      }
      const rows = [...ownerRows.querySelectorAll('[data-owner-row]')].map(row => row._fields).filter(item => item.select.value);
      if (!rows.length) return showToast('Debe indicar al menos un titular', 'error');
      const owners = rows.map(item => {
        if (rows.length === 1) return { ownerId: item.select.value, percentage: prefilled.get(item.select.value) ?? null };
        const percentage = Number(item.percentage.value.replace(',', '.'));
        return { ownerId: item.select.value, percentage: item.percentage.value.trim() === '' ? null : percentage };
      });
      if (owners.length > 1) {
        if (owners.some(item => !(item.percentage > 0))) return showToast('Cada titular debe tener un porcentaje mayor que 0', 'error');
        if (Math.abs(owners.reduce((total, item) => total + item.percentage, 0) - 100) > 0.01) return showToast('El total de los porcentajes debe ser 100', 'error');
      }
      let rentalPart = { rental: null, obligationResponsibilities: [] };
      if (rentalUi) {
        if (rentalUi.needsEndConfirmation() && !endConfirmed) return rentalUi.askEndConfirmation(() => { endConfirmed = true; footer.lastChild.click(); });
        rentalPart = rentalUi.collect();
        if (rentalPart.error) return showToast(rentalPart.error, 'error');
      }
      try {
        await API.assets.saveForm(editing ? asset.id : null, { asset: payload, owners, rental: rentalPart.rental, obligationResponsibilities: rentalPart.obligationResponsibilities });
        Modal.hide();
        showToast(editing ? 'Bien actualizado' : 'Bien creado');
        this.render();
      } catch (error) { showToast(error.message, 'error'); }
    });
    Modal.show(editing ? 'Editar bien' : 'Nuevo bien', form, { footer });
  },

  legacyLines(asset) {
    const lines = [];
    const add = (label, value) => { if (value !== undefined && value !== null && value !== '') lines.push(`${label}: ${value}`); };
    add('Descripción', asset.description);
    add('Adquisición', [asset.acquisitionDate, asset.acquisitionValue != null ? asset.acquisitionValue : ''].filter(value => value !== '' && value !== null && value !== undefined).join(' · '));
    add('Estado', asset.status && asset.status !== 'active' ? asset.status : '');
    add('Subtipo', asset.subtype);
    add('Tipo de inmueble (texto libre)', asset.propertyType);
    add('Dirección', [asset.address, asset.locality, asset.province, asset.country].filter(Boolean).join(', '));
    add('Superficie (m²)', asset.area);
    add('Uso actual', asset.condition ? '' : this.usageLabel(asset.usageStatus));
    return lines;
  },

  renderLegacyData(asset, container) {
    const lines = this.legacyLines(asset);
    if (!lines.length) return;
    const section = create('section', { style: { borderTop: '1px solid var(--border-color)', marginTop: '12px', paddingTop: '8px' } });
    section.appendChild(create('h4', { textContent: 'Datos anteriores' }));
    lines.forEach(text => section.appendChild(create('p', { className: 'text-muted', style: { margin: '4px 0' }, textContent: text })));
    container.appendChild(section);
  },

  async showDetails(id) {
    try {
      const asset = await API.assets.get(id);
      const body = create('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
      body.append(create('p', { textContent: `${asset.type === 'immovable' ? 'Inmueble' : 'Mueble'}${asset.type === 'immovable' && asset.condition ? ` · ${this.optionLabel(this.conditionOptions(), asset.condition)}` : ''}` }));
      const typed = asset.type === 'immovable'
        ? [['Tipo', this.optionLabel(this.propertyKindOptions(), asset.propertyKind)], ['Características', asset.characteristics], ['Ubicación', asset.location],
          ['Superficie cubierta', asset.coveredAreaM2 != null ? `${asset.coveredAreaM2} m²` : ''], ['Superficie libre', asset.freeAreaM2 != null ? `${asset.freeAreaM2} m²` : ''], ['Antigüedad', asset.ageYears != null ? asset.ageYears : '']]
        : [['Tipo', asset.vehicleType === 'automovil' ? 'Automóvil' : ''], ['Marca', asset.brand], ['Dominio', asset.plate], ['KMs', asset.mileage], ['Color', asset.color]];
      typed.forEach(([label, value]) => { if (value !== '' && value != null) body.appendChild(create('p', { style: { margin: '4px 0' }, textContent: `${label}: ${value}` })); });
      if (asset.notes) body.appendChild(create('p', { textContent: `Notas: ${asset.notes}` }));
      this.renderLegacyData(asset, body);
      await this.renderAssetFile(asset, body);
      await this.renderRecoveries(asset, body);
      await this.renderEconomicAnalysis(asset, body);
      this.renderMonthlyView(asset, body);
      body.appendChild(create('h4', { textContent: 'Historial de titularidad', style: { marginTop: '14px' } }));
      (asset.ownerships || []).forEach(record => {
        const line = create('div', { className: 'card', style: { marginTop: '8px' } });
        line.appendChild(create('p', { textContent: `${record.owner?.name || 'Titular'}${record.percentage !== null ? ` · ${record.percentage}%` : ''}` }));
        line.appendChild(create('small', { textContent: `${record.startDate}${record.endDate ? ` — ${record.endDate}` : ' — vigente'}${record.notes ? ` · ${record.notes}` : ''}` }));
        if (!record.endDate) line.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Finalizar titularidad hoy', style: { marginTop: '6px' }, onClick: async () => {
          try { await API.assets.closeOwnership(id, record.id, new Date().toISOString().slice(0, 10)); await this.showDetails(id); }
          catch (error) { showToast(error.message, 'error'); }
        } }));
        body.appendChild(line);
      });
      const addGroup = create('div', { style: { borderTop: '1px solid var(--border-color)', marginTop: '12px', paddingTop: '12px' } });
      addGroup.appendChild(create('h4', { textContent: 'Añadir titularidad' }));
      const ownerSelect = this.select([['', 'Seleccionar titular'], ...this.owners.filter(owner => (owner.roles || ['owner']).includes('owner')).map(owner => [owner.id, owner.name])]);
      const startDate = create('input', { className: 'form-control', type: 'date', value: new Date().toISOString().slice(0, 10) });
      const percentage = create('input', { className: 'form-control', type: 'number', min: '0', max: '100', step: '0.01', placeholder: 'Porcentaje informativo' });
      const ownerNotes = create('input', { className: 'form-control', type: 'text', placeholder: 'Notas' });
      addGroup.append(ownerSelect, startDate, percentage, ownerNotes, create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Añadir', style: { marginTop: '8px' }, onClick: async () => {
        try {
          await API.assets.addOwnership(id, { ownerId: ownerSelect.value, startDate: startDate.value, percentage: percentage.value === '' ? null : Number(percentage.value), notes: ownerNotes.value.trim() });
          await this.showDetails(id);
        } catch (error) { showToast(error.message, 'error'); }
      } }));
      body.appendChild(addGroup);
      if (asset.type === 'immovable') await this.renderRentals(asset, body);
      body.appendChild(create('h4', { textContent: 'Historial de estados', style: { marginTop: '14px' } }));
      (asset.statusHistory || []).slice().reverse().forEach(event => body.appendChild(create('p', { textContent: `${event.status} · ${new Date(event.changedAt).toLocaleDateString()}${event.notes ? ` · ${event.notes}` : ''}` })));
      await WealthRecords.renderPanel(body, 'asset', id);
      const footer = create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() })]);
      Modal.show(asset.name, body, { footer });
    } catch (error) { showToast(error.message, 'error'); }
  },

  async renderRecoveries(asset, container) {
    const section = create('section', { style: { borderTop: '1px solid var(--border-color)', marginTop: '16px', paddingTop: '12px' } });
    section.appendChild(create('h4', { textContent: 'Gastos recuperables e importes pendientes' }));
    const rows = create('div', { style: { display: 'grid', gap: '8px' } });
    const addButton = create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Registrar gasto recuperable' });
    section.append(rows, addButton);
    container.appendChild(section);
    try {
      const [claims, allocations] = await Promise.all([API.finance.claims({ assetId: asset.id }), API.finance.allocations({ assetId: asset.id })]);
      rows.appendChild(create('strong', { textContent: 'Movimientos atribuidos' }));
      if (!allocations.length) rows.appendChild(create('small', { textContent: 'No hay movimientos atribuidos a este bien.' }));
      allocations.forEach(allocation => {
        const row = create('div', { className: 'card', style: { padding: '8px', display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' } });
        row.appendChild(create('span', { textContent: `${allocation.transaction.titulo} · ${allocation.transaction.fecha} · ${allocation.amount} ${allocation.currencyCode} · ${allocation.transaction.tipo}` }));
        row.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Editar atribuciones', disabled: Boolean(allocation.transaction.obligationOccurrenceId || allocation.transaction.rentCollectionId), onClick: () => TransactionForm.show(() => this.showDetails(asset.id), allocation.transaction) }));
        rows.appendChild(row);
      });
      rows.appendChild(create('strong', { textContent: 'Reclamos de reintegro' }));
      if (!claims.length) rows.appendChild(create('small', { textContent: 'Todavía no hay gastos recuperables asociados.' }));
      claims.forEach(claim => {
        const card = create('article', { className: 'card', style: { padding: '10px' } });
        card.appendChild(create('strong', { textContent: `${claim.transaction?.titulo || 'Gasto'} · ${claim.amount} ${claim.currencyCode}` }));
        card.appendChild(create('p', { className: 'text-muted', textContent: `${claim.recoveredAmount} recuperado · ${claim.outstandingAmount} pendiente${claim.tenantEntityId ? ` · Inquilino: ${this.owners.find(owner => owner.id === claim.tenantEntityId)?.name || ''}` : ''}` }));
        if (claim.outstandingMinor > 0) card.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Registrar reintegro', onClick: async () => {
          try {
            const accounts = await API.accounts.list();
            const available = accounts.filter(account => account.activo && account.currency === claim.currencyCode);
            if (!available.length) return showToast('No hay una cuenta activa en la moneda del reclamo', 'error');
            const form = create('div', { style: { display: 'grid', gap: '8px' } });
            const amount = create('input', { className: 'form-control', type: 'number', min: '0.01', step: ['JPY', 'KRW', 'CLP', 'PYG'].includes(claim.currencyCode) ? '1' : '0.01', value: claim.outstandingAmount });
            const account = this.select(available.map(item => [item.id, item.nombre]));
            form.append(create('label', {}, [create('span', { textContent: `Importe recibido (pendiente: ${claim.outstandingAmount} ${claim.currencyCode})` }), amount]));
            form.append(create('label', {}, [create('span', { textContent: 'Cuenta de ingreso' }), account]));
            Modal.show('Registrar reintegro', form, { footer: create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Guardar ingreso', onClick: async () => {
              try {
                await API.finance.collectClaim(claim.id, {
                  amount: Number(amount.value), accountId: account.value,
                  idempotencyKey: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}-recovery`
                });
                Modal.hide();
                await this.showDetails(asset.id);
              } catch (error) { showToast(error.message, 'error'); }
            } } )]) });
          } catch (error) { showToast(error.message, 'error'); }
        } }));
        (claim.recoveries || []).forEach(recovery => card.appendChild(create('small', { style: { display: 'block' }, textContent: `${recovery.date} · ${recovery.amount} ${recovery.currencyCode} · ingreso real` })));
        rows.appendChild(card);
      });
    } catch (error) {
      rows.appendChild(create('small', { textContent: `No se pudieron cargar los reintegros: ${error.message}` }));
    }
    addButton.addEventListener('click', async () => {
      try {
        const [transactions, contracts, owners] = await Promise.all([API.transactions.list(), API.rentals.list({ assetId: asset.id }), API.owners.list()]);
        const expenses = transactions.filter(item => item.tipo === 'expense' && !item.isRecurringInstance && !item.recoverableClaimId);
        const tenants = owners.filter(item => (item.roles || []).includes('tenant'));
        const form = create('div', { style: { display: 'grid', gap: '8px' } });
        const expense = this.select([['', 'Seleccionar gasto'], ...expenses.map(item => [item.id, `${item.titulo} · ${item.fecha} · ${item.monto} ${item.currencyCode || 'EUR'}`])]);
        const contract = this.select([['', 'Sin contrato'], ...contracts.map(item => [item.id, `${item.startDate} · ${item.tenants.map(tenant => tenant.name).join(', ')}`])]);
        const tenant = this.select([['', 'Sin inquilino'], ...tenants.map(item => [item.id, item.name])]);
        const amount = create('input', { className: 'form-control', type: 'number', min: '0.01', step: '0.01', placeholder: 'Importe recuperable' });
        const selectedExpense = () => expenses.find(item => item.id === expense.value);
        expense.addEventListener('change', () => {
          const selected = selectedExpense();
          amount.value = selected?.monto || '';
          amount.step = ['JPY', 'KRW', 'CLP', 'PYG'].includes(selected?.currencyCode) ? '1' : '0.01';
        });
        form.append(create('label', {}, [create('span', { textContent: 'Gasto de origen' }), expense]));
        form.append(create('label', {}, [create('span', { textContent: 'Contrato de alquiler (opcional)' }), contract]));
        form.append(create('label', {}, [create('span', { textContent: 'Inquilino responsable (opcional)' }), tenant]));
        form.append(create('label', {}, [create('span', { textContent: 'Importe recuperable' }), amount]));
        Modal.show('Registrar gasto recuperable', form, { footer: create('div', {}, [
          create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Guardar reclamo', onClick: async () => {
            try {
              await API.finance.createClaim({ transactionId: expense.value, assetId: asset.id, contractId: contract.value || null, tenantEntityId: tenant.value || null, amount: Number(amount.value) });
              Modal.hide();
              await this.showDetails(asset.id);
            } catch (error) { showToast(error.message, 'error'); }
          } })
        ]) });
      } catch (error) { showToast(error.message, 'error'); }
    });
  },

  async renderEconomicAnalysis(asset, container) {
    const section = create('section', { style: { borderTop: '1px solid var(--border-color)', marginTop: '16px', paddingTop: '12px' } });
    section.appendChild(create('h4', { textContent: 'Análisis económico del bien' }));
    section.appendChild(create('p', { className: 'text-muted', textContent: 'Solo incluye movimientos reales contabilizados y atribuidos a este bien. Los importes pendientes se muestran aparte; no se convierten monedas.' }));
    const controls = create('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' } });
    const mode = this.select([
      ['acquisition', 'Desde adquisición o gestión hasta hoy'],
      ['contract', 'Desde contratos activos hasta hoy'],
      ['month', 'Mes seleccionado'],
      ['year', 'Año seleccionado'],
      ['custom', 'Rango personalizado']
    ]);
    mode.setAttribute('aria-label', 'Período del análisis económico');
    const today = new Date();
    const month = create('input', { className: 'form-control', type: 'month', value: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`, 'aria-label': 'Mes' });
    const year = create('input', { className: 'form-control', type: 'number', min: '1900', max: '9999', value: String(today.getFullYear()), 'aria-label': 'Año' });
    const from = create('input', { className: 'form-control', type: 'date', 'aria-label': 'Desde' });
    const to = create('input', { className: 'form-control', type: 'date', value: today.toISOString().slice(0, 10), 'aria-label': 'Hasta' });
    const monthLabel = create('label', { textContent: 'Mes' }, [month]);
    const yearLabel = create('label', { textContent: 'Año' }, [year]);
    const fromLabel = create('label', { textContent: 'Desde' }, [from]);
    const toLabel = create('label', { textContent: 'Hasta' }, [to]);
    controls.append(mode, monthLabel, yearLabel, fromLabel, toLabel);
    section.appendChild(controls);
    const report = create('div', { style: { display: 'grid', gap: '8px', marginTop: '10px' } });
    section.appendChild(report);
    container.appendChild(section);

    const updateControls = () => {
      monthLabel.style.display = mode.value === 'month' ? '' : 'none';
      yearLabel.style.display = mode.value === 'year' ? '' : 'none';
      fromLabel.style.display = mode.value === 'custom' ? '' : 'none';
      toLabel.style.display = mode.value === 'custom' ? '' : 'none';
    };
    mode.addEventListener('change', updateControls);
    updateControls();
    const load = async () => {
      const filters = { period: mode.value };
      if (mode.value === 'month') filters.month = month.value;
      if (mode.value === 'year') filters.year = year.value;
      if (mode.value === 'custom') { filters.from = from.value; filters.to = to.value; }
      report.replaceChildren(create('small', { textContent: 'Cargando análisis económico...' }));
      try {
        const result = await API.assets.economics(asset.id, filters);
        this.renderEconomicResult(report, result);
      } catch (error) {
        report.replaceChildren(create('small', { textContent: `No se pudo cargar el análisis económico: ${error.message}` }));
      }
    };
    controls.appendChild(create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Actualizar período', onClick: load }));
    await load();
  },

  async renderAssetFile(asset, container) {
    const section = create('section', { style: { borderTop: '1px solid var(--border-color)', marginTop: '12px', paddingTop: '8px' } });
    section.appendChild(create('h4', { textContent: 'Ficha del bien' }));
    container.appendChild(section);
    let file;
    try { file = await API.getAssetFile(asset.id); } catch (error) {
      section.appendChild(create('p', { className: 'text-muted', textContent: error.message || 'No se pudo cargar la ficha' }));
      return;
    }
    const money = (minor, currency) => `${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)} ${currency || ''}`.trim();
    const totals = map => Object.entries(map || {}).map(([currency, minor]) => money(minor, currency)).join(' · ') || 'Sin movimientos';
    const responsibility = { owner: 'Propietario', tenant: 'Inquilino', shared: 'Compartido', third: 'Tercero', none: 'Sin responsable' };
    const settled = { owner: 'pagó el propietario', tenant: 'resolvió el inquilino', third: 'pagó un tercero', shared: 'pago compartido' };
    const resolution = { none: '', partial: ' · resolución parcial', resolved: ' · resuelto por el inquilino' };
    const line = (label, text) => section.appendChild(create('p', { style: { margin: '4px 0' }, textContent: `${label}: ${text}` }));
    const list = (title, items, render) => {
      section.appendChild(create('strong', { textContent: title, style: { display: 'block', marginTop: '8px' } }));
      if (!items.length) { section.appendChild(create('small', { className: 'text-muted', textContent: 'Sin elementos' })); return; }
      const ul = create('ul', { style: { margin: '4px 0', paddingLeft: '18px' } });
      items.forEach(item => ul.appendChild(create('li', { textContent: render(item) })));
      section.appendChild(ul);
    };
    line('Titulares', (file.owners || []).map(item => `${item.name || 'Titular'}${item.percentage != null ? ` ${item.percentage}%` : ''}`).join(', ') || 'Sin titulares vigentes');
    const contract = file.currentContract;
    line('Inquilino actual', contract ? `${contract.tenantNames.join(', ') || 'Sin inquilino'} · contrato hasta ${contract.endDate || 'sin fecha de fin'}` : 'Sin contrato vigente');
    line('Alquiler cobrado este mes', totals(file.rentCollectedThisMonthMinorByCurrency));
    line('Costo de mantenimiento (últimos 12 meses)', totals(file.costLast12MonthsMinorByCurrency));
    list('Próximos vencimientos', file.upcoming, item => `${item.date} · ${item.title}`);
    list('Pendientes', file.pending, item => `${item.dueDate} · ${item.title}${item.type === 'document_pending' ? ' (falta comprobante)' : item.type === 'tenant_obligation_pending' ? ' (comprobante del inquilino pendiente)' : ''}`);
    list('Obligaciones', file.obligations, item => `${item.title} · ${responsibility[item.responsibilityType] || item.responsibilityType}${item.responsibleParty?.name ? ` (${item.responsibleParty.name})` : ''} · ${item.nextDueDate ? `próximo ${item.nextDueDate}` : 'sin próximo vencimiento'}${item.settledBy ? ` · ${settled[item.settledBy]}` : ''}${resolution[item.resolutionStatus] || ''}`);
    list('Documentos', file.documents, item => `${item.title} (${item.fileName})`);
    list('Notas', file.notes, item => item.text);
  },

  renderMonthlyView(asset, container) {
    const section = create('section', { style: { borderTop: '1px solid var(--border-color)', marginTop: '16px', paddingTop: '12px' } });
    section.appendChild(create('h4', { textContent: 'Ficha mensual' }));
    const report = create('div', { style: { display: 'grid', gap: '12px', marginTop: '8px' } });
    const money = (minor, currency) => (typeof minor === 'number'
      ? `${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)} ${currency || ''}`.trim() : '-');
    const totals = map => Object.entries(map || {}).map(([currency, minor]) => money(minor, currency)).join(' · ') || '-';
    const responsibility = { owner: 'Propietario', tenant: 'Inquilino', shared: 'Compartido', third: 'Tercero', none: 'Sin responsable' };
    const statusLabel = { paid: 'Pagado', resolved: 'Resuelto', partial: 'Parcial', overdue: 'Vencido', expected: 'Esperado', confirmed: 'Confirmado' };
    const render = result => {
      report.replaceChildren();
      [...result.months].reverse().forEach(month => {
        const table = create('table', { className: 'table', style: { width: '100%', fontSize: '0.85rem' } });
        table.appendChild(create('caption', { textContent: month.month, style: { textAlign: 'left', fontWeight: '600' } }));
        table.appendChild(create('thead', {}, [create('tr', {}, ['Concepto', 'Responsable', 'Esperado', 'Pagado o cobrado', 'Estado', 'Comprobante'].map(text => create('th', { textContent: text })))]));
        const rows = create('tbody');
        const add = cells => rows.appendChild(create('tr', {}, cells.map(text => create('td', { textContent: text }))));
        (month.rentByCurrency.length ? month.rentByCurrency : [null]).forEach(rent => add(['Alquiler', 'Inquilino',
          rent ? money(rent.expectedMinor, rent.currencyCode) : '-', rent ? money(rent.collectedMinor, rent.currencyCode) : '-',
          rent ? (rent.differenceMinor > 0 ? `Falta ${money(rent.differenceMinor, rent.currencyCode)}` : 'Cobrado') : 'Sin alquiler', '']));
        month.obligations.forEach(item => {
          const tenantPaid = item.resolutionStatus !== 'none';
          add([item.title, responsibility[item.responsibilityType] || item.responsibilityType, money(item.estimatedMinor, item.currencyCode),
            tenantPaid ? `${money(item.actualMinor, item.currencyCode)} · Pagado por inquilino ${money(item.resolutionAmountMinor, item.currencyCode)}` : money(item.actualMinor, item.currencyCode),
            statusLabel[item.status] || item.status, item.documentIds.length ? `${item.documentIds.length} adjunto(s)` : 'Sin comprobante']);
        });
        [['Gastos imputados', month.expensesMinorByCurrency], ['Ingresos imputados', month.incomeMinorByCurrency],
          ['Reintegros', month.refundsMinorByCurrency], ['Recuperos', month.recoveriesMinorByCurrency]].forEach(([label, map]) => {
          if (Object.keys(map).length) add([label, 'Propietario', '', totals(map), '', '']);
        });
        month.claims.forEach(claim => add(['Gasto a recuperar', 'Inquilino', money(claim.amountMinor, claim.currencyCode), money(claim.recoveredMinor, claim.currencyCode), claim.status === 'recovered' ? 'Recuperado' : claim.status === 'partial' ? 'Parcial' : 'Pendiente', '']));
        month.documents.forEach(doc => add([`Documento: ${doc.title}`, '', '', '', '', doc.fileName]));
        month.notes.forEach(note => add([`Nota: ${note}`, '', '', '', '', '']));
        table.appendChild(rows);
        report.appendChild(table);
      });
    };
    const load = async () => {
      report.replaceChildren(create('small', { textContent: 'Cargando ficha mensual...' }));
      try { render(await API.assets.monthlyView(asset.id)); } catch (error) {
        report.replaceChildren(create('small', { textContent: `No se pudo cargar la ficha mensual: ${error.message}` }));
      }
    };
    section.append(create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Ver ficha mensual (últimos 12 meses)', onClick: load }), report);
    container.appendChild(section);
  },

  renderEconomicResult(container, result) {
    container.replaceChildren();
    container.appendChild(create('small', { className: 'text-muted', textContent: `Período: ${result.period.from} — ${result.period.to}` }));
    if (!result.currencies.length) container.appendChild(create('small', { textContent: 'No hay movimientos reales atribuidos en este período.' }));
    const movementList = create('div', { style: { display: 'grid', gap: '8px' } });
    result.currencies.forEach(total => {
      const card = create('article', { className: 'card', style: { padding: '10px' } });
      card.appendChild(create('strong', { textContent: `${total.currency} · Resultado neto ${formatearMonedaConCodigo(total.netResult, total.currency)}` }));
      card.appendChild(create('p', { textContent: `Ingresos reales: ${formatearMonedaConCodigo(total.income, total.currency)} · Gastos brutos: ${formatearMonedaConCodigo(total.grossExpenses, total.currency)} · Reembolsos: ${formatearMonedaConCodigo(total.refunds, total.currency)}` }));
      card.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Ver movimientos de esta moneda', onClick: () => {
        movementList.querySelectorAll('[data-currency-row]').forEach(row => { row.style.display = row.dataset.currencyRow === total.currency ? '' : 'none'; });
        movementList.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } }));
      container.appendChild(card);
    });
    if (result.evolution.length) {
      const evolution = create('details', { className: 'card', style: { padding: '10px' } }, [create('summary', { textContent: 'Evolución mensual y acumulada' })]);
      result.evolution.forEach(item => evolution.appendChild(create('p', { style: { margin: '5px 0' }, textContent: `${item.month} · ${item.currency} · ingresos ${formatearMonedaConCodigo(item.income, item.currency)} · gastos ${formatearMonedaConCodigo(item.expenses, item.currency)} · reembolsos ${formatearMonedaConCodigo(item.refunds, item.currency)} · neto ${formatearMonedaConCodigo(item.netResult, item.currency)} · acumulado ${formatearMonedaConCodigo(item.cumulativeResult, item.currency)}` })));
      container.appendChild(evolution);
    }
    const movementsHeading = create('h5', { textContent: 'Movimientos reales', style: { margin: '8px 0 0' } });
    container.append(movementsHeading, movementList);
    if (!result.movements.length) movementList.appendChild(create('small', { textContent: 'No hay movimientos que detallar.' }));
    result.movements.forEach(item => {
      const row = create('article', { className: 'card', style: { padding: '8px' }, dataset: { currencyRow: item.currency } });
      const sign = item.type === 'expense' ? '−' : '+';
      row.appendChild(create('strong', { textContent: `${item.date} · ${item.concept} · ${sign}${formatearMonedaConCodigo(item.amount, item.currency)}` }));
      row.appendChild(create('small', { style: { display: 'block' }, textContent: `${item.type === 'income' ? 'Ingreso' : item.type === 'expense' ? 'Gasto' : 'Reembolso'} · ${item.category || 'Sin categoría'} · ${item.account} · ${item.paymentMethod || 'Medio no indicado'} · ${item.contract || 'Sin contrato'} · ${item.status === 'posted' ? 'Contabilizado' : item.status}` }));
      if (item.refundSourceId) row.appendChild(create('small', { style: { display: 'block' }, textContent: `Reembolso vinculado a: ${item.refundSourceConcept || 'gasto de origen'}` }));
      (item.documents || []).forEach(document => {
        const link = create('a', { href: API.documents.contentUrl(document.id), target: '_blank', rel: 'noopener noreferrer', textContent: `Documento: ${document.title || document.fileName}` });
        row.appendChild(link);
      });
      movementList.appendChild(row);
    });
    const pending = create('section', { className: 'card', style: { padding: '10px' } });
    pending.appendChild(create('strong', { textContent: 'Pendiente, fuera de resultados reales' }));
    const pendingRows = [...(result.pending?.obligations || []).map(item => ({ ...item, kind: 'Obligación' })), ...(result.pending?.rents || []).map(item => ({ ...item, kind: 'Alquiler esperado' }))];
    if (!pendingRows.length) pending.appendChild(create('small', { style: { display: 'block' }, textContent: 'No hay importes pendientes en este período.' }));
    pendingRows.forEach(item => pending.appendChild(create('p', { style: { margin: '5px 0' }, textContent: `${item.date} · ${item.kind} · ${item.concept} · ${formatearMonedaConCodigo(item.amount, item.currency)} · ${item.status}` })));
    container.appendChild(pending);
  },

  async renderRentals(asset, container) {
    const section = create('section', { style: { borderTop: '1px solid var(--border-color)', marginTop: '16px', paddingTop: '12px' } });
    section.appendChild(create('h4', { textContent: 'Contratos y alquileres' }));
    const contractList = create('div', { style: { display: 'grid', gap: '8px', marginTop: '8px' } });
    const filter = this.select([['', 'Todos los períodos'], ['pending', 'Pendientes'], ['partially_collected', 'Parcialmente cobrados'], ['collected', 'Cobrados'], ['overdue', 'Vencidos'], ['cancelled', 'Cancelados']]);
    filter.setAttribute('aria-label', 'Filtrar períodos de alquiler');
    const newButton = create('button', { className: 'btn btn-primary btn-sm', type: 'button', textContent: 'Nuevo contrato', style: { marginTop: '8px' }, onClick: () => this.showRentalContractModal(asset) });
    section.append(filter, contractList, newButton);
    container.appendChild(section);
    let contracts = [];
    try {
      contracts = await API.rentals.list({ assetId: asset.id });
    } catch (error) {
      contractList.appendChild(create('p', { textContent: `No se pudieron cargar los contratos: ${error.message}` }));
      return;
    }
    const renderList = () => {
      contractList.replaceChildren();
      if (!contracts.length) {
        contractList.appendChild(create('small', { textContent: 'Todavía no hay contratos asociados a este inmueble.' }));
        return;
      }
      contracts.forEach(contract => {
        const card = create('article', { className: 'card', style: { padding: '10px' } });
        const heading = create('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, [
          create('strong', { textContent: `${this.contractTypeLabel(contract.type)} · ${contract.tenants.map(item => item.name).join(', ')}` }),
          create('span', { textContent: contract.status, className: 'badge' })
        ]);
        card.append(heading, create('small', { textContent: `${contract.startDate}${contract.endDate ? ` — ${contract.endDate}` : ' — sin fecha de fin'} · Alquiler inicial: ${contract.initialRent} ${contract.currencyCode} · vencimiento día ${contract.dueDay}`, style: { display: 'block', marginTop: '5px' } }));
        const operations = create('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } });
        operations.append(
          create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Actualizar alquiler', onClick: () => this.showRentalConditionModal(asset, contract) }),
          create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Registrar cobro', onClick: () => this.showRentCollectionModal(asset, contract) }),
          create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Finalizar contrato', disabled: contract.status !== 'active', onClick: async () => {
            try { await API.rentals.update(contract.id, { status: 'ended', endDate: contract.endDate || new Date().toISOString().slice(0, 10) }); await this.showDetails(asset.id); }
            catch (error) { showToast(error.message, 'error'); }
          } }),
          create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Documentos y notas', onClick: async () => {
            const records = create('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
            try { await WealthRecords.renderPanel(records, 'contract', contract.id); Modal.show('Contrato · documentos y notas', records); }
            catch (error) { showToast(error.message, 'error'); }
          } })
        );
        card.appendChild(operations);
        const occurrenceList = create('div', { style: { display: 'grid', gap: '4px', marginTop: '8px' } });
        const occurrences = contract.occurrences.filter(item => !filter.value || item.status === filter.value);
        if (!occurrences.length) occurrenceList.appendChild(create('small', { textContent: 'No hay períodos para este filtro.' }));
        occurrences.forEach(item => occurrenceList.appendChild(create('div', { className: 'card', style: { padding: '8px', display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } }, [
          create('span', { textContent: `${item.date} · ${item.rentAmount} ${item.currencyCode} · ${this.rentStatusLabel(item.status)} · Pagado ${item.paidAmount}, pendiente ${item.remainingAmount}` }),
          create('span', { style: { display: 'flex', gap: '6px' } }, [
            item.remainingMinor > 0 && item.status !== 'cancelled' ? create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Cobrar período', onClick: () => this.showRentCollectionModal(asset, contract, item.id) }) : null,
            item.paidMinor === 0 && item.status !== 'cancelled' ? create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Cancelar período', onClick: async () => {
              try { await API.rentals.cancelOccurrence(contract.id, item.id); await this.showDetails(asset.id); }
              catch (error) { showToast(error.message, 'error'); }
            } }) : null
          ].filter(Boolean))
        ])));
        card.appendChild(occurrenceList);
        const collectionHistory = create('details', { style: { marginTop: '8px' } }, [create('summary', { textContent: 'Cobros y saldos no aplicados' })]);
        const balances = create('div', { style: { display: 'grid', gap: '4px', marginTop: '6px' } });
        API.rentals.collections(contract.id).then(rows => {
          if (!rows.length) balances.appendChild(create('small', { textContent: 'Todavía no hay cobros.' }));
          rows.forEach(row => balances.appendChild(create('div', { className: 'card', style: { padding: '8px' }, textContent: `${row.date} · aplicado a este contrato ${row.contractAllocatedAmount} ${row.currencyCode} · saldo global sin aplicar ${row.unappliedAmount} · ${row.method || 'medio no indicado'}` })));
        }).catch(error => balances.appendChild(create('small', { textContent: `No se pudieron cargar los cobros: ${error.message}` })));
        collectionHistory.appendChild(balances);
        card.appendChild(collectionHistory);
        const movementAttributions = create('details', { style: { marginTop: '8px' } }, [create('summary', { textContent: 'Otros movimientos atribuidos al contrato' })]);
        const movementRows = create('div', { style: { display: 'grid', gap: '4px', marginTop: '6px' } });
        API.finance.allocations({ contractId: contract.id }).then(allocations => {
          if (!allocations.length) movementRows.appendChild(create('small', { textContent: 'No hay atribuciones adicionales.' }));
          allocations.forEach(allocation => {
            const row = create('div', { className: 'card', style: { padding: '8px', display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' } });
            row.appendChild(create('span', { textContent: `${allocation.transaction.titulo} · ${allocation.transaction.fecha} · ${allocation.amount} ${allocation.currencyCode}` }));
            row.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Editar atribuciones', disabled: Boolean(allocation.transaction.rentCollectionId), onClick: () => TransactionForm.show(() => this.showDetails(asset.id), allocation.transaction) }));
            movementRows.appendChild(row);
          });
        }).catch(error => movementRows.appendChild(create('small', { textContent: `No se pudieron cargar las atribuciones: ${error.message}` })));
        movementAttributions.appendChild(movementRows);
        card.appendChild(movementAttributions);
        contractList.appendChild(card);
      });
    };
    filter.addEventListener('change', renderList);
    renderList();
  },

  contractTypeLabel(type) {
    return ({ residential: 'Residencial', commercial: 'Comercial', industrial: 'Industrial', temporary: 'Temporal', other: 'Otro' })[type] || type;
  },

  rentStatusLabel(status) {
    return ({ pending: 'Pendiente', partially_collected: 'Parcial', collected: 'Cobrado', overdue: 'Vencido', cancelled: 'Cancelado' })[status] || status;
  },

  rentalField(container, label, options = {}) {
    const group = create('label', { className: 'form-group', style: { display: 'grid', gap: '4px' } });
    group.appendChild(create('span', { textContent: label }));
    const field = create(options.multiline ? 'textarea' : 'input', { className: 'form-control', ...(options.multiline ? { rows: 3 } : { type: options.type || 'text' }) });
    if (!options.multiline) { if (options.min !== undefined) field.min = options.min; if (options.step) field.step = options.step; }
    field.value = options.value ?? '';
    group.appendChild(field);
    container.appendChild(group);
    return field;
  },

  async showRentalContractModal(asset) {
    try {
      const [owners, accounts] = await Promise.all([API.owners.list(), API.accounts.list()]);
      const body = create('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
      const type = this.select([['residential', 'Residencial'], ['commercial', 'Comercial'], ['industrial', 'Industrial'], ['temporary', 'Temporal'], ['other', 'Otro']]);
      const typeGroup = create('label', { className: 'form-group' }, [create('span', { textContent: 'Tipo de contrato' }), type]);
      body.appendChild(typeGroup);
      const tenantSelect = create('select', { className: 'form-control', multiple: true, size: Math.min(owners.filter(item => (item.roles || ['owner']).includes('tenant')).length || 2, 6), 'aria-label': 'Inquilinos' });
      owners.filter(item => (item.roles || ['owner']).includes('tenant')).forEach(item => tenantSelect.appendChild(create('option', { value: item.id, textContent: item.name })));
      body.append(create('label', { className: 'form-group' }, [create('span', { textContent: 'Inquilinos (puedes seleccionar varios)' }), tenantSelect]));
      const startDate = this.rentalField(body, 'Inicio', { type: 'date', value: new Date().toISOString().slice(0, 10) });
      const endDate = this.rentalField(body, 'Fin (opcional)', { type: 'date' });
      const rent = this.rentalField(body, 'Alquiler inicial', { type: 'number', min: '0.01', step: '0.01' });
      const currency = this.select(['ARS', 'EUR', 'USD'].map(code => [code, code]), localStorage.getItem('pate_app_currency') || 'ARS');
      body.append(create('label', { className: 'form-group' }, [create('span', { textContent: 'Moneda' }), currency]));
      const periodicity = this.select([['monthly', 'Mensual'], ['bimonthly', 'Cada dos meses'], ['quarterly', 'Trimestral'], ['semiannual', 'Semestral'], ['annual', 'Anual']]);
      body.append(create('label', { className: 'form-group' }, [create('span', { textContent: 'Periodicidad' }), periodicity]));
      const dueDay = this.rentalField(body, 'Día de vencimiento', { type: 'number', min: '1', value: '1' });
      const deposit = this.rentalField(body, 'Depósito o garantía en dinero (opcional)', { type: 'number', min: '0', step: '0.01' });
      const guarantee = this.rentalField(body, 'Detalle de la garantía', { multiline: true });
      const included = this.rentalField(body, 'Gastos incluidos (separados por coma)');
      const responsibility = this.rentalField(body, 'Responsabilidad de gastos (JSON, por ejemplo {"expensas":"tenant"})', { multiline: true });
      responsibility.value = '{}';
      const notes = this.rentalField(body, 'Notas del contrato', { multiline: true });
      const accountHint = accounts.find(item => item.activo)?.nombre || 'Sin cuentas activas';
      body.appendChild(create('small', { textContent: `Los cobros se registran luego desde una cuenta activa. Cuenta disponible: ${accountHint}` }));
      const footer = create('div', { style: { display: 'flex', gap: '8px' } }, [
        create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cancelar', onClick: () => Modal.hide() }),
        create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Crear contrato' })
      ]);
      footer.lastChild.addEventListener('click', async () => {
        let expenseResponsibility;
        try { expenseResponsibility = JSON.parse(responsibility.value || '{}'); } catch { return showToast('La responsabilidad de gastos debe ser JSON válido', 'error'); }
        try {
          await API.rentals.create({
            assetId: asset.id, type: type.value, startDate: startDate.value, endDate: endDate.value || null,
            initialRent: Number(rent.value), currencyCode: currency.value, periodicity: periodicity.value,
            dueDay: Number(dueDay.value), depositAmount: deposit.value === '' ? 0 : Number(deposit.value),
            guarantee: guarantee.value.trim(), includedExpenses: included.value.split(',').map(item => item.trim()).filter(Boolean),
            expenseResponsibility, notes: notes.value.trim(), tenantIds: [...tenantSelect.selectedOptions].map(option => option.value), status: 'active'
          });
          Modal.hide();
          showToast('Contrato creado');
          await this.showDetails(asset.id);
        } catch (error) { showToast(error.message, 'error'); }
      });
      Modal.show(`Nuevo contrato · ${asset.name}`, body, { footer });
    } catch (error) { showToast(`No se pudo abrir el contrato: ${error.message}`, 'error'); }
  },

  showRentalConditionModal(asset, contract) {
    const body = create('div');
    const method = this.select([['manual', 'Importe manual'], ['percentage', 'Porcentaje ingresado'], ['index', 'Índice ingresado']]);
    body.append(create('label', { className: 'form-group' }, [create('span', { textContent: 'Tipo de actualización' }), method]));
    const effectiveDate = this.rentalField(body, 'Fecha efectiva (debe coincidir con un vencimiento)', { type: 'date' });
    const amount = this.rentalField(body, `Nuevo alquiler (${contract.currencyCode})`, { type: 'number', min: '0.01', step: '0.01' });
    const percentage = this.rentalField(body, 'Porcentaje de ajuste', { type: 'number', step: '0.01' });
    const indexValue = this.rentalField(body, 'Valor de índice ingresado', { type: 'number', min: '0.000001', step: '0.000001' });
    const baseIndexValue = this.rentalField(body, 'Valor de índice base ingresado', { type: 'number', min: '0.000001', step: '0.000001' });
    const periodicity = this.select([['', 'Mantener periodicidad'], ['monthly', 'Mensual'], ['bimonthly', 'Cada dos meses'], ['quarterly', 'Trimestral'], ['semiannual', 'Semestral'], ['annual', 'Anual']]);
    body.append(create('label', { className: 'form-group' }, [create('span', { textContent: 'Periodicidad aplicable' }), periodicity]));
    method.addEventListener('change', () => {
      amount.parentElement.style.display = method.value === 'manual' ? '' : 'none';
      percentage.parentElement.style.display = method.value === 'percentage' ? '' : 'none';
      indexValue.parentElement.style.display = method.value === 'index' ? '' : 'none';
      baseIndexValue.parentElement.style.display = method.value === 'index' ? '' : 'none';
    });
    method.dispatchEvent(new Event('change'));
    const footer = create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Guardar condición', onClick: async () => {
      const data = { method: method.value, effectiveDate: effectiveDate.value, periodicity: periodicity.value || undefined };
      if (method.value === 'manual') data.rentAmount = Number(amount.value);
      if (method.value === 'percentage') data.percentage = Number(percentage.value);
      if (method.value === 'index') { data.indexValue = Number(indexValue.value); data.baseIndexValue = Number(baseIndexValue.value); }
      try { await API.rentals.addCondition(contract.id, data); showToast('Condición guardada'); await this.showDetails(asset.id); }
      catch (error) { showToast(error.message, 'error'); }
    } })]);
    Modal.show('Actualizar condición de alquiler', body, { footer });
  },

  async showRentCollectionModal(asset, contract, selectedOccurrenceId = null, onDone = null) {
    try {
      const [fullContract, accounts, paymentMethods] = await Promise.all([API.rentals.get(contract.id), API.accounts.list(), API.finance.paymentMethods()]);
      const open = fullContract.occurrences.filter(item => item.remainingMinor > 0 && item.status !== 'cancelled');
      const body = create('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
      const rows = create('div', { style: { display: 'grid', gap: '6px' } });
      const amountInputs = [];
      open.forEach(occurrence => {
        const checkbox = create('input', { type: 'checkbox', checked: occurrence.id === selectedOccurrenceId });
        const amount = create('input', { className: 'form-control', type: 'number', min: '0.01', step: contract.currencyCode === 'JPY' ? '1' : '0.01', value: occurrence.id === selectedOccurrenceId ? occurrence.remainingAmount : '' });
        const row = create('label', { className: 'card', style: { padding: '8px', display: 'grid', gridTemplateColumns: 'auto 1fr minmax(90px, 150px)', gap: '8px', alignItems: 'center' } }, [
          checkbox, create('span', { textContent: `${occurrence.date} · pendiente ${occurrence.remainingAmount} ${contract.currencyCode}` }), amount
        ]);
        rows.appendChild(row);
        amountInputs.push({ occurrence, checkbox, amount });
      });
      if (!open.length) rows.appendChild(create('small', { textContent: 'No hay períodos pendientes para asignar.' }));
      body.append(create('p', { textContent: 'Selecciona uno o varios períodos y distribuye el cobro recibido. La parte no asignada quedará visible.' }), rows);
      const total = this.rentalField(body, `Importe total recibido (${contract.currencyCode})`, { type: 'number', min: '0.01', step: contract.currencyCode === 'JPY' ? '1' : '0.01' });
      const account = this.select([['', 'Seleccionar cuenta'], ...accounts.filter(item => item.activo && item.currency === contract.currencyCode).map(item => [item.id, item.nombre])]);
      body.append(create('label', { className: 'form-group' }, [create('span', { textContent: 'Cuenta (misma moneda del contrato)' }), account]));
      const date = this.rentalField(body, 'Fecha de cobro', { type: 'date', value: new Date().toISOString().slice(0, 10) });
      const method = this.rentalField(body, 'Medio de cobro (texto libre)');
      const paymentMethod = this.select([['', 'Sin medio reutilizable'], ...paymentMethods.map(item => [item.id, `${item.name}${item.lastFour ? ` ···· ${item.lastFour}` : ''}`])]);
      paymentMethod.addEventListener('change', () => { method.value = paymentMethods.find(item => item.id === paymentMethod.value)?.name || method.value; });
      body.append(create('label', { className: 'form-group' }, [create('span', { textContent: 'Medio reutilizable' }), paymentMethod]));
      const footer = create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Registrar cobro', onClick: async () => {
        const allocations = amountInputs.filter(item => item.checkbox.checked).map(item => ({ occurrenceId: item.occurrence.id, amount: Number(item.amount.value) }));
        if (!allocations.length) return showToast('Selecciona al menos un período para asignar', 'error');
        try {
          await API.rentals.collect({
            amount: Number(total.value), accountId: account.value, date: date.value,
            method: method.value.trim(), paymentMethodId: paymentMethod.value || null, allocations,
            idempotencyKey: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-rent`
          });
          showToast('Cobro registrado en los ingresos reales');
          Modal.hide();
          await (onDone ? onDone() : this.showDetails(asset.id));
        } catch (error) { showToast(error.message, 'error'); }
      } })]);
      Modal.show(`Registrar cobro · ${contract.currencyCode}`, body, { footer });
    } catch (error) { showToast(`No se pudo abrir el cobro: ${error.message}`, 'error'); }
  }
};
