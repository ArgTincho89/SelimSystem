// Responsive data table: a real <table> on desktop that becomes stacked label/value cards on phones (see
// `.data-table` in components.css; every cell carries `data-label`). Rows may expand to a detail row.
//
//   const table = DataTable.create({ caption, columns: [{ key, label, render(row) }], rowId(row), rowDataset(row), expand(row), emptyMessage });
//   table.setRows(rows);  table.element
const DataTable = {
  create({ caption = '', columns, rowId = row => row.id, rowDataset = null, expand = null, emptyMessage = 'No hay datos para mostrar.' }) {
    const head = columns.map(column => create('th', { scope: 'col', textContent: column.label }));
    if (expand) head.unshift(create('th', { scope: 'col' }, [create('span', { className: 'sr-only', textContent: 'Detalle' })]));
    const body = create('tbody');
    const table = create('table', { className: 'data-table' }, [
      ...(caption ? [create('caption', { className: 'sr-only', textContent: caption })] : []),
      create('thead', {}, [create('tr', {}, head)]),
      body
    ]);
    const empty = create('p', { className: 'empty-state', role: 'status', textContent: emptyMessage });
    const element = create('div', { className: 'table-scroll' }, [table, empty]);

    const cell = (column, row) => {
      const content = column.render ? column.render(row) : row[column.key];
      const td = create('td', { dataset: { label: column.label, column: column.key } });
      if (content instanceof HTMLElement) td.appendChild(content);
      else if (Array.isArray(content)) content.filter(Boolean).forEach(node => td.appendChild(node));
      else if (content !== null && content !== undefined) td.appendChild(document.createTextNode(String(content)));
      return td;
    };

    const renderRow = row => {
      const id = rowId(row);
      const tr = create('tr', { className: 'data-row', dataset: { rowId: id, ...(rowDataset ? rowDataset(row) : {}) } });
      if (expand) {
        const detail = create('tr', { className: 'data-row-detail', dataset: { detailFor: id } }, [create('td', { colspan: String(columns.length + 1) })]);
        detail.hidden = true;
        const toggle = create('button', { className: 'btn btn-ghost btn-sm data-row-toggle', type: 'button', 'aria-expanded': 'false', 'aria-label': 'Ver el detalle del período', textContent: '▸' });
        let rendered = false;
        on(toggle, 'click', () => {
          const open = toggle.getAttribute('aria-expanded') !== 'true';
          toggle.setAttribute('aria-expanded', String(open));
          toggle.textContent = open ? '▾' : '▸';
          detail.hidden = !open;
          if (open && !rendered) {
            rendered = true;
            detail.children[0].appendChild(expand(row));
          }
        });
        tr.appendChild(create('td', { className: 'data-row-expander' }, [toggle]));
        columns.forEach(column => tr.appendChild(cell(column, row)));
        return [tr, detail];
      }
      columns.forEach(column => tr.appendChild(cell(column, row)));
      return [tr];
    };

    const setRows = rows => {
      body.replaceChildren(...rows.flatMap(renderRow));
      empty.hidden = rows.length > 0;
      table.hidden = rows.length === 0;
    };
    setRows([]);
    return { element, setRows };
  }
};
