// Períodos tab of the rental modal: one row per month with every modality, the owner and tenant obligations of
// the month, the consolidated state and the actions. It also owns the rent collection dialogs ("Registrar
// cobro", "Deshacer cobro", "Ver" a collection) that used to live in the asset page.
const RentalPeriods = {
  MODALITIES: ['locacion', 'comodato', 'mutuo'],
  RESPONSIBILITY: { owner: 'Titular', tenant: 'Inquilino' },
  MONTH_NAMES: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  EMPTY_FILTERS: { month: '', status: '', type: '', responsibility: '', modality: '', provider: '', text: '' },

  select(options, selected = '') {
    const control = create('select', { className: 'form-control' });
    options.forEach(([value, text]) => control.appendChild(create('option', { value, textContent: text })));
    control.value = selected;
    return control;
  },

  shortDate(date) {
    return date ? date.split('-').reverse().join('/') : '';
  },

  money(amount, currencyCode) {
    return formatearMonedaConCodigo(amount, currencyCode);
  },

  // Totals of the month per currency: the expected rent plus the obligations of the month (non cancelled).
  periodTotals(period, parts = period.parts, obligations = period.obligations) {
    const totals = new Map();
    const add = (currency, amount) => totals.set(currency, Math.round(((totals.get(currency) || 0) + amount) * 100) / 100);
    parts.filter(part => part.state !== 'cancelled').forEach(part => add(part.currencyCode, part.expected));
    obligations.filter(item => item.state !== 'cancelled' && item.currencyCode).forEach(item => add(item.currencyCode, item.expected));
    return [...totals].map(([currencyCode, amount]) => ({ currencyCode, amount }));
  },

  // Client-side filters over the loaded year. Returns periods with `visibleParts` / `visibleObligations`.
  applyFilters(periods, filters) {
    const f = { ...this.EMPTY_FILTERS, ...filters };
    const text = f.text.trim().toLowerCase();
    return periods.map(period => {
      let parts = period.parts;
      let obligations = period.obligations;
      if (f.modality) parts = parts.filter(part => part.modality === f.modality);
      if (f.type === 'obligation') parts = [];
      if (f.type === 'rent') obligations = [];
      if (f.responsibility) obligations = obligations.filter(item => item.responsibility === f.responsibility);
      if (f.provider) obligations = obligations.filter(item => item.counterpart === f.provider);
      return { ...period, visibleParts: parts, visibleObligations: obligations };
    }).filter(period => {
      if (f.month && period.period.slice(5, 7) !== f.month) return false;
      if (f.status && period.state !== f.status) return false;
      if ((f.responsibility || f.provider || f.type === 'obligation') && !period.visibleObligations.length) return false;
      if ((f.modality || f.type === 'rent') && !period.visibleParts.length) return false;
      if (text) {
        const haystack = [period.period, ...period.visibleParts.map(part => part.modalityLabel), ...period.visibleObligations.flatMap(item => [item.concept, item.counterpart || ''])].join(' ').toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      return true;
    });
  },

  async render(ctx) {
    const current = Number(getToday().slice(0, 4));
    const first = Number((ctx.overview.header.from || `${current}`).slice(0, 4));
    const last = Math.max(Number((ctx.overview.header.to || `${current}`).slice(0, 4)), current + 1);
    const filters = ctx.periodFilter = { ...this.EMPTY_FILTERS, year: ctx.year || String(current), ...ctx.periodFilter };
    const root = create('div', { className: 'rental-periods', style: { display: 'grid', gap: '10px' } });
    const control = (label, element) => create('label', { className: 'periods-filter' }, [create('span', { textContent: label }), element]);
    const year = this.select(Array.from({ length: last - Math.min(first, Number(filters.year)) + 1 }, (_, index) => { const value = String(Math.min(first, Number(filters.year)) + index); return [value, value]; }), filters.year);
    year.setAttribute('aria-label', 'Año');
    const month = this.select([['', 'Todos los meses'], ...this.MONTH_NAMES.map((name, index) => [String(index + 1).padStart(2, '0'), name])], filters.month);
    month.setAttribute('aria-label', 'Mes');
    const status = this.select([['', 'Todos los estados'], ['pending', 'Pendiente'], ['partial', 'Parcial'], ['collected', 'Cobrado'], ['overdue', 'Vencido'], ['cancelled', 'Cancelado']], filters.status);
    status.setAttribute('aria-label', 'Estado');
    const type = this.select([['', 'Alquiler y obligaciones'], ['rent', 'Solo alquiler'], ['obligation', 'Solo obligaciones']], filters.type);
    type.setAttribute('aria-label', 'Tipo');
    const responsibility = this.select([['', 'Todos los responsables'], ['owner', 'Titular'], ['tenant', 'Inquilino']], filters.responsibility);
    responsibility.setAttribute('aria-label', 'Responsable');
    const modality = this.select([['', 'Todas las modalidades'], ...this.MODALITIES.map(kind => [kind, modalityLabel(kind)])], filters.modality);
    modality.setAttribute('aria-label', 'Modalidad');
    const provider = this.select([['', 'Todos los proveedores']], '');
    provider.setAttribute('aria-label', 'Proveedor');
    const text = create('input', { className: 'form-control', type: 'search', placeholder: 'Buscar', 'aria-label': 'Buscar texto', value: filters.text });
    const filterGrid = create('div', { className: 'periods-filters-grid' }, [
      control('Año', year), control('Mes', month), control('Estado', status), control('Tipo', type), control('Responsable', responsibility), control('Modalidad', modality), control('Proveedor', provider), control('Buscar', text)
    ]);
    const clear = create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Limpiar filtros' });
    const actions = create('div', { className: 'periods-filters-actions' }, [clear]);
    // Filters sit in their own compact section, separated from the results table.
    const toolbar = create('section', { className: 'periods-filters', 'aria-label': 'Filtros de períodos' }, [filterGrid, actions]);
    if (!ctx.readOnly && ctx.overview.header.status !== 'ended') actions.appendChild(create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Actualizar alquiler', onClick: () => RentalModal.updateRent(ctx) }));
    const table = DataTable.create({
      caption: 'Períodos del alquiler', rowId: row => row.period, rowDataset: row => ({ rentMonth: row.monthKey || row.period, collected: String(row.state === 'collected') }), emptyMessage: 'No hay períodos que coincidan con los filtros.',
      expand: row => this.detail(row, ctx),
      columns: [
        { key: 'period', label: 'Período', render: row => create('strong', { textContent: formatMonthLabel(row.period) }) },
        { key: 'dueDate', label: 'Vencimiento', render: row => this.shortDate(row.dueDate) },
        ...this.MODALITIES.map(kind => ({ key: kind, label: modalityLabel(kind), render: row => this.modalityCell(row, kind) })),
        { key: 'obligations', label: 'Obligaciones', render: row => this.obligationsCell(row, ctx) },
        { key: 'total', label: 'Total', render: row => this.periodTotals(row, row.visibleParts, row.visibleObligations).map(item => this.money(item.amount, item.currencyCode)).join(' + ') || '—' },
        { key: 'state', label: 'Estado', render: row => this.stateBadge(row.state, row) },
        { key: 'actions', label: 'Acción', render: row => this.actionsCell(row, ctx) }
      ]
    });
    const empty = create('div', { className: 'periods-empty', hidden: true });
    root.append(toolbar, table.element, empty);

    let data = [];
    const refreshProviders = () => {
      const names = [...new Set(data.flatMap(period => period.obligations.map(item => item.counterpart)).filter(Boolean))].sort();
      provider.replaceChildren(create('option', { value: '', textContent: 'Todos los proveedores' }), ...names.map(name => create('option', { value: name, textContent: name })));
      provider.value = names.includes(filters.provider) ? filters.provider : '';
      filters.provider = provider.value;
    };
    const paint = () => {
      const rows = this.applyFilters(data, filters);
      table.setRows(rows);
      empty.hidden = rows.length > 0;
      empty.replaceChildren();
      if (!rows.length) {
        const pending = filters.status === 'pending' || filters.status === 'overdue';
        const message = !data.length ? 'No hay períodos de alquiler en este año.' : pending ? Feedback.MESSAGES.noPendingPeriods : 'No hay períodos que coincidan con estos filtros.';
        empty.append(Feedback.empty({ message, actionLabel: 'Limpiar filtros', onAction: () => clear.click() }));
      }
    };
    const load = async () => {
      table.element.setAttribute('aria-busy', 'true');
      try {
        data = await API.rentals.declarations.periods(ctx.declarationId, { from: `${filters.year}-01`, to: `${filters.year}-12` });
      } catch (error) {
        empty.hidden = false;
        empty.replaceChildren(Feedback.error(`No se pudieron cargar los períodos: ${error.message}`, { onRetry: () => load() }));
        return;
      } finally { table.element.removeAttribute('aria-busy'); }
      refreshProviders();
      paint();
    };
    const bind = (element, key, event = 'change') => on(element, event, () => { filters[key] = element.value; paint(); });
    bind(month, 'month'); bind(status, 'status'); bind(type, 'type'); bind(responsibility, 'responsibility'); bind(modality, 'modality'); bind(provider, 'provider'); bind(text, 'text', 'input');
    on(year, 'change', () => { filters.year = year.value; load(); });
    on(clear, 'click', () => {
      Object.assign(filters, this.EMPTY_FILTERS);
      [month, status, type, responsibility, modality, provider, text].forEach(element => { element.value = ''; });
      paint();
    });
    ctx.reloadPeriods = load;
    await load();
    return root;
  },

  stateBadge(state, row = {}) {
    const info = statusBadge(state);
    return create('span', { className: `status-badge ${info.className}`, dataset: { status: state }, textContent: `${info.icon} ${info.label}` });
  },

  modalityCell(period, kind) {
    const part = period.visibleParts.find(item => item.modality === kind);
    if (!part) return '—';
    const info = statusBadge(part.state);
    return [
      create('span', { textContent: this.money(part.expected, part.currencyCode) }),
      create('small', { className: `status-badge ${info.className}`, textContent: `${info.icon} ${info.label}`, style: { display: 'block' } })
    ];
  },

  // Owner and tenant obligations of the month, kept apart, each with its own direct action.
  obligationsCell(period, ctx) {
    if (!period.visibleObligations.length) return '—';
    const box = create('div', { className: 'obligation-lines', style: { display: 'grid', gap: '4px' } });
    ['owner', 'tenant'].forEach(side => {
      const items = period.visibleObligations.filter(item => item.responsibility === side);
      if (!items.length) return;
      box.appendChild(create('div', { className: 'text-muted', textContent: this.RESPONSIBILITY[side], style: { fontWeight: '700', fontSize: 'var(--font-sm)' } }));
      items.forEach(item => box.appendChild(this.obligationLine(item, ctx)));
    });
    return box;
  },

  obligationLine(item, ctx) {
    const line = create('div', { className: 'obligation-line', dataset: { obligationOccurrence: item.refs.occurrenceId }, style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } }, [
      create('span', { textContent: `${item.concept}: ${this.money(item.expected, item.currencyCode)}` }), this.stateBadge(item.state)
    ]);
    if (!ctx.readOnly) this.obligationActions(item, ctx).forEach(button => line.appendChild(button));
    return line;
  },

  obligationActions(item, ctx) {
    const row = { refs: { obligationId: item.refs.obligationId, occurrenceId: item.refs.occurrenceId }, date: item.date };
    const buttons = [];
    const add = (label, handler, className = 'btn btn-secondary btn-sm') => buttons.push(create('button', { className, type: 'button', textContent: label, 'aria-label': `${label}: ${item.concept}`, onClick: handler }));
    if (item.actions.includes('pay')) add('Registrar pago', () => AssetHistory.payObligation(row, () => ctx.reopen()));
    if (item.actions.includes('resolve')) add('Resolver', () => AssetHistory.resolveObligation(row, () => ctx.reopen()));
    if (item.actions.includes('unresolve')) add('Anular resolución', () => this.unresolve(item, ctx), 'btn btn-ghost btn-sm');
    AssetHistory.revertButtons({ ...item, kind: 'obligation' }, () => ctx.reload({ tab: 'periodos' })).forEach(button => buttons.push(button));
    return buttons;
  },

  async unresolve(item, ctx) {
    await UndoDialog.open({
      type: 'obligation.resolution', obligationId: item.refs.obligationId, occurrenceId: item.refs.occurrenceId, title: 'Anular resolución', confirmLabel: 'Anular resolución',
      message: `Vas a anular la resolución de "${item.concept}". El vencimiento vuelve a quedar pendiente de resolver.`
    }, { onDone: () => ctx.reload({ tab: 'periodos' }) });
  },

  actionsCell(period, ctx) {
    const box = create('div', { className: 'period-actions', style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
    const label = formatMonthLabel(period.period);
    if (!ctx.readOnly) {
      if (period.actions.includes('collect') && period.monthKey) box.appendChild(create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Registrar cobro', 'aria-label': `Registrar cobro de ${label}`, onClick: () => this.collectMonth(ctx.assetId, period.monthKey, () => ctx.reload({ tab: 'periodos' })) }));
      if (period.actions.includes('undo-collect')) {
        const undo = this.undoCollections([...new Set(period.collections.map(item => item.groupId || item.id))], () => ctx.reload({ tab: 'periodos' }), 'Se deshacen los cobros de este mes y vuelve a quedar pendiente de cobro.');
        if (undo) box.appendChild(undo);
      }
      if (period.actions.includes('cancel-period')) box.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Cancelar período', 'aria-label': `Cancelar período ${label}`, onClick: () => this.cancelPeriod(period, ctx) }));
    }
    box.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Ver detalle', 'aria-label': `Ver detalle de ${label}`, onClick: () => Modal.push(`Período ${label}`, this.detail(period, ctx), { width: '760px' }) }));
    return box;
  },

  async cancelPeriod(period, ctx) {
    const label = formatMonthLabel(period.period);
    const { confirmed } = await ConfirmDialog.open({
      title: 'Cancelar período', danger: true, confirmLabel: 'Cancelar período',
      message: `Vas a cancelar el período ${label}. Se cancelan todas sus modalidades sin cobros.\nEsta acción no se puede deshacer. ¿Querés continuar?`
    });
    if (!confirmed) return;
    try {
      for (const part of period.parts.filter(item => item.actionable)) await API.rentals.cancelOccurrence(part.contractId, part.occurrenceId);
      showToast('Período cancelado');
      await ctx.reload({ tab: 'periodos' });
    } catch (error) { showToast(error.message, 'error'); }
  },

  // Full detail of one period (inline when expanded, in a stacked dialog from "Ver detalle").
  detail(period, ctx) {
    const parts = period.visibleParts || period.parts;
    const obligations = period.visibleObligations || period.obligations;
    const root = create('div', { className: 'period-detail', style: { display: 'grid', gap: '10px', padding: '8px 0' } });
    const section = (title, children) => { const box = create('section', { dataset: { detailSection: title } }, [create('strong', { textContent: title })]); children.forEach(child => box.appendChild(child)); root.appendChild(box); return box; };
    const text = value => create('div', { className: 'text-muted', textContent: value });
    section('Período', [text(`${formatMonthLabel(period.period)} · vence el ${this.shortDate(period.dueDate)} · `), this.stateBadge(period.state)]);
    section('Modalidades y montos', parts.map(part => create('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
      create('span', { textContent: `${part.modalityLabel}: ${this.money(part.expected, part.currencyCode)} · ${part.classification}${part.collected ? ` · cobrado ${this.money(part.collected, part.currencyCode)}` : ''}` }), this.stateBadge(part.state)
    ])));
    section('Obligaciones', obligations.length ? obligations.map(item => create('div', { style: { display: 'grid', gap: '2px' } }, [this.obligationLine(item, ctx),
      ...(item.payments || []).map(payment => text(`Pago ${this.shortDate(payment.date)} · ${this.money(payment.amount, item.currencyCode)}${payment.accountName ? ` · ${payment.accountName}` : ''}`)),
      ...(item.reversals || []).map(reversal => text(`Pago revertido${reversal.reason ? ` · ${reversal.reason}` : ''}`)),
      ...(item.resolution ? [text(`Resuelto el ${this.shortDate(item.resolution.resolvedAt)} · ${this.money(item.resolution.amount, item.currencyCode)}`)] : [])
    ])) : [text('No hay obligaciones en este período.')]);
    section('Cobros registrados', period.collections.length ? period.collections.map(item => text(`${this.shortDate(item.date)} · ${this.money(item.amount, item.currencyCode)}${item.modality ? ` · ${modalityLabel(item.modality)}` : ''}${item.accountName ? ` · ${item.accountName}` : ''}${item.paymentMethod ? ` · ${item.paymentMethod}` : ''}`)) : [text('Sin cobros registrados.')]);
    if (period.unapplied.length) section('Saldo sin aplicar', period.unapplied.map(item => text(`Cobro del ${this.shortDate(item.date)} con ${this.money(item.amount, item.currencyCode)} sin aplicar a un período.`)));
    const documents = [...period.documents, ...obligations.flatMap(item => item.documents || [])];
    section('Comprobantes', documents.length ? documents.map(doc => create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: `Ver ${doc.title || doc.fileName || 'comprobante'}`, onClick: () => AssetHistory.showReceipt(doc) })) : [text('Sin comprobantes.')]);
    const notes = [...period.notes, ...obligations.flatMap(item => item.notes || [])];
    section('Notas', notes.length ? notes.map(note => text(`${this.shortDate(note.date)} · ${note.content}`)) : [text('Sin notas.')]);
    return root;
  },

  // "Deshacer cobro": opens the UndoDialog (required "Motivo") that undoes every given collection (same effect as
  // deleting its transaction). A month collected by modality is one group: undoing any part undoes all of it.
  undoCollections(collectionIds, afterDone, note) {
    if (!collectionIds.length) return null;
    return create('button', {
      className: 'btn btn-sm', type: 'button', textContent: 'Deshacer cobro', dataset: { undoCollection: 'true' }, style: { border: '1px solid var(--danger)', color: 'var(--danger)', background: 'transparent' },
      onClick: () => UndoDialog.open({ type: 'rental.collection', collectionIds, message: note }, { onDone: afterDone })
    });
  },

  // "Ver" a rent collection (read-only): per modality payment date, amount, IVA (locación), payment
  // method and destination account, plus totals and the rental/property/period. Legacy collections too.
  async showCollectionView(id, options = {}) {
    let detail;
    try { detail = await API.rentals.collectionView(id); } catch (error) { showToast(error.message, 'error'); return; }
    const money = (amount, currency) => formatearMonedaConCodigo(amount, currency);
    const body = create('div', { style: { display: 'grid', gap: '8px', maxHeight: '65vh', overflowY: 'auto' }, dataset: { collectionView: detail.id } });
    [['Inmueble', detail.asset?.name], ['Inquilino', detail.tenants.join(', ')], ['Período', detail.periods.map(formatMonthLabel).join(', ')]]
      .forEach(([label, value]) => { if (value) body.appendChild(create('p', { style: { margin: '2px 0' }, textContent: `${label}: ${value}` })); });
    if (detail.reversed) body.appendChild(create('p', { className: 'text-danger', textContent: 'Este cobro fue deshecho.' }));
    detail.lines.forEach(line => {
      const card = create('section', { className: 'card', style: { padding: '8px' }, dataset: { collectionLine: line.modality || 'sin-asignar' } });
      card.appendChild(create('strong', { textContent: line.unapplied ? 'Sin asignar a un período' : (modalityLabel(line.modality) || 'Alquiler') }));
      [
        ['Fecha de cobro', line.date],
        ['Importe', money(line.amount, line.currencyCode)],
        ...(line.ivaAmount ? [['IVA', `${money(line.ivaAmount, line.currencyCode)} (${line.ivaPercent}% incluido)`], ['Neto', money(line.netAmount, line.currencyCode)]] : []),
        ['Clasificación', line.clasificacion || 'Sin clasificar'],
        ['Medio de cobro', line.method || 'No indicado'],
        ['Cuenta de destino', line.accountName || 'Sin cuenta']
      ].forEach(([label, value]) => card.appendChild(create('p', { style: { margin: '2px 0' }, textContent: `${label}: ${value}` })));
      body.appendChild(card);
    });
    detail.totals.forEach(total => body.appendChild(create('p', { style: { fontWeight: '700', margin: '4px 0' }, dataset: { collectionTotal: total.currencyCode }, textContent: `Total ${total.currencyCode}: ${money(total.amount, total.currencyCode)}${total.ivaAmount ? ` · IVA incluido ${money(total.ivaAmount, total.currencyCode)}` : ''}` })));
    const footer = create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() })]);
    (options.stacked ? Modal.push : Modal.show).call(Modal, 'Cobro de alquiler', body, { footer });
  },

  // "Registrar cobro" of a month (rental modal, Avisos, ficha): one line per modality with its own amount
  // (prefilled from the contract), A/B classification (IVA shown for locación), payment date, payment method
  // and destination account. Each line becomes its own income transaction; all of them are grouped in one
  // collection, so "Deshacer cobro" undoes them together.
  async collectMonth(assetId, monthKey, onDone = null) {
    try {
      const [months, accounts, paymentMethods] = await Promise.all([API.rentals.months(assetId), API.accounts.list(), API.finance.paymentMethods().catch(() => [])]);
      const month = (months || []).find(item => item.key === monthKey);
      const open = month ? month.parts.filter(part => part.remainingMinor > 0) : [];
      if (!open.length) { showToast('Ese mes ya no tiene saldo pendiente de cobro', 'error'); return; }
      const body = create('div', { style: { maxHeight: '65vh', overflowY: 'auto', display: 'grid', gap: '10px' } });
      body.appendChild(create('p', { textContent: `Mes ${month.date}: cada modalidad se registra como un ingreso propio en su cuenta. El mes figura como cobrado cuando se cobran todas sus modalidades.` }));
      const methodList = create('datalist', { id: `rent-methods-${month.date}` });
      [...new Set(['Transferencia', 'Efectivo', ...paymentMethods.map(item => item.name)])].forEach(name => methodList.appendChild(create('option', { value: name })));
      body.appendChild(methodList);
      const today = getToday();
      const ivaOf = (gross, percent) => Math.round((gross - gross / (1 + percent / 100)) * 100) / 100;
      const field = (label, control) => create('label', { className: 'form-group', style: { display: 'grid', gap: '4px', margin: 0 } }, [create('span', { textContent: label }), control]);
      const lines = open.map(part => {
        const label = modalityLabel(part.modality) || 'Alquiler';
        const currency = part.currencyCode;
        const eligible = accounts.filter(item => item.activo && item.currency === currency);
        const amount = MoneyInput.create({ currency, value: part.remainingAmount, ariaLabel: `Importe ${label}` });
        const kind = this.select([['A', 'A (declarado)'], ['B', 'B (sin facturar)']]);
        kind.value = part.modality === 'locacion' ? 'A' : 'B';
        kind.setAttribute('aria-label', `Clasificación ${label}`);
        const iva = create('small', { className: 'text-muted', dataset: { rentLineIva: 'true' } });
        const sync = () => {
          const value = MoneyInput.value(amount);
          iva.textContent = kind.value === 'A' && part.ivaPercent > 0 ? `IVA ${part.ivaPercent}% incluido${value > 0 ? `: ${formatearMonedaConCodigo(ivaOf(value, part.ivaPercent), currency)}` : ''}` : '';
        };
        kind.addEventListener('change', sync);
        ['input', 'change', 'blur'].forEach(name => amount.addEventListener(name, sync));
        sync();
        const date = create('input', { className: 'form-control', type: 'date', value: today, max: today, 'aria-label': `Fecha de cobro (${label})` });
        const method = create('input', { className: 'form-control', type: 'text', maxLength: 100, placeholder: 'Transferencia, efectivo…', list: methodList.id, 'aria-label': `Medio de cobro (${label})` });
        const account = this.select([['', 'Seleccionar cuenta'], ...accountTreeOptions(eligible).map(({ account: item, label: text }) => [item.id, text])]);
        account.setAttribute('aria-label', `Cuenta (${label})`);
        account.value = (eligible.find(item => item.primary) || (eligible.length === 1 ? eligible[0] : null))?.id || '';
        body.appendChild(create('fieldset', { className: 'card', style: { padding: '10px', display: 'grid', gap: '6px' }, dataset: { rentLine: part.modality || 'alquiler' } }, [
          create('legend', { textContent: `${label} · pendiente ${formatearMonedaConCodigo(part.remainingAmount, currency)}` }),
          field(`Importe (${currency})`, amount), field('Clasificación', kind), iva,
          field('Fecha de cobro', date), field('Medio de cobro', method), field(`Cuenta de destino (${currency})`, account)
        ]));
        return { part, label, amount, kind, date, method, account };
      });
      const errorBox = create('p', { className: 'text-danger', role: 'alert', style: { display: 'none', margin: 0 } });
      body.appendChild(errorBox);
      const showError = message => { errorBox.textContent = message; errorBox.style.display = message ? '' : 'none'; };
      const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-rent-month`;
      const submit = create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Registrar cobro' });
      submit.addEventListener('click', async () => {
        showError('');
        if (!MoneyInput.validateAll(lines.map(line => line.amount))) return;
        const chosen = lines.filter(line => MoneyInput.value(line.amount) > 0);
        if (!chosen.length) return showError('Ingresá el importe a cobrar');
        const missing = chosen.find(line => !line.account.value);
        if (missing) return showError(`${missing.label}: seleccioná la cuenta de destino`);
        const payload = chosen.map(line => {
          const methodText = line.method.value.trim();
          const known = paymentMethods.find(item => item.name.toLowerCase() === methodText.toLowerCase());
          return {
            occurrenceId: line.part.occurrenceId, amount: MoneyInput.value(line.amount), accountId: line.account.value, date: line.date.value || today,
            clasificacion: line.kind.value, method: methodText, ...(known ? { paymentMethodId: known.id } : {})
          };
        });
        submit.disabled = true;
        try {
          await API.rentals.collectMonth({ idempotencyKey, lines: payload });
          showToast('Cobro registrado en los ingresos reales');
          Modal.hide();
          if (onDone) await onDone();
        } catch (error) { submit.disabled = false; showError(error.message); }
      });
      Modal.push(`Registrar cobro · mes ${month.date}`, body, { footer: create('div', {}, [submit]) });
    } catch (error) { showToast(`No se pudo abrir el cobro: ${error.message}`, 'error'); }
  },

  // Multi-period collection for one contract (contract card). The month dialog is used from alerts and periods.
  async collectContract(asset, contract, selectedOccurrenceId = null, onDone = null) {
    try {
      const [fullContract, accounts] = await Promise.all([API.rentals.get(contract.id), API.accounts.list()]);
      const currency = contract.currencyCode;
      const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-rent`;
      const open = fullContract.occurrences.filter(item => item.remainingMinor > 0 && item.status !== 'cancelled');
      const body = create('div', { style: { maxHeight: '65vh', overflowY: 'auto' } });
      const rows = create('div', { style: { display: 'grid', gap: '6px' } });
      const amountInputs = [];
      open.forEach(occurrence => {
        const checkbox = create('input', { type: 'checkbox', checked: occurrence.id === selectedOccurrenceId });
        const amount = MoneyInput.create({ currency, value: occurrence.id === selectedOccurrenceId ? occurrence.remainingAmount : null, ariaLabel: `Importe ${occurrence.date}` });
        rows.appendChild(create('label', { className: 'card', style: { padding: '8px', display: 'grid', gridTemplateColumns: 'auto 1fr minmax(90px, 150px)', gap: '8px', alignItems: 'center' } }, [
          checkbox, create('span', { textContent: `${occurrence.date} · pendiente ${occurrence.remainingAmount} ${currency}` }), amount
        ]));
        amountInputs.push({ occurrence, checkbox, amount });
      });
      if (!open.length) rows.appendChild(create('small', { textContent: 'No hay períodos pendientes para asignar.' }));
      body.append(create('p', { textContent: 'Selecciona uno o varios períodos y distribuye el cobro recibido. La parte no asignada quedará visible.' }), rows);
      const total = MoneyInput.create({ currency, value: null, required: true, ariaLabel: `Importe total recibido (${currency})` });
      body.append(create('label', { className: 'form-group' }, [create('span', { textContent: `Importe total recibido (${currency})` }), total]));
      const eligible = accounts.filter(item => item.activo && item.currency === currency);
      const account = this.select([['', 'Seleccionar cuenta'], ...accountTreeOptions(eligible).map(({ account: item, label }) => [item.id, label])]);
      account.value = (eligible.find(item => item.primary) || (eligible.length === 1 ? eligible[0] : null))?.id || '';
      body.append(create('label', { className: 'form-group' }, [create('span', { textContent: 'Cuenta (misma moneda del contrato)' }), account]));
      const date = AssetsPage.rentalField(body, 'Fecha de cobro', { type: 'date', value: new Date().toISOString().slice(0, 10) });
      const method = AssetsPage.rentalField(body, 'Medio de cobro (opcional)');
      const ivaPercent = Number(fullContract.ivaPercent) || 0;
      const classification = this.select([['', 'Sin clasificar'], ['A', ivaPercent > 0 ? `A (IVA ${ivaPercent}%)` : 'A'], ['B', 'B']]);
      classification.value = ivaPercent > 0 ? 'A' : '';
      body.append(create('label', { className: 'form-group' }, [create('span', { textContent: 'Clasificación' }), classification]));
      const footer = create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Registrar cobro', onClick: async () => {
        if (!MoneyInput.validateAll([total, ...amountInputs.map(item => item.amount)])) return;
        const totalValue = MoneyInput.value(total);
        if (!(totalValue > 0)) return showToast('Ingresá el importe recibido', 'error');
        const allocations = amountInputs.filter(item => item.checkbox.checked).map(item => ({ occurrenceId: item.occurrence.id, amount: MoneyInput.value(item.amount) }));
        if (!allocations.length) return showToast('Selecciona al menos un período para asignar', 'error');
        try {
          await API.rentals.collect({
            amount: totalValue, accountId: account.value, date: date.value,
            method: method.value.trim(), allocations,
            ...(classification.value ? { clasificacion: classification.value } : {}),
            idempotencyKey
          });
          showToast('Cobro registrado en los ingresos reales');
          Modal.hide();
          await (onDone ? onDone() : AssetsPage.showDetails(asset.id));
        } catch (error) { showToast(error.message, 'error'); }
      } })]);
      Modal.push(`Registrar cobro · ${currency}`, body, { footer });
    } catch (error) { showToast(`No se pudo abrir el cobro: ${error.message}`, 'error'); }
  }
};

// "Ficha mensual": a wide secondary modal over the asset history (`GET /assets/:id/history?from&to`). It shows the
// same rows as the history, filtered by type, responsible, state, modality and free text, with the actions of the
// periods tab (the server decides them in `row.actions`; extra ones come from `AssetHistory.actionProviders`).
const MonthlySheet = {
  MAX_MONTHS: 36,
  RANGE_NOTE: 'El rango máximo es de 36 meses.',
  EMPTY_FILTERS: { type: '', responsibility: '', state: '', modality: '', text: '' },
  TYPES: [['', 'Alquiler y obligaciones'], ['rent', 'Alquiler'], ['obligation', 'Obligación']],
  RESPONSIBLE: [['', 'Todos'], ['owner', 'Titular'], ['tenant', 'Inquilino']],
  STATES: [['', 'Todos los estados'], ['pending', 'Pendiente'], ['overdue', 'Vencido'], ['partial', 'Parcial'], ['paid', 'Pagado'], ['collected', 'Cobrado'], ['resolved', 'Resuelto'], ['reverted', 'Revertido'], ['cancelled', 'Cancelado']],

  // Month key YYYY-MM shifted by `delta` months.
  shift(key, delta) {
    const [year, month] = key.split('-').map(Number);
    const index = year * 12 + (month - 1) + delta;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  },

  monthCount(from, to) {
    const [fromYear, fromMonth] = from.split('-').map(Number);
    const [toYear, toMonth] = to.split('-').map(Number);
    return (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
  },

  periodLabel(date) {
    const [year, month] = String(date).split('-');
    return `${AssetHistory.MONTH_NAMES[Number(month) - 1] || ''} ${year}`.trim();
  },

  rowType(row) {
    return row.kind === 'rent' || row.kind === 'adjustment' ? 'rent' : 'obligation';
  },

  // Pure: rows that match every active filter (events and adjustments only show under "all types" / rent).
  filterRows(rows, filters = {}) {
    const f = { ...this.EMPTY_FILTERS, ...filters };
    const text = f.text.trim().toLowerCase();
    return rows.filter(row => {
      if (f.type && (this.rowType(row) !== f.type || row.kind === 'event')) return false;
      if (f.responsibility && row.responsibility !== f.responsibility) return false;
      if (f.state && row.state !== f.state) return false;
      if (f.modality && !(row.parts || []).some(part => part.modality === f.modality)) return false;
      if (text && ![row.concept, row.counterpart, row.typeLabel].some(value => String(value || '').toLowerCase().includes(text))) return false;
      return true;
    });
  },

  // Pure: expected and executed per currency, without conversion (cancelled rows and other event kinds are not counted).
  totals(rows) {
    const totals = new Map();
    rows.filter(row => (row.kind === 'rent' || row.kind === 'obligation') && row.currencyCode && row.state !== 'cancelled').forEach(row => {
      const entry = totals.get(row.currencyCode) || { currencyCode: row.currencyCode, expected: 0, executed: 0 };
      entry.expected = Math.round((entry.expected + (row.expected || 0)) * 100) / 100;
      entry.executed = Math.round((entry.executed + (row.executed || 0)) * 100) / 100;
      totals.set(row.currencyCode, entry);
    });
    return [...totals.values()];
  },

  modalityOptions(rows) {
    const kinds = new Set();
    rows.forEach(row => (row.parts || []).forEach(part => kinds.add(part.modality)));
    return [['', 'Todas las modalidades'], ...[...kinds].map(kind => [kind, modalityLabel(kind) || kind])];
  },

  async open(assetId, options = {}) {
    let asset;
    try { asset = await API.assets.get(assetId); } catch (error) { showToast(error.message, 'error'); return null; }
    const today = getCurrentMonth();
    const state = { from: options.from || this.shift(today, -11), to: options.to || today, filters: { ...this.EMPTY_FILTERS }, rows: [] };
    const control = (label, element) => create('label', { className: 'form-group', style: { margin: '0', display: 'grid', gap: '2px' } }, [create('small', { textContent: label }), element]);
    const labelled = (element, label) => { element.setAttribute('aria-label', label); return element; };
    const fromInput = create('input', { className: 'form-control', type: 'month', value: state.from, 'aria-label': 'Desde el mes' });
    const toInput = create('input', { className: 'form-control', type: 'month', value: state.to, 'aria-label': 'Hasta el mes' });
    const years = Array.from({ length: 6 }, (_, index) => { const year = String(Number(today.slice(0, 4)) - index); return [year, year]; });
    const yearSelect = labelled(RentalPeriods.select([['', 'Elegir año'], ...years], ''), 'Año');
    const typeSelect = labelled(RentalPeriods.select(this.TYPES, ''), 'Tipo');
    const responsibleSelect = labelled(RentalPeriods.select(this.RESPONSIBLE, ''), 'Responsable');
    const stateSelect = labelled(RentalPeriods.select(this.STATES, ''), 'Estado');
    const modalitySelect = labelled(RentalPeriods.select([['', 'Todas las modalidades']], ''), 'Modalidad');
    const textInput = create('input', { className: 'form-control', type: 'search', placeholder: 'Proveedor o texto', 'aria-label': 'Buscar por proveedor o texto' });
    const message = create('p', { className: 'text-muted', role: 'status', style: { margin: '0' }, textContent: this.RANGE_NOTE });
    const totalsLine = create('p', { className: 'sheet-totals', style: { margin: '0', fontWeight: '600' } });
    const ctx = { asset, reload: () => load(), afterDone: () => load() };
    const table = DataTable.create({
      caption: `Ficha mensual de ${asset.name}`, emptyMessage: 'No hay movimientos en este período.',
      rowId: row => row.id, rowDataset: row => ({ sheetRow: row.id, kind: row.kind }),
      columns: [
        { key: 'period', label: 'Período', render: row => this.periodLabel(row.date) },
        { key: 'concept', label: 'Concepto', render: row => row.concept },
        { key: 'responsibility', label: 'Responsable', render: row => RentalPeriods.RESPONSIBILITY[row.responsibility] || '—' },
        { key: 'expected', label: 'Esperado', render: row => AssetHistory.amountText(row.expected, row.currencyCode) },
        { key: 'executed', label: 'Ejecutado', render: row => AssetHistory.amountText(row.executed, row.currencyCode) },
        { key: 'state', label: 'Estado', render: row => AssetHistory.badge(row.state, row) || '—' },
        { key: 'receipt', label: 'Comprobante', render: row => this.receiptCell(row) },
        { key: 'actions', label: 'Acción', render: row => this.actionsCell(row, ctx) }
      ],
      expand: row => this.detail(row, ctx)
    });

    const renderRows = () => {
      const visible = this.filterRows(state.rows, state.filters);
      table.setRows(visible);
      totalsLine.textContent = visible.length
        ? this.totals(visible).map(item => `${item.currencyCode}: esperado ${AssetHistory.amountText(item.expected, item.currencyCode)} · ejecutado ${AssetHistory.amountText(item.executed, item.currencyCode)}`).join('  |  ')
        : '';
    };
    const fail = text => { message.textContent = text; message.setAttribute('role', 'alert'); };
    const load = async () => {
      if (!state.from || !state.to || state.from > state.to) { fail('El rango de meses no es válido.'); return; }
      if (this.monthCount(state.from, state.to) > this.MAX_MONTHS) { fail(`El rango elegido supera los ${this.MAX_MONTHS} meses. ${this.RANGE_NOTE}`); return; }
      message.textContent = this.RANGE_NOTE;
      message.setAttribute('role', 'status');
      table.element.setAttribute('aria-busy', 'true');
      try {
        const history = await API.assets.history(assetId, { from: state.from, to: state.to });
        state.rows = history.rows;
        modalitySelect.replaceChildren(...this.modalityOptions(state.rows).map(([value, label]) => create('option', { value, textContent: label })));
        modalitySelect.value = state.filters.modality;
        renderRows();
      } catch (error) {
        fail(`No se pudo cargar la ficha mensual: ${error.message}`);
      }
      table.element.setAttribute('aria-busy', 'false');
    };

    on(fromInput, 'change', () => { state.from = fromInput.value; load(); });
    on(toInput, 'change', () => { state.to = toInput.value; load(); });
    on(yearSelect, 'change', () => {
      if (!yearSelect.value) return;
      state.from = `${yearSelect.value}-01`;
      state.to = `${yearSelect.value}-12`;
      fromInput.value = state.from;
      toInput.value = state.to;
      load();
    });
    [[typeSelect, 'type', 'change'], [responsibleSelect, 'responsibility', 'change'], [stateSelect, 'state', 'change'], [modalitySelect, 'modality', 'change'], [textInput, 'text', 'input']].forEach(([element, key, event]) => {
      on(element, event, () => { state.filters[key] = element.value; renderRows(); });
    });

    const filters = create('div', { className: 'sheet-filters', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end' } }, [
      control('Año', yearSelect), control('Desde', fromInput), control('Hasta', toInput), control('Tipo', typeSelect), control('Responsable', responsibleSelect),
      control('Estado', stateSelect), control('Modalidad', modalitySelect), control('Proveedor o texto', textInput)
    ]);
    const body = create('div', { className: 'monthly-sheet', style: { display: 'grid', gap: '10px' } }, [filters, message, totalsLine, table.element]);
    Modal.push(`Ficha mensual · ${asset.name}`, body, { width: '1200px', fullscreenOnMobile: true, footer: create('div', {}, [create('button', { className: 'btn btn-ghost', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() })]) });
    await load();
    return ctx;
  },

  receiptCell(row) {
    const doc = (row.documents || [])[0];
    if (!doc) return '—';
    return create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Ver', 'aria-label': `Ver comprobante de ${row.concept}`, onClick: () => AssetHistory.showReceipt(doc) });
  },

  // The same actions as the history detail; each button reloads the sheet when its flow ends.
  actionButtons(row, ctx) {
    const buttons = [];
    const actions = row.actions || [];
    const add = (label, handler, className = 'btn btn-primary btn-sm') => buttons.push(create('button', { className, type: 'button', textContent: label, 'aria-label': `${label}: ${row.concept}`, dataset: { sheetAction: label }, onClick: handler }));
    if (actions.includes('pay')) add('Registrar pago', () => AssetHistory.payObligation(row, ctx.afterDone));
    if (actions.includes('resolve')) add('Resolver', () => AssetHistory.resolveObligation(row, ctx.afterDone), 'btn btn-secondary btn-sm');
    if (actions.includes('collect') && row.refs.monthKey) add('Registrar cobro', () => AssetsPage.showRentMonthModal(row.refs.assetId, row.refs.monthKey, ctx.afterDone));
    AssetHistory.actionProviders.forEach(provider => buttons.push(...(provider(row, ctx) || [])));
    return buttons;
  },

  actionsCell(row, ctx) {
    const buttons = this.actionButtons(row, ctx);
    return buttons.length ? create('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, buttons) : '—';
  },

  detail(row, ctx) {
    const box = create('div', { className: 'sheet-detail', style: { display: 'grid', gap: '4px', padding: '6px 0' } });
    if (row.counterpart) box.appendChild(create('div', { textContent: `${row.responsibility === 'tenant' ? 'Inquilino' : 'Proveedor'}: ${row.counterpart}` }));
    (row.parts || []).forEach(part => box.appendChild(create('div', { className: 'text-muted', textContent: `${part.modalityLabel || modalityLabel(part.modality)}: ${AssetHistory.amountText(part.amount, part.currencyCode)} · ${statusLabel(part.state)}` })));
    (row.payments || []).forEach(payment => box.appendChild(create('div', { className: 'text-muted', textContent: `${AssetHistory.formatDate(payment.date)} · ${AssetHistory.amountText(payment.amount, payment.currencyCode || row.currencyCode)}${payment.accountName ? ` · ${payment.accountName}` : ''}` })));
    (row.reversals || []).forEach(reversal => box.appendChild(create('div', { className: 'text-muted', textContent: `Revertido${reversal.reason ? `: ${reversal.reason}` : ''}` })));
    box.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Ver detalle completo', 'aria-label': `Ver detalle completo de ${row.concept}`, onClick: () => AssetHistory.showDetail(row, ctx) }));
    return box;
  }
};
