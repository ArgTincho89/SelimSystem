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
    ctx.reopen = (tab = null) => RentalModal.open(declarationId, { assetId: ctx.assetId, tab: tab || ctx.tabs?.current() || 'resumen', year: ctx.year, readOnly: ctx.readOnly, periodFilter: ctx.periodFilter });
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
    return id === 'documentos' ? this.renderDocuments(ctx) : this.renderNotes(ctx);
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
    if (ended) {
      const management = ctx.overview.management;
      if (management.editable) actions.appendChild(create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Editar alquiler', onClick: () => this.editRental(ctx, { historical: true }) }));
      else actions.appendChild(create('small', { className: 'text-muted', textContent: 'No se puede editar: tiene cobros, documentos, notas u obligaciones vinculadas.' }));
      if (management.deletable) actions.appendChild(create('button', { className: 'btn btn-danger btn-sm', type: 'button', textContent: 'Eliminar alquiler', dataset: { deleteRental: 'true' }, onClick: () => this.deleteRental({ declarationId: ctx.declarationId, assetId: ctx.assetId, impact: management.impact }, () => AssetsPage.showDetails(ctx.assetId)) }));
      else actions.appendChild(create('small', { className: 'text-muted', textContent: 'Para eliminarlo, primero deshacé sus cobros.' }));
    }
    ctx.header.replaceChildren(facts, actions);
  },

  async editRental(ctx, { historical = false } = {}) {
    try {
      const asset = await API.assets.get(ctx.assetId);
      const declaration = historical ? await API.rentals.declarations.get(ctx.declarationId) : null;
      await RentalDeclarationModal.show(AssetsPage, asset, { onDone: () => ctx.reopen(), ...(declaration ? { declaration } : {}) });
    } catch (error) { showToast(error.message, 'error'); }
  },

  // Deleting a finished rental: strong confirmation with its impact; blocked by the server while collections exist.
  async deleteRental({ declarationId, impact }, afterDone) {
    const extra = impact.periods || impact.documents || impact.notes || impact.linkedObligations;
    const lines = ['Estás por eliminar un alquiler y potencialmente sus datos asociados.', 'Esta acción no se puede deshacer.', '¿Querés continuar?'];
    if (extra) lines.splice(1, 0, `Este alquiler tiene ${impact.periods} período${impact.periods === 1 ? '' : 's'}, ${impact.documents} documento${impact.documents === 1 ? '' : 's'} y ${impact.notes} nota${impact.notes === 1 ? '' : 's'} asociados que se eliminan o se desvinculan.`);
    const { confirmed } = await ConfirmDialog.open({
      title: 'Eliminar alquiler', danger: true, confirmLabel: 'Eliminar alquiler', message: lines.join('\n'),
      details: [['Períodos', impact.periods], ['Documentos', impact.documents], ['Notas', impact.notes], ['Obligaciones vinculadas', impact.linkedObligations], ['Cobros deshechos (se conservan para auditoría)', impact.reversedCollections]]
    });
    if (!confirmed) return;
    try {
      await API.rentals.declarations.remove(declarationId);
      showToast('Alquiler eliminado');
      await afterDone();
    } catch (error) { showToast(error.message, 'error'); }
  },

  // "Histórico de alquileres": every rental of the asset (lightweight summary list), "Ver" opens it read-only
  // (the current one opens the main modal) and a finished one can be deleted with a strong confirmation.
  async showHistory(asset) {
    const body = create('div', { className: 'rental-history', style: { display: 'grid', gap: '8px' } }, [create('div', { className: 'loading', textContent: 'Cargando alquileres...' })]);
    Modal.push(`Histórico de alquileres · ${asset.name}`, body, { width: '860px' });
    const load = async () => {
      let rows;
      try { rows = await API.rentals.declarations.summary(asset.id); } catch (error) { body.replaceChildren(create('p', { className: 'empty-state', role: 'alert', textContent: error.message })); return; }
      if (!rows.length) {
        body.replaceChildren(create('div', { className: 'empty-state' }, [create('p', { className: 'empty-state-text', textContent: 'Este inmueble todavía no tuvo alquileres.' }), create('p', { className: 'text-muted', textContent: 'Cuando declares uno, va a aparecer en esta lista.' })]));
        return;
      }
      body.replaceChildren(...rows.map(row => this.historyRow(asset, row, load)));
    };
    await load();
  },

  historyRow(asset, row, reload) {
    const period = `${this.shortDate(row.from)} – ${row.to ? this.shortDate(row.to) : 'sin fecha de fin'}`;
    const active = row.state === 'active';
    const actions = create('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
      create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Ver', 'aria-label': `Ver alquiler ${period}`, onClick: () => AssetsPage.openRental(asset.id, row.id, { readOnly: !active }) })
    ]);
    if (row.deletable) actions.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Eliminar', 'aria-label': `Eliminar alquiler ${period}`, onClick: () => this.deleteRental({ declarationId: row.id, impact: row.impact }, reload) }));
    return create('article', { className: 'card', dataset: { rentalHistoryRow: row.id }, style: { padding: '10px', display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, [
      create('div', {}, [
        create('strong', { textContent: period }),
        create('div', { className: 'text-muted', textContent: `${row.tenants.map(item => item.name).join(', ') || 'Sin inquilino'} · ${row.modalities.map(kind => modalityLabel(kind)).join(' + ')} · ${active ? 'Activo' : 'Finalizado'}` })
      ]),
      actions
    ]);
  },

  shortDate(date) {
    return date ? date.split('-').reverse().join('/') : '';
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

  // "Actualizar alquiler": shows the current value, lets the user pick a manual amount, a percentage or an index
  // and a due date (one of the last 3 past ones, marked "retroactivo", or a future one; the next due date is
  // preselected), and previews the effect (read-only endpoint) before confirming. Collected periods keep their amount.
  openCondition(ctx, contractId) {
    const card = ctx.overview.modalities.find(item => item.contractId === contractId);
    if (!card) return null;
    const pastDueDates = card.pastDueDates || [];
    const body = create('div', { className: 'rental-condition', style: { display: 'grid', gap: '10px' } });
    body.appendChild(create('p', { style: { margin: '0' }, textContent: `${card.modalityLabel}. Valor actual: ${formatearMonedaConCodigo(card.currentAmount, card.currencyCode)}` }));
    const method = create('select', { className: 'form-control', 'aria-label': 'Tipo de actualización' });
    [['manual', 'Nuevo importe'], ['percentage', 'Porcentaje de aumento'], ['index', 'Índice o criterio']].forEach(([value, label]) => method.appendChild(create('option', { value, textContent: label })));
    const date = create('select', { className: 'form-control', 'aria-label': 'Fecha efectiva' });
    pastDueDates.forEach(value => date.appendChild(create('option', { value, textContent: `${value.split('-').reverse().join('/')} (retroactivo)` })));
    card.futureDueDates.forEach(value => date.appendChild(create('option', { value, textContent: value.split('-').reverse().join('/') })));
    date.value = card.futureDueDates[0] || pastDueDates[pastDueDates.length - 1] || '';
    const amount = MoneyInput.create({ currency: card.currencyCode, ariaLabel: `Nuevo alquiler (${card.currencyCode})` });
    const percentage = create('input', { className: 'form-control', type: 'number', step: '0.01', 'aria-label': 'Porcentaje de aumento' });
    const indexValue = create('input', { className: 'form-control', type: 'number', min: '0.000001', step: '0.000001', 'aria-label': 'Valor de índice actual' });
    const baseIndex = create('input', { className: 'form-control', type: 'number', min: '0.000001', step: '0.000001', 'aria-label': 'Valor de índice base' });
    const field = (label, control) => create('label', { className: 'form-group', style: { display: 'grid', gap: '4px', margin: '0' } }, [create('span', { textContent: label }), control]);
    const rows = { manual: field(`Nuevo importe (${card.currencyCode})`, amount), percentage: field('Porcentaje de aumento', percentage), index: create('div', { style: { display: 'grid', gap: '10px' } }, [field('Índice actual', indexValue), field('Índice base', baseIndex)]) };
    body.append(field('Tipo de actualización', method), field('Fecha efectiva (vencimiento)', date), rows.manual, rows.percentage, rows.index);
    if (pastDueDates.length) body.appendChild(create('small', { className: 'text-muted', textContent: 'Podés elegir hasta 3 vencimientos anteriores. Los períodos ya cobrados conservan su importe.' }));
    const note = create('p', { className: 'text-muted', role: 'status', style: { margin: '0' }, textContent: card.futureDueDates.length || pastDueDates.length ? 'Completá los datos para ver la previsualización.' : 'Este contrato no tiene vencimientos para ajustar.' });
    body.appendChild(note);
    const save = create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Guardar ajuste', disabled: true });
    let valid = false;
    const input = () => {
      const data = { method: method.value, effectiveDate: date.value };
      if (method.value === 'manual') data.rentAmount = MoneyInput.value(amount);
      if (method.value === 'percentage') data.percentage = percentage.value === '' ? undefined : Number(percentage.value);
      if (method.value === 'index') { data.indexValue = indexValue.value === '' ? undefined : Number(indexValue.value); data.baseIndexValue = baseIndex.value === '' ? undefined : Number(baseIndex.value); }
      return data;
    };
    let token = 0;
    const refresh = async () => {
      Object.entries(rows).forEach(([key, row]) => { row.style.display = key === method.value ? '' : 'none'; });
      valid = false;
      save.disabled = true;
      const current = input();
      const ready = current.effectiveDate && ((method.value === 'manual' && current.rentAmount > 0) || (method.value === 'percentage' && Number.isFinite(current.percentage)) || (method.value === 'index' && current.indexValue > 0 && current.baseIndexValue > 0));
      if (!ready) return;
      const mine = (token += 1);
      try {
        const result = await API.rentals.previewCondition(contractId, current);
        if (mine !== token) return;
        note.textContent = this.previewText(result, card);
        valid = true;
        save.disabled = false;
      } catch (error) {
        if (mine !== token) return;
        note.textContent = error.message;
      }
    };
    [method, date, percentage, indexValue, baseIndex].forEach(control => { on(control, 'change', refresh); on(control, 'input', refresh); });
    ['input', 'change', 'blur'].forEach(name => on(amount, name, refresh));
    on(save, 'click', async () => {
      if (!valid) return;
      save.disabled = true;
      try {
        await API.rentals.addCondition(contractId, input());
        showToast('Ajuste de alquiler guardado');
        Modal.hide();
        await ctx.reload();
      } catch (error) { save.disabled = false; note.textContent = error.message; }
    });
    refresh();
    Modal.push('Actualizar alquiler', body, { width: '520px', footer: create('div', { style: { display: 'flex', gap: '8px' } }, [create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cancelar', onClick: () => Modal.hide() }), save]) });
    return body;
  },

  // "Desde diciembre 2026, el alquiler pasa de ARS 11.797.500 a ARS 15.336.750. Se actualizarán 5 períodos futuros no cobrados."
  previewText(preview, card) {
    const month = formatMonthLabel(preview.effectiveDate.slice(0, 7));
    const count = preview.affectedDates.length;
    const skipped = preview.skippedCollectedDates.length;
    // Retroactive when the effective date is one of the past due dates offered in the dialog.
    const retro = (card.pastDueDates || []).includes(preview.effectiveDate);
    const periods = `${count} período${count === 1 ? '' : 's'}${retro ? '' : ` futuro${count === 1 ? '' : 's'}`} no cobrado${count === 1 ? '' : 's'}${retro ? ' (incluye vencimientos pasados)' : ''}`;
    const text = `Desde ${month.charAt(0).toLowerCase()}${month.slice(1)}, el alquiler pasa de ${formatearMonedaConCodigo(preview.previousAmount, card.currencyCode)} a ${formatearMonedaConCodigo(preview.newAmount, card.currencyCode)}. Se actualizarán ${periods}.`;
    return skipped ? `${text} ${skipped === 1 ? 'Un período ya cobrado se mantiene' : `${skipped} períodos ya cobrados se mantienen`} sin cambios.` : text;
  },

  finishRental(ctx) {
    return this.endDialog(ctx, {
      title: 'Finalizar alquiler', confirmLabel: 'Confirmar y finalizar alquiler',
      intro: ['Estás por finalizar este alquiler.', 'Se cancelarán los períodos futuros sin cobrar.', 'Las obligaciones a cargo del inquilino volverán al titular.', 'Esta acción no se puede deshacer.', '¿Querés continuar?'],
      preview: endDate => API.rentals.declarations.endPreview(ctx.declarationId, { endDate }),
      end: endDate => API.rentals.declarations.end(ctx.declarationId, { endDate: endDate || null }),
      done: 'Alquiler finalizado'
    });
  },

  // "Finalizar contrato": only inside a concrete modality; asks for the end date, lists the periods that get
  // cancelled and requires an explicit confirmation. It is not "Finalizar alquiler" (that ends every modality).
  finishContract(ctx, card) {
    return this.endDialog(ctx, {
      title: `Finalizar contrato · ${card.modalityLabel}`, confirmLabel: 'Confirmar y finalizar contrato',
      intro: [`Estás por finalizar el contrato de ${card.modalityLabel.toLowerCase()}.`, 'Se cancelarán los períodos futuros sin cobrar de esta modalidad. Los cobros registrados se conservan.', 'Esta acción no se puede deshacer.', '¿Querés continuar?'],
      preview: endDate => API.rentals.declarations.endModalityPreview(ctx.declarationId, card.contractId, { endDate }),
      end: endDate => API.rentals.declarations.endModality(ctx.declarationId, card.contractId, { endDate: endDate || null }),
      done: 'Contrato finalizado'
    });
  },

  // Shared end dialog: date, live preview of what gets cancelled, explicit confirmation.
  endDialog(ctx, { title, confirmLabel, intro, preview, end, done }) {
    const body = create('div', { className: 'rental-end', style: { display: 'grid', gap: '8px' } });
    intro.forEach(line => body.appendChild(create('p', { style: { margin: '0' }, textContent: line })));
    const endDate = create('input', { className: 'form-control', type: 'date', value: getToday(), 'aria-label': 'Fecha de finalización' });
    body.appendChild(create('label', { className: 'form-group', style: { display: 'grid', gap: '4px', margin: '0' } }, [create('span', { textContent: 'Fecha de finalización' }), endDate]));
    const result = create('div', { className: 'rental-end-preview', role: 'status', dataset: { endPreview: 'true' } });
    body.appendChild(result);
    const confirm = create('button', { className: 'btn btn-danger', type: 'button', textContent: confirmLabel, dataset: { confirmEnd: 'true' } });
    let token = 0;
    const refresh = async () => {
      const mine = (token += 1);
      result.replaceChildren(create('small', { className: 'text-muted', textContent: 'Calculando qué se cancelará...' }));
      try {
        const data = await preview(endDate.value);
        if (mine !== token) return;
        const items = data.cancelledPeriods.map(item => `${modalityLabel(item.modality)} · ${formatMonthLabel(item.period)} · ${formatearMonedaConCodigo(item.amount, item.currencyCode)}`);
        result.replaceChildren(
          create('strong', { textContent: items.length ? `Se cancelarán ${items.length} período${items.length === 1 ? '' : 's'} sin cobrar` : 'No hay períodos futuros sin cobrar para cancelar' }),
          ...(items.length ? [create('ul', { style: { margin: '4px 0', paddingLeft: '18px', maxHeight: '160px', overflowY: 'auto' } }, items.map(text => create('li', { textContent: text })))] : []),
          ...(data.tenantObligations && data.tenantObligations.length ? [create('strong', { textContent: 'Estas obligaciones del inquilino vuelven al titular:' }), create('ul', { style: { margin: '4px 0', paddingLeft: '18px' } }, data.tenantObligations.map(item => create('li', { textContent: item.title })))] : [])
        );
        confirm.disabled = false;
      } catch (error) {
        if (mine !== token) return;
        result.replaceChildren(create('p', { className: 'text-danger', role: 'alert', textContent: error.message }));
        confirm.disabled = true;
      }
    };
    on(endDate, 'change', refresh);
    on(confirm, 'click', async () => {
      confirm.disabled = true;
      try {
        await end(endDate.value);
        showToast(done);
        Modal.hide();
        await ctx.reload();
      } catch (error) { result.replaceChildren(create('p', { className: 'text-danger', role: 'alert', textContent: error.message })); confirm.disabled = false; }
    });
    refresh();
    Modal.push(title, body, { width: '520px', footer: create('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' } }, [create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cancelar', onClick: () => Modal.hide() }), confirm]) });
    return body;
  },

  async collect(ctx, monthKey) {
    await RentalPeriods.collectMonth(ctx.assetId, monthKey, () => ctx.reload());
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

  cardActions(ctx, card, { collect = true } = {}) {
    const actions = create('div', { className: 'rental-card-actions' });
    const button = (label, handler) => actions.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: label, 'aria-label': `${label} · ${card.modalityLabel}`, onClick: handler }));
    if (card.status === 'active') {
      button('Actualizar alquiler', () => this.updateRent(ctx, card.contractId));
      if (collect) button('Registrar cobro', () => this.collectContract(ctx, card.contractId));
    }
    button('Ver períodos', () => { ctx.periodFilter = { modality: card.modality }; ctx.tabs.select('periodos'); ctx.tabs.refresh('periodos'); });
    if (card.status === 'active') button('Finalizar contrato', () => this.finishContract(ctx, card));
    return actions;
  },

  async collectContract(ctx, contractId) {
    try {
      const contract = await API.rentals.get(contractId);
      await RentalPeriods.collectContract(ctx.asset, contract, null, () => ctx.reload());
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
      const row = create('div', { className: alert.type === 'rent_due' ? 'rental-alert alert-critical' : 'rental-alert', dataset: { alertType: alert.type }, style: { display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, [create('span', { textContent: alert.message })]);
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
      const documentsSlot = create('div', { className: 'contract-documents', dataset: { contractDocuments: card.contractId }, style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } });
      article.appendChild(documentsSlot);
      this.loadContractDocuments(documentsSlot, card.contractId);
      if (!ctx.readOnly) article.appendChild(this.cardActions(ctx, card, { collect: false }));
      root.appendChild(article);
    });
    return root;
  },

  // Fills the card slot with view/download actions for the contract's documents; nothing is shown without documents.
  async loadContractDocuments(slot, contractId) {
    let documents = [];
    try {
      documents = await API.documents.list('contract', contractId);
    } catch {
      return;
    }
    (Array.isArray(documents) ? documents : []).forEach(doc => {
      const name = doc.title || doc.fileName || '';
      slot.append(
        create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Ver documento', dataset: { contractDocument: 'view' }, 'aria-label': `Ver documento ${name}`.trim(), onClick: () => AssetHistory.showReceipt(doc) }),
        create('a', { className: 'btn btn-ghost btn-sm', href: API.documents.contentUrl(doc.id, true), textContent: 'Descargar documento', dataset: { contractDocument: 'download' }, 'aria-label': `Descargar documento ${name}`.trim() })
      );
    });
  },

  // Períodos: the unified monthly table (one row per month: modalities, obligations, state and actions).
  renderPeriods(ctx) {
    return RentalPeriods.render(ctx);
  },

  // Documentos: everything linked to the rental (its contracts, periods and the rental itself). A new file attaches
  // to the chosen modality contract, or to the rental as a whole.
  async renderDocuments(ctx) {
    const root = create('div', { className: 'rental-records' });
    const targets = [{ value: `declaration:${ctx.declarationId}`, label: 'Todo el alquiler' }, ...ctx.overview.modalities.map(card => ({ value: `contract:${card.contractId}`, label: card.modalityLabel }))];
    await WealthRecords.renderDocuments(root, {
      title: 'Documentos del alquiler',
      load: () => API.documents.list('declaration', ctx.declarationId, { includeRelated: '1' }),
      targets,
      upload: (file, target) => {
        const [type, id] = String(target || targets[0].value).split(':');
        return API.documents.upload(type, id, file);
      }
    });
    return root;
  },

  // Notas: notes of the rental and of its contracts and periods, with date range, order, edit and delete.
  async renderNotes(ctx) {
    const root = create('div', { className: 'rental-records' });
    await WealthRecords.renderNotes(root, {
      title: 'Notas del alquiler',
      load: range => API.wealthNotes.list('declaration', ctx.declarationId, { includeRelated: '1', ...range }),
      create: data => API.wealthNotes.create({ targetType: 'declaration', targetId: ctx.declarationId, ...data })
    });
    return root;
  }
};
