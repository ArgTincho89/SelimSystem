const ProfilePage = {
  async render() {
    const content = $('#page-content');
    const navbar = $('#navbar');
    navbar.style.display = '';
    content.style.paddingBottom = '';

    try {
      const user = await API.auth.me();
      this.renderContent(content, user);
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p>Error: ${err.message}</p></div>`;
    }
  },

  renderContent(content, user) {
    content.innerHTML = '';

    const header = create('div', { className: 'page-header' }, [
      create('h2', { className: 'page-title', textContent: 'Perfil' })
    ]);
    content.appendChild(header);

    const avatarSection = create('div', { className: 'profile-section' });
    const savedAvatar = user.photo;
    const avatarDisplay = create('div', { className: 'profile-avatar' });
    if (savedAvatar) {
      avatarDisplay.innerHTML = `<img src="${savedAvatar}" alt="Avatar" class="avatar-img">`;
    } else {
      const initials = (user.nombre || 'U').charAt(0).toUpperCase();
      avatarDisplay.innerHTML = `<div class="avatar-placeholder">${initials}</div>`;
    }
    avatarSection.appendChild(avatarDisplay);

    const avatarBtn = create('button', {
      className: 'btn btn-ghost btn-sm',
      textContent: 'Cambiar foto'
    });
    on(avatarBtn, 'click', () => {
      const fileInput = create('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      on(fileInput, 'change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          return showToast('La imagen no puede superar 2MB', 'error');
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = async () => {
            const canvas = create('canvas');
            const size = 200;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const min = Math.min(img.width, img.height);
            const sx = (img.width - min) / 2;
            const sy = (img.height - min) / 2;
            ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            try {
              await API.auth.uploadPhoto(dataUrl);
              this.render();
              showToast('Foto actualizada');
            } catch (err) {
              showToast(err.message, 'error');
            }
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
      fileInput.click();
    });
    avatarSection.appendChild(avatarBtn);

    if (savedAvatar) {
      const removeAvatarBtn = create('button', {
        className: 'btn btn-ghost btn-sm',
        textContent: 'Eliminar foto',
        style: { color: 'var(--danger)' }
      });
      on(removeAvatarBtn, 'click', async () => {
        try {
          await API.auth.deletePhoto();
          this.render();
          showToast('Foto eliminada');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
      avatarSection.appendChild(removeAvatarBtn);
    }
    content.appendChild(avatarSection);

    const infoSection = create('div', { className: 'profile-section' });
    infoSection.appendChild(create('h3', { textContent: 'Datos de la cuenta', style: { marginBottom: '16px' } }));

    const nameRow = create('div', { className: 'profile-info-row' });
    nameRow.appendChild(create('span', { className: 'profile-info-label', textContent: 'Usuario' }));
    nameRow.appendChild(create('span', { className: 'profile-info-value', textContent: user.nombre }));
    infoSection.appendChild(nameRow);

    const emailRow = create('div', { className: 'profile-info-row' });
    emailRow.appendChild(create('span', { className: 'profile-info-label', textContent: 'Email' }));
    emailRow.appendChild(create('span', { className: 'profile-info-value', textContent: user.email }));
    infoSection.appendChild(emailRow);

    content.appendChild(infoSection);

    const accountActionsBtn = create('button', {
      className: 'btn btn-ghost btn-full',
      textContent: 'Acciones de cuenta',
      style: { marginBottom: '12px' }
    });
    on(accountActionsBtn, 'click', () => this.showAccountActionsModal());
    content.appendChild(accountActionsBtn);

    const logoutBtn = create('button', {
      className: 'btn btn-danger btn-full',
      textContent: 'Cerrar sesión'
    });
    on(logoutBtn, 'click', async () => {
      try {
        await API.auth.logout();
        App.user = null;
        Router.navigate('/login');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    content.appendChild(logoutBtn);

    content.appendChild(this.renderLogsSection());
  },

  showAccountActionsModal() {
    const actions = create('div', {
      style: { display: 'flex', flexDirection: 'column', gap: '8px' }
    });

    const changeEmailOption = create('button', {
      className: 'btn btn-ghost btn-full',
      textContent: 'Cambiar email',
      id: 'account-action-change-email'
    });
    on(changeEmailOption, 'click', () => this.showChangeEmailModal());
    actions.appendChild(changeEmailOption);

    const changePwOption = create('button', {
      className: 'btn btn-ghost btn-full',
      textContent: 'Cambiar contraseña',
      id: 'account-action-change-password'
    });
    on(changePwOption, 'click', () => this.showChangePasswordModal());
    actions.appendChild(changePwOption);

    const deleteOption = create('button', {
      className: 'btn btn-danger btn-full',
      textContent: 'Eliminar mi cuenta',
      id: 'account-action-delete'
    });
    on(deleteOption, 'click', () => this.showDeleteAccountModal());
    actions.appendChild(deleteOption);

    const footer = create('div', { style: { display: 'flex', gap: '8px' } });
    footer.appendChild(create('button', {
      className: 'btn btn-ghost',
      textContent: 'Cerrar',
      onClick: () => Modal.hide()
    }));

    Modal.show('Acciones de cuenta', actions, { footer });
  },

  LOGS_PAGE_SIZE: 200,
  LOGS_MAX_PAGES: 50,
  LOGS_DEFAULT_DAYS: 30,

  // Shifts a "YYYY-MM-DD" day by whole days.
  shiftDay(day, delta) {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + delta);
    return date.toISOString().slice(0, 10);
  },

  // "YYYY-MM-DD" -> "dd/mm/aaaa".
  formatDayLabel(day) {
    const [year, month, date] = day.split('-');
    return `${date}/${month}/${year}`;
  },

  // Groups log entries (newest first) by day in the user's timezone, keeping that order.
  groupLogsByDay(items) {
    const groups = new Map();
    items.forEach(item => {
      const day = logDayKey(item.timestamp);
      if (!day) return;
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(item);
    });
    return [...groups].map(([day, entries]) => ({ day, entries }));
  },

  renderLogItem(item) {
    const failed = item.outcome === 'failure';
    return create('div', { className: 'activity-log-item', style: { padding: '8px 0', borderBottom: '1px solid var(--border, #ddd)' } }, [
      create('div', { textContent: formatLogDateTime(item.timestamp), style: { fontSize: 'var(--font-sm)', opacity: '0.7' } }),
      create('div', { textContent: item.message }),
      create('div', { textContent: failed ? 'No se completó' : 'Realizada', style: { fontSize: 'var(--font-sm)', color: failed ? 'var(--danger, #c0392b)' : 'inherit', opacity: failed ? '1' : '0.7' } })
    ]);
  },

  // Collapsible day panel (collapsed by default); its entries are only rendered once it is expanded.
  renderLogDay({ day, entries }) {
    const panel = create('details', { className: 'activity-log-day card', dataset: { day }, style: { padding: '8px 12px' } });
    const count = `${entries.length} ${entries.length === 1 ? 'acción' : 'acciones'}`;
    panel.appendChild(create('summary', { className: 'activity-log-day-summary', style: { cursor: 'pointer', fontWeight: '600' } }, [
      create('span', { textContent: this.formatDayLabel(day) }),
      create('span', { className: 'text-muted', textContent: ` · ${count}`, style: { fontWeight: '400' } })
    ]));
    const body = create('div', { className: 'activity-log-day-entries' });
    panel.appendChild(body);
    on(panel, 'toggle', () => {
      if (panel.open && !body.childElementCount) entries.forEach(item => body.appendChild(this.renderLogItem(item)));
    });
    return panel;
  },

  // LOGS section: date filter on top and the entries grouped by day below.
  renderLogsSection() {
    const section = create('div', { className: 'profile-section', id: 'activity-log-section' });
    section.appendChild(create('h3', { textContent: 'LOGS', style: { marginBottom: '16px' } }));

    const today = getToday();
    const fromInput = create('input', { className: 'form-control', type: 'date', id: 'activity-log-from', value: this.shiftDay(today, -(this.LOGS_DEFAULT_DAYS - 1)) });
    const toInput = create('input', { className: 'form-control', type: 'date', id: 'activity-log-to', value: today });
    const filterRow = create('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' } });
    [['Desde', fromInput], ['Hasta', toInput]].forEach(([label, input]) => {
      const group = create('div', { className: 'form-group', style: { flex: '1 1 140px', marginBottom: '0' } });
      group.appendChild(create('label', { textContent: label, for: input.id }));
      group.appendChild(input);
      filterRow.appendChild(group);
    });
    const applyBtn = create('button', { className: 'btn btn-primary btn-sm', type: 'button', textContent: 'Filtrar', id: 'activity-log-apply' });
    filterRow.appendChild(applyBtn);
    section.appendChild(filterRow);

    const list = create('div', { id: 'activity-log-list', style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' } });
    section.appendChild(list);

    let requestId = 0;
    const load = async () => {
      const from = fromInput.value;
      const to = toInput.value;
      if (from && to && from > to) return showToast('La fecha "Desde" no puede ser posterior a "Hasta"', 'error');
      const current = ++requestId;
      applyBtn.disabled = true;
      list.replaceChildren(create('div', { className: 'loading', textContent: 'Cargando acciones...' }));
      try {
        // Loads the whole range so every day panel shows its full count.
        const items = [];
        let before = null;
        for (let page = 0; page < this.LOGS_MAX_PAGES; page += 1) {
          const result = await API.activityLogs.list({ limit: this.LOGS_PAGE_SIZE, before, from, to, timezone: localStorage.getItem('pate_timezone') || undefined });
          items.push(...result.items);
          before = result.nextBefore;
          if (!before) break;
        }
        if (current !== requestId) return;
        const days = this.groupLogsByDay(items);
        list.replaceChildren(...days.map(group => this.renderLogDay(group)));
        if (!days.length) {
          list.appendChild(create('p', { className: 'empty-state', textContent: from || to ? 'No hay acciones registradas en esas fechas' : 'Todavía no hay acciones registradas' }));
        }
      } catch (err) {
        if (current !== requestId) return;
        list.replaceChildren();
        showToast(err.message, 'error');
      } finally {
        if (current === requestId) applyBtn.disabled = false;
      }
    };
    on(applyBtn, 'click', load);
    load();
    return section;
  },

  showChangeEmailModal() {
    const form = create('div');
    form.appendChild(create('div', { className: 'form-group', innerHTML: `
      <label>Nuevo email</label>
      <input type="email" class="form-control" id="new-email" placeholder="nuevo@email.com">
    ` }));
    form.appendChild(create('div', { className: 'form-group', innerHTML: `
      <label>Contraseña actual (para confirmar)</label>
      <input type="password" class="form-control" id="confirm-pw-email" placeholder="Tu contraseña">
    ` }));

    const footer = create('div', { style: { display: 'flex', gap: '8px' } });
    footer.appendChild(create('button', { className: 'btn btn-ghost', textContent: 'Cancelar', onClick: () => Modal.hide() }));
    footer.appendChild(create('button', { className: 'btn btn-primary', textContent: 'Guardar' }));

    on(footer.lastChild, 'click', async () => {
      const email = $('#new-email').value.trim();
      const password = $('#confirm-pw-email').value;
      if (!email) return showToast('Ingresá el nuevo email', 'error');
      if (!password) return showToast('Ingresá tu contraseña', 'error');
      try {
        const res = await API.post('/auth/change-email', { email, password });
        App.user.email = res.email;
        Modal.hide();
        showToast('Email actualizado');
        this.render();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    Modal.show('Cambiar email', form, { footer });
  },

  showChangePasswordModal() {
    const form = create('div');
    form.appendChild(create('div', { className: 'form-group', innerHTML: `
      <label>Contraseña actual</label>
      <input type="password" class="form-control" id="current-pw" placeholder="Tu contraseña actual">
    ` }));
    form.appendChild(create('div', { className: 'form-group', innerHTML: `
      <label>Nueva contraseña</label>
      <input type="password" class="form-control" id="new-pw" placeholder="Mínimo 6 caracteres" minlength="6">
    ` }));
    form.appendChild(create('div', { className: 'form-group', innerHTML: `
      <label>Repetir nueva contraseña</label>
      <input type="password" class="form-control" id="repeat-pw" placeholder="Repetí la contraseña" minlength="6">
    ` }));

    const footer = create('div', { style: { display: 'flex', gap: '8px' } });
    footer.appendChild(create('button', { className: 'btn btn-ghost', textContent: 'Cancelar', onClick: () => Modal.hide() }));
    footer.appendChild(create('button', { className: 'btn btn-primary', textContent: 'Guardar' }));

    on(footer.lastChild, 'click', async () => {
      const currentPassword = $('#current-pw').value;
      const newPassword = $('#new-pw').value;
      const repeatPw = $('#repeat-pw').value;
      if (!currentPassword) return showToast('Ingresá tu contraseña actual', 'error');
      if (!newPassword || newPassword.length < 6) return showToast('La nueva contraseña debe tener al menos 6 caracteres', 'error');
      if (newPassword !== repeatPw) return showToast('Las contraseñas no coinciden', 'error');
      try {
        await API.post('/auth/change-password', { currentPassword, newPassword });
        Modal.hide();
        showToast('Contraseña actualizada');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    Modal.show('Cambiar contraseña', form, { footer });
  },

  showDeleteAccountModal() {
    const form = create('div');
    form.appendChild(create('p', {
      textContent: 'Esta acción es irreversible. Se eliminarán tu cuenta y todos tus datos (transacciones, categorías y metas).'
    }));

    const confirmGroup = create('div', { className: 'form-group' });
    confirmGroup.appendChild(create('label', {
      textContent: 'Escribí ELIMINAR para confirmar'
    }));
    const confirmInput = create('input', {
      className: 'form-control',
      type: 'text',
      id: 'delete-account-confirm',
      placeholder: 'ELIMINAR'
    });
    confirmGroup.appendChild(confirmInput);
    form.appendChild(confirmGroup);

    const footer = create('div', { style: { display: 'flex', gap: '8px' } });
    footer.appendChild(create('button', {
      className: 'btn btn-ghost',
      textContent: 'Cancelar',
      onClick: () => Modal.hide()
    }));
    const confirmBtn = create('button', {
      className: 'btn btn-danger',
      textContent: 'Eliminar mi cuenta'
    });
    footer.appendChild(confirmBtn);

    on(confirmBtn, 'click', async () => {
      const value = $('#delete-account-confirm').value.trim();
      if (value !== 'ELIMINAR') {
        return showToast('Escribí ELIMINAR para confirmar', 'error');
      }
      try {
        await API.delete('/auth/account');
        Modal.hide();
        App.user = null;
        showToast('Cuenta eliminada');
        Router.navigate('/login');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    Modal.show('Eliminar mi cuenta', form, { footer });
  }
};
