// Accessible tabs: `role="tablist"` with `role="tab"` buttons (aria-selected) and one `role="tabpanel"` per tab.
// Left/Right (and Home/End) move between tabs. Panels render lazily the first time their tab is selected;
// `render()` may return an element or a promise of one, and `refresh(id)` renders the panel again.
//
//   Tabs.create({ tabs: [{ id, label, render }], initial, label }) -> { element, select(id), refresh(id), current() }
const Tabs = {
  create({ tabs, initial, label = 'Secciones' }) {
    const uid = `tabs-${Math.random().toString(36).slice(2, 8)}`;
    const list = create('div', { className: 'tabs-list', role: 'tablist', 'aria-label': label });
    const element = create('div', { className: 'tabs' }, [list]);
    const entries = new Map();
    let currentId = null;

    const fill = async id => {
      const entry = entries.get(id);
      const token = (entry.token = (entry.token || 0) + 1);
      entry.panel.replaceChildren(create('div', { className: 'loading', textContent: 'Cargando...' }));
      try {
        const content = await entry.tab.render();
        if (token !== entry.token) return;
        entry.panel.replaceChildren(...(content ? [content] : []));
        entry.rendered = true;
      } catch (error) {
        if (token !== entry.token) return;
        entry.panel.replaceChildren(create('p', { className: 'empty-state', role: 'alert', textContent: `No se pudo cargar esta sección: ${error.message}` }));
      }
    };

    const select = (id, { focus = false } = {}) => {
      if (!entries.has(id)) return;
      currentId = id;
      entries.forEach((entry, key) => {
        const active = key === id;
        entry.button.setAttribute('aria-selected', String(active));
        entry.button.tabIndex = active ? 0 : -1;
        entry.button.classList.toggle('active', active);
        entry.panel.hidden = !active;
      });
      const entry = entries.get(id);
      if (!entry.rendered && !entry.token) fill(id);
      if (focus) entry.button.focus();
    };

    tabs.forEach(tab => {
      const button = create('button', {
        className: 'tab', type: 'button', role: 'tab', id: `${uid}-tab-${tab.id}`, 'aria-selected': 'false',
        'aria-controls': `${uid}-panel-${tab.id}`, tabindex: '-1', textContent: tab.label, dataset: { tab: tab.id }
      });
      const panel = create('div', { className: 'tab-panel', role: 'tabpanel', id: `${uid}-panel-${tab.id}`, 'aria-labelledby': button.id, tabindex: '0', dataset: { tabPanel: tab.id } });
      panel.hidden = true;
      on(button, 'click', () => select(tab.id));
      on(button, 'keydown', event => {
        const ids = tabs.map(item => item.id);
        const index = ids.indexOf(tab.id);
        let next = null;
        if (event.key === 'ArrowRight') next = ids[(index + 1) % ids.length];
        else if (event.key === 'ArrowLeft') next = ids[(index - 1 + ids.length) % ids.length];
        else if (event.key === 'Home') next = ids[0];
        else if (event.key === 'End') next = ids[ids.length - 1];
        if (next === null) return;
        event.preventDefault();
        select(next, { focus: true });
      });
      list.appendChild(button);
      element.appendChild(panel);
      entries.set(tab.id, { tab, button, panel, rendered: false, token: 0 });
    });

    select(initial && entries.has(initial) ? initial : tabs[0].id);
    return {
      element, select: id => select(id), current: () => currentId,
      refresh: id => { const target = id || currentId; if (entries.has(target)) return fill(target); return undefined; }
    };
  }
};
