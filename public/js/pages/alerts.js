// Avisos: the operational center. It only aggregates (GET /api/alerts) and delegates every action
// to the existing flows of the obligations, assets and installments modules.
const AlertsPage = {
  alerts: [],
  filters: { type: '', assetId: '' },
  assets: [],

  TYPE_LABELS: {
    obligation_overdue: 'Obligaciones vencidas',
    obligation_due: 'Próximos vencimientos',
    partial_payment: 'Pagos parciales',
    tenant_obligation_pending: 'Comprobantes pendientes de inquilinos',
    rent_due: 'Alquileres pendientes de cobro',
    card_installment_due: 'Cuotas de tarjeta',
    contract_expiry: 'Contratos por vencer',
    rent_adjustment_due: 'Ajustes de alquiler',
    document_pending: 'Documentos pendientes',
    account_forecast: 'Saldo insuficiente en cuentas'
  },

  async render(params = {}) {
    const content = $('#page-content');
    $('#navbar').style.display = '';
    content.style.paddingBottom = '';
    content.innerHTML = '<div class="loading">Cargando avisos...</div>';
    if (params.type !== undefined) this.filters.type = params.type;
    try {
      const [alerts, assets] = await Promise.all([API.getAlerts(this.filters), API.assets.list()]);
      this.alerts = alerts;
      this.assets = assets;
      this.renderContent(content);
      App.setAlertBadge?.(alerts.length);
    } catch (error) {
      content.replaceChildren(create('div', { className: 'empty-state', textContent: `No se pudieron cargar los avisos: ${error.message}` }));
    }
  },

  async reload() {
    await this.render();
  },

  renderContent(content) {
    content.replaceChildren();
    content.appendChild(create('div', { className: 'page-header' }, [
      create('h2', { className: 'page-title', textContent: 'Avisos' }),
      create('span', { className: 'text-muted', textContent: `${this.alerts.length} pendientes` })
    ]));

    const form = create('form', { className: 'card', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '16px' } });
    const type = this.select([['', 'Todos los tipos'], ...Object.entries(this.TYPE_LABELS)], this.filters.type);
    type.setAttribute('aria-label', 'Tipo de aviso');
    const asset = this.select([['', 'Todos los bienes'], ...this.assets.map(item => [item.id, item.name])], this.filters.assetId);
    asset.setAttribute('aria-label', 'Bien');
    form.append(type, asset, create('button', { className: 'btn btn-secondary', type: 'submit', textContent: 'Filtrar' }));
    on(form, 'submit', event => {
      event.preventDefault();
      this.filters = { type: type.value, assetId: asset.value };
      this.render();
    });
    content.appendChild(form);

    if (!this.alerts.length) {
      content.appendChild(create('div', { className: 'empty-state', innerHTML: '<div class="empty-state-icon">✅</div><p class="empty-state-text">No hay avisos pendientes</p>' }));
      return;
    }
    Object.keys(this.TYPE_LABELS).forEach(typeKey => {
      const group = this.alerts.filter(item => item.type === typeKey);
      if (!group.length) return;
      const section = create('section', { dataset: { alertGroup: typeKey }, style: { display: 'grid', gap: '10px', marginBottom: '18px' } }, [
        create('h3', { textContent: `${this.TYPE_LABELS[typeKey]} (${group.length})` })
      ]);
      group.forEach(alert => section.appendChild(this.renderAlert(alert)));
      content.appendChild(section);
    });
  },

  renderAlert(alert) {
    const overdue = alert.status === 'overdue';
    const card = create('article', { className: 'card', dataset: { alertId: alert.id }, style: { display: 'grid', gap: '8px', borderLeft: `4px solid ${overdue ? 'var(--danger)' : 'var(--accent)'}` } }, [
      create('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' } }, [
        create('strong', { textContent: alert.type === 'rent_due' && modalityLabel(alert.modality) ? `${alert.title} · ${modalityLabel(alert.modality)}` : alert.title }),
        create('span', { className: overdue ? 'text-danger' : 'text-muted', textContent: overdue ? `Vencido · ${alert.date}` : alert.date })
      ]),
      create('div', { textContent: alert.message || alert.title })
    ]);
    const actions = create('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
    this.actionsFor(alert).forEach(([label, handler, primary]) => actions.appendChild(create('button', {
      className: `btn ${primary ? 'btn-secondary' : 'btn-ghost'} btn-sm`, type: 'button', textContent: label, onClick: () => this.run(handler)
    })));
    card.appendChild(actions);
    return card;
  },

  actionsFor(alert) {
    const viewObligation = ['Ver obligación', () => Router.navigate(`/obligations?focus=${encodeURIComponent(alert.obligationId)}`)];
    const viewAsset = ['Ver bien', () => Router.navigate(`/assets?asset=${encodeURIComponent(alert.assetId)}`)];
    switch (alert.type) {
      case 'obligation_due':
      case 'obligation_overdue':
      case 'partial_payment':
        return [['Registrar pago', () => this.payObligation(alert), true], ['Adjuntar comprobante', () => this.attachReceipt(alert)], viewObligation];
      case 'tenant_obligation_pending':
        return [['Resolver', () => this.resolveObligation(alert), true], ['Adjuntar comprobante', () => this.attachReceipt(alert)], viewObligation];
      case 'document_pending':
        return [['Adjuntar comprobante', () => this.attachReceipt(alert), true], viewObligation];
      case 'rent_due':
        return [['Registrar cobro', () => this.collectRent(alert), true], ...(alert.assetId ? [viewAsset] : [])];
      case 'card_installment_due':
        return [['Contabilizar cuota', () => this.postInstallment(alert), true], ['Ver transacciones', () => Router.navigate('/home')]];
      case 'account_forecast':
        return [['Ver cuentas', () => Router.navigate('/settings')]];
      default:
        return alert.assetId ? [viewAsset] : [];
    }
  },

  async run(handler) {
    try { await handler(); }
    catch (error) { showToast(error.message, 'error'); }
  },

  // Finds the persisted occurrence behind an alert (opening the obligation generates it if needed).
  async occurrenceOf(alert) {
    const obligation = await API.obligations.get(alert.obligationId);
    const occurrence = (obligation.occurrences || []).find(item => item.id === alert.occurrenceId) || (obligation.occurrences || []).find(item => item.date === alert.date);
    if (!occurrence) throw new Error('No se encontró el vencimiento');
    return { obligation, occurrence };
  },

  async payObligation(alert) {
    const { obligation, occurrence } = await this.occurrenceOf(alert);
    await ObligationsPage.loadLookups();
    ObligationsPage.onChange = () => this.reload();
    await ObligationsPage.pay(obligation, occurrence);
  },

  async resolveObligation(alert) {
    const { obligation, occurrence } = await this.occurrenceOf(alert);
    await ObligationsPage.loadLookups();
    ObligationsPage.onChange = () => this.reload();
    await ObligationsPage.showResolveModal(obligation, occurrence);
  },

  async attachReceipt(alert) {
    const { occurrence } = await this.occurrenceOf(alert);
    const input = create('input', { type: 'file', accept: '.pdf,.png,.jpg,.jpeg,.webp,.txt' });
    on(input, 'change', async () => {
      if (!input.files?.[0]) return;
      try {
        await API.documents.uploadTargets({ occurrenceId: occurrence.id, tenantEntityId: alert.tenantEntityId }, input.files[0]);
        showToast('Comprobante adjuntado');
        await this.reload();
      } catch (error) { showToast(error.message, 'error'); }
    });
    input.click();
  },

  // One alert per declaration month: the dialog collects every modality of that month.
  async collectRent(alert) {
    await AssetsPage.showRentMonthModal(alert.assetId, alert.monthKey, () => this.reload());
  },

  async postInstallment(alert) {
    const amount = prompt(`Importe de la cuota ${alert.installmentNumber} (previsto: ${alert.amount} ${alert.currencyCode})`, String(alert.amount));
    if (amount === null) return;
    await API.installments.postOccurrence(alert.planId, alert.occurrenceId, { amount: Number(amount) });
    showToast('Cuota contabilizada');
    await this.reload();
  },

  select(options, selected = '') {
    const control = create('select', { className: 'form-control' });
    options.forEach(([value, label]) => control.appendChild(create('option', { value, textContent: label })));
    control.value = selected;
    return control;
  }
};
