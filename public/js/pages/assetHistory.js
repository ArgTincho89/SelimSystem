// Typed financial and operational timeline of an asset. Year and month are separate selectors; the list
// refreshes in place (GET /assets/:id/history). A row opens a detail dialog whose actions come from the
// server (`row.actions`) plus `AssetHistory.actionProviders` (so new actions never restructure the detail).
const AssetHistory = {
  MONTH_NAMES: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  RECEIPT_MIME_ALLOWLIST: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'],
  RESPONSIBILITY_LABELS: { owner: 'Titular', tenant: 'Inquilino' },
  ACTION_LABELS: { pay: 'Registrar pago', resolve: 'Resolver', collect: 'Registrar cobro', 'undo-collect': 'Deshacer cobro' },
  // Extension point: functions (row, context) returning an array of buttons rendered in the detail actions slot.
  actionProviders: [],

  async open(assetId, options = {}) {
    let asset;
    let history;
    const state = { year: options.year || '', month: options.month || '' };
    try {
      [asset, history] = await Promise.all([API.assets.get(assetId), API.assets.history(assetId, state)]);
    } catch (error) { showToast(error.message, 'error'); return; }
    state.year = history.year || state.year;
    state.month = history.month || state.month;
    const body = create('div', { className: 'asset-history', style: { display: 'grid', gap: '12px' } });
    const yearSelect = this.select([], '');
    yearSelect.setAttribute('aria-label', 'Año');
    const monthSelect = this.select([['all', 'Todo el año'], ...this.MONTH_NAMES.map((name, index) => [String(index + 1).padStart(2, '0'), name])], state.month);
    monthSelect.setAttribute('aria-label', 'Mes');
    const today = create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Hoy', 'aria-label': 'Volver al mes actual' });
    const controls = create('div', { className: 'asset-history-controls', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end' } }, [
      create('label', { className: 'form-group', style: { marginBottom: '0' } }, [create('span', { textContent: 'Año' }), yearSelect]),
      create('label', { className: 'form-group', style: { marginBottom: '0' } }, [create('span', { textContent: 'Mes' }), monthSelect]),
      today
    ]);
    const status = create('p', { className: 'text-muted', role: 'status', style: { margin: '0' } });
    const list = create('div', { className: 'asset-history-list', id: 'asset-history-list' });
    body.append(controls, status, list);

    const fillYears = years => {
      yearSelect.replaceChildren(...years.map(year => create('option', { value: year, textContent: year })));
      yearSelect.value = state.year;
    };
    const ctx = { asset, reload: () => load() };
    const load = async () => {
      list.replaceChildren(Feedback.loading('Cargando historial...'));
      try {
        history = await API.assets.history(assetId, { year: state.year, month: state.month });
      } catch (error) {
        list.replaceChildren(Feedback.error(`No se pudo cargar el historial: ${error.message}`, { onRetry: load }));
        return;
      }
      state.year = history.year;
      state.month = history.month;
      fillYears(history.years);
      monthSelect.value = state.month;
      status.textContent = state.month === 'all' ? `Todo ${state.year}` : `${this.MONTH_NAMES[Number(state.month) - 1]} ${state.year}`;
      this.renderList(list, history, ctx);
    };
    on(yearSelect, 'change', () => { state.year = yearSelect.value; load(); });
    on(monthSelect, 'change', () => { state.month = monthSelect.value; load(); });
    on(today, 'click', () => { state.year = ''; state.month = ''; load(); });
    fillYears(history.years);
    this.renderList(list, history, ctx);
    status.textContent = state.month === 'all' ? `Todo ${state.year}` : `${this.MONTH_NAMES[Number(state.month) - 1]} ${state.year}`;
    Modal.show(`Historial de ${asset.name}`, body, { width: '1100px' });
  },

  select(options, selected = '') {
    const select = create('select', { className: 'form-control' });
    options.forEach(([value, text]) => select.appendChild(create('option', { value, textContent: text })));
    select.value = selected;
    return select;
  },

  // Rows grouped by month when a whole year (or a range) is shown.
  groupByMonth(rows) {
    const groups = new Map();
    rows.forEach(row => {
      const month = row.date.slice(0, 7);
      if (!groups.has(month)) groups.set(month, []);
      groups.get(month).push(row);
    });
    return [...groups].map(([month, items]) => ({ month, rows: items }));
  },

  renderList(list, history, ctx) {
    list.replaceChildren();
    if (!history.rows.length) {
      list.appendChild(Feedback.empty({ message: Feedback.MESSAGES.noMovements, hint: 'Probá con otro mes o volvé al mes actual con "Hoy".' }));
      return;
    }
    const groups = history.month === 'all' || !history.month ? this.groupByMonth(history.rows) : [{ month: null, rows: history.rows }];
    groups.forEach(group => {
      if (group.month) list.appendChild(create('h4', { textContent: formatMonth(group.month), style: { margin: '10px 0 4px' } }));
      list.appendChild(this.renderTable(group.rows, ctx));
    });
  },

  amountText(value, currencyCode) {
    return value === null || value === undefined || !currencyCode ? '—' : formatearMonedaConCodigo(value, currencyCode);
  },

  formatDate(date) {
    return date ? date.split('-').reverse().join('/') : '';
  },

  renderTable(rows, ctx) {
    const head = ['Fecha', 'Concepto', 'Tipo', 'Responsable', 'Proveedor / inquilino', 'Esperado', 'Ejecutado', 'Saldo', 'Estado', 'Acción'];
    const table = create('table', { className: 'asset-history-table' }, [
      create('thead', {}, [create('tr', {}, head.map(label => create('th', { scope: 'col', textContent: label })))]),
      create('tbody', {}, rows.map(row => this.renderRow(row, ctx)))
    ]);
    return create('div', { className: 'table-scroll' }, [table]);
  },

  renderRow(row, ctx) {
    const concept = create('td', { dataset: { label: 'Concepto' } }, [create('strong', { textContent: row.concept })]);
    (row.parts || []).forEach(part => concept.appendChild(create('div', { className: 'text-muted history-part', textContent: `${part.modalityLabel}: ${this.amountText(part.amount, part.currencyCode)} · ${part.classification}` })));
    if ((row.parts || []).length > 1) {
      const total = row.totals && row.totals.length === 1 ? this.amountText(row.totals[0].expected, row.totals[0].currencyCode) : null;
      if (total) concept.appendChild(create('div', { className: 'history-part', textContent: `Total: ${total}` }));
    }
    const badge = this.badge(row.state, row);
    const detail = create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Ver detalle', 'aria-label': `Ver detalle de ${row.concept}`, dataset: { historyDetail: row.id },
      onClick: event => { event.stopPropagation(); this.showDetail(row, ctx); } });
    const cell = (label, content) => create('td', { dataset: { label } }, [typeof content === 'string' ? document.createTextNode(content) : content].filter(Boolean));
    return create('tr', { className: 'asset-history-row', dataset: { historyRow: row.id, kind: row.kind }, onClick: () => this.showDetail(row, ctx) }, [
      cell('Fecha', this.formatDate(row.date)),
      concept,
      cell('Tipo', row.typeLabel),
      cell('Responsable', this.RESPONSIBILITY_LABELS[row.responsibility] || '—'),
      cell('Proveedor / inquilino', row.counterpart || '—'),
      cell('Esperado', this.amountText(row.expected, row.currencyCode)),
      cell('Ejecutado', this.amountText(row.executed, row.currencyCode)),
      cell('Saldo', this.amountText(row.balance, row.currencyCode)),
      cell('Estado', badge || '—'),
      cell('Acción', detail)
    ]);
  },

  badge(state, row = {}) {
    if (!state) return null;
    const info = statusBadge(state, { overdue: row.overdue });
    return create('span', { className: `status-badge ${info.className}`, dataset: { status: state }, textContent: `${info.icon} ${info.label}` });
  },

  // Detail of one record: amounts, state, payments or collections, receipts, notes and the contextual actions.
  showDetail(row, ctx) {
    const panel = create('div', { className: 'asset-history-detail', style: { display: 'grid', gap: '8px' } });
    const line = (label, value) => {
      if (value === null || value === undefined || value === '') return;
      panel.appendChild(create('div', { className: 'label-value' }, [create('strong', { textContent: `${label}:` }), typeof value === 'string' ? create('span', { textContent: value }) : value]));
    };
    line('Tipo de registro', row.typeLabel);
    line('Fecha', this.formatDate(row.date));
    line('Concepto', row.concept);
    line('Bien', ctx.asset.name);
    line('Responsable', this.RESPONSIBILITY_LABELS[row.responsibility]);
    line(row.responsibility === 'tenant' ? 'Inquilino' : 'Proveedor', row.counterpart);
    if (row.currencyCode) {
      line('Importe esperado', this.amountText(row.expected, row.currencyCode));
      line(row.kind === 'rent' ? 'Importe cobrado' : (row.responsibility === 'tenant' ? 'Importe resuelto' : 'Importe pagado'), this.amountText(row.executed, row.currencyCode));
      line('Saldo pendiente', this.amountText(row.balance, row.currencyCode));
    }
    const badge = this.badge(row.state, row);
    if (badge) line('Estado', badge);
    (row.parts || []).forEach(part => line(part.modalityLabel, `${this.amountText(part.amount, part.currencyCode)} · ${part.classification} · ${statusLabel(part.state)}`));
    if (row.previousAmount !== undefined) line('Importe anterior', this.amountText(row.previousAmount, row.currencyCode));
    panel.appendChild(create('strong', { textContent: row.kind === 'rent' ? 'Cobros registrados' : 'Pagos registrados' }));
    if (!row.payments.length) panel.appendChild(create('span', { className: 'text-muted', textContent: row.kind === 'rent' ? 'Sin cobros registrados.' : 'Sin pagos registrados.' }));
    row.payments.forEach(payment => {
      const parts = [`${this.formatDate(payment.date)} · ${this.amountText(payment.amount, payment.currencyCode || row.currencyCode)}`,
        payment.accountName ? `Cuenta: ${payment.accountName}` : '', payment.paymentMethod ? `Medio: ${payment.paymentMethod}` : '',
        payment.title ? `Título: ${payment.title}` : '', payment.notes ? `Notas: ${payment.notes}` : ''].filter(Boolean);
      panel.appendChild(create('div', { className: 'text-muted', textContent: parts.join(' · ') }));
    });
    if (row.resolution) panel.appendChild(create('div', { className: 'text-muted', textContent: `Resuelto el ${this.formatDate(row.resolution.resolvedAt)} por ${this.amountText(row.resolution.amount, row.currencyCode)}${row.resolution.notes ? ` · ${row.resolution.notes}` : ''}` }));
    (row.voidedResolutions || []).forEach(voided => panel.appendChild(create('div', { className: 'text-muted', dataset: { voidedResolution: voided.id },
      textContent: `Resolución anulada${voided.voidedAt ? ` el ${this.formatDate(String(voided.voidedAt).slice(0, 10))}` : ''}${voided.voidReason ? ` · Motivo: ${voided.voidReason}` : ''}` })));
    if (row.reversals.length) {
      panel.appendChild(create('strong', { textContent: row.kind === 'obligation' ? 'Pagos revertidos' : 'Cobros revertidos' }));
      row.reversals.forEach(reversal => panel.appendChild(create('div', { className: 'text-muted', textContent: `Revertido: ${reversal.date || reversal.reversedAt ? this.formatDate(reversal.date || String(reversal.reversedAt).slice(0, 10)) : ''} ${reversal.amount !== undefined ? this.amountText(reversal.amount, reversal.currencyCode || row.currencyCode) : ''}${reversal.reason ? ` · Motivo: ${reversal.reason}` : ''}`.trim() })));
    }
    panel.appendChild(create('strong', { textContent: 'Comprobantes' }));
    if (!row.documents.length) panel.appendChild(create('span', { className: 'text-muted', textContent: 'Sin comprobantes adjuntos.' }));
    row.documents.forEach(doc => panel.appendChild(create('span', { style: { display: 'inline-flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, [
      create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Ver comprobante', 'aria-label': `Ver comprobante ${doc.title || doc.fileName || ''}`.trim(), onClick: () => this.showReceipt(doc) }),
      create('a', { className: 'btn btn-ghost btn-sm', href: API.documents.contentUrl(doc.id, true), textContent: 'Descargar comprobante', 'aria-label': `Descargar comprobante ${doc.title || doc.fileName || ''}`.trim() })
    ])));
    panel.appendChild(create('strong', { textContent: 'Notas' }));
    if (!row.notes.length) panel.appendChild(create('span', { className: 'text-muted', textContent: 'Sin notas.' }));
    row.notes.forEach(note => panel.appendChild(create('div', { className: 'text-muted', textContent: `${this.formatDate(note.date)}${note.title ? ` · ${note.title}` : ''} · ${note.content}` })));
    const slot = create('div', { className: 'asset-history-actions', dataset: { actionsSlot: 'true' }, style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } });
    this.buildActions(row, ctx).forEach(button => slot.appendChild(button));
    panel.appendChild(slot);
    Modal.push('Detalle del registro', panel, { width: '680px', footer: create('div', {}, [create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() })]) });
  },

  // Only actions valid for the record state are offered (the server decides them in `row.actions`).
  buildActions(row, ctx) {
    const buttons = [];
    const afterDone = async () => { Modal.hide(); await ctx.reload(); };
    const action = (label, handler, className = 'btn btn-primary btn-sm') => buttons.push(create('button', { className, type: 'button', textContent: label, dataset: { historyAction: label }, onClick: handler }));
    const actions = row.actions || [];
    if (actions.includes('pay')) action('Registrar pago', () => this.payObligation(row, afterDone));
    if (actions.includes('resolve')) action('Resolver', () => this.resolveObligation(row, afterDone), 'btn btn-secondary btn-sm');
    if (actions.includes('collect') && row.refs.monthKey) action('Registrar cobro', () => AssetsPage.showRentMonthModal(row.refs.assetId, row.refs.monthKey, afterDone));
    if (row.refs.occurrenceId && row.kind === 'obligation') {
      action('Adjuntar comprobante', () => this.attachReceipt(row, afterDone), 'btn btn-ghost btn-sm');
      action('Agregar nota', () => this.addNote(row, afterDone), 'btn btn-ghost btn-sm');
    }
    this.actionProviders.forEach(provider => buttons.push(...(provider(row, { ...ctx, afterDone }) || [])));
    return buttons;
  },

  UNDO_COLLECTION_NOTE: 'Se deshacen los cobros de este mes y vuelve a quedar pendiente de cobro.',

  // The "Deshacer" entry points of a history row: a paid obligation, a resolved obligation and a collected rent all
  // open the same UndoDialog (required "Motivo"). Pending or already reverted rows carry no such action.
  undoButtons(row, afterDone) {
    const actions = row.actions || [];
    const buttons = this.revertButtons(row, afterDone);
    const button = (descriptor, aria) => create('button', {
      className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Deshacer', 'aria-label': aria, dataset: { historyAction: 'undo' },
      onClick: () => UndoDialog.open(descriptor, { onDone: afterDone })
    });
    if (row.kind === 'obligation' && actions.includes('unresolve')) {
      buttons.push(button({ type: 'obligation.resolution', obligationId: row.refs.obligationId, occurrenceId: row.refs.occurrenceId }, `Deshacer resolución de ${row.concept}`));
    }
    if (actions.includes('undo-collect') && row.refs.collectionIds?.length) {
      buttons.push(button({ type: 'rental.collection', collectionIds: row.refs.collectionIds, message: this.UNDO_COLLECTION_NOTE }, `Deshacer cobro de ${row.concept}`));
    }
    return buttons;
  },

  // One "Deshacer" button per revertible payment of an obligation row (the server marks `revertible`).
  revertButtons(row, afterDone) {
    if (row.kind !== 'obligation' || !(row.actions || []).includes('revert')) return [];
    const revertible = row.payments.filter(payment => payment.revertible);
    return revertible.map((payment, index) => create('button', {
      className: 'btn btn-secondary btn-sm', type: 'button', textContent: revertible.length > 1 ? `Deshacer pago ${index + 1}` : 'Deshacer',
      'aria-label': `Deshacer pago de ${row.concept}`, dataset: { historyAction: 'undo', revertPayment: payment.transactionId },
      onClick: () => ObligationsPage.revertPayment({ obligationId: row.refs.obligationId, occurrenceId: row.refs.occurrenceId, transactionId: payment.transactionId }, afterDone)
    }));
  },

  async occurrenceOf(row) {
    const obligation = await API.obligations.get(row.refs.obligationId);
    const occurrence = (obligation.occurrences || []).find(item => item.id === row.refs.occurrenceId) || (obligation.occurrences || []).find(item => item.date === row.date);
    if (!occurrence) throw new Error('No se encontró el vencimiento');
    return { obligation, occurrence };
  },

  async payObligation(row, afterDone) {
    try {
      const { obligation, occurrence } = await this.occurrenceOf(row);
      await ObligationsPage.loadLookups();
      ObligationsPage.onChange = afterDone;
      await ObligationsPage.pay(obligation, occurrence);
    } catch (error) { showToast(error.message, 'error'); }
  },

  async resolveObligation(row, afterDone) {
    try {
      const { obligation, occurrence } = await this.occurrenceOf(row);
      await ObligationsPage.loadLookups();
      ObligationsPage.onChange = afterDone;
      await ObligationsPage.showResolveModal(obligation, occurrence);
    } catch (error) { showToast(error.message, 'error'); }
  },

  attachReceipt(row, afterDone) {
    const input = create('input', { type: 'file', accept: '.pdf,.png,.jpg,.jpeg,.webp,.txt' });
    on(input, 'change', async () => {
      if (!input.files?.[0]) return;
      try {
        await API.documents.uploadTargets({ occurrenceId: row.refs.occurrenceId }, input.files[0]);
        showToast('Comprobante adjuntado');
        await afterDone();
      } catch (error) { showToast(error.message, 'error'); }
    });
    input.click();
  },

  addNote(row, afterDone) {
    const content = create('textarea', { className: 'form-control', rows: 4, maxLength: 4000, 'aria-label': 'Nota' });
    const save = create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Guardar nota', onClick: async () => {
      const text = content.value.trim();
      if (!text) { showToast('Escribí la nota', 'error'); return; }
      try {
        await API.wealthNotes.create({ targetType: 'obligation', targetId: row.refs.obligationId, content: text });
        showToast('Nota guardada');
        Modal.hide();
        await afterDone();
      } catch (error) { showToast(error.message, 'error'); }
    } });
    Modal.push('Agregar nota', create('div', { className: 'form-group' }, [create('label', { textContent: 'Nota' }), content]), { footer: create('div', {}, [save]) });
  },

  // Normalized MIME type when it is allowed to render inline, '' otherwise (HTML and the like never render).
  receiptMime(contentType) {
    const base = String(contentType || '').split(';')[0].trim().toLowerCase();
    return this.RECEIPT_MIME_ALLOWLIST.includes(base) ? base : '';
  },

  // Receipt viewer stacked over the history: the file is fetched as a Blob and shown from an object URL
  // (the content endpoint is restricted, which blocks the browser PDF viewer).
  async showReceipt(doc) {
    const viewer = create('div', { className: 'receipt-viewer' }, [create('div', { className: 'loading', textContent: 'Cargando comprobante...' })]);
    let objectUrl = null;
    let closed = false;
    const revoke = () => {
      closed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    };
    Modal.push(doc.title || doc.fileName || 'Comprobante', viewer, { width: '900px', onClose: revoke });
    const downloadLink = create('a', { className: 'btn btn-ghost btn-sm', href: API.documents.contentUrl(doc.id, true), textContent: 'Descargar' });
    try {
      const response = await fetch(API.documents.contentUrl(doc.id), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('No se pudo cargar el comprobante');
      const raw = await response.blob();
      if (closed) return;
      const type = this.receiptMime(doc.contentType || doc.mimeType || raw.type);
      if (!type) {
        viewer.replaceChildren(create('p', { className: 'text-muted', textContent: 'Este tipo de archivo no se puede mostrar. Descargalo para verlo.' }), downloadLink);
        return;
      }
      objectUrl = URL.createObjectURL(new Blob([raw], { type }));
      const toolbar = create('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } });
      let content;
      if (type.startsWith('image/')) {
        let scale = 1;
        const img = create('img', { src: objectUrl, alt: doc.title || doc.fileName || 'Comprobante' });
        const apply = () => { img.style.scale = String(scale); };
        const zoom = delta => { scale = Math.min(4, Math.max(0.25, Math.round((scale + delta) * 100) / 100)); apply(); };
        toolbar.append(
          create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: '− Alejar', onClick: () => zoom(-0.25) }),
          create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: '+ Acercar', onClick: () => zoom(0.25) }),
          create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: '100%', onClick: () => { scale = 1; apply(); } })
        );
        content = create('div', { className: 'receipt-image-frame' }, [img]);
      } else {
        content = create('iframe', { src: objectUrl, title: doc.title || doc.fileName || 'Comprobante' });
      }
      toolbar.append(create('a', { className: 'btn btn-ghost btn-sm', href: objectUrl, target: '_blank', rel: 'noopener', textContent: 'Abrir' }), downloadLink);
      viewer.replaceChildren(toolbar, content);
    } catch (error) {
      if (closed) return;
      viewer.replaceChildren(create('p', { className: 'text-muted', textContent: error.message }), downloadLink);
    }
  }
};

// Extension point use: the "Deshacer" buttons of a row (history detail and monthly sheet).
AssetHistory.actionProviders.push((row, ctx) => AssetHistory.undoButtons(row, ctx.afterDone));
