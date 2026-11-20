// Dedicated activity log screen: every action of the user, newest first, with an accent/case
// insensitive search, optional "Desde"/"Hasta" days and server-side filters (Bien, Titular, Inquilino, Categoría).
// Date/time on the left, description on the right; "Deshacer" on the rows whose action can still be undone.
const LogsPage = {
  LOGS_PAGE_SIZE: 200,
  LOGS_MAX_PAGES: 50,
  FILTERS: [['assetId', 'Bien', 'Todos los bienes'], ['ownerId', 'Titular', 'Todos los titulares'], ['tenantId', 'Inquilino', 'Todos los inquilinos'], ['categoryId', 'Categoría', 'Todas las categorías']],

  // Lowercase text without accents, for tolerant matching.
  normalizeText(value) {
    return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  },

  // Entries whose message contains every word of the query (accent and case insensitive).
  filterItems(items, query) {
    const words = this.normalizeText(query).split(/\s+/).filter(Boolean);
    if (!words.length) return items;
    return items.filter(item => {
      const message = this.normalizeText(item.message);
      return words.every(word => message.includes(word));
    });
  },

  // Loads every page of the range (newest first), following `nextBefore` up to LOGS_MAX_PAGES pages.
  async loadAll(from, to, filters = {}) {
    const items = [];
    let before = null;
    for (let page = 0; page < this.LOGS_MAX_PAGES; page += 1) {
      const result = await API.activityLogs.list({
        limit: this.LOGS_PAGE_SIZE, before, from, to, timezone: localStorage.getItem('pate_timezone') || undefined,
        assetId: filters.assetId || undefined, ownerId: filters.ownerId || undefined, tenantId: filters.tenantId || undefined, categoryId: filters.categoryId || undefined
      });
      items.push(...result.items);
      before = result.nextBefore;
      if (!before) break;
    }
    return items;
  },

  // Options of the four selectors: [{ value, label }] per filter key. A list that fails to load stays empty.
  async loadFilterOptions() {
    const safe = async request => { try { return (await request) || []; } catch { return []; } };
    const [assets, owners, categories] = await Promise.all([safe(API.assets.list()), safe(API.owners.list()), safe(API.categories.list())]);
    const named = (items, label) => items.map(item => ({ value: item.id, label: label(item) })).filter(item => item.value && item.label)
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
    const hasRole = (item, role) => (item.roles || ['owner']).includes(role);
    return {
      assetId: named(assets, item => item.name),
      ownerId: named(owners.filter(item => hasRole(item, 'owner')), item => item.name),
      tenantId: named(owners.filter(item => hasRole(item, 'tenant')), item => item.name),
      categoryId: named(categories, item => item.nombre)
    };
  },

  renderRow(item, onUndone = null) {
    const failed = item.outcome === 'failure';
    const description = create('div', { className: 'log-description' }, [
      create('span', { textContent: item.message })
    ]);
    if (failed) {
      description.appendChild(create('span', {
        className: 'due-overdue', textContent: ' · No se completó', style: { marginLeft: '4px' }
      }));
    }
    if (item.undoable && item.undo && !failed) {
      description.appendChild(create('button', {
        className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Deshacer', style: { marginLeft: '8px' },
        'data-log-action': 'undo',
        onClick: () => UndoDialog.open(item.undo, { onDone: () => { if (onUndone) onUndone(); } })
      }));
    }
    return create('div', { className: 'log-row' }, [
      create('div', { className: 'log-date text-muted', textContent: formatLogDateTime(item.timestamp) }),
      description
    ]);
  },

  async render() {
    const content = $('#page-content');
    const navbar = $('#navbar');
    navbar.style.display = '';
    content.style.paddingBottom = '';
    content.innerHTML = '';

    content.appendChild(create('div', { className: 'page-header logs-header' }, [
      create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: '← Perfil', onClick: () => Router.navigate('/profile') }),
      create('h2', { className: 'page-title', textContent: 'Logs' })
    ]));

    const searchInput = create('input', { className: 'form-control', type: 'search', id: 'logs-search', placeholder: 'Buscar en las acciones...' });
    const fromInput = create('input', { className: 'form-control', type: 'date', id: 'logs-from' });
    const toInput = create('input', { className: 'form-control', type: 'date', id: 'logs-to' });
    // One compact toolbar: text and dates filter locally, the selectors filter on the server (changing one reloads).
    const toolbar = create('section', { className: 'logs-filters logs-toolbar', 'aria-label': 'Filtros de logs' });
    const field = (label, control, modifier) => {
      const group = create('div', { className: `logs-field${modifier ? ` logs-field-${modifier}` : ''}` });
      group.appendChild(create('label', { textContent: label, for: control.id }));
      group.appendChild(control);
      toolbar.appendChild(group);
    };
    field('Buscar', searchInput, 'search');
    field('Desde', fromInput, 'date');
    field('Hasta', toInput, 'date');
    const selects = {};
    this.FILTERS.forEach(([key, label, allLabel]) => {
      const select = create('select', { className: 'form-control', id: `logs-filter-${key}`, title: label }, [create('option', { value: '', textContent: allLabel })]);
      selects[key] = select;
      field(label, select);
    });
    const clearButton = create('button', { className: 'btn btn-ghost btn-sm logs-clear', type: 'button', id: 'logs-clear-filters', textContent: 'Limpiar filtros' });
    toolbar.appendChild(clearButton);
    content.appendChild(toolbar);

    const list = create('div', { id: 'logs-list' });
    content.appendChild(list);

    const activeFilters = () => Object.fromEntries(this.FILTERS.map(([key]) => [key, selects[key].value]));
    let allItems = [];
    let requestId = 0;
    const paint = () => {
      const visible = this.filterItems(allItems, searchInput.value);
      list.replaceChildren(...visible.map(item => this.renderRow(item, load)));
      if (!visible.length) {
        const filtered = searchInput.value.trim() || fromInput.value || toInput.value || activeFilters().assetId || activeFilters().ownerId || activeFilters().tenantId || activeFilters().categoryId;
        list.appendChild(create('p', {
          className: 'empty-state',
          textContent: filtered ? 'No hay acciones que coincidan con la búsqueda' : 'Todavía no hay acciones registradas'
        }));
      }
    };
    const load = async () => {
      const from = fromInput.value;
      const to = toInput.value;
      if (from && to && from > to) return showToast('La fecha "Desde" no puede ser posterior a "Hasta"', 'error');
      const current = ++requestId;
      list.replaceChildren(create('div', { className: 'loading', textContent: 'Cargando acciones...' }));
      try {
        const items = await this.loadAll(from, to, activeFilters());
        if (current !== requestId) return;
        allItems = items;
        paint();
      } catch (err) {
        if (current !== requestId) return;
        list.replaceChildren();
        showToast(err.message, 'error');
      }
    };

    on(searchInput, 'input', paint);
    on(fromInput, 'change', load);
    on(toInput, 'change', load);
    this.FILTERS.forEach(([key]) => on(selects[key], 'change', load));
    on(clearButton, 'click', () => {
      this.FILTERS.forEach(([key]) => { selects[key].value = ''; });
      searchInput.value = '';
      fromInput.value = '';
      toInput.value = '';
      return load();
    });
    const loading = load();
    this.loadFilterOptions().then(options => {
      this.FILTERS.forEach(([key]) => (options[key] || []).forEach(option => selects[key].appendChild(create('option', { value: option.value, textContent: option.label }))));
    });
    await loading;
  }
};
