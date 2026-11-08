const AssetsPage = {
  assets: [],
  owners: [],

  async render(filters = {}) {
    const content = $('#page-content');
    $('#navbar').style.display = '';
    content.style.paddingBottom = '';
    content.innerHTML = '<div class="loading">Cargando bienes...</div>';
    try {
      const [assets, owners] = await Promise.all([API.assets.list(filters), API.owners.list()]);
      this.assets = assets;
      this.owners = owners;
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
      body.appendChild(create('h4', { textContent: 'Historial de estados', style: { marginTop: '14px' } }));
      (asset.statusHistory || []).slice().reverse().forEach(event => body.appendChild(create('p', { textContent: `${event.status} · ${new Date(event.changedAt).toLocaleDateString()}${event.notes ? ` · ${event.notes}` : ''}` })));
      await WealthRecords.renderPanel(body, 'asset', id);
      const footer = create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() })]);
      Modal.show(asset.name, body, { footer });
    } catch (error) { showToast(error.message, 'error'); }
  }
};
