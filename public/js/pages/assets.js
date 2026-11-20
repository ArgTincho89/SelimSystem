const AssetsPage = {
  assets: [],
  owners: [],
  rentalAlerts: [],
  kinds: [],

  async loadKinds() {
    try {
      this.kinds = API.assetKinds ? await API.assetKinds.list() : [];
    } catch {
      this.kinds = this.kinds || [];
    }
    return this.kinds;
  },

  async render(filters = {}) {
    const content = $('#page-content');
    $('#navbar').style.display = '';
    content.style.paddingBottom = '';
    content.innerHTML = '<div class="loading">Cargando bienes...</div>';
    try {
      const [assets, owners, rentalAlerts] = await Promise.all([API.assets.list(filters), API.owners.list(), API.rentals.alerts(), this.loadKinds()]);
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

    const form = create('form', { className: 'card filter-form', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '10px', marginBottom: '16px', alignItems: 'end' } });
    const type = this.filterSelect('Tipo de bien', [['', 'Todos'], ['movable', 'Mueble'], ['immovable', 'Inmueble']], filters.type || '');
    // "Tipo de inmueble" only appears once "Inmueble" is chosen; options are the property kinds already defined.
    const propertyKind = this.filterSelect('Tipo de inmueble', [['', 'Todos'], ...this.propertyKindOptions()], filters.propertyKind || '');
    const owner = this.filterSelect('Titular legal', [['', 'Todos'], ...this.owners.filter(item => (item.roles || ['owner']).includes('owner')).map(item => [item.id, item.name])], filters.ownerId || '');
    const condition = this.filterSelect('Estado', [['', 'Todos'], ['rented', 'Alquilado'], ['not_rented', 'No alquilado']], filters.condition || '');
    const propertyKindField = labeledField('Tipo de inmueble', propertyKind);
    const syncPropertyKind = () => {
      const visible = type.value === 'immovable';
      propertyKindField.style.display = visible ? '' : 'none';
      if (!visible) propertyKind.value = '';
    };
    on(type, 'change', syncPropertyKind);
    syncPropertyKind();
    [labeledField('Tipo de bien', type), propertyKindField, labeledField('Titular legal', owner), labeledField('Estado', condition)]
      .forEach(field => form.appendChild(field));
    form.appendChild(create('button', { className: 'btn btn-secondary', type: 'submit', textContent: 'Filtrar' }));
    form.appendChild(create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Limpiar', onClick: () => this.render() }));
    on(form, 'submit', event => {
      event.preventDefault();
      this.render({ type: type.value, propertyKind: type.value === 'immovable' ? propertyKind.value : '', ownerId: owner.value, condition: condition.value });
    });
    content.appendChild(form);

    if (!this.assets.length) {
      content.appendChild(create('div', { className: 'empty-state', innerHTML: '<div class="empty-state-icon">🏠</div><p class="empty-state-text">No hay bienes que coincidan con la búsqueda</p>' }));
      return;
    }
    const list = create('div', { className: 'asset-list', style: { display: 'grid', gap: '10px' } });
    this.assets.forEach(asset => {
      const card = create('article', { className: 'card asset-card', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } });
      card.dataset.assetId = asset.id;
      const handle = create('button', {
        className: 'asset-drag-handle', type: 'button', textContent: '⋮⋮',
        title: 'Arrastrá para reordenar', 'aria-label': `Reordenar ${asset.name} (flechas arriba y abajo)`
      });
      const details = create('div', { className: 'asset-card-main' }, [handle, create('div', {}, [create('strong', { textContent: asset.name }), ...this.assetCardLines(asset)])]);
      const actions = create('div', { style: { display: 'flex', gap: '8px' } }, [
        create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Ver', onClick: async () => { try { this.showAssetModal(await API.assets.get(asset.id), { readOnly: true }); } catch (error) { showToast(error.message, 'error'); } } }),
        create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Ver historial', onClick: () => this.showHistory(asset.id) }),
        create('button', { className: 'btn btn-ghost btn-sm', textContent: 'Ficha', onClick: () => this.showDetails(asset.id) }),
        create('button', { className: 'btn btn-secondary btn-sm', textContent: 'Editar', onClick: async () => { try { this.showAssetModal(await API.assets.get(asset.id)); } catch (error) { showToast(error.message, 'error'); } } })
      ]);
      if (asset.type === 'immovable') actions.appendChild(this.rentalAccessButton(asset, { onDone: () => this.render() }));
      card.append(details, actions);
      list.appendChild(card);
    });
    this.enableReorder(list);
    content.appendChild(list);
  },

  // Drag and drop of the asset cards by their handle (pointer events: mouse and touch), plus
  // ArrowUp/ArrowDown on the focused handle. The new order is saved when the drop changes it.
  enableReorder(list) {
    const cards = () => Array.from(list.children).filter(child => child.classList.contains('asset-card'));
    const idsNow = () => cards().map(card => card.dataset.assetId);
    let dragging = null;
    let before = '';
    on(list, 'pointerdown', event => {
      const handle = event.target.closest && event.target.closest('.asset-drag-handle');
      if (!handle || (event.button !== undefined && event.button !== 0)) return;
      dragging = handle.closest('.asset-card');
      before = idsNow().join(',');
      event.preventDefault();
      if (handle.setPointerCapture) { try { handle.setPointerCapture(event.pointerId); } catch { /* capture is optional */ } }
      dragging.classList.add('is-dragging');
    });
    on(list, 'pointermove', event => {
      if (!dragging) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const over = target && target.closest ? target.closest('.asset-card') : null;
      if (!over || over === dragging || over.parentNode !== list) return;
      const rect = over.getBoundingClientRect();
      list.insertBefore(dragging, event.clientY > rect.top + rect.height / 2 ? over.nextSibling : over);
    });
    const finish = () => {
      if (!dragging) return;
      dragging.classList.remove('is-dragging');
      dragging = null;
      if (idsNow().join(',') !== before) this.saveOrder(idsNow());
    };
    on(list, 'pointerup', finish);
    on(list, 'pointercancel', finish);
    on(list, 'keydown', event => {
      const handle = event.target.closest && event.target.closest('.asset-drag-handle');
      if (!handle || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
      event.preventDefault();
      const card = handle.closest('.asset-card');
      const sibling = event.key === 'ArrowUp' ? card.previousElementSibling : card.nextElementSibling;
      if (!sibling) return;
      list.insertBefore(card, event.key === 'ArrowUp' ? sibling : sibling.nextSibling);
      handle.focus();
      this.saveOrder(idsNow());
    });
  },

  async saveOrder(ids) {
    try {
      await API.assets.reorder(ids);
      const byId = new Map(this.assets.map(asset => [asset.id, asset]));
      this.assets = ids.map(id => byId.get(id)).filter(Boolean);
    } catch (error) {
      showToast(error.message || 'No se pudo guardar el orden', 'error');
      this.render();
    }
  },

  // "Alquilado" only when the asset has an active rental; everything else (movables, usufruct, unset) is "No alquilado".
  rentalStateLabel(asset) {
    return asset.condition === 'rented' ? 'Alquilado' : 'No alquilado';
  },

  // Summary lines of an asset card with the parameter names in bold:
  // "Inmueble · Tipo: Galpón · Ubicación: …" and "Estado: Alquilado · Titular: …".
  assetCardLines(asset) {
    const line = (parts, marginTop) => {
      const element = create('div', { className: 'asset-card-line', style: { color: 'var(--text-muted)', fontSize: 'var(--font-sm)', marginTop } });
      parts.filter(([, value]) => value !== '' && value !== null && value !== undefined).forEach(([name, value], index) => {
        if (index) element.appendChild(document.createTextNode(' · '));
        element.appendChild(create('strong', { textContent: value === true ? name : `${name}:` }));
        if (value !== true) element.appendChild(document.createTextNode(` ${value}`));
      });
      return element;
    };
    const immovable = asset.type === 'immovable';
    const location = asset.location || [asset.locality, asset.province, asset.country].filter(Boolean).join(', ');
    const first = immovable
      ? [['Inmueble', true], ['Tipo', this.optionLabel(this.propertyKindOptions(), asset.propertyKind) || asset.propertyType || ''], ['Ubicación', location]]
      : [['Mueble', true], ['Detalle', [asset.brand, asset.plate, asset.subtype].filter(Boolean).join(' · ')], ['Ubicación', asset.location || '']];
    const second = [['Estado', this.rentalStateLabel(asset)], ['Titular', (asset.owners || []).map(item => item.name).join(', ')]];
    return [line(first, '4px'), line(second, '3px')];
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
    return [['departamento', 'Departamento'], ['casa', 'Casa'], ['galpon', 'Galpón'], ['local', 'Local'], ['lote', 'Lote'], ...(this.kinds || []).map(kind => [kind.key, kind.name])];
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

  // "Obligaciones del bien": list, per-obligation responsibility and shortcut. Rent is declared separately.
  // `options.onNewObligation` replaces the navigation to Obligaciones (stacked "Nueva obligación" from the
  // rental declaration); `add()` lists an obligation created there with its responsibility selector.
  renderObligations(slot, asset, options = {}) {
    slot.replaceChildren();
    const items = asset?.obligations || [];
    const hasTenant = Boolean(asset?.activeContract) || Boolean(options.allowTenant);
    const section = create('section', { className: 'card', style: { padding: '10px', marginBottom: '10px' }, dataset: { obligationsBlock: 'true' } });
    section.appendChild(create('h4', { textContent: 'Obligaciones del bien' }));
    if (!asset?.id) section.appendChild(create('small', { className: 'text-muted', textContent: 'Guardá el bien para asignarle obligaciones.' }));
    else if (!items.length) section.appendChild(create('small', { className: 'text-muted', textContent: 'Este bien todavía no tiene obligaciones asignadas.' }));
    const selectors = new Map();
    const created = create('div', { dataset: { createdObligations: 'true' } });
    items.forEach(item => {
      const row = create('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', margin: '4px 0' } }, [create('span', { textContent: this.obligationLine(item) })]);
      if (['owner', 'tenant'].includes(item.responsibilityType)) {
        const selector = this.select(hasTenant || item.responsibilityType === 'tenant' ? [['owner', 'Titular'], ['tenant', 'Inquilino']] : [['owner', 'Titular']], item.responsibilityType);
        selector.setAttribute('aria-label', 'A cargo de');
        selectors.set(item.id, selector);
        row.appendChild(create('label', {}, [create('span', { textContent: 'A cargo de: ' }), selector]));
      } else row.appendChild(create('small', { className: 'text-muted', textContent: 'A cargo de: compartida (solo lectura)' }));
      section.appendChild(row);
    });
    section.appendChild(created);
    section.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Nueva obligación', disabled: !asset?.id,
      onClick: () => {
        if (options.onNewObligation) return options.onNewObligation();
        Modal.hide(); Router.navigate(`/obligations?newForAsset=${encodeURIComponent(asset.id)}`);
      } }));
    slot.appendChild(section);
    return {
      collect: () => ({ obligationResponsibilities: [...selectors].map(([obligationId, selector]) => ({ obligationId, responsibilityType: selector.value })) }),
      add: (obligation, responsibilityType) => {
        const selector = this.select([['owner', 'Titular'], ['tenant', 'Inquilino']], responsibilityType === 'tenant' ? 'tenant' : 'owner');
        selector.setAttribute('aria-label', 'A cargo de');
        selectors.set(obligation.id, selector);
        created.appendChild(create('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', margin: '4px 0' }, dataset: { createdObligation: obligation.id } }, [
          create('span', { textContent: `Nueva: ${this.obligationLine(obligation)}` }),
          create('label', {}, [create('span', { textContent: 'A cargo de: ' }), selector])
        ]));
      }
    };
  },

  // Live "Antigüedad" text from a YYYY-MM-DD construction date: whole years, or months when under one year.
  ageText(dateValue, now = new Date()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue || '')) return '';
    const [y, m, d] = dateValue.split('-').map(Number);
    let months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
    if (now.getDate() < d) months -= 1;
    if (months < 0) return '';
    if (months < 12) return `Antigüedad: ${months} ${months === 1 ? 'mes' : 'meses'}`;
    const years = Math.floor(months / 12);
    return `Antigüedad: ${years} ${years === 1 ? 'año' : 'años'}`;
  },

  showAssetModal(asset = null, options = {}) {
    const readOnly = Boolean(options.readOnly);
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
    let obligationsUi = null;
    let saveConfirmed = false;
    const renderKind = () => {
      kindFields.replaceChildren();
      obligationsUi = null;
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
        const addKindValue = '__add-kind__';
        const kindOptions = () => [['', 'Seleccionar tipo'], ...this.propertyKindOptions(), [addKindValue, 'Agregar tipo…']];
        fields.propertyKind = this.select(kindOptions(), same ? asset.propertyKind || '' : '');
        let previousKind = fields.propertyKind.value;
        fields.propertyKind.addEventListener('change', async () => {
          if (fields.propertyKind.value !== addKindValue) { previousKind = fields.propertyKind.value; return; }
          const name = (prompt('Nombre del nuevo tipo de bien') || '').trim();
          if (!name) { fields.propertyKind.value = previousKind; return; }
          try {
            const kind = await API.assetKinds.create(name);
            this.kinds = [...(this.kinds || []), kind];
            fields.propertyKind.replaceChildren();
            kindOptions().forEach(([value, text]) => fields.propertyKind.appendChild(create('option', { value, textContent: text })));
            fields.propertyKind.value = kind.key;
            previousKind = kind.key;
          } catch (error) {
            fields.propertyKind.value = previousKind;
            showToast(error.message, 'error');
          }
        });
        group.appendChild(fields.propertyKind);
        kindFields.appendChild(group);
        fields.characteristics = this.addField(kindFields, 'Características', { value: same ? asset.characteristics || '' : '', multiline: true });
        fields.location = this.addField(kindFields, 'Ubicación', { value: same ? asset.location || '' : '' });
        fields.coveredAreaM2 = this.addField(kindFields, 'Superficie cubierta (m²)', { type: 'number', min: 0, step: '1', value: same ? asset.coveredAreaM2 ?? '' : '' });
        fields.freeAreaM2 = this.addField(kindFields, 'Superficie libre (m²)', { type: 'number', min: 0, step: '1', value: same ? asset.freeAreaM2 ?? '' : '' });
        fields.cadastralId = this.addField(kindFields, 'Identificación catastral', { value: same ? asset.cadastralId || '' : '' });
        fields.cadastralId.maxLength = 100;
        fields.constructionDate = this.addField(kindFields, 'Fecha de construcción', { type: 'date', value: same ? asset.constructionDate || '' : '' });
        fields.constructionDate.max = new Date().toISOString().slice(0, 10);
        const ageLine = create('p', { className: 'text-muted', dataset: { ageText: 'true' }, style: { margin: '0 0 10px' } });
        kindFields.appendChild(ageLine);
        const legacyAge = same && !asset.constructionDate && asset.age?.source === 'legacy' ? `Antigüedad (dato anterior): ${asset.age.years} años` : '';
        const refreshAge = () => { ageLine.textContent = this.ageText(fields.constructionDate.value) || legacyAge; };
        on(fields.constructionDate, 'input', refreshAge);
        on(fields.constructionDate, 'change', refreshAge);
        refreshAge();
        const slot = create('div', { dataset: { slot: 'obligations' } });
        kindFields.appendChild(slot);
        obligationsUi = this.renderObligations(slot, same ? asset : null);
      }
    };
    typeControl.addEventListener('change', renderKind);
    renderKind();
    const notes = this.addField(form, 'Notas', { value: asset?.notes || '', multiline: true });

    const confirmBox = create('div', { className: 'card', style: { display: 'none', padding: '10px', width: '100%' }, dataset: { saveConfirm: 'true' } });
    const saveButton = create('button', { className: 'btn btn-primary', type: 'button', textContent: editing ? 'Guardar cambios' : 'Crear bien' });
    const footer = readOnly
      ? create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() })])
      : create('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
        confirmBox,
        ...(editing ? [create('button', { className: 'btn btn-danger', type: 'button', textContent: 'Eliminar', dataset: { assetDelete: 'true' }, onClick: () => this.confirmDelete(asset) })] : []),
        create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cancelar', onClick: () => Modal.hide() }),
        saveButton
      ]);
    on(saveButton, 'click', async () => {
      const payload = { type: typeControl.value, name: title.value.trim(), notes: notes.value.trim() };
      if (!payload.name) return showToast('El título es obligatorio', 'error');
      if (typeControl.value === 'movable') {
        payload.vehicleType = fields.vehicleType.value;
        ['brand', 'plate', 'mileage', 'color'].forEach(key => { payload[key] = fields[key].value.trim(); });
      } else {
        if (!fields.propertyKind.value || fields.propertyKind.value === '__add-kind__') return showToast('El tipo de inmueble es obligatorio', 'error');
        payload.propertyKind = fields.propertyKind.value;
        payload.characteristics = fields.characteristics.value.trim();
        payload.location = fields.location.value.trim();
        payload.cadastralId = fields.cadastralId.value.trim() || null;
        payload.constructionDate = fields.constructionDate.value || null;
        const labels = { coveredAreaM2: 'La superficie cubierta', freeAreaM2: 'La superficie libre' };
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
      if (editing && !saveConfirmed) {
        confirmBox.replaceChildren(
          create('p', { style: { margin: '0 0 8px' }, textContent: 'Estás por modificar datos del bien. Revisá los cambios antes de confirmar.' }),
          create('button', { className: 'btn btn-primary btn-sm', type: 'button', textContent: 'Confirmar y guardar', onClick: () => { saveConfirmed = true; confirmBox.style.display = 'none'; saveButton.click(); } }),
          create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Volver', onClick: () => { confirmBox.style.display = 'none'; } })
        );
        confirmBox.style.display = '';
        return;
      }
      saveConfirmed = false;
      const obligationPart = obligationsUi ? obligationsUi.collect() : { obligationResponsibilities: [] };
      try {
        await API.assets.saveForm(editing ? asset.id : null, { asset: payload, owners, obligationResponsibilities: obligationPart.obligationResponsibilities });
        Modal.hide();
        showToast(editing ? 'Bien actualizado' : 'Bien creado');
        this.render();
      } catch (error) { showToast(error.message, 'error'); }
    });
    if (readOnly) form.querySelectorAll('input, select, textarea, button').forEach(control => { control.disabled = true; });
    if (readOnly && asset?.type === 'immovable' && asset.declaration) form.appendChild(create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Ver declaración de alquiler', onClick: () => RentalDeclarationModal.show(this, asset, { readOnly: true }) }));
    Modal.show(readOnly ? 'Ver bien' : (editing ? 'Editar bien' : 'Nuevo bien'), form, { footer });
  },

  legacyLines(asset) {
    const lines = [];
    const add = (label, value) => { if (value !== undefined && value !== null && value !== '') lines.push(`${label}: ${value}`); };
    add('Descripción', asset.description);
    add('Adquisición', [asset.acquisitionDate, asset.acquisitionValue != null ? asset.acquisitionValue : ''].filter(value => value !== '' && value !== null && value !== undefined).join(' · '));
    add('Estado', asset.status && asset.status !== 'active' ? statusLabel(asset.status) : '');
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

  // Danger confirmation first; nothing is sent until the user confirms. A 409 keeps the server reason in a dialog.
  async confirmDelete(asset) {
    const { confirmed } = await ConfirmDialog.open({ title: 'Eliminar bien', danger: true, confirmLabel: 'Eliminar bien', message: `Vas a eliminar el bien "${asset.name}". Esta acción no se puede deshacer. ¿Querés continuar?` });
    if (!confirmed) return false;
    try {
      await API.assets.delete(asset.id);
    } catch (error) {
      await ConfirmDialog.open({ title: 'No se puede eliminar el bien', message: error.message, confirmLabel: 'Entendido', cancelLabel: 'Cerrar' });
      return false;
    }
    Modal.hide();
    showToast('Bien eliminado');
    this.render();
    return true;
  },

  // The typed history timeline lives in assetHistory.js.
  showHistory(id) {
    return AssetHistory.open(id);
  },

  // Ficha of an asset: a summary (header, data, obligations, rental card, documents and notes, economics),
  // not the whole financial and contractual management. Rental details live in the rental modal.
  async showDetails(id) {
    try {
      const [asset, obligationItems, owners] = await Promise.all([API.assets.get(id), API.obligations.list({ assetId: id }), API.owners.list()]);
      this.owners = owners;
      const body = create('div', { className: 'asset-ficha', style: { display: 'grid', gap: '14px' } });
      body.appendChild(this.renderFichaHeader(asset));
      body.appendChild(this.renderDataBlock(asset));
      body.appendChild(this.renderObligationsList(asset, obligationItems, owners));
      if (asset.type === 'immovable') await this.renderRentalCard(asset, body);
      const records = create('section', { className: 'card', dataset: { fichaBlock: 'documents-notes' }, style: { padding: '12px' } }, [create('h3', { textContent: 'Documentos y notas del bien' })]);
      await WealthRecords.renderPanel(records, 'asset', id);
      body.appendChild(records);
      const economics = create('section', { className: 'card', dataset: { fichaBlock: 'economics' }, style: { padding: '12px' } }, [create('h3', { textContent: 'Economía del bien' })]);
      await this.renderAssetFile(asset, economics);
      await this.renderEconomicAnalysis(asset, economics);
      this.renderMonthlyView(asset, economics);
      body.appendChild(economics);
      // Re-homed from the rental modal: still reachable from the ficha.
      const extra = create('section', { className: 'card', dataset: { fichaBlock: 'recoveries' }, style: { padding: '12px' } });
      await this.renderRecoveries(asset, extra);
      body.appendChild(extra);
      const history = create('section', { className: 'card', dataset: { fichaBlock: 'history' }, style: { padding: '12px' } });
      history.appendChild(create('h4', { textContent: 'Historial de titularidad' }));
      (asset.ownerships || []).forEach(record => {
        const line = create('div', { className: 'card', style: { marginTop: '8px' } });
        line.appendChild(create('p', { textContent: `${record.owner?.name || 'Titular'}${record.percentage !== null ? ` · ${record.percentage}%` : ''}` }));
        line.appendChild(create('small', { textContent: `${record.startDate}${record.endDate ? ` — ${record.endDate}` : ' — vigente'}${record.notes ? ` · ${record.notes}` : ''}` }));
        history.appendChild(line);
      });
      history.appendChild(create('h4', { textContent: 'Historial de estados', style: { marginTop: '14px' } }));
      (asset.statusHistory || []).slice().reverse().forEach(event => history.appendChild(create('p', { textContent: `${statusLabel(event.status)} · ${new Date(event.changedAt).toLocaleDateString()}${event.notes ? ` · ${event.notes}` : ''}` })));
      body.appendChild(history);
      const footer = create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() })]);
      Modal.show(asset.name, body, { footer, width: '1000px' });
    } catch (error) { showToast(error.message, 'error'); }
  },

  // Header: name, type, location, status, current holders with percentages and the main actions.
  renderFichaHeader(asset) {
    const current = (asset.ownerships || []).filter(record => !record.endDate);
    const holders = current.map(record => `${record.owner?.name || 'Titular'}${record.percentage != null ? ` ${record.percentage}%` : ''}`).join(', ');
    const location = asset.location || [asset.address, asset.locality, asset.province, asset.country].filter(Boolean).join(', ');
    const state = asset.type === 'immovable' ? (this.optionLabel(this.conditionOptions(), asset.condition) || this.usageLabel(asset.usageStatus)) : '';
    const actions = create('div', { className: 'ficha-actions', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
      create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Editar', onClick: async () => { try { this.showAssetModal(await API.assets.get(asset.id)); } catch (error) { showToast(error.message, 'error'); } } }),
      create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Ver historial', onClick: () => this.showHistory(asset.id) }),
      create('button', { className: 'btn btn-danger btn-sm', type: 'button', textContent: 'Eliminar', dataset: { assetDelete: 'true' }, onClick: () => this.confirmDelete(asset) })
    ]);
    if (asset.type === 'immovable') actions.appendChild(this.rentalAccessButton(asset, { onDone: () => this.showDetails(asset.id) }));
    return create('header', { className: 'ficha-header', dataset: { fichaBlock: 'header' }, style: { display: 'grid', gap: '6px' } }, [
      create('h3', { textContent: asset.name, style: { margin: '0' } }),
      create('div', { className: 'text-muted', textContent: [asset.type === 'immovable' ? 'Inmueble' : 'Mueble', location, state, `Estado: ${statusLabel(asset.status || 'active')}`].filter(Boolean).join(' · ') }),
      create('div', { className: 'text-muted', textContent: `Titular${current.length > 1 ? 'es' : ''}: ${holders || 'sin titulares vigentes'}` }),
      actions
    ]);
  },

  // "Ver alquiler" when a current rental exists, "Declarar alquiler" otherwise. The decision uses the active
  // declaration (a declaration with an active modality), never the asset condition alone.
  rentalAccessButton(asset, options = {}) {
    const declarationId = asset.activeDeclarationId || asset.declaration?.id || null;
    const active = asset.activeDeclarationId !== undefined ? Boolean(asset.activeDeclarationId) : Boolean(asset.declaration && asset.declaration.status !== 'ended');
    if (active) return create('button', { className: 'btn btn-primary btn-sm', type: 'button', textContent: 'Ver alquiler', dataset: { viewRental: asset.id }, onClick: () => this.openRental(asset.id, declarationId) });
    return create('button', { className: 'btn btn-primary btn-sm', type: 'button', textContent: 'Declarar alquiler', dataset: { declareRental: asset.id }, onClick: () => this.openDeclaration(asset.id, { onDone: options.onDone || (() => this.render()) }) });
  },

  // Opens the rental of the asset on its Resumen tab: the rental modal owns the whole rental experience.
  openRental(assetId, declarationId, options = {}) {
    return RentalModal.open(declarationId, { assetId, tab: 'resumen', ...options });
  },

  // Data of the asset: classification, type, characteristics, location, areas, cadastral id, construction
  // date, age, holders with their validity periods and the general notes.
  renderDataBlock(asset) {
    const section = create('section', { className: 'card', dataset: { fichaBlock: 'data' }, style: { padding: '12px' } }, [create('h3', { textContent: 'Datos del bien' })]);
    section.appendChild(create('p', { textContent: `${asset.type === 'immovable' ? 'Inmueble' : 'Mueble'}${asset.type === 'immovable' && asset.condition ? ` · ${this.optionLabel(this.conditionOptions(), asset.condition)}` : ''}` }));
    const typed = asset.type === 'immovable'
      ? [['Tipo', this.optionLabel(this.propertyKindOptions(), asset.propertyKind)], ['Características', asset.characteristics], ['Ubicación', asset.location],
        ['Superficie cubierta', asset.coveredAreaM2 != null ? `${asset.coveredAreaM2} m²` : ''], ['Superficie libre', asset.freeAreaM2 != null ? `${asset.freeAreaM2} m²` : ''], ['Identificación catastral', asset.cadastralId], ['Fecha de construcción', asset.constructionDate], [asset.age?.source === 'legacy' ? 'Antigüedad (dato anterior)' : 'Antigüedad', asset.age?.years != null ? `${asset.age.years} años` : '']]
      : [['Tipo', asset.vehicleType === 'automovil' ? 'Automóvil' : ''], ['Marca', asset.brand], ['Dominio', asset.plate], ['KMs', asset.mileage], ['Color', asset.color]];
    typed.forEach(([label, value]) => { if (value !== '' && value != null) section.appendChild(create('p', { style: { margin: '4px 0' }, textContent: `${label}: ${value}` })); });
    const holders = (asset.ownerships || []).map(record => `${record.owner?.name || 'Titular'}${record.percentage != null ? ` · ${record.percentage}%` : ''} (${record.startDate}${record.endDate ? ` — ${record.endDate}` : ' — vigente'})`);
    if (holders.length) section.appendChild(create('p', { style: { margin: '4px 0' }, textContent: `Titulares: ${holders.join('; ')}` }));
    if (asset.notes) section.appendChild(create('p', { textContent: `Notas: ${asset.notes}` }));
    this.renderLegacyData(asset, section);
    return section;
  },

  // Compact obligations list with the actions valid for each responsibility.
  renderObligationsList(asset, items, owners) {
    const section = create('section', { className: 'card', dataset: { fichaBlock: 'obligations' }, style: { padding: '12px' } }, [create('h3', { textContent: 'Obligaciones del bien' })]);
    const active = (items || []).filter(item => item.status !== 'cancelled');
    if (!active.length) section.appendChild(create('p', { className: 'text-muted', textContent: 'Este bien todavía no tiene obligaciones. Usá "Agregar obligación" para cargar la primera.' }));
    const providers = new Map((owners || []).map(owner => [owner.id, owner.name]));
    const reload = () => this.showDetails(asset.id);
    active.forEach(item => {
      const tenantSide = item.responsibilityType === 'tenant';
      const next = item.nextDue || null;
      const badge = next ? dueBadge(next) : null;
      const identifier = item.externalIdentifier ? `${this.identifierLabel(item.externalIdentifierType)}: ${item.externalIdentifier}` : '';
      const details = [
        obligationTypeLabel(item.type), providers.get(item.providerEntityId) || 'Sin proveedor', tenantSide ? 'A cargo del inquilino' : 'A cargo del titular', identifier,
        item.estimatedAmount != null ? formatearMonedaConCodigo(item.estimatedAmount, item.currencyCode) : '',
        item.recurrenceFrequency ? ObligationsPage.frequencyLabel(item.recurrenceFrequency) : 'Única vez'
      ].filter(Boolean).join(' · ');
      const actions = create('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
        create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Ver obligación', 'aria-label': `Ver obligación ${item.title}`, onClick: () => { Modal.hide(); Router.navigate(`/obligations?focus=${encodeURIComponent(item.id)}`); } }),
        ...(next && !tenantSide && next.status !== 'paid' ? [create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Registrar pago', 'aria-label': `Registrar pago de ${item.title}`, onClick: () => this.payFromFicha(item, next, reload) })] : []),
        ...(next && tenantSide && !next.resolution ? [create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Resolver', 'aria-label': `Resolver ${item.title}`, onClick: () => this.resolveFromFicha(item, next, reload) })] : []),
        create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Editar obligación', 'aria-label': `Editar obligación ${item.title}`, onClick: () => this.editFromFicha(item, reload) })
      ]);
      section.appendChild(create('article', { className: 'ficha-obligation', dataset: { obligationId: item.id }, style: { display: 'grid', gap: '4px', padding: '8px 0', borderTop: '1px solid var(--border-color)' } }, [
        create('strong', { textContent: item.title }),
        create('div', { className: 'text-muted', textContent: details }),
        create('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, next ? [create('span', { textContent: `Próximo vencimiento: ${next.date}` }), create('span', { className: badge.className, textContent: badge.label })] : [create('span', { textContent: 'Sin próximo vencimiento' })]),
        actions
      ]));
    });
    section.appendChild(create('button', { className: 'btn btn-primary btn-sm', type: 'button', textContent: 'Agregar obligación', style: { marginTop: '8px' }, onClick: () => { Modal.hide(); Router.navigate(`/obligations?newForAsset=${encodeURIComponent(asset.id)}`); } }));
    return section;
  },

  async payFromFicha(obligation, occurrence, reload) {
    try {
      await ObligationsPage.loadLookups();
      ObligationsPage.onChange = reload;
      await ObligationsPage.pay(obligation, occurrence);
    } catch (error) { showToast(error.message, 'error'); }
  },

  async resolveFromFicha(obligation, occurrence, reload) {
    try {
      await ObligationsPage.loadLookups();
      ObligationsPage.onChange = reload;
      await ObligationsPage.showResolveModal(obligation, occurrence);
    } catch (error) { showToast(error.message, 'error'); }
  },

  async editFromFicha(obligation, reload) {
    try {
      await ObligationsPage.loadLookups();
      ObligationsPage.assets = await API.assets.list();
      ObligationsPage.onChange = reload;
      await ObligationsPage.showCreateModal(obligation);
    } catch (error) { showToast(error.message, 'error'); }
  },

  // Summary of a declaration for the ficha card: current monthly amount per currency, composition by
  // modality, next collection, pending total and validity. Pure over the declaration view and `today`.
  rentalSummary(declaration, today) {
    const modalities = (declaration?.modalities || []).filter(item => item.status === 'active');
    const live = item => (item.occurrences || []).filter(occurrence => !occurrence.cancelled && occurrence.status !== 'cancelled');
    const composition = modalities.map(item => {
      const occurrences = live(item);
      const current = [...occurrences].reverse().find(occurrence => occurrence.date <= today) || occurrences[0] || null;
      return { modality: item.kind, currencyCode: item.currencyCode, amount: current ? current.rentAmount : item.totalAmount };
    });
    const add = (map, currency, value) => map.set(currency, Math.round(((map.get(currency) || 0) + value) * 100) / 100);
    const totalsBy = new Map();
    composition.forEach(item => add(totalsBy, item.currencyCode, item.amount));
    const pending = new Map();
    let nextDate = null;
    modalities.forEach(item => live(item).forEach(occurrence => {
      if (occurrence.remainingMinor > 0 && occurrence.date <= today) add(pending, occurrence.currencyCode, occurrence.remainingAmount);
      if (occurrence.remainingMinor > 0 && occurrence.date >= today && (!nextDate || occurrence.date < nextDate)) nextDate = occurrence.date;
    }));
    const starts = (declaration?.modalities || []).map(item => item.startDate).sort();
    const ends = (declaration?.modalities || []).map(item => item.endDate);
    return {
      tenants: (declaration?.tenants || []).map(item => item.name),
      from: starts[0] || null, to: ends.length && ends.every(Boolean) ? [...ends].sort().pop() : null,
      composition, monthlyTotals: [...totalsBy].map(([currencyCode, amount]) => ({ currencyCode, amount })),
      pendingTotals: [...pending].map(([currencyCode, amount]) => ({ currencyCode, amount })), nextCollection: nextDate
    };
  },

  // Rental section of the ficha: an empty state with "Declarar alquiler", or the summary card with
  // "Ver alquiler" (the declare action stays disabled while a rental is in force). Plus the rental history.
  async renderRentalCard(asset, container) {
    const section = create('section', { className: 'card', dataset: { fichaBlock: 'rental' }, style: { padding: '12px', display: 'grid', gap: '6px' } }, [create('h3', { textContent: 'Alquiler' })]);
    container.appendChild(section);
    const money = list => list.map(item => formatearMonedaConCodigo(item.amount, item.currencyCode)).join(' + ') || '—';
    if (!asset.activeDeclarationId && !asset.declaration) {
      section.append(
        Feedback.empty({ message: Feedback.MESSAGES.noActiveRental }),
        this.rentalAccessButton(asset, { onDone: () => this.showDetails(asset.id) })
      );
    } else {
      const declarationId = asset.activeDeclarationId || asset.declaration.id;
      let declaration = null;
      try { declaration = (await API.rentals.declarations.list(asset.id)).find(item => item.id === declarationId) || null; } catch (error) { section.appendChild(create('p', { className: 'text-muted', textContent: `No se pudo cargar el alquiler: ${error.message}` })); }
      if (declaration) {
        const summary = this.rentalSummary(declaration, getToday());
        const line = (label, value) => section.appendChild(create('div', { className: 'label-value' }, [create('strong', { textContent: `${label}:` }), create('span', { textContent: value })]));
        line('Inquilino', summary.tenants.join(', ') || '—');
        line('Vigencia', `${summary.from || '—'} — ${summary.to || 'sin fecha de fin'}`);
        line('Estado del alquiler', statusLabel(declaration.status));
        line('Monto mensual vigente', money(summary.monthlyTotals));
        summary.composition.forEach(item => line(modalityLabel(item.modality) || 'Alquiler', formatearMonedaConCodigo(item.amount, item.currencyCode)));
        line('Próximo cobro', summary.nextCollection || 'Sin cobros próximos');
        line('Total pendiente de cobro', money(summary.pendingTotals));
        section.appendChild(create('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '6px' } }, [
          this.rentalAccessButton(asset),
          create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Declarar alquiler', disabled: true, 'aria-describedby': 'declare-blocked-hint' }),
          create('small', { id: 'declare-blocked-hint', className: 'text-muted', textContent: 'Finalizá el alquiler vigente antes de declarar uno nuevo' })
        ]));
      }
    }
    section.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Histórico de alquileres', dataset: { rentalHistory: asset.id }, style: { justifySelf: 'start' }, onClick: () => this.showRentalHistory(asset) }));
  },

  // "Histórico de alquileres": the list (view, safe edit, delete) lives in the rental modal.
  showRentalHistory(asset) {
    return RentalModal.showHistory(asset);
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
            const amount = MoneyInput.create({ currency: claim.currencyCode, value: claim.outstandingAmount, required: true, ariaLabel: 'Importe recibido' });
            const account = this.select(accountTreeOptions(available).map(({ account: item, label }) => [item.id, label]));
            form.append(create('label', {}, [create('span', { textContent: `Importe recibido (pendiente: ${claim.outstandingAmount} ${claim.currencyCode})` }), amount]));
            form.append(create('label', {}, [create('span', { textContent: 'Cuenta de ingreso' }), account]));
            Modal.show('Registrar reintegro', form, { footer: create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Guardar ingreso', onClick: async () => {
              if (!MoneyInput.validate(amount)) return;
              try {
                await API.finance.collectClaim(claim.id, {
                  amount: MoneyInput.value(amount) ?? NaN, accountId: account.value,
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
        const amount = MoneyInput.create({ currency: 'ARS', required: true, ariaLabel: 'Importe recuperable' });
        const selectedExpense = () => expenses.find(item => item.id === expense.value);
        expense.addEventListener('change', () => {
          const selected = selectedExpense();
          MoneyInput.setCurrency(amount, selected?.currencyCode || 'ARS');
          MoneyInput.setValue(amount, selected?.monto ?? null);
        });
        form.append(create('label', {}, [create('span', { textContent: 'Gasto de origen' }), expense]));
        form.append(create('label', {}, [create('span', { textContent: 'Contrato de alquiler (opcional)' }), contract]));
        form.append(create('label', {}, [create('span', { textContent: 'Inquilino responsable (opcional)' }), tenant]));
        form.append(create('label', {}, [create('span', { textContent: 'Importe recuperable' }), amount]));
        Modal.show('Registrar gasto recuperable', form, { footer: create('div', {}, [
          create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Guardar reclamo', onClick: async () => {
            if (!MoneyInput.validate(amount)) return;
            try {
              await API.finance.createClaim({ transactionId: expense.value, assetId: asset.id, contractId: contract.value || null, tenantEntityId: tenant.value || null, amount: MoneyInput.value(amount) ?? NaN });
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
    // Immovables show "Próximos vencimientos" by collection period in their rentals section.
    if (asset.type !== 'immovable') list('Próximos vencimientos', file.upcoming, item => `${item.date} · ${item.title}`);
    list('Pendientes', file.pending, item => `${item.dueDate} · ${item.title}${item.type === 'document_pending' ? ' (falta comprobante)' : item.type === 'tenant_obligation_pending' ? ' (comprobante del inquilino pendiente)' : ''}`);
    list('Obligaciones', file.obligations, item => `${item.title} · ${responsibility[item.responsibilityType] || item.responsibilityType}${item.responsibleParty?.name ? ` (${item.responsibleParty.name})` : ''} · ${item.nextDueDate ? `próximo ${item.nextDueDate}` : 'sin próximo vencimiento'}${item.settledBy ? ` · ${settled[item.settledBy]}` : ''}${resolution[item.resolutionStatus] || ''}`);
    const documents = create('div', { style: { display: 'grid', gap: '4px' } }, [create('strong', { textContent: 'Documentos', style: { display: 'block', marginTop: '8px' } })]);
    if (!(file.documents || []).length) documents.appendChild(create('small', { className: 'text-muted', textContent: 'Sin elementos' }));
    (file.documents || []).forEach(item => documents.appendChild(API.documents.receiptLinks([item])));
    section.appendChild(documents);
    list('Notas', file.notes, item => item.text);
  },

  // The monthly sheet opens as a wide secondary modal (MonthlySheet in rentalPeriods.js); nothing renders inline.
  renderMonthlyView(asset, container) {
    const section = create('section', { style: { borderTop: '1px solid var(--border-color)', marginTop: '16px', paddingTop: '12px' } });
    section.append(create('h4', { textContent: 'Ficha mensual' }), create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Ver ficha mensual', dataset: { monthlySheet: 'true' }, onClick: () => MonthlySheet.open(asset.id) }));
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
      row.appendChild(create('small', { style: { display: 'block' }, textContent: `${item.type === 'income' ? 'Ingreso' : item.type === 'expense' ? 'Gasto' : 'Reembolso'} · ${item.category || 'Sin categoría'} · ${item.account} · ${item.paymentMethod || 'Medio no indicado'} · ${item.contract || 'Sin contrato'} · ${statusLabel(item.status)}` }));
      if (item.refundSourceId) row.appendChild(create('small', { style: { display: 'block' }, textContent: `Reembolso vinculado a: ${item.refundSourceConcept || 'gasto de origen'}` }));
      (item.documents || []).forEach(document => {
        row.appendChild(API.documents.receiptLinks([document]));
      });
      movementList.appendChild(row);
    });
    const pending = create('section', { className: 'card', style: { padding: '10px' } });
    pending.appendChild(create('strong', { textContent: 'Pendiente, fuera de resultados reales' }));
    const pendingRows = [...(result.pending?.obligations || []).map(item => ({ ...item, kind: 'Obligación' })), ...(result.pending?.rents || []).map(item => ({ ...item, kind: 'Alquiler esperado' }))];
    if (!pendingRows.length) pending.appendChild(create('small', { style: { display: 'block' }, textContent: 'No hay importes pendientes en este período.' }));
    pendingRows.forEach(item => pending.appendChild(create('p', { style: { margin: '5px 0' }, textContent: `${item.date} · ${item.kind}${modalityLabel(item.modality) ? ` (${modalityLabel(item.modality)})` : ''} · ${item.concept} · ${formatearMonedaConCodigo(item.amount, item.currency)} · ${statusLabel(item.status)}` })));
    container.appendChild(pending);
  },

  // "Finalizar alquiler": confirmation with the termination date. Today by default; an earlier date (or a
  // future one) declares an early termination and frees the following dates for a new rental.
  // `options.stacked` opens it on top of the current dialog (e.g. from the declaration overlap error).
  endDeclaration(asset, options = {}) {
    const declarationId = options.declarationId || asset.declaration.id;
    const body = create('div', { style: { display: 'grid', gap: '8px' } });
    body.appendChild(create('p', { textContent: 'Se finalizan todas las modalidades y se cancelan los períodos sin cobrar posteriores a la fecha de finalización. Los cobros registrados se conservan.' }));
    const endDate = create('input', { className: 'form-control', type: 'date', value: getToday(), 'aria-label': 'Fecha de finalización' });
    body.appendChild(create('label', { className: 'form-group', style: { display: 'grid', gap: '4px' } }, [create('span', { textContent: 'Fecha de finalización' }), endDate]));
    body.appendChild(create('small', { className: 'text-muted', textContent: 'Podés declarar una finalización anticipada: las fechas posteriores quedan libres para declarar un nuevo alquiler.' }));
    const back = () => (options.stacked ? Modal.hide() : this.showDetails(asset.id));
    const footer = create('div', {}, [
      create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Volver', onClick: back }),
      create('button', { className: 'btn btn-danger', type: 'button', textContent: 'Confirmar y finalizar', onClick: async () => {
        try {
          await API.rentals.declarations.end(declarationId, { endDate: endDate.value || null });
          showToast('Alquiler finalizado');
          if (options.stacked) { Modal.hide(); if (options.onDone) await options.onDone(); }
          else await this.showDetails(asset.id);
        } catch (error) { showToast(error.message, 'error'); }
      } })
    ]);
    (options.stacked ? Modal.push : Modal.show).call(Modal, 'Finalizar alquiler', body, { footer });
  },

  contractTypeLabel(type) {
    return ({ residential: 'Residencial', commercial: 'Comercial', industrial: 'Industrial', temporary: 'Temporal', other: 'Otro' })[type] || type;
  },

  rentStatusLabel(status) {
    return statusLabel(status);
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

  // Opens the "Declaración de alquiler" modal for an asset (fetches the fresh asset with its declaration).
  // Collection dialogs live in rentalPeriods.js; these delegates keep the existing callers working.
  showRentMonthModal(assetId, monthKey, onDone = null) {
    return RentalPeriods.collectMonth(assetId, monthKey, onDone);
  },

  showRentCollectionModal(asset, contract, selectedOccurrenceId = null, onDone = null) {
    return RentalPeriods.collectContract(asset, contract, selectedOccurrenceId, onDone);
  },

  showCollectionView(id, options = {}) {
    return RentalPeriods.showCollectionView(id, options);
  },

  undoCollections(collectionIds, afterDone, note) {
    return RentalPeriods.undoCollections(collectionIds, afterDone, note);
  },

  async openDeclaration(assetId, options = {}) {
    try { await RentalDeclarationModal.show(this, await API.assets.get(assetId), options); }
    catch (error) { showToast(error.message, 'error'); }
  },

};
