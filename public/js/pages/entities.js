const EntitiesPage = {
  entities: [],

  async render() {
    const content = $('#page-content');
    $('#navbar').style.display = '';
    content.style.paddingBottom = '';
    content.replaceChildren(create('div', { className: 'loading', textContent: 'Cargando personas y organizaciones...' }));
    try {
      this.entities = await API.owners.list();
      this.renderContent(content);
    } catch (error) {
      content.replaceChildren(create('div', { className: 'empty-state', textContent: `No se pudieron cargar los contactos: ${error.message}` }));
    }
  },

  roleLabels(roles = []) {
    const labels = { owner: 'Propietario', tenant: 'Inquilino', provider: 'Proveedor' };
    return roles.map(role => labels[role] || role).join(' · ');
  },

  renderContent(content) {
    content.replaceChildren();
    content.appendChild(create('div', { className: 'page-header' }, [
      create('h2', { className: 'page-title', textContent: 'Personas y organizaciones' }),
      create('button', { className: 'btn btn-primary btn-sm', textContent: '+ Nuevo contacto', onClick: () => this.showForm() })
    ]));
    if (!this.entities.length) {
      content.appendChild(create('div', { className: 'empty-state', textContent: 'Todavía no hay personas u organizaciones registradas.' }));
      return;
    }
    const list = create('div', { style: { display: 'grid', gap: '10px' } });
    this.entities.forEach(entity => {
      const kind = entity.kind === 'person' ? 'Persona' : 'Organización';
      const details = create('div', {}, [
        create('strong', { textContent: entity.name }),
        create('div', { textContent: `${kind} · ${this.roleLabels(entity.roles)}`, style: { color: 'var(--text-muted)', fontSize: 'var(--font-sm)', marginTop: '4px' } }),
        create('div', { textContent: [entity.email, entity.phone].filter(Boolean).join(' · '), style: { color: 'var(--text-muted)', fontSize: 'var(--font-sm)', marginTop: '3px' } })
      ]);
      const card = create('article', { className: 'card', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } }, [
        details,
        create('div', { style: { display: 'flex', gap: '8px' } }, [
          create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Ver ficha', onClick: () => this.showDetails(entity) }),
          create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Editar', onClick: () => this.showForm(entity) })
        ])
      ]);
      list.appendChild(card);
    });
    content.appendChild(list);
  },

  showForm(entity = null) {
    const editing = Boolean(entity);
    const form = create('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
    const name = this.addField(form, 'Nombre', entity?.name || '', 'text');
    const kind = create('select', { className: 'form-control' });
    [['person', 'Persona'], ['entity', 'Organización']].forEach(([value, label]) => kind.appendChild(create('option', { value, textContent: label })));
    kind.value = entity?.kind || 'person';
    form.append(create('label', { textContent: 'Tipo' }), kind);
    const roles = create('div', { style: { display: 'grid', gap: '6px', margin: '10px 0' } });
    roles.appendChild(create('strong', { textContent: 'Roles' }));
    const roleInputs = {};
    [['owner', 'Propietario'], ['tenant', 'Inquilino'], ['provider', 'Proveedor']].forEach(([value, label]) => {
      const checkbox = create('input', { type: 'checkbox' });
      checkbox.checked = (entity?.roles || ['owner']).includes(value);
      roleInputs[value] = checkbox;
      roles.appendChild(create('label', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [checkbox, document.createTextNode(label)]));
    });
    form.appendChild(roles);
    const email = this.addField(form, 'Correo electrónico', entity?.email || '', 'email');
    const phone = this.addField(form, 'Teléfono', entity?.phone || '');
    const address = this.addField(form, 'Dirección', entity?.address || '');
    const taxIdentification = this.addField(form, 'Identificación fiscal (opcional)', entity?.taxIdentification || '');
    const notes = this.addField(form, 'Notas generales', entity?.notes || '', 'textarea');
    const footer = create('div', { style: { display: 'flex', gap: '8px' } }, [
      create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cancelar', onClick: () => Modal.hide() }),
      create('button', { className: 'btn btn-primary', type: 'button', textContent: editing ? 'Guardar cambios' : 'Crear contacto' })
    ]);
    footer.lastChild.addEventListener('click', async () => {
      const selectedRoles = Object.entries(roleInputs).filter(([, input]) => input.checked).map(([role]) => role);
      if (!selectedRoles.length) return showToast('Selecciona al menos un rol', 'error');
      const data = { name: name.value.trim(), kind: kind.value, roles: selectedRoles, email: email.value.trim(), phone: phone.value.trim(), address: address.value.trim(), taxIdentification: taxIdentification.value.trim(), notes: notes.value.trim() };
      try {
        if (editing) await API.owners.update(entity.id, data);
        else await API.owners.create(data);
        Modal.hide();
        showToast(editing ? 'Contacto actualizado' : 'Contacto creado');
        await this.render();
      } catch (error) { showToast(error.message, 'error'); }
    });
    Modal.show(editing ? 'Editar contacto' : 'Nuevo contacto', form, { footer });
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
    [['Correo', entity.email], ['Teléfono', entity.phone], ['Dirección', entity.address], ['Identificación fiscal', entity.taxIdentification], ['Notas', entity.notes]].forEach(([label, value]) => {
      if (value) body.appendChild(create('p', { textContent: `${label}: ${value}` }));
    });
    await WealthRecords.renderPanel(body, 'entity', entity.id);
    Modal.show(entity.name, body, { footer: create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() })]) });
  }
};
