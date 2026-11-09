const EntitiesPage = {
  entities: [],
  categories: [],

  ROLE_TITLES: { owner: 'Titular', tenant: 'Inquilino', provider: 'Proveedor' },

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
      const [entities, categories] = await Promise.all([API.owners.list(), role === 'provider' ? API.categories.list() : Promise.resolve([])]);
      this.categories = categories;
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
      const category = this.categories.find(item => item.id === entity.expenseCategoryId);
      const details = create('div', {}, [
        create('strong', { textContent: entity.name }),
        create('div', { textContent: `${kind} · ${this.roleLabels(entity.roles)}`, style: muted }),
        create('div', { textContent: [entity.email, entity.phone, category && `Categoría: ${category.nombre}`].filter(Boolean).join(' · '), style: muted })
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

  showForm(panel, role, entity = null) {
    const editing = Boolean(entity);
    const form = create('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
    const kind = create('select', { className: 'form-control' });
    [['person', 'Persona'], ['entity', 'Organización']].forEach(([value, label]) => kind.appendChild(create('option', { value, textContent: label })));
    kind.value = !entity || entity.kind === 'person' ? 'person' : 'entity';
    form.append(create('label', { textContent: 'Tipo' }), kind);
    const personBox = create('div');
    const orgBox = create('div');
    const addressBox = create('div');
    form.append(personBox, orgBox);
    const firstName = this.addField(personBox, 'Nombre', entity?.firstName ?? (entity?.kind === 'person' ? entity.name : ''));
    const lastName = this.addField(personBox, 'Apellido', entity?.lastName || '');
    const dni = this.addField(personBox, 'DNI', entity?.dni || '');
    const businessName = this.addField(orgBox, 'Razón social', entity?.kind === 'person' ? '' : (entity?.name || ''));
    const taxId = this.addField(orgBox, 'CUIL/CUIT', entity?.taxIdentification || '');
    const phone = this.addField(form, 'Teléfono', entity?.phone || '');
    const email = this.addField(form, 'Correo electrónico', entity?.email || '', 'email');
    form.appendChild(addressBox);
    const address = this.addField(addressBox, 'Dirección', entity?.address || '');
    const category = create('select', { className: 'form-control' });
    category.appendChild(create('option', { value: '', textContent: 'Seleccionar categoría' }));
    this.categories.forEach(item => category.appendChild(create('option', { value: item.id, textContent: item.nombre })));
    category.value = entity?.expenseCategoryId || '';
    const roleInputs = {};
    const roles = create('div', { style: { display: 'grid', gap: '6px', margin: '10px 0' } }, [create('strong', { textContent: 'Roles' })]);
    [['owner', 'Propietario'], ['tenant', 'Inquilino'], ['provider', 'Proveedor'], ['payment_responsible', 'Responsable de pago'], ['other', 'Otro']].forEach(([value, label]) => {
      const checkbox = create('input', { type: 'checkbox' });
      checkbox.checked = (entity?.roles || [role]).includes(value);
      roleInputs[value] = checkbox;
      roles.appendChild(create('label', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [checkbox, document.createTextNode(label)]));
    });
    const categoryGroup = create('div', { className: 'form-group' }, [create('label', { textContent: 'Categoría de gasto (obligatoria para organizaciones proveedoras)' }), category]);
    form.append(categoryGroup, roles);
    const notes = this.addField(form, 'Notas generales', entity?.notes || '', 'textarea');
    const sync = () => {
      personBox.hidden = kind.value !== 'person';
      orgBox.hidden = kind.value === 'person';
      addressBox.hidden = kind.value === 'person';
      categoryGroup.hidden = !roleInputs.provider.checked;
    };
    kind.addEventListener('change', sync);
    roleInputs.provider.addEventListener('change', sync);
    sync();
    const footer = create('div', { style: { display: 'flex', gap: '8px' } }, [
      create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cancelar', onClick: () => Modal.hide() }),
      create('button', { className: 'btn btn-primary', type: 'button', textContent: editing ? 'Guardar cambios' : 'Crear' })
    ]);
    footer.lastChild.addEventListener('click', async () => {
      const selectedRoles = Object.entries(roleInputs).filter(([, input]) => input.checked).map(([name]) => name);
      const data = this.buildPayload({
        kind: kind.value, roles: selectedRoles, firstName: firstName.value, lastName: lastName.value, dni: dni.value,
        businessName: businessName.value, taxId: taxId.value, email: email.value, phone: phone.value,
        address: address.value, categoryId: category.value, notes: notes.value
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
    Modal.show(editing ? `Editar ${this.ROLE_TITLES[role] || 'contacto'}` : `Nuevo ${this.ROLE_TITLES[role] || 'contacto'}`, form, { footer });
  },

  buildPayload(values) {
    const base = { kind: values.kind, roles: values.roles, email: values.email.trim(), phone: values.phone.trim(), notes: values.notes.trim() };
    if (values.roles.includes('provider')) base.expenseCategoryId = values.categoryId || null;
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
    if (data.kind !== 'person' && data.roles.includes('provider') && !data.expenseCategoryId) return 'La categoría de gasto es obligatoria para proveedores';
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
