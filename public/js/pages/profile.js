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
