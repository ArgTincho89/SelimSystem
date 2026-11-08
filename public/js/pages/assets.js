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
      create('button', { className: 'btn btn-secondary btn-sm', textContent: 'Obligaciones', onClick: () => Router.navigate('/obligations') }),
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
        ? [asset.propertyType, this.usageLabel(asset.usageStatus), [asset.locality, asset.province, asset.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
        : [asset.subtype, asset.location].filter(Boolean).join(' · ');
      const card = create('article', { className: 'card', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } });
      const details = create('div', {}, [
        create('strong', { textContent: asset.name }),
        create('div', { textContent: `${asset.type === 'immovable' ? 'Inmueble' : 'Mueble'}${meta ? ` · ${meta}` : ''}`, style: { color: 'var(--text-muted)', fontSize: 'var(--font-sm)', marginTop: '4px' } }),
        create('div', { textContent: `Estado: ${asset.status || 'active'}${asset.owners?.length ? ` · Titular: ${asset.owners.map(item => item.name).join(', ')}` : ''}`, style: { color: 'var(--text-muted)', fontSize: 'var(--font-sm)', marginTop: '3px' } })
      ]);
      const actions = create('div', { style: { display: 'flex', gap: '8px' } }, [
        create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Ver historial', onClick: () => this.showDetails(asset.id) }),
        create('button', { className: 'btn btn-secondary btn-sm', textContent: 'Editar', onClick: () => this.showAssetModal(asset) })
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

  showAssetModal(asset = null) {
    const editing = Boolean(asset);
    const form = create('div', { style: { maxHeight: '65vh', overflowY: 'auto', paddingRight: '4px' } });
    const typeControl = this.select([['movable', 'Mueble / bien mueble'], ['immovable', 'Inmueble']], asset?.type || 'movable');
    if (editing) typeControl.disabled = true;
    const typeGroup = create('div', { className: 'form-group' }, [create('label', { textContent: 'Clasificación' }), typeControl]);
    form.appendChild(typeGroup);
    const name = this.addField(form, 'Nombre', { value: asset?.name || '', required: true });
    const description = this.addField(form, 'Descripción', { value: asset?.description || '', multiline: true });
    const acquisitionDate = this.addField(form, 'Fecha de adquisición', { type: 'date', value: asset?.acquisitionDate || '' });
    const acquisitionValue = this.addField(form, 'Valor de adquisición', { type: 'number', value: asset?.acquisitionValue ?? '', min: 0, step: '0.01' });
    const status = this.addField(form, 'Estado (por ejemplo: activo, vendido, baja)', { value: asset?.status || 'active' });
    const statusNotes = this.addField(form, 'Nota del cambio de estado', { value: '' });
    const notes = this.addField(form, 'Notas', { value: asset?.notes || '', multiline: true });
    const kindFields = create('div');
    form.appendChild(kindFields);
    let detailsControl;
    const renderKind = () => {
      kindFields.replaceChildren();
      if (typeControl.value === 'movable') {
        this.addField(kindFields, 'Subtipo', { value: asset?.type === 'movable' ? asset.subtype || '' : '', placeholder: 'Por ejemplo: vehículo, mobiliario, equipo' }).dataset.field = 'subtype';
        const detailsGroup = create('div', { className: 'form-group' }, [create('label', { textContent: 'Detalles extensibles (JSON)' })]);
        detailsControl = create('textarea', { className: 'form-control', rows: 3 });
        detailsControl.value = JSON.stringify(asset?.type === 'movable' ? asset.details || {} : {}, null, 2);
        detailsGroup.append(detailsControl, create('small', { textContent: 'No incluyas claves, credenciales ni números completos de cuentas o tarjetas.' }));
        kindFields.appendChild(detailsGroup);
        this.addField(kindFields, 'Ubicación', { value: asset?.location || '' }).dataset.field = 'location';
      } else {
        this.addField(kindFields, 'Tipo de inmueble', { value: asset?.type === 'immovable' ? asset.propertyType || '' : '', placeholder: 'Casa, departamento, terreno...' }).dataset.field = 'propertyType';
        this.addField(kindFields, 'Dirección', { value: asset?.type === 'immovable' ? asset.address || '' : '' }).dataset.field = 'address';
        this.addField(kindFields, 'Localidad', { value: asset?.type === 'immovable' ? asset.locality || '' : '' }).dataset.field = 'locality';
        this.addField(kindFields, 'Provincia', { value: asset?.type === 'immovable' ? asset.province || '' : '' }).dataset.field = 'province';
        this.addField(kindFields, 'País', { value: asset?.type === 'immovable' ? asset.country || '' : '' }).dataset.field = 'country';
        this.addField(kindFields, 'Superficie (m²)', { type: 'number', min: 0, step: '0.01', value: asset?.type === 'immovable' ? asset.area ?? '' : '' }).dataset.field = 'area';
        const usageGroup = create('div', { className: 'form-group' }, [create('label', { textContent: 'Uso actual' })]);
        usageGroup.appendChild(this.select(this.usageOptions(), asset?.type === 'immovable' ? asset.usageStatus || 'vacant' : 'vacant'));
        kindFields.appendChild(usageGroup);
      }
    };
    typeControl.addEventListener('change', renderKind);
    renderKind();

    const ownersSection = create('section', { style: { borderTop: '1px solid var(--border-color)', marginTop: '12px', paddingTop: '12px' } });
    if (editing) ownersSection.style.display = 'none';
    ownersSection.appendChild(create('h4', { textContent: 'Titulares legales', style: { marginBottom: '8px' } }));
    const ownerRows = create('div', { style: { display: 'grid', gap: '8px' } });
    ownersSection.appendChild(ownerRows);
    const ownerForm = create('div', { style: { display: 'none', marginTop: '8px' } });
    const newOwnerName = this.addField(ownerForm, 'Nombre legal');
    const newOwnerKind = this.select([['person', 'Persona'], ['entity', 'Entidad']]);
    ownerForm.append(create('label', { textContent: 'Tipo', style: { display: 'block', marginBottom: '5px' } }), newOwnerKind);
    const ownerSave = create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Guardar titular', style: { marginTop: '8px' } });
    ownerForm.appendChild(ownerSave);
    ownersSection.append(ownerForm, create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: '+ Crear persona o entidad', style: { marginTop: '8px' }, onClick: () => { ownerForm.style.display = ownerForm.style.display === 'none' ? '' : 'none'; } }));
    form.appendChild(ownersSection);
    const addOwnerRow = (record = {}) => {
      const row = create('div', { className: 'card', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', padding: '10px' } });
      const select = this.select([['', 'Seleccionar titular'], ...this.owners.filter(owner => (owner.roles || ['owner']).includes('owner')).map(owner => [owner.id, `${owner.name} (${owner.kind === 'person' ? 'persona' : 'entidad'})`])], record.ownerId || '');
      const percentage = create('input', { className: 'form-control', type: 'number', min: '0', max: '100', step: '0.01', placeholder: 'Porcentaje', value: record.percentage ?? '' });
      const startDate = create('input', { className: 'form-control', type: 'date', value: record.startDate || new Date().toISOString().slice(0, 10) });
      const ownerNotes = create('input', { className: 'form-control', type: 'text', placeholder: 'Nota de titularidad', value: record.notes || '' });
      row.append(create('label', {}, [create('span', { textContent: 'Titular' }), select]), create('label', {}, [create('span', { textContent: 'Porcentaje informativo' }), percentage]), create('label', {}, [create('span', { textContent: 'Desde' }), startDate]), create('label', {}, [create('span', { textContent: 'Notas' }), ownerNotes]));
      row.dataset.ownerRow = 'true';
      row._ownershipFields = { select, percentage, startDate, ownerNotes };
      const remove = create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Quitar', onClick: () => row.remove() });
      row.appendChild(remove);
      ownerRows.appendChild(row);
    };
    if (!editing) (asset?.ownerships || []).forEach(addOwnerRow);
    const addOwnerButton = create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: '+ Añadir titular', style: { marginTop: '8px' }, onClick: () => addOwnerRow() });
    ownersSection.appendChild(addOwnerButton);
    ownerSave.addEventListener('click', async () => {
      const label = newOwnerName.value.trim();
      if (!label) return showToast('El nombre legal es obligatorio', 'error');
      try {
        const created = await API.owners.create({ name: label, kind: newOwnerKind.value });
        this.owners.push(created);
        addOwnerRow({ ownerId: created.id });
        newOwnerName.value = '';
        ownerForm.style.display = 'none';
        showToast('Titular creado');
      } catch (error) { showToast(error.message, 'error'); }
    });

    const footer = create('div', { style: { display: 'flex', gap: '8px' } }, [
      create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cancelar', onClick: () => Modal.hide() }),
      create('button', { className: 'btn btn-primary', type: 'button', textContent: editing ? 'Guardar cambios' : 'Crear bien' })
    ]);
    on(footer.lastChild, 'click', async () => {
      let details = {};
      if (typeControl.value === 'movable') {
        try { details = JSON.parse(detailsControl.value || '{}'); }
        catch { return showToast('Los detalles deben tener formato JSON válido', 'error'); }
        if (details === null || Array.isArray(details) || typeof details !== 'object') return showToast('Los detalles deben ser un objeto JSON', 'error');
      }
      const data = {
        type: typeControl.value, name: name.value.trim(), description: description.value.trim(),
        acquisitionDate: acquisitionDate.value || null, acquisitionValue: acquisitionValue.value === '' ? null : Number(acquisitionValue.value),
        status: status.value.trim(), statusNotes: statusNotes.value.trim(), notes: notes.value.trim()
      };
      if (typeControl.value === 'movable') {
        data.subtype = $('[data-field="subtype"]', kindFields).value.trim();
        data.location = $('[data-field="location"]', kindFields).value.trim();
        data.details = details;
      } else {
        data.propertyType = $('[data-field="propertyType"]', kindFields).value.trim();
        ['address', 'locality', 'province', 'country'].forEach(key => data[key] = $(`[data-field="${key}"]`, kindFields).value.trim());
        const areaValue = $('[data-field="area"]', kindFields).value;
        data.area = areaValue === '' ? null : Number(areaValue);
        data.usageStatus = $('select', kindFields).value;
      }
      const ownerships = [...ownerRows.querySelectorAll('[data-owner-row]')].map(row => {
        const fields = row._ownershipFields;
        return { ownerId: fields.select.value, percentage: fields.percentage.value === '' ? null : Number(fields.percentage.value), startDate: fields.startDate.value, notes: fields.ownerNotes.value.trim() };
      }).filter(item => item.ownerId);
      if (!editing) data.ownerships = ownerships;
      try {
        if (editing) await API.assets.update(asset.id, data);
        else await API.assets.create(data);
        Modal.hide();
        showToast(editing ? 'Bien actualizado' : 'Bien creado');
        this.render();
      } catch (error) { showToast(error.message, 'error'); }
    });
    Modal.show(editing ? 'Editar bien' : 'Nuevo bien', form, { footer });
  },

  async showDetails(id) {
    try {
      const asset = await API.assets.get(id);
      const body = create('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
      body.append(create('p', { textContent: `${asset.type === 'immovable' ? 'Inmueble' : 'Mueble'} · Estado: ${asset.status}` }));
      if (asset.description) body.appendChild(create('p', { textContent: asset.description }));
      if (asset.type === 'immovable') {
        body.appendChild(create('p', { textContent: `Tipo: ${asset.propertyType || 'Sin especificar'} · Uso: ${this.usageLabel(asset.usageStatus)}${asset.area != null ? ` · Superficie: ${asset.area} m²` : ''}` }));
      } else if (asset.subtype) body.appendChild(create('p', { textContent: `Subtipo: ${asset.subtype}` }));
      if (asset.acquisitionDate || asset.acquisitionValue != null) body.appendChild(create('p', { textContent: `Adquisición: ${asset.acquisitionDate || 'Fecha no indicada'}${asset.acquisitionValue != null ? ` · ${asset.acquisitionValue}` : ''}` }));
      const location = asset.type === 'immovable' ? [asset.address, asset.locality, asset.province, asset.country].filter(Boolean).join(', ') : asset.location;
      if (location) body.appendChild(create('p', { textContent: `Ubicación: ${location}` }));
      if (asset.notes) body.appendChild(create('p', { textContent: `Notas: ${asset.notes}` }));
      await this.renderRecoveries(asset, body);
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
      const currency = this.select(['EUR', 'USD', 'ARS', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'BRL', 'CLP', 'MXN', 'UYU', 'PYG', 'COP', 'PEN', 'BOB', 'CRC', 'DOP', 'PLN', 'SEK', 'NOK', 'DKK', 'NZD', 'INR', 'ZAR', 'KRW', 'CNY'].map(code => [code, code]), localStorage.getItem('pate_app_currency') || 'EUR');
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

  async showRentCollectionModal(asset, contract, selectedOccurrenceId = null) {
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
          await this.showDetails(asset.id);
        } catch (error) { showToast(error.message, 'error'); }
      } })]);
      Modal.show(`Registrar cobro · ${contract.currencyCode}`, body, { footer });
    } catch (error) { showToast(`No se pudo abrir el cobro: ${error.message}`, 'error'); }
  }
};
