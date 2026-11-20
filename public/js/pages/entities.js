const EntitiesPage = {
  entities: [],
  categories: [],

  allEntities: [],

  ROLE_TITLES: { owner: 'Titular', tenant: 'Inquilino', provider: 'Proveedor' },

  // "Elegir existente" (evolutivo-13): a panel can add its role to an entity already loaded with another role,
  // so the same entity (same id) is, e.g., titular and inquilino. Which lists each panel picks from:
  EXISTING_SOURCES: {
    tenant: { roles: ['owner'], label: 'Elegir un titular existente' },
    owner: { roles: ['tenant', 'provider'], label: 'Elegir un inquilino o proveedor existente' },
    provider: { roles: ['owner', 'tenant'], label: 'Elegir un titular o inquilino existente' }
  },

  // Pure: entities of the source lists that do not have `role` yet, by name.
  existingCandidates(entities, role) {
    const source = this.EXISTING_SOURCES[role];
    if (!source) return [];
    return (entities || [])
      .filter(entity => { const roles = entity.roles || ['owner']; return !roles.includes(role) && source.roles.some(item => roles.includes(item)); })
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  },

  // Legacy entry point: the old /entities page now lives in Settings.
  render() {
    Router.navigate('/settings?section=owners');
  },

  roleLabels(roles = []) {
    const labels = { owner: 'Propietario', tenant: 'Inquilino', provider: 'Proveedor', payment_responsible: 'Responsable de pago', other: 'Otro' };
    return roles.map(role => labels[role] || role).join(' · ');
  },

  async renderPanel(panel, role) {
    panel.replaceChildren(create('div', { className: 'loading', textContent: 'Cargando...' }));
    try {
      const [entities, categories] = await Promise.all([API.owners.list(), API.categories.list().catch(() => [])]);
      this.categories = categories;
      this.allEntities = entities;
      this.entities = entities.filter(entity => (entity.roles || ['owner']).includes(role));
      this.renderList(panel, role);
    } catch (error) {
      panel.replaceChildren(create('div', { className: 'empty-state', textContent: `No se pudieron cargar los datos: ${error.message}` }));
    }
  },

  renderList(panel, role) {
    const title = this.ROLE_TITLES[role] || 'Contactos';
    panel.replaceChildren(create('div', { className: 'settings-section-heading' }, [
      create('h2', { textContent: title }),
      create('button', { className: 'btn btn-primary', type: 'button', textContent: `Agregar ${title.toLowerCase()}`, onClick: () => this.showForm(panel, role) })
    ]));
    if (!this.entities.length) {
      panel.appendChild(create('p', { className: 'empty-state-text', textContent: `Todavía no hay registros de ${title.toLowerCase()}.` }));
      return;
    }
    const list = create('div', { style: { display: 'grid', gap: '10px' } });
    const muted = { color: 'var(--text-muted)', fontSize: 'var(--font-sm)', marginTop: '4px' };
    this.entities.forEach(entity => {
      const kind = entity.kind === 'person' ? 'Persona' : 'Organización';
      const categoryNames = this.entityCategoryIds(entity).map(id => this.categories.find(item => item.id === id)?.nombre).filter(Boolean);
      const details = create('div', {}, [
        create('strong', { textContent: entity.name }),
        create('div', { textContent: `${kind} · ${this.roleLabels(entity.roles)}`, style: muted }),
        create('div', { textContent: [entity.email, entity.phone, categoryNames.length && `${categoryNames.length > 1 ? 'Categorías' : 'Categoría'}: ${categoryNames.join(', ')}`].filter(Boolean).join(' · '), style: muted })
      ]);
      list.appendChild(create('article', { className: 'settings-card', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } }, [
        details,
        create('div', { style: { display: 'flex', gap: '8px' } }, [
          create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Ver ficha', onClick: () => this.showDetails(entity) }),
          create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Editar', onClick: () => this.showForm(panel, role, entity) }),
          create('button', { className: 'btn btn-danger btn-sm', type: 'button', textContent: 'Eliminar', onClick: () => this.remove(panel, role, entity) })
        ])
      ]));
    });
    panel.appendChild(list);
  },

  async remove(panel, role, entity) {
    try {
      await API.owners.delete(entity.id);
      showToast('Registro eliminado');
      await this.renderPanel(panel, role);
    } catch (error) {
      showToast(`No se pudo eliminar: ${error.message}`, 'error');
    }
  },

  async showForm(panel, role, entity = null) {
    const editing = Boolean(entity);
    // Expense categories always load when the form opens, whatever the panel role; a failure is shown, never silent.
    let categoriesError = null;
    try { this.categories = await API.categories.list(); } catch (error) { categoriesError = error.message; this.categories = []; }
    const form = create('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
    // New record: either create a new entity (the fields below) or add this role to an existing one.
    const candidates = editing ? [] : this.existingCandidates(this.allEntities, role);
    const title = this.ROLE_TITLES[role] || 'contacto';
    const origin = create('select', { className: 'form-control', 'aria-label': 'Origen del registro', dataset: { entityOrigin: 'true' } });
    [['new', `Crear ${title.toLowerCase()} nuevo`], ['existing', this.EXISTING_SOURCES[role]?.label || 'Elegir existente']].forEach(([value, label]) => origin.appendChild(create('option', { value, textContent: label })));
    const existing = create('select', { className: 'form-control', 'aria-label': 'Registro existente', dataset: { existingEntity: 'true' } });
    candidates.forEach(item => existing.appendChild(create('option', { value: item.id, textContent: `${item.name} (${this.roleLabels(item.roles || ['owner'])})` })));
    const existingBox = create('div', { className: 'form-group', dataset: { existingPicker: 'true' } }, [
      create('label', { textContent: 'Elegí el registro' }), existing,
      create('small', { className: 'text-muted', textContent: `Se mantiene el mismo registro y se le agrega el rol ${title.toLowerCase()}.` })
    ]);
    const fields = create('div');
    if (candidates.length) form.append(create('div', { className: 'form-group' }, [create('label', { textContent: '¿Nuevo o existente?' }), origin]), existingBox);
    form.appendChild(fields);
    const kind = create('select', { className: 'form-control' });
    [['person', 'Persona'], ['entity', 'Organización']].forEach(([value, label]) => kind.appendChild(create('option', { value, textContent: label })));
    kind.value = !entity || entity.kind === 'person' ? 'person' : 'entity';
    fields.append(create('label', { textContent: 'Tipo' }), kind);
    const personBox = create('div');
    const orgBox = create('div');
    const addressBox = create('div');
    fields.append(personBox, orgBox);
    const firstName = this.addField(personBox, 'Nombre', entity?.firstName ?? (entity?.kind === 'person' ? entity.name : ''));
    const lastName = this.addField(personBox, 'Apellido', entity?.lastName || '');
    const dni = this.addField(personBox, 'DNI', entity?.dni || '');
    const businessName = this.addField(orgBox, 'Razón social', entity?.kind === 'person' ? '' : (entity?.name || ''));
    const taxId = this.addField(orgBox, 'CUIL/CUIT', entity?.taxIdentification || '');
    const phone = this.addField(fields, 'Teléfono', entity?.phone || '');
    const email = this.addField(fields, 'Correo electrónico', entity?.email || '', 'email');
    fields.appendChild(addressBox);
    const address = this.addField(addressBox, 'Dirección', entity?.address || '');
    // Multiple selection: one checkbox per category (subcategories show their parent).
    const selectedCategories = new Set(this.entityCategoryIds(entity));
    const category = create('div', { className: 'category-multiselect', role: 'group', 'aria-label': 'Categorías de gasto' });
    const categoryInputs = this.categories.map(item => {
      const parent = item.parentId ? this.categories.find(other => other.id === item.parentId) : null;
      const checkbox = create('input', { type: 'checkbox', value: item.id });
      checkbox.checked = selectedCategories.has(item.id);
      category.appendChild(create('label', { className: 'checkbox-label' }, [checkbox, document.createTextNode(` ${parent ? `${parent.nombre} › ` : ''}${item.nombre}`)]));
      return checkbox;
    });
    const roleInputs = {};
    const roles = create('div', { style: { display: 'grid', gap: '6px', margin: '10px 0' } }, [create('strong', { textContent: 'Roles' })]);
    [['owner', 'Propietario'], ['tenant', 'Inquilino'], ['provider', 'Proveedor'], ['payment_responsible', 'Responsable de pago'], ['other', 'Otro']].forEach(([value, label]) => {
      const checkbox = create('input', { type: 'checkbox' });
      checkbox.checked = (entity?.roles || [role]).includes(value);
      roleInputs[value] = checkbox;
      roles.appendChild(create('label', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [checkbox, document.createTextNode(label)]));
    });
    const categoryGroup = create('div', { className: 'form-group' }, [create('label', { textContent: 'Categorías de gasto (al menos una para organizaciones proveedoras)' }), category]);
    const categoryHint = categoriesError
      ? `No se pudieron cargar las categorías: ${categoriesError}`
      : (this.categories.length ? '' : 'Primero creá una categoría de gastos en Configuración → Categorías.');
    if (categoryHint) categoryGroup.appendChild(create('small', { className: 'text-muted', role: categoriesError ? 'alert' : 'status', dataset: { categoryHint: categoriesError ? 'error' : 'empty' }, textContent: categoryHint }));
    fields.append(categoryGroup, roles);
    const notes = this.addField(fields, 'Notas generales', entity?.notes || '', 'textarea');
    const sync = () => {
      const pickExisting = origin.value === 'existing' && candidates.length > 0;
      existingBox.hidden = !pickExisting;
      fields.hidden = pickExisting;
      footer.lastChild.textContent = editing ? 'Guardar cambios' : (pickExisting ? `Agregar como ${title.toLowerCase()}` : 'Crear');
      personBox.hidden = kind.value !== 'person';
      orgBox.hidden = kind.value === 'person';
      addressBox.hidden = kind.value === 'person';
      categoryGroup.hidden = !roleInputs.provider.checked;
    };
    const footer = create('div', { style: { display: 'flex', gap: '8px' } }, [
      create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cancelar', onClick: () => Modal.hide() }),
      create('button', { className: 'btn btn-primary', type: 'button', textContent: editing ? 'Guardar cambios' : 'Crear' })
    ]);
    kind.addEventListener('change', sync);
    origin.addEventListener('change', sync);
    roleInputs.provider.addEventListener('change', sync);
    sync();
    footer.lastChild.addEventListener('click', async () => {
      if (!editing && origin.value === 'existing' && candidates.length) return this.addRoleToExisting(panel, role, candidates.find(item => item.id === existing.value));
      const selectedRoles = Object.entries(roleInputs).filter(([, input]) => input.checked).map(([name]) => name);
      const data = this.buildPayload({
        kind: kind.value, roles: selectedRoles, firstName: firstName.value, lastName: lastName.value, dni: dni.value,
        businessName: businessName.value, taxId: taxId.value, email: email.value, phone: phone.value,
        address: address.value, categoryIds: categoryInputs.filter(input => input.checked).map(input => input.value), notes: notes.value
      });
      const problem = this.validate(data);
      if (problem) return showToast(problem, 'error');
      try {
        if (editing) await API.owners.update(entity.id, data);
        else await API.owners.create(data);
        Modal.hide();
        showToast(editing ? 'Registro actualizado' : 'Registro creado');
        await this.renderPanel(panel, role);
      } catch (error) { showToast(error.message, 'error'); }
    });
    Modal.show(editing ? `Editar ${title}` : `Nuevo ${title}`, form, { footer });
  },

  // Adds the panel role to an existing entity (same id, roles merged): no duplicate record is created.
  async addRoleToExisting(panel, role, entity) {
    if (!entity) return showToast('Elegí un registro existente', 'error');
    const title = (this.ROLE_TITLES[role] || 'contacto').toLowerCase();
    try {
      await API.owners.update(entity.id, { roles: [...new Set([...(entity.roles || ['owner']), role])] });
      Modal.hide();
      showToast(`${entity.name} ahora también es ${title}`);
      await this.renderPanel(panel, role);
    } catch (error) { showToast(error.message, 'error'); }
  },

  entityCategoryIds(entity) {
    if (!entity) return [];
    if (Array.isArray(entity.expenseCategoryIds) && entity.expenseCategoryIds.length) return entity.expenseCategoryIds;
    return entity.expenseCategoryId ? [entity.expenseCategoryId] : [];
  },

  buildPayload(values) {
    const base = { kind: values.kind, roles: values.roles, email: values.email.trim(), phone: values.phone.trim(), notes: values.notes.trim() };
    if (values.roles.includes('provider')) base.expenseCategoryIds = values.categoryIds || [];
    if (values.kind === 'person') {
      const firstName = values.firstName.trim();
      const lastName = values.lastName.trim();
      return { ...base, firstName, lastName, dni: values.dni.trim() || null, name: `${firstName} ${lastName}`.trim() };
    }
    return { ...base, name: values.businessName.trim(), taxIdentification: values.taxId.trim(), address: values.address.trim() };
  },

  validate(data) {
    if (!data.roles.length) return 'Selecciona al menos un rol';
    if (data.kind === 'person' && (!data.firstName || !data.lastName)) return 'Nombre y apellido son obligatorios';
    if (data.kind !== 'person' && !data.name) return 'La razón social es obligatoria';
    if (data.kind !== 'person' && data.roles.includes('provider') && !(data.expenseCategoryIds || []).length) return 'Elegí al menos una categoría de gasto para el proveedor';
    return null;
  },

  addField(container, labelText, value = '', type = 'text') {
    const control = create(type === 'textarea' ? 'textarea' : 'input', { className: 'form-control', ...(type === 'textarea' ? { rows: 3 } : { type }) });
    control.value = value;
    const group = create('div', { className: 'form-group' }, [create('label', { textContent: labelText }), control]);
    container.appendChild(group);
    return control;
  },

  async showDetails(entity) {
    const body = create('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
    body.appendChild(create('p', { textContent: `${entity.kind === 'person' ? 'Persona' : 'Organización'} · ${this.roleLabels(entity.roles)}` }));
    [['DNI', entity.dni], ['Correo', entity.email], ['Teléfono', entity.phone], ['Dirección', entity.address], ['CUIL/CUIT', entity.taxIdentification], ['Notas', entity.notes]].forEach(([label, value]) => {
      if (value) body.appendChild(create('p', { textContent: `${label}: ${value}` }));
    });
    await WealthRecords.renderPanel(body, 'entity', entity.id);
    Modal.show(entity.name, body, { footer: create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() })]) });
  }
};
