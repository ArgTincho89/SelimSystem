// Dedicated activity log screen: every action of the user, newest first, with an accent/case
// insensitive search and optional "Desde"/"Hasta" days. Date/time on the left, description on the right.
const LogsPage = {
  LOGS_PAGE_SIZE: 200,
  LOGS_MAX_PAGES: 50,

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
  async loadAll(from, to) {
    const items = [];
    let before = null;
    for (let page = 0; page < this.LOGS_MAX_PAGES; page += 1) {
      const result = await API.activityLogs.list({
        limit: this.LOGS_PAGE_SIZE, before, from, to, timezone: localStorage.getItem('pate_timezone') || undefined
      });
      items.push(...result.items);
      before = result.nextBefore;
      if (!before) break;
    }
    return items;
  },

  renderRow(item) {
    const failed = item.outcome === 'failure';
    const description = create('div', { className: 'log-description' }, [
      create('span', { textContent: item.message })
    ]);
    if (failed) {
      description.appendChild(create('span', {
        className: 'due-overdue', textContent: ' · No se completó', style: { marginLeft: '4px' }
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

    content.appendChild(create('div', { className: 'page-header' }, [
      create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: '← Perfil', onClick: () => Router.navigate('/profile') }),
      create('h2', { className: 'page-title', textContent: 'Logs' })
    ]));

    const searchInput = create('input', { className: 'form-control', type: 'search', id: 'logs-search', placeholder: 'Buscar en las acciones...' });
    const fromInput = create('input', { className: 'form-control', type: 'date', id: 'logs-from' });
    const toInput = create('input', { className: 'form-control', type: 'date', id: 'logs-to' });
    const filters = create('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '12px' } });
    [['Buscar', searchInput, '2 1 220px'], ['Desde', fromInput, '1 1 140px'], ['Hasta', toInput, '1 1 140px']].forEach(([label, input, flex]) => {
      const group = create('div', { className: 'form-group', style: { flex, marginBottom: '0' } });
      group.appendChild(create('label', { textContent: label, for: input.id }));
      group.appendChild(input);
      filters.appendChild(group);
    });
    content.appendChild(filters);

    const list = create('div', { id: 'logs-list' });
    content.appendChild(list);

    let allItems = [];
    let requestId = 0;
    const paint = () => {
      const visible = this.filterItems(allItems, searchInput.value);
      list.replaceChildren(...visible.map(item => this.renderRow(item)));
      if (!visible.length) {
        const filtered = searchInput.value.trim() || fromInput.value || toInput.value;
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
        const items = await this.loadAll(from, to);
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
    await load();
  }
};
