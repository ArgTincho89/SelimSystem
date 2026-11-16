// Rental modal: a wide panel with a fixed header and tabs (Resumen, Períodos, Contratos, Documentos,
// Notas). It shows one rental (declaration) of an asset. The asset ficha only keeps a summary card and
// opens this modal with "Ver alquiler".
const RentalModal = {
  TABS: [['resumen', 'Resumen'], ['periodos', 'Períodos'], ['contratos', 'Contratos'], ['documentos', 'Documentos'], ['notas', 'Notas']],
  CLASSIFICATION_TEXT: { A: 'A', B: 'B' },
  ALERT_ACTIONS: { collect: 'Registrar cobro', pay: 'Registrar pago', resolve: 'Resolver', 'attach-receipt': 'Adjuntar comprobante', edit: 'Editar alquiler', update: 'Actualizar alquiler' },

  async open(declarationId, options = {}) {
    const ctx = {
      declarationId, assetId: options.assetId || null, year: options.year || '', readOnly: Boolean(options.readOnly),
      periodFilter: options.periodFilter || {}, overview: null, asset: null, tabs: null, header: create('div', { className: 'rental-header' })
    };
    try {
      ctx.overview = await API.rentals.declarations.overview(declarationId, { year: ctx.year });
      ctx.assetId = ctx.assetId || ctx.overview.assetId;
      ctx.asset = await API.assets.get(ctx.assetId);
      ctx.year = ctx.overview.year;
    } catch (error) { showToast(error.message, 'error'); return null; }
    ctx.reopen = (tab = null) => RentalModal.open(declarationId, { assetId: ctx.assetId, tab: tab || ctx.tabs?.current() || 'resumen', year: ctx.year, readOnly: ctx.readOnly });
    ctx.reload = async ({ tab } = {}) => {
      ctx.overview = await API.rentals.declarations.overview(declarationId, { year: ctx.year });
      this.renderHeader(ctx);
      ctx.tabs.refresh(tab);
    };
    ctx.tabs = Tabs.create({
      label: 'Secciones del alquiler', initial: options.tab || 'resumen',
      tabs: this.TABS.map(([id, label]) => ({ id, label, render: () => this.renderTab(id, ctx) }))
    });
    this.renderHeader(ctx);
    Modal.show(ctx.overview.header.assetName || ctx.asset.name, ctx.tabs.element, { layout: 'panel', header: ctx.header, width: '1100px', fullscreenOnMobile: true, onClose: options.onClose });
    return ctx;
  },

  renderTab(id, ctx) {
    if (id === 'resumen') return this.renderSummary(ctx);
    if (id === 'periodos') return this.renderPeriods(ctx);
    if (id === 'contratos') return this.renderContracts(ctx);
    return this.renderRecords(ctx, id);
  },

  money(list) {
    return (list || []).map(item => formatearMonedaConCodigo(item.amount, item.currencyCode)).join(' + ') || '—';
  },

  line(label, value) {
    return create('div', { className: 'label-value' }, [create('strong', { textContent: `${label}:` }), typeof value === 'string' ? create('span', { textContent: value }) : value]);
  },

  // Fixed header: status, tenants, validity, current monthly amount, next collection and due, global actions.
  renderHeader(ctx) {
    const { header } = ctx.overview;
    const ended = header.status === 'ended';
    const info = statusBadge(header.status);
    const nextCollection = header.nextCollection ? `${header.nextCollection.date} · ${this.money(header.nextCollection.totals)}` : 'Sin cobros próximos';
    const facts = create('div', { className: 'rental-header-facts' }, [
      create('span', { className: `status-badge ${info.className}`, dataset: { rentalStatus: header.status }, textContent: `${info.icon} ${info.label}` }),
      this.line('Inquilino', header.tenants.map(item => item.name).join(', ') || '—'),
      this.line('Vigencia', `${header.from || '—'} — ${header.to || 'sin fecha de fin'}`),
      this.line('Monto mensual vigente', this.money(header.monthlyTotals)),
      this.line('Próximo cobro', nextCollection),
      this.line('Próximo vencimiento', header.nextDue || '—')
    ]);
    const actions = create('div', { className: 'rental-header-actions' });
    if (!ctx.readOnly && !ended) {
      actions.append(
        create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Editar alquiler', onClick: () => this.editRental(ctx) }),
        create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Actualizar alquiler', onClick: () => this.updateRent(ctx) }),
        create('span', { className: 'rental-header-separator', role: 'separator' }),
        create('button', { className: 'btn btn-danger btn-sm rental-finish', type: 'button', textContent: 'Finalizar alquiler', onClick: () => this.finishRental(ctx) })
      );
    }
    ctx.header.replaceChildren(facts, actions);
  },

  async editRental(ctx) {
    try {
      const asset = await API.assets.get(ctx.assetId);
      await RentalDeclarationModal.show(AssetsPage, asset, { onDone: () => ctx.reopen() });
    } catch (error) { showToast(error.message, 'error'); }
  },

  // "Actualizar alquiler": one modality directly, or a short chooser when several are active.
  async updateRent(ctx, contractId = null) {
    const active = ctx.overview.modalities.filter(item => item.status === 'active');
    const target = contractId || (active.length === 1 ? active[0].contractId : null);
    if (target) return this.openCondition(ctx, target);
    const list = create('div', { style: { display: 'grid', gap: '8px' } }, active.map(item => create('button', {
      className: 'btn btn-secondary', type: 'button', textContent: `${item.modalityLabel} · ${formatearMonedaConCodigo(item.currentAmount, item.currencyCode)}`,
      onClick: () => { Modal.hide(); this.openCondition(ctx, item.contractId); }
    })));
    Modal.push('¿Qué modalidad querés actualizar?', list);
    return null;
  },

  async openCondition(ctx, contractId) {
    try {
      const contract = await API.rentals.get(contractId);
      AssetsPage.showRentalConditionModal(ctx.asset, contract, { onDone: () => ctx.reopen() });
    } catch (error) { showToast(error.message, 'error'); }
  },

  finishRental(ctx) {
    AssetsPage.endDeclaration(ctx.asset, { declarationId: ctx.declarationId, stacked: true, onDone: () => ctx.reload() });
  },

  async collect(ctx, monthKey) {
    await AssetsPage.showRentMonthModal(ctx.assetId, monthKey, () => ctx.reopen());
  },

  // Resumen: general state, one card per active modality, collection progress and alerts (only when they apply).
  renderSummary(ctx) {
    const { header, modalities, progress, alerts } = ctx.overview;
    const root = create('div', { className: 'rental-summary', style: { display: 'grid', gap: '14px' } });
    const state = create('section', { className: 'card', dataset: { summaryBlock: 'state' }, style: { padding: '12px', display: 'grid', gap: '4px' } }, [create('h4', { textContent: 'Estado general' })]);
    const info = statusBadge(header.status);
    state.append(
      this.line('Estado del alquiler', create('span', { className: `status-badge ${info.className}`, textContent: `${info.icon} ${info.label}` })),
      this.line('Fecha de inicio', header.from || '—'), this.line('Fecha de finalización', header.to || 'Sin fecha de fin'),
      this.line('Inquilino', header.tenants.map(item => item.name).join(', ') || '—'),
      this.line('Próximo cobro', header.nextCollection ? `${header.nextCollection.date} · ${this.money(header.nextCollection.totals)}` : 'Sin cobros próximos'),
      this.line('Total pendiente de cobro', this.money(header.pendingTotals)),
      this.line('Próximo ajuste', header.nextAdjustment || 'Sin ajustes programados'),
      this.line('Obligaciones del período actual', this.obligationsStatus(header.currentPeriodObligations))
    );
    root.appendChild(state);
    root.appendChild(this.renderComposition(ctx, modalities.filter(item => item.status === 'active')));
    root.appendChild(this.renderProgress(ctx, progress));
    if (alerts.length) root.appendChild(this.renderAlerts(ctx, alerts));
    return root;
  },

  obligationsStatus(current) {
    const { owner, tenant } = current;
    const parts = [];
    if (owner.overdue) parts.push(`${owner.overdue} del titular vencida${owner.overdue === 1 ? '' : 's'}`);
    if (owner.pending) parts.push(`${owner.pending} del titular pendiente${owner.pending === 1 ? '' : 's'}`);
    if (tenant.pending) parts.push(`${tenant.pending} del inquilino sin resolver`);
    return parts.join(' · ') || 'Sin obligaciones pendientes';
  },

  classificationText(card) {
    return `${card.classification}${card.ivaPercent ? ' · IVA incluido' : ''}`;
  },

  // One card per active modality with its four actions.
  renderComposition(ctx, cards) {
    const section = create('section', { dataset: { summaryBlock: 'composition' }, style: { display: 'grid', gap: '8px' } }, [create('h4', { textContent: 'Composición del alquiler' })]);
    if (!cards.length) section.appendChild(create('p', { className: 'text-muted', textContent: 'No hay modalidades activas.' }));
    const grid = create('div', { className: 'rental-cards' });
    cards.forEach(card => {
      const info = statusBadge(card.status);
      const article = create('article', { className: 'card rental-card', dataset: { modality: card.modality, contractId: card.contractId }, style: { padding: '12px', display: 'grid', gap: '4px' } }, [
        create('strong', { textContent: card.modalityLabel }),
        create('span', { className: `status-badge ${info.className}`, textContent: `${info.icon} ${info.label}` }),
        this.line('Vigencia', `${card.from} — ${card.to || 'sin fecha de fin'}`),
        this.line('Monto mensual vigente', formatearMonedaConCodigo(card.currentAmount, card.currencyCode)),
        this.line('Clasificación', this.classificationText(card)),
        this.line('Próximo ajuste', card.nextAdjustmentDate || '—')
      ]);
      if (!ctx.readOnly) article.appendChild(this.cardActions(ctx, card));
      grid.appendChild(article);
    });
    section.appendChild(grid);
    return section;
  },

  cardActions(ctx, card) {
    const actions = create('div', { className: 'rental-card-actions' });
    const button = (label, handler) => actions.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: label, 'aria-label': `${label} · ${card.modalityLabel}`, onClick: handler }));
    if (card.status === 'active') {
      button('Actualizar alquiler', () => this.updateRent(ctx, card.contractId));
      button('Registrar cobro', () => this.collectContract(ctx, card.contractId));
    }
    button('Ver períodos', () => { ctx.periodFilter = { modality: card.modality }; ctx.tabs.select('periodos'); ctx.tabs.refresh('periodos'); });
    return actions;
  },

  async collectContract(ctx, contractId) {
    try {
      const contract = await API.rentals.get(contractId);
      await AssetsPage.showRentCollectionModal(ctx.asset, contract, null, () => ctx.reopen());
    } catch (error) { showToast(error.message, 'error'); }
  },

  percent(done, total) {
    return total > 0 ? Math.round(Math.min(100, (done / total) * 100)) : 0;
  },

  bar(done, total, label) {
    const fill = create('span', { className: 'progress-fill', style: { width: `${this.percent(done, total)}%` } });
    return create('div', { className: 'progress-bar', role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done) }, [fill]);
  },

  // "Avance de cobros · {year}": a bar per modality, a consolidated total and the period counts.
  renderProgress(ctx, progress) {
    const section = create('section', { className: 'card', dataset: { summaryBlock: 'progress' }, style: { padding: '12px', display: 'grid', gap: '8px' } });
    const yearSelect = create('select', { className: 'form-control', 'aria-label': 'Año del avance', style: { width: 'auto' } });
    const current = Number(getToday().slice(0, 4));
    const first = Number((ctx.overview.header.from || `${current}`).slice(0, 4));
    const last = Math.max(Number((ctx.overview.header.to || `${current}`).slice(0, 4)), current, Number(ctx.year));
    for (let year = Math.min(first, Number(ctx.year)); year <= last; year += 1) yearSelect.appendChild(create('option', { value: String(year), textContent: String(year) }));
    yearSelect.value = ctx.year;
    on(yearSelect, 'change', () => { ctx.year = yearSelect.value; ctx.reload({ tab: 'resumen' }); });
    section.appendChild(create('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, [create('h4', { textContent: `Avance de cobros · ${ctx.year}`, style: { margin: '0' } }), yearSelect]));
    if (!progress.byModality.length) section.appendChild(create('p', { className: 'text-muted', textContent: 'No hay períodos esperados en este año.' }));
    progress.byModality.forEach(item => section.appendChild(create('div', { className: 'progress-row', dataset: { progressModality: item.modality } }, [
      create('span', { textContent: item.modalityLabel }), this.bar(item.collected, item.expected, `${item.modalityLabel}: ${item.collected} de ${item.expected} períodos cobrados`),
      create('span', { textContent: `${item.collected}/${item.expected} períodos cobrados` })
    ])));
    progress.total.forEach(item => section.appendChild(create('div', { className: 'progress-row', dataset: { progressTotal: item.currencyCode } }, [
      create('span', { textContent: 'Total' }), this.bar(item.collected, item.expected, `Total ${item.currencyCode}: ${item.collected} de ${item.expected} cobrados`),
      create('span', { textContent: `${formatearMonedaConCodigo(item.collected, item.currencyCode)} cobrados` })
    ])));
    const counts = progress.counts;
    section.appendChild(create('small', { className: 'text-muted', textContent: `Esperados: ${counts.expected} · Cobrados: ${counts.collected} · Parciales: ${counts.partial} · Vencidos: ${counts.overdue} · Pendientes: ${counts.pending} · Cancelados: ${counts.cancelled}` }));
    return section;
  },

  // Alerts only render when they apply; each one has a direct action.
  renderAlerts(ctx, alerts) {
    const section = create('section', { className: 'card', dataset: { summaryBlock: 'alerts' }, role: 'region', 'aria-label': 'Alertas del alquiler', style: { padding: '12px', display: 'grid', gap: '6px' } }, [create('h4', { textContent: 'Alertas' })]);
    alerts.forEach(alert => {
      const row = create('div', { className: 'rental-alert', dataset: { alertType: alert.type }, style: { display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, [create('span', { textContent: alert.message })]);
      const label = this.ALERT_ACTIONS[alert.action];
      if (label && !ctx.readOnly) row.appendChild(create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: label, 'aria-label': `${label}: ${alert.title || alert.message}`, onClick: () => this.runAlert(ctx, alert) }));
      section.appendChild(row);
    });
    return section;
  },

  runAlert(ctx, alert) {
    const row = { refs: { obligationId: alert.refs.obligationId, occurrenceId: alert.refs.occurrenceId }, date: alert.date };
    const after = () => ctx.reopen();
    if (alert.action === 'collect') return this.collect(ctx, alert.refs.monthKey);
    if (alert.action === 'pay') return AssetHistory.payObligation(row, after);
    if (alert.action === 'resolve') return AssetHistory.resolveObligation(row, after);
    if (alert.action === 'attach-receipt') return AssetHistory.attachReceipt(row, after);
    if (alert.action === 'edit') return this.editRental(ctx);
    if (alert.action === 'update') return this.updateRent(ctx);
    return null;
  },

  // Contratos: one compact card per modality, without the monthly information.
  renderContracts(ctx) {
    const tenants = ctx.overview.header.tenants.map(item => item.name).join(', ');
    const root = create('div', { className: 'rental-contracts', style: { display: 'grid', gap: '10px' } });
    ctx.overview.modalities.forEach(card => {
      const info = statusBadge(card.status === 'ended' || card.status === 'cancelled' ? 'ended' : card.status);
      const article = create('article', { className: 'card rental-card', dataset: { contractCard: card.contractId }, style: { padding: '12px', display: 'grid', gap: '4px' } }, [
        create('strong', { textContent: `${card.modalityLabel}${tenants ? ` · ${tenants}` : ''}` }),
        create('span', { className: `status-badge ${info.className}`, textContent: `${info.icon} ${info.label}` }),
        this.line('Vigencia', `${card.from} — ${card.to || 'sin fecha de fin'}`),
        this.line('Monto original', formatearMonedaConCodigo(card.originalAmount, card.currencyCode)),
        this.line('Monto mensual vigente', formatearMonedaConCodigo(card.currentAmount, card.currencyCode)),
        this.line('Clasificación', this.classificationText(card)),
        this.line('Frecuencia de ajuste', card.adjustmentFrequencyMonths ? `Cada ${card.adjustmentFrequencyMonths} meses` : '—'),
        this.line('Criterio de ajuste', card.adjustmentCriterion || '—'),
        this.line('Próximo ajuste', card.nextAdjustmentDate || '—')
      ]);
      if (!ctx.readOnly) article.appendChild(this.cardActions(ctx, card));
      root.appendChild(article);
    });
    return root;
  },

  // Períodos (temporary, until the unified table lands): the existing rent schedule of the asset.
  async renderPeriods(ctx) {
    const root = create('div', { className: 'rental-periods' });
    const asset = await API.assets.get(ctx.assetId);
    await AssetsPage.renderRentals(asset, root);
    return root;
  },

  // Documentos / Notas (temporary): the per-contract panels, one for each modality of the rental.
  async renderRecords(ctx) {
    const root = create('div', { className: 'rental-records', style: { display: 'grid', gap: '12px' } });
    for (const card of ctx.overview.modalities) {
      const box = create('section', { className: 'card', style: { padding: '12px' } }, [create('h4', { textContent: card.modalityLabel })]);
      await WealthRecords.renderPanel(box, 'contract', card.contractId);
      root.appendChild(box);
    }
    return root;
  }
};
