const CategoriesPage = {
  async render() {
    const content = $('#page-content');
    const navbar = $('#navbar');
    navbar.style.display = '';
    content.style.paddingBottom = '';

    content.innerHTML = '<div class="loading">Cargando...</div>';

    try {
      const categories = await API.categories.list();
      this.renderContent(content, categories);
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
    }
  },

  renderContent(content, categories) {
    content.innerHTML = '';

    const header = create('div', { className: 'page-header' }, [
      create('h2', { className: 'page-title', textContent: 'Categorías' }),
      create('button', {
        className: 'btn btn-primary btn-sm',
        textContent: '+ Nueva'
      })
    ]);

    on(header.lastChild, 'click', () => this.showCreateModal(content, categories));

    content.appendChild(header);

    if (categories.length === 0) {
      content.appendChild(create('div', {
        className: 'empty-state',
        innerHTML: '<div class="empty-state-icon">📁</div><p class="empty-state-text">No tenés categorías creadas</p>'
      }));
      return;
    }

    const catMap = {};
    categories.forEach(c => catMap[c.id] = c);

    const parents = categories.filter(c => !c.parentId);
    const childrenMap = {};
    categories.forEach(c => {
      if (c.parentId) {
        if (!childrenMap[c.parentId]) childrenMap[c.parentId] = [];
        childrenMap[c.parentId].push(c);
      }
    });

    const list = create('ul', { className: 'category-list' });

    const renderCategory = (cat, depth) => {
      const li = create('li', { className: 'category-item' });
      if (depth > 0) li.classList.add('category-child');
      li.style.paddingLeft = `${16 + depth * 24}px`;

      const left = create('div', { className: 'category-item-left' });
      left.appendChild(create('span', {
        className: 'category-dot',
        style: { background: cat.color || '#6c6c7c', width: '12px', height: '12px', display: 'inline-block', borderRadius: '50%' }
      }));
      left.appendChild(create('span', { textContent: cat.nombre }));

      if (depth > 0) {
        left.appendChild(create('span', {
          className: 'category-parent-badge',
          textContent: catMap[cat.parentId]?.nombre || '',
          style: { fontSize: 'var(--font-xs)', color: 'var(--text-muted)', marginLeft: '8px' }
        }));
      }

      const childCount = (childrenMap[cat.id] || []).length;
      if (childCount > 0) {
        left.appendChild(create('span', {
          className: 'category-child-count',
          textContent: `(${childCount})`,
          style: { fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }
        }));
      }

      const actions = create('div', { className: 'category-item-actions' });

      if (depth === 0) {
        const addSubBtn = create('button', {
          className: 'icon-btn',
          innerHTML: '➕',
          title: 'Agregar subcategoría'
        });
        on(addSubBtn, 'click', () => this.showCreateModal(content, categories, cat.id));
        actions.appendChild(addSubBtn);
      }

      const editBtn = create('button', {
        className: 'icon-btn',
        innerHTML: '✏️',
        title: 'Editar'
      });
      on(editBtn, 'click', () => this.showEditModal(content, cat, categories));

      const deleteBtn = create('button', {
        className: 'icon-btn danger',
        innerHTML: '🗑️',
        title: 'Eliminar'
      });
      on(deleteBtn, 'click', () => this.deleteCategory(content, cat));

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      li.appendChild(left);
      li.appendChild(actions);
      list.appendChild(li);

      (childrenMap[cat.id] || []).forEach(child => renderCategory(child, depth + 1));
    };

    parents.forEach(cat => renderCategory(cat, 0));
    content.appendChild(list);
  },

  showCreateModal(content, categories, preselectedParentId) {
    const form = create('div');

    const nameGroup = create('div', { className: 'form-group' });
    nameGroup.appendChild(create('label', { textContent: 'Nombre' }));
    const nameInput = create('input', {
      className: 'form-control',
      type: 'text',
      placeholder: 'Ej: Supermercado'
    });
    nameGroup.appendChild(nameInput);
    form.appendChild(nameGroup);

    const parentGroup = create('div', { className: 'form-group' });
    parentGroup.appendChild(create('label', { textContent: 'Categoría padre (opcional)' }));
    const parentSelect = create('select', { className: 'form-control' });
    parentSelect.appendChild(create('option', { value: '', textContent: 'Ninguna (categoría principal)' }));
    categories.filter(c => !c.parentId).forEach(cat => {
      parentSelect.appendChild(create('option', { value: cat.id, textContent: cat.nombre }));
    });
    if (preselectedParentId) parentSelect.value = preselectedParentId;
    parentGroup.appendChild(parentSelect);
    form.appendChild(parentGroup);

    const colorGroup = create('div', { className: 'form-group' });
    colorGroup.appendChild(create('label', { textContent: 'Color' }));
    const colorPicker = this.createColorPicker();
    colorGroup.appendChild(colorPicker);
    form.appendChild(colorGroup);

    const footer = create('div', { style: { display: 'flex', gap: '8px' } });
    footer.appendChild(create('button', {
      className: 'btn btn-ghost',
      textContent: 'Cancelar',
      onClick: () => Modal.hide()
    }));
    footer.appendChild(create('button', {
      className: 'btn btn-primary',
      textContent: 'Crear'
    }));

    on(footer.lastChild, 'click', async () => {
      const nombre = nameInput.value.trim();
      if (!nombre) return showToast('El nombre es obligatorio', 'error');

      try {
        const data = { nombre, color: colorPicker.dataset.selected || null };
        if (parentSelect.value) data.parentId = parentSelect.value;
        await API.categories.create(data);
        Modal.hide();
        showToast('Categoría creada');
        this.render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    Modal.show('Nueva categoría', form, { footer });
    nameInput.focus();
  },

  showEditModal(content, cat, categories) {
    const form = create('div');

    const nameGroup = create('div', { className: 'form-group' });
    nameGroup.appendChild(create('label', { textContent: 'Nombre' }));
    const nameInput = create('input', {
      className: 'form-control',
      type: 'text',
      value: cat.nombre
    });
    nameGroup.appendChild(nameInput);
    form.appendChild(nameGroup);

    const parentGroup = create('div', { className: 'form-group' });
    parentGroup.appendChild(create('label', { textContent: 'Categoría padre' }));
    const parentSelect = create('select', { className: 'form-control' });
    parentSelect.appendChild(create('option', { value: '', textContent: 'Ninguna (categoría principal)' }));
    categories.filter(c => !c.parentId && c.id !== cat.id).forEach(c => {
      parentSelect.appendChild(create('option', { value: c.id, textContent: c.nombre }));
    });
    parentSelect.value = cat.parentId || '';
    parentGroup.appendChild(parentSelect);
    form.appendChild(parentGroup);

    const colorGroup = create('div', { className: 'form-group' });
    colorGroup.appendChild(create('label', { textContent: 'Color' }));
    const colorPicker = this.createColorPicker(cat.color);
    colorGroup.appendChild(colorPicker);
    form.appendChild(colorGroup);

    const footer = create('div', { style: { display: 'flex', gap: '8px' } });
    footer.appendChild(create('button', {
      className: 'btn btn-ghost',
      textContent: 'Cancelar',
      onClick: () => Modal.hide()
    }));
    footer.appendChild(create('button', {
      className: 'btn btn-primary',
      textContent: 'Guardar'
    }));

    on(footer.lastChild, 'click', async () => {
      const nombre = nameInput.value.trim();
      if (!nombre) return showToast('El nombre es obligatorio', 'error');

      try {
        const data = { nombre, color: colorPicker.dataset.selected || null, parentId: parentSelect.value || null };
        await API.categories.update(cat.id, data);
        Modal.hide();
        showToast('Categoría actualizada');
        this.render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    Modal.show('Editar categoría', form, { footer });
    nameInput.focus();
  },

  async deleteCategory(content, cat) {
    const footer = create('div', { style: { display: 'flex', gap: '8px' } });
    footer.appendChild(create('button', {
      className: 'btn btn-ghost',
      textContent: 'Cancelar',
      onClick: () => Modal.hide()
    }));
    footer.appendChild(create('button', {
      className: 'btn btn-danger',
      textContent: 'Eliminar'
    }));

    on(footer.lastChild, 'click', async () => {
      try {
        await API.categories.delete(cat.id);
        Modal.hide();
        showToast('Categoría eliminada');
        this.render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    Modal.show(
      'Eliminar categoría',
      create('p', { textContent: `¿Eliminar "${cat.nombre}"?` }),
      { footer }
    );
  },

  createColorPicker(selectedColor) {
    const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#95E1D3', '#AA96DA', '#F38181', '#A8D8EA', '#FFA07A', '#DDA0DD', '#98D8C8', '#F7DC6F', '#85C1E9'];
    const wrapper = create('div', { className: 'color-picker' });
    wrapper.dataset.selected = selectedColor || colors[0];

    colors.forEach(color => {
      const dot = create('button', {
        className: `color-option ${color === (selectedColor || colors[0]) ? 'selected' : ''}`,
        style: { background: color }
      });
      on(dot, 'click', (e) => {
        e.preventDefault();
        wrapper.querySelectorAll('.color-option').forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
        wrapper.dataset.selected = color;
      });
      wrapper.appendChild(dot);
    });

    return wrapper;
  }
};
