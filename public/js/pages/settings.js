const SettingsPage = {
  section: 'accounts',
  settings: null,
  accounts: [],
  owners: [],
  currencies: ['ARS', 'EUR', 'USD'],

  async render(params = {}) {
    this.section = ['accounts', 'alerts', 'owners', 'tenants', 'providers'].includes(params.section) ? params.section : this.section;
    const content = $('#page-content');
    $('#navbar').style.display = '';
    content.style.paddingBottom = '';
    content.innerHTML = '<div class="loading">Cargando configuración…</div>';
    try {
      const [setup, accounts, owners] = await Promise.all([API.accounts.setup(), API.accounts.list(), API.owners.list()]);
      this.settings = setup.settings;
      this.accounts = accounts;
      this.owners = owners;
      localStorage.setItem('pate_app_currency', this.settings.appCurrency || 'ARS');
      localStorage.setItem('pate_locale', this.settings.locale || 'es-AR');
      this.renderContent(content);
      if (typeof App !== 'undefined' && App.refreshAlertIndicator) App.refreshAlertIndicator();
    } catch (error) {
      const message = create('div', { className: 'empty-state', role: 'alert' });
      message.appendChild(create('p', { textContent: `No se pudo cargar la configuración: ${error.message}` }));
      content.replaceChildren(message);
    }
  },

  renderContent(content) {
    const pageHeader = create('div', { className: 'settings-section-heading' });
    pageHeader.appendChild(create('h1', { className: 'page-title', textContent: 'Configuración' }));
    const privacy = create('button', {
      className: 'btn btn-ghost', type: 'button',
      textContent: localStorage.getItem('pate_hide_income') === 'true' ? 'Mostrar importes' : 'Ocultar importes',
      'aria-pressed': String(localStorage.getItem('pate_hide_income') === 'true')
    });
    on(privacy, 'click', () => {
      const hidden = localStorage.getItem('pate_hide_income') !== 'true';
      localStorage.setItem('pate_hide_income', String(hidden));
      $$('[data-public-value]').forEach(element => { element.textContent = hidden ? '••••••' : element.dataset.publicValue; });
      privacy.textContent = hidden ? 'Mostrar importes' : 'Ocultar importes';
      privacy.setAttribute('aria-pressed', String(hidden));
    });
    pageHeader.appendChild(privacy);
    content.replaceChildren(pageHeader);
    const navigation = create('nav', { className: 'settings-nav', 'aria-label': 'Secciones de configuración' });
    [['accounts', 'Cuentas'], ['alerts', 'Avisos'], ['owners', 'Titular'], ['tenants', 'Inquilino'], ['providers', 'Proveedor']].forEach(([id, label]) => {
      const button = create('button', {
        className: `btn btn-ghost${this.section === id ? ' active' : ''}`,
        type: 'button', textContent: label,
        'aria-current': this.section === id ? 'page' : 'false'
      });
      on(button, 'click', () => { this.section = id; this.render(); });
      navigation.appendChild(button);
    });
    content.appendChild(navigation);
    const panel = create('section', { className: 'settings-panel', 'aria-label': `Configuración ${this.section}` });
    content.appendChild(panel);
    const partyRoles = { owners: 'owner', tenants: 'tenant', providers: 'provider' };
    if (this.section === 'accounts') this.renderAccounts(panel);
    else if (partyRoles[this.section]) EntitiesPage.renderPanel(panel, partyRoles[this.section]);
    else this.renderAlerts(panel);
  },

  renderAccounts(panel) {
    const heading = create('div', { className: 'settings-section-heading' });
    heading.appendChild(create('h2', { textContent: 'Cuentas' }));
    const add = create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Agregar cuenta' });
    on(add, 'click', () => this.showAccountForm());
    heading.appendChild(add);
    panel.appendChild(heading);
    const list = create('div', { className: 'settings-account-list' });
    this.accounts.forEach(account => list.appendChild(this.renderAccount(account)));
    if (!this.accounts.length) list.appendChild(create('p', { className: 'empty-state-text', textContent: 'Todavía no hay cuentas.' }));
    panel.appendChild(list);

    const transferHeading = create('div', { className: 'settings-section-heading' });
    transferHeading.appendChild(create('h2', { textContent: 'Transferencias y conversiones' }));
    const transferButton = create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Nuevo movimiento entre cuentas' });
    on(transferButton, 'click', () => this.showTransferForm());
    transferHeading.appendChild(transferButton);
    panel.appendChild(transferHeading);
    this.renderTransfers(panel);
  },

  renderAccount(account) {
    const isChild = Boolean(account.parentId);
    const card = create('article', { className: isChild ? 'settings-card settings-subaccount' : 'settings-card', style: isChild ? { marginLeft: '24px' } : {} });
    const heading = create('div', { className: 'settings-section-heading' });
    const title = `${isChild ? '↳ ' : ''}${account.nombre}${account.primary ? ' · Principal' : ''}${account.activo ? '' : ' · Archivada'}`;
    heading.appendChild(create('h3', { textContent: title }));
    heading.appendChild(create('span', { className: 'account-card-currency', textContent: account.currency }));
    card.appendChild(heading);
    const accountOwner = this.owners.find(owner => owner.id === account.ownerId);
    card.appendChild(create('p', { className: 'account-status-note', textContent: `Titular: ${accountOwner?.name || 'Sin titular asignado'}` }));
    if (account.balanceStatus === 'verified') {
      const balance = create('p', { className: 'account-card-balance sensitive-value' });
      this.setSensitive(balance, formatearMoneda(account.balance, account.currency));
      card.appendChild(balance);
    }
    const actions = create('div', { className: 'settings-card-actions' });
    const detail = create('button', { className: 'btn btn-sm btn-ghost', type: 'button', textContent: 'Ver movimientos' });
    on(detail, 'click', () => this.showAccountDetails(account));
    actions.appendChild(detail);
    const reconcile = create('button', { className: 'btn btn-sm btn-ghost', type: 'button', textContent: account.reconciled ? 'Editar conciliación' : 'Conciliar saldo' });
    on(reconcile, 'click', () => this.showReconcileForm(account));
    actions.appendChild(reconcile);
    const edit = create('button', { className: 'btn btn-sm btn-ghost', type: 'button', textContent: 'Editar' });
    on(edit, 'click', () => this.showAccountForm(account));
    actions.appendChild(edit);
    if (!isChild && account.activo) {
      const addSub = create('button', { className: 'btn btn-sm btn-ghost', type: 'button', textContent: 'Agregar sub-cuenta' });
      on(addSub, 'click', () => this.showAccountForm(null, account));
      actions.appendChild(addSub);
    }
    if (!account.primary && account.activo) {
      if (!isChild) {
        const primary = create('button', { className: 'btn btn-sm btn-ghost', type: 'button', textContent: 'Hacer principal' });
        on(primary, 'click', async () => {
          try { await API.accounts.update(account.id, { primary: true }); await this.render(); }
          catch (error) { showToast(error.message, 'error'); }
        });
        actions.appendChild(primary);
      }
      const archive = create('button', { className: 'btn btn-sm btn-ghost', type: 'button', textContent: 'Archivar' });
      on(archive, 'click', async () => {
        try { await API.accounts.archive(account.id); await this.render(); }
        catch (error) { showToast(error.message, 'error'); }
      });
      actions.appendChild(archive);
    }
    if (!account.primary) {
      const remove = create('button', { className: 'btn btn-sm btn-danger', type: 'button', textContent: 'Eliminar' });
      on(remove, 'click', async () => {
        try { await API.accounts.delete(account.id); await this.render(); }
        catch (error) { showToast(error.message, 'error'); }
      });
      actions.appendChild(remove);
    }
    card.appendChild(actions);
    return card;
  },

  async renderTransfers(panel) {
    const list = create('div', { className: 'settings-transfer-list' });
    panel.appendChild(list);
    try {
      const [transfers, transactions] = await Promise.all([API.transfers.list(), API.transactions.list()]);
      if (!transfers.length) list.appendChild(create('p', { className: 'account-status-note', textContent: 'Todavía no hay transferencias.' }));
      transfers.forEach(transfer => {
        const row = create('article', { className: 'settings-card transfer-row' });
        const info = create('div', { className: 'transfer-details' });
        const from = this.accounts.find(account => account.id === transfer.fromAccountId)?.nombre || 'Cuenta archivada';
        const to = this.accounts.find(account => account.id === transfer.toAccountId)?.nombre || 'Cuenta archivada';
        info.appendChild(create('strong', { textContent: `${from} → ${to}` }));
        const sentText = formatearMoneda(ledgerAmount(transfer.sentMinor, transfer.fromCurrency), transfer.fromCurrency);
        const receivedText = formatearMoneda(ledgerAmount(transfer.receivedMinor, transfer.toCurrency), transfer.toCurrency);
        const debitText = formatearMoneda(ledgerAmount(transfer.sentMinor + (transfer.feeMinor || 0), transfer.fromCurrency), transfer.fromCurrency);
        const details = `${sentText} → ${receivedText} · Débito total ${debitText} · Tasa efectiva: ${receivedText} por ${sentText} · ${transfer.fecha} · ${transfer.status === 'posted' ? 'Contabilizada' : 'Programada'}`;
        const detail = create('p', { className: 'transfer-details sensitive-value' });
        this.setSensitive(detail, details);
        info.appendChild(detail);
        if (transfer.feeMinor) {
          const fee = create('p', { className: 'account-status-note sensitive-value' });
          this.setSensitive(fee, `Comisión: ${formatearMoneda(ledgerAmount(transfer.feeMinor, transfer.fromCurrency), transfer.fromCurrency)} (gasto)`);
          info.appendChild(fee);
        }
        (transfer.normalizationAllocations || []).forEach(allocation => {
          const lineage = allocation.lineage?.length ? allocation.lineage : [{ originalIncomeId: allocation.originalIncomeId }];
          const sources = lineage.map(part => transactions.find(tx => tx.id === part.originalIncomeId)).filter(Boolean);
          if (!sources.length) return;
          const original = sources.map(source => `${source.titulo} (${source.fecha})`).join(', ');
          const normalization = create('p', { className: 'account-status-note sensitive-value' });
          this.setSensitive(normalization, `Normaliza ${original}: ${formatearMoneda(ledgerAmount(allocation.receivedMinor, transfer.toCurrency), transfer.toCurrency)} · ejecución ${transfer.postedAt || transfer.fecha}`);
          info.appendChild(normalization);
        });
        row.appendChild(info);
        const actions = create('div', { className: 'settings-card-actions' });
        const edit = create('button', { className: 'btn btn-sm btn-ghost', type: 'button', textContent: 'Editar' });
        on(edit, 'click', () => this.showTransferForm(transfer));
        actions.appendChild(edit);
        if (transfer.status === 'scheduled') {
          const post = create('button', { className: 'btn btn-sm btn-primary', type: 'button', textContent: 'Confirmar y contabilizar' });
          on(post, 'click', async () => {
            try { await API.transfers.post(transfer.id); await this.render(); }
            catch (error) { showToast(error.message, 'error'); }
          });
          actions.appendChild(post);
        }
        const remove = create('button', { className: 'btn btn-sm btn-danger', type: 'button', textContent: 'Eliminar' });
        on(remove, 'click', async () => {
          try { await API.transfers.delete(transfer.id); await this.render(); }
          catch (error) { showToast(error.message, 'error'); }
        });
        actions.appendChild(remove);
        row.appendChild(actions);
        list.appendChild(row);
      });
    } catch (error) { list.appendChild(create('p', { role: 'alert', textContent: error.message })); }
  },

  async renderAlerts(panel) {
    panel.appendChild(create('h2', { textContent: 'Avisos de saldo' }));
    const form = create('form', { className: 'settings-card' });
    const lead = create('input', { id: 'alert-lead', className: 'form-control', type: 'number', min: '0', max: '30', step: '1', value: this.settings.alertLeadDays ?? 5 });
    form.appendChild(this.field('Avisar con anticipación (días calendario)', lead));
    const horizon = create('input', { id: 'alert-horizon', className: 'form-control', type: 'number', min: '1', max: '365', step: '1', value: this.settings.forecastHorizonDays ?? 30 });
    form.appendChild(this.field('Horizonte de pronóstico (días)', horizon));
    const dailyLabel = create('label', { className: 'checkbox-label' });
    const daily = create('input', { type: 'checkbox', className: 'form-checkbox' });
    daily.checked = this.settings.dailyReview !== false;
    dailyLabel.appendChild(daily);
    dailyLabel.appendChild(document.createTextNode(' Revisión diaria en el servidor'));
    form.appendChild(dailyLabel);
    form.appendChild(create('p', { className: 'account-status-note', textContent: 'Avisos internos únicamente. No se envían correos o notificaciones y no se ejecutan pagos.' }));
    const save = create('button', { className: 'btn btn-primary', type: 'submit', textContent: 'Guardar avisos' });
    form.appendChild(save);
    on(form, 'submit', async event => {
      event.preventDefault();
      try {
        this.settings = await API.accounts.updateSettings({ alertLeadDays: Number(lead.value), forecastHorizonDays: Number(horizon.value), dailyReview: daily.checked });
        await this.render();
        showToast('Preferencias de avisos guardadas');
      } catch (error) { this.showError(form, error.message); }
    });
    panel.appendChild(form);

    const forecasts = await Promise.all(this.accounts.map(async account => ({ account, forecast: await API.accounts.forecast(account.id) })));
    const list = create('div', { className: 'settings-alert-list' });
    const alerts = await API.accounts.alerts();
    if (!alerts.length) list.appendChild(create('p', { className: 'account-status-note', textContent: 'No hay avisos activos.' }));
    alerts.forEach(alert => {
      const account = this.accounts.find(item => item.id === alert.accountId);
      const row = create('article', { className: 'settings-card account-alert-row' });
      const info = create('div', { className: 'account-alert-details' });
      info.appendChild(create('strong', { textContent: account?.nombre || 'Cuenta archivada' }));
      if (alert.status === 'covered') info.appendChild(create('p', { className: 'account-status-note', textContent: 'Cubierto por una transferencia planificada; el saldo actual no cambia.' }));
      info.appendChild(create('p', { textContent: `${alert.title} · ${alert.date}` }));
      const needed = create('p', { className: 'sensitive-value' });
      this.setSensitive(needed, `Necesitás ${formatearMoneda(ledgerAmount(alert.neededMinor, alert.currency), alert.currency)}`);
      info.appendChild(needed);
      if (alert.plannedTransfer) {
        const coverage = create('p', { className: 'account-status-note sensitive-value' });
        const planned = alert.coverageTransfers.map(item => `${item.title} · ${item.date} · ${formatearMoneda(ledgerAmount(item.amountMinor, alert.currency), alert.currency)}`).join('; ');
        this.setSensitive(coverage, `${alert.status === 'covered' ? 'Cobertura planificada' : 'Cobertura parcial'}: ${planned}. El saldo actual no cambia.`);
        info.appendChild(coverage);
      }
      row.appendChild(info);
      list.appendChild(row);
    });
    panel.appendChild(list);
    forecasts.forEach(({ account, forecast }) => {
      if (!forecast.reconciled) return;
      const row = create('article', { className: 'settings-card' });
      row.appendChild(create('h3', { textContent: `${account.nombre} · Pronóstico` }));
      const min = create('p', { className: 'sensitive-value' });
      this.setSensitive(min, `Mínimo del horizonte: ${formatearMoneda(ledgerAmount(forecast.minimumMinor, account.currency), account.currency)}`);
      row.appendChild(min);
      const nextPayment = create('p', { className: 'account-status-note sensitive-value' });
      this.setSensitive(nextPayment, forecast.nextPayment
        ? `Próximo pago: ${forecast.nextPayment.title} · ${forecast.nextPayment.date} · ${formatearMoneda(ledgerAmount(forecast.nextPayment.amountMinor, account.currency), account.currency)}`
        : 'No hay pagos programados en el horizonte.');
      row.appendChild(nextPayment);
      panel.appendChild(row);
    });
  },

  async showAccountDetails(account) {
    const body = create('div');
    body.appendChild(create('p', { textContent: `${account.nombre} · ${account.currency}${account.activo ? '' : ' · Archivada'}` }));
    const balance = create('p', { className: 'sensitive-value' });
    this.setSensitive(balance, account.balanceStatus === 'verified' ? `Saldo actual: ${formatearMoneda(account.balance, account.currency)}` : 'Saldo actual: Por conciliar');
    body.appendChild(balance);
    try {
      const transactions = await API.transactions.list(null, account.id);
      if (!transactions.length) body.appendChild(create('p', { className: 'account-status-note', textContent: 'No hay movimientos registrados.' }));
      transactions.forEach(transaction => {
        const row = create('p', { className: 'sensitive-value' });
        const amount = transaction.isTransfer
          ? `${formatearMoneda(transaction.monto, transaction.fromCurrency)} → ${formatearMoneda(transaction.receivedAmount, transaction.toCurrency)}`
          : formatearMoneda(transaction.monto, transaction.currencyCode || account.currency);
        this.setSensitive(row, `${transaction.fecha} · ${transaction.titulo} · ${amount}`);
        body.appendChild(row);
      });
      const forecast = await API.accounts.forecast(account.id);
      if (forecast.reconciled) {
        const min = create('p', { className: 'sensitive-value' });
        this.setSensitive(min, `Mínimo proyectado (${forecast.horizonDays} días): ${formatearMoneda(ledgerAmount(forecast.minimumMinor, account.currency), account.currency)}`);
        body.appendChild(min);
      }
    } catch (error) { body.appendChild(create('p', { role: 'alert', textContent: error.message })); }
    const footer = create('div', { className: 'settings-actions' });
    footer.appendChild(create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() }));
    if (account.activo) {
      footer.appendChild(create('button', {
        className: 'btn btn-primary', type: 'button', textContent: 'Nuevo movimiento en esta cuenta',
        onClick: () => {
          Modal.hide();
          TransactionForm.show(() => this.render({ section: 'accounts' }), null, { accountId: account.id });
        }
      }));
    }
    Modal.show('Detalle de cuenta', body, { footer });
  },

  showAccountForm(account = null, parent = null) {
    const form = create('form');
    const name = create('input', { id: 'account-name', className: 'form-control', type: 'text', maxlength: '80', required: 'required', value: account?.nombre || '' });
    form.appendChild(this.field('Nombre de cuenta', name));
    let currencyValue = account?.currency || 'ARS';
    const currencySelect = create('div', { className: 'currency-select' });
    const currencyTrigger = create('button', {
      id: 'account-currency', className: 'form-control', type: 'button',
      textContent: currencyValue, 'aria-haspopup': 'listbox', 'aria-expanded': 'false'
    });
    const currencyDropdown = create('div', { className: 'currency-dropdown', role: 'listbox', 'aria-label': 'Moneda' });
    currencyDropdown.hidden = true;
    const setDropdownOpen = open => {
      currencyDropdown.hidden = !open;
      currencyTrigger.setAttribute('aria-expanded', String(open));
    };
    this.currencies.forEach(code => {
      const option = create('button', {
        className: `currency-option${code === currencyValue ? ' is-selected' : ''}`,
        role: 'option', type: 'button', textContent: code,
        'aria-selected': String(code === currencyValue)
      });
      option.dataset.currency = code;
      on(option, 'click', () => {
        currencyValue = code;
        currencyTrigger.textContent = code;
        $$('button', currencyDropdown).forEach(button => {
          const selected = button.dataset.currency === code;
          button.classList.toggle('is-selected', selected);
          button.setAttribute('aria-selected', String(selected));
        });
        setDropdownOpen(false);
        currencyTrigger.focus();
      });
      currencyDropdown.appendChild(option);
    });
    currencyTrigger.disabled = Boolean(account && (account.hasMovement || account.reconciled || account.openingBalanceMinor !== null));
    on(currencyTrigger, 'click', () => {
      if (currencyTrigger.disabled) return;
      setDropdownOpen(currencyDropdown.hidden);
    });
    on(currencySelect, 'keydown', event => {
      if (event.key === 'Escape' && !currencyDropdown.hidden) {
        event.preventDefault();
        event.stopPropagation();
        setDropdownOpen(false);
        currencyTrigger.focus();
      }
    });
    const closeOnOutsideClick = event => {
      if (!currencySelect.isConnected) {
        document.removeEventListener('click', closeOnOutsideClick);
        return;
      }
      if (!currencySelect.contains(event.target)) setDropdownOpen(false);
    };
    document.addEventListener('click', closeOnOutsideClick);
    currencySelect.appendChild(currencyTrigger);
    currencySelect.appendChild(currencyDropdown);
    const currencyGroup = this.field('Moneda', currencySelect);
    currencyGroup.querySelector('label').setAttribute('for', 'account-currency');
    form.appendChild(currencyGroup);
    const ownerOptions = [['', 'Sin titular asignado'], ...this.owners
      .filter(owner => (owner.roles || ['owner']).includes('owner'))
      .map(owner => [owner.id, owner.name])];
    const owner = create('select', { id: 'account-owner', className: 'form-control' });
    ownerOptions.forEach(([value, label]) => owner.appendChild(create('option', { value, textContent: label })));
    owner.value = account?.ownerId || parent?.ownerId || '';
    form.appendChild(this.field('Titular de la cuenta', owner));
    const primaryLabel = create('label', { className: 'checkbox-label' });
    const primary = create('input', { type: 'checkbox', className: 'form-checkbox' });
    primary.checked = account?.primary || false;
    primary.disabled = Boolean(account?.primary);
    if (!account && this.accounts.some(item => item.primary && item.activo)) primary.disabled = true;
    const isSub = Boolean(parent || account?.parentId);
    if (isSub) { primary.checked = false; primary.disabled = true; primaryLabel.style.display = 'none'; }
    primaryLabel.appendChild(primary);
    primaryLabel.appendChild(document.createTextNode(' Cuenta principal'));
    form.appendChild(primaryLabel);
    const save = create('button', { className: 'btn btn-primary', type: 'submit', textContent: account ? 'Guardar cuenta' : (parent ? 'Crear sub-cuenta' : 'Crear cuenta') });
    form.appendChild(save);
    on(form, 'submit', async event => {
      event.preventDefault();
      try {
        if (account) await API.accounts.update(account.id, { name: name.value.trim(), currency: currencyValue, primary: primary.checked, ownerId: owner.value || null });
        else await API.accounts.create({ name: name.value.trim(), currency: currencyValue, primary: primary.checked, ownerId: owner.value || null, ...(parent ? { parentId: parent.id } : {}) });
        Modal.hide();
        await this.render();
      } catch (error) { this.showError(form, error.message); }
    });
    Modal.show(account ? 'Editar cuenta' : (parent ? `Nueva sub-cuenta de ${parent.nombre}` : 'Nueva cuenta'), form);
    name.focus();
  },

  async showReconcileForm(account) {
    const form = create('form');
    const setup = await API.accounts.reconciliation(account.id);
    const amount = MoneyInput.create({ id: 'opening-balance', currency: account.currency, allowNegative: true, required: true, value: account.openingBalanceMinor === null ? null : ledgerAmount(account.openingBalanceMinor, account.currency) });
    form.appendChild(this.field(`Saldo al inicio de la fecha (${account.currency})`, amount));
    const date = create('input', { id: 'opening-date', className: 'form-control', type: 'date', required: 'required', value: account.openingDate || getToday() });
    form.appendChild(this.field('Fecha de referencia', date));
    form.appendChild(create('p', { className: 'account-status-note', textContent: 'El saldo indicado corresponde al inicio de esta fecha. Los movimientos de la fecha se aplican después.' }));
    const selected = new Set(account.includedMovementIds || []);
    const movementGroup = create('fieldset', { className: 'form-group' });
    movementGroup.appendChild(create('legend', { textContent: 'Movimientos históricos ya incluidos en el saldo' }));
    const toolbar = create('div', { className: 'reconcile-toolbar' });
    const toggleAll = create('button', { className: 'btn btn-sm btn-ghost', type: 'button', textContent: 'Seleccionar todos', 'aria-pressed': 'false' });
    toolbar.appendChild(toggleAll);
    movementGroup.appendChild(toolbar);
    const movementList = create('div', { className: 'reconcile-movement-list' });
    movementGroup.appendChild(movementList);
    const updateToggleState = () => {
      const checkboxes = $$('input[type="checkbox"]', movementList);
      const allSelected = checkboxes.length > 0 && checkboxes.every(input => input.checked);
      toggleAll.textContent = allSelected ? 'Quitar selección' : 'Seleccionar todos';
      toggleAll.setAttribute('aria-pressed', String(allSelected));
    };
    const renderMovements = (referenceDate, checkedIds = new Set()) => {
      movementList.replaceChildren();
      setup.movements.filter(item => item.date < referenceDate).forEach(item => {
        const label = create('label', { className: 'checkbox-label', style: { display: 'flex', gap: '8px', marginBottom: '8px' } });
        const checkbox = create('input', { type: 'checkbox', className: 'form-checkbox', value: item.id });
        checkbox.checked = checkedIds.has(item.id) || selected.has(item.id);
        checkbox.dataset.movementId = item.id;
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(`${item.date} · ${item.title} · `));
        const movementAmount = create('span');
        this.setSensitive(movementAmount, formatearMoneda(item.amount, item.currency));
        label.appendChild(movementAmount);
        movementList.appendChild(label);
      });
      if (!movementList.querySelector('input')) movementList.appendChild(create('p', { className: 'account-status-note', textContent: 'No hay movimientos anteriores a la fecha elegida.' }));
      updateToggleState();
    };
    on(toggleAll, 'click', () => {
      const checkboxes = $$('input[type="checkbox"]', movementList);
      if (!checkboxes.length) return;
      const allSelected = checkboxes.every(input => input.checked);
      checkboxes.forEach(input => { input.checked = !allSelected; });
      updateToggleState();
    });
    on(movementList, 'change', updateToggleState);
    on(date, 'change', () => {
      const checked = new Set($$('input[type="checkbox"]', movementList).filter(input => input.checked).map(input => input.value));
      renderMovements(date.value, checked);
    });
    renderMovements(account.openingDate || getToday());
    form.appendChild(movementGroup);
    const save = create('button', { className: 'btn btn-primary', type: 'submit', textContent: 'Guardar conciliación' });
    form.appendChild(save);
    on(form, 'submit', async event => {
      event.preventDefault();
      if (!MoneyInput.validate(amount)) return;
      try {
        const includedMovementIds = $$('input[type="checkbox"]', movementList).filter(input => input.checked).map(input => input.value);
        await API.accounts.reconcile(account.id, { openingBalance: MoneyInput.value(amount), openingDate: date.value, includedMovementIds });
        Modal.hide();
        await this.render();
      } catch (error) { this.showError(form, error.message); }
    });
    Modal.show('Conciliar saldo', form);
    amount.focus();
  },

  async showTransferForm(existingTransfer = null) {
    const activeAccounts = this.accounts.filter(account => account.activo);
    if (activeAccounts.length < 2) return showToast('Agregá dos cuentas activas para registrar una transferencia', 'error');
    const [transactions, categories, transfers] = await Promise.all([API.transactions.list(), API.categories.list(), API.transfers.list()]);
    const form = create('form');
    const from = create('select', { id: 'transfer-from', className: 'form-control' });
    const to = create('select', { id: 'transfer-to', className: 'form-control' });
    accountTreeOptions(activeAccounts).forEach(({ account, label }) => {
      from.appendChild(create('option', { value: account.id, textContent: label }));
      to.appendChild(create('option', { value: account.id, textContent: label }));
    });
    if (existingTransfer) {
      from.value = existingTransfer.fromAccountId;
      to.value = existingTransfer.toAccountId;
    } else if (activeAccounts[1]) to.value = activeAccounts[1].id;
    form.appendChild(this.field('Cuenta de origen', from));
    form.appendChild(this.field('Cuenta de destino', to));
    const sent = MoneyInput.create({ id: 'transfer-sent', currency: existingTransfer?.fromCurrency || 'ARS', required: true });
    const received = MoneyInput.create({ id: 'transfer-received', currency: existingTransfer?.toCurrency || 'ARS' });
    if (existingTransfer) {
      MoneyInput.setValue(sent, ledgerAmount(existingTransfer.sentMinor, existingTransfer.fromCurrency));
      MoneyInput.setValue(received, ledgerAmount(existingTransfer.receivedMinor, existingTransfer.toCurrency));
    }
    form.appendChild(this.field('Importe enviado', sent));
    form.appendChild(this.field('Importe realmente recibido (obligatorio si cambia la moneda)', received));
    const date = create('input', { id: 'transfer-date', className: 'form-control', type: 'date', value: getToday(), required: 'required' });
    if (existingTransfer) date.value = existingTransfer.fecha;
    form.appendChild(this.field('Fecha', date));
    const status = create('select', { id: 'transfer-status', className: 'form-control' });
    status.appendChild(create('option', { value: 'posted', textContent: 'Contabilizada ahora' }));
    status.appendChild(create('option', { value: 'scheduled', textContent: 'Programada (solo pronóstico)' }));
    status.value = existingTransfer?.status || 'posted';
    form.appendChild(this.field('Estado', status));
    const title = create('input', { id: 'transfer-reference', className: 'form-control', type: 'text', maxlength: '100' });
    title.value = existingTransfer?.reference || '';
    form.appendChild(this.field('Descripción', title));
    const fee = MoneyInput.create({ id: 'transfer-fee', currency: existingTransfer?.fromCurrency || 'ARS' });
    if (existingTransfer?.feeMinor) MoneyInput.setValue(fee, ledgerAmount(existingTransfer.feeMinor, existingTransfer.fromCurrency));
    form.appendChild(this.field('Comisión explícita (opcional)', fee));
    const feeCategory = create('select', { id: 'transfer-fee-category', className: 'form-control' });
    feeCategory.appendChild(create('option', { value: '', textContent: 'Seleccionar categoría para la comisión' }));
    categories.forEach(category => feeCategory.appendChild(create('option', { value: category.id, textContent: category.nombre })));
    form.appendChild(this.field('Categoría de comisión', feeCategory));
    const allocationGroup = create('fieldset', { className: 'form-group' });
    allocationGroup.appendChild(create('legend', { textContent: 'Ingresos a normalizar (opcional)' }));
    const allocationRows = create('div', { className: 'settings-card-actions' });
    const incomeSources = transactions.filter(tx => tx.tipo === 'income').map(tx => ({
      id: tx.id, sourceType: 'income', accountId: tx.accountId, currency: tx.currencyCode || 'EUR',
      label: `${tx.titulo} · ${tx.fecha} · ${formatearMoneda(tx.monto, tx.currencyCode || 'EUR')}`
    }));
    const transferSources = transfers.filter(item => item.status === 'posted' && item.normalizationAllocations?.length).map(item => ({
      id: item.id, sourceType: 'transfer', accountId: item.toAccountId, currency: item.toCurrency,
      label: `Conversión · ${item.fecha} · ${formatearMoneda(ledgerAmount(item.receivedMinor, item.toCurrency), item.toCurrency)}`
    }));
    const allSources = [...incomeSources, ...transferSources];
    const addAllocationRow = allocation => {
      const row = create('div', { className: 'settings-allocation-row' });
      const source = create('select', { className: 'form-control', 'aria-label': 'Ingreso o conversión de origen' });
      source.appendChild(create('option', { value: '', textContent: 'Sin vincular' }));
      allSources.forEach(item => {
        const option = create('option', { value: `${item.sourceType}:${item.id}` });
        option.dataset.publicValue = item.label;
        option.textContent = localStorage.getItem('pate_hide_income') === 'true' ? item.label.replace(/ · [^·]*$/, ' · ••••••') : item.label;
        option.dataset.accountId = item.accountId || '';
        option.dataset.currency = item.currency;
        option.dataset.sourceType = item.sourceType;
        source.appendChild(option);
      });
      const amount = MoneyInput.create({ currency: existingTransfer?.fromCurrency || 'ARS', ariaLabel: 'Importe del ingreso asignado' });
      if (allocation) {
        source.value = `${allocation.sourceType}:${allocation.sourceId}`;
        MoneyInput.setValue(amount, Number.isSafeInteger(allocation.sourceMinor)
          ? ledgerAmount(allocation.sourceMinor, existingTransfer.fromCurrency)
          : allocation.amount ?? null);
      }
      const remove = create('button', { className: 'btn btn-sm btn-ghost', type: 'button', textContent: 'Quitar asignación', 'aria-label': 'Quitar asignación de ingreso' });
      on(remove, 'click', () => { if (allocationRows.children.length > 1) row.remove(); else { source.value = ''; amount.value = ''; } });
      row.appendChild(source);
      row.appendChild(amount);
      row.appendChild(remove);
      allocationRows.appendChild(row);
      return { source, amount };
    };
    const initialAllocations = existingTransfer?.normalizationAllocations?.length
      ? existingTransfer.normalizationAllocations
      : existingTransfer?.pendingAllocations || [];
    const allocationControls = (initialAllocations.length ? initialAllocations : [null]).map(addAllocationRow);
    const addAllocation = create('button', { className: 'btn btn-sm btn-ghost', type: 'button', textContent: 'Agregar otro ingreso' });
    on(addAllocation, 'click', () => allocationControls.push(addAllocationRow(null)));
    allocationGroup.appendChild(allocationRows);
    allocationGroup.appendChild(addAllocation);
    form.appendChild(allocationGroup);
    const note = create('p', { className: 'account-status-note', textContent: 'No se consulta una cotización. La tasa se obtiene de los importes reales enviados y recibidos.' });
    form.appendChild(note);
    const save = create('button', { className: 'btn btn-primary', type: 'submit', textContent: 'Guardar movimiento' });
    form.appendChild(save);
    const updateAllocationOptions = () => allocationRows.querySelectorAll('select').forEach(select => {
      const account = activeAccounts.find(item => item.id === from.value);
      Array.from(select.options).forEach(option => {
        if (option.value && (option.dataset.currency !== account?.currency || (option.dataset.sourceType === 'transfer' && option.dataset.accountId !== account?.id))) option.hidden = true;
        else option.hidden = false;
      });
      if (select.selectedOptions[0]?.hidden) select.value = '';
      const money = select.parentNode.querySelector('[data-money-input]');
      if (money && account) MoneyInput.setCurrency(money, account.currency);
    });
    on(from, 'change', () => { this.updateTransferCurrencyLabels(from, to, sent, received, fee); updateAllocationOptions(); });
    on(to, 'change', () => this.updateTransferCurrencyLabels(from, to, sent, received, fee));
    this.updateTransferCurrencyLabels(from, to, sent, received, fee);
    updateAllocationOptions();
    on(form, 'submit', async event => {
      event.preventDefault();
      if (!MoneyInput.validateAll([sent, received, fee, ...allocationRows.querySelectorAll('[data-money-input]')])) return;
      const source = activeAccounts.find(account => account.id === from.value);
      const destination = activeAccounts.find(account => account.id === to.value);
      const allocationEntries = Array.from(allocationRows.children).map(row => {
        const selected = row.querySelector('select').value;
        const amount = MoneyInput.value(row.querySelector('[data-money-input]'));
        if (selected && amount === null) return { error: 'Indicá el importe para cada ingreso seleccionado' };
        if (!selected && amount !== null) return { error: 'Seleccioná el ingreso o conversión que corresponde al importe' };
        if (!selected) return null;
        const [sourceType, sourceId] = selected.split(':');
        return { sourceType, sourceId, amount };
      });
      const allocationError = allocationEntries.find(item => item?.error);
      if (allocationError) return this.showError(form, allocationError.error);
      const allocations = allocationEntries.filter(Boolean);
      const payload = {
        fromAccountId: source.id, toAccountId: destination.id,
        sentAmount: MoneyInput.value(sent), receivedAmount: MoneyInput.value(received) ?? undefined,
        fecha: date.value, status: status.value, reference: title.value.trim(),
        feeAmount: MoneyInput.value(fee) ?? undefined,
        feeCategoryId: feeCategory.value || undefined, allocations
      };
      try {
        if (existingTransfer) await API.transfers.update(existingTransfer.id, payload);
        else await API.transfers.create(payload);
        Modal.hide();
        await this.render();
      } catch (error) { this.showError(form, error.message); }
    });
    Modal.show('Transferencia o conversión', form);
    sent.focus();
  },

  updateTransferCurrencyLabels(from, to, sent, received, fee) {
    const source = this.accounts.find(account => account.id === from.value);
    const destination = this.accounts.find(account => account.id === to.value);
    sent.setAttribute('aria-label', `Importe enviado en ${source?.currency || ''}`);
    received.setAttribute('aria-label', `Importe realmente recibido en ${destination?.currency || ''}`);
    if (source) { MoneyInput.setCurrency(sent, source.currency); if (fee) MoneyInput.setCurrency(fee, source.currency); }
    if (destination) MoneyInput.setCurrency(received, destination.currency);
    if (source?.currency === destination?.currency && !received.value) received.value = sent.value;
  },

  field(label, input) {
    const group = create('div', { className: 'form-group' });
    const labelNode = create('label', { textContent: label });
    labelNode.setAttribute('for', input.id);
    group.appendChild(labelNode);
    group.appendChild(input);
    return group;
  },

  setSensitive(element, value) {
    element.dataset.publicValue = value;
    element.textContent = localStorage.getItem('pate_hide_income') === 'true' ? '••••••' : value;
  },

  showError(form, message) {
    let error = form.querySelector('[role="alert"]');
    if (!error) {
      error = create('p', { role: 'alert', className: 'settings-error' });
      form.prepend(error);
    }
    error.textContent = message;
  }
};

function ledgerAmount(minor, currency) {
  const precision = ['JPY', 'KRW', 'CLP', 'PYG', 'BIF', 'DJF', 'GNF', 'KMF', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'].includes(currency) ? 0 : 2;
  return minor / (10 ** precision);
}
