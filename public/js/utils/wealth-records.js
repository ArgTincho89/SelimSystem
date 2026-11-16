// Documents and notes blocks shared by the asset ficha, people/organizations and the rental modal tabs.
// `renderDocuments` and `renderNotes` are configured with loader callbacks; `renderPanel` wires both to one target.
// Deleting always asks first (ConfirmDialog); nothing uses the browser native dialogs.
const WealthRecords = {
  ACCEPT: '.pdf,.png,.jpg,.jpeg,.webp,.txt',
  TYPE_OPTIONS: [['', 'Todos los tipos'], ['pdf', 'PDF'], ['image', 'Imagen'], ['text', 'Texto']],

  // 2026-11-16 -> 16/11/2026
  dmy(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
    return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
  },

  typeOf(documentRecord) {
    const type = String(documentRecord.contentType || '').split(';')[0];
    if (type === 'application/pdf') return 'pdf';
    if (type.startsWith('image/')) return 'image';
    return 'text';
  },

  // Pure: filters documents by name (contains, case-insensitive), type and upload date range.
  filterDocuments(documents, { name = '', type = '', from = '', to = '' } = {}) {
    const needle = name.trim().toLowerCase();
    return documents.filter(item => {
      if (needle && !String(item.title || item.fileName || '').toLowerCase().includes(needle)) return false;
      if (type && this.typeOf(item) !== type) return false;
      const day = String(item.uploadedAt || '').slice(0, 10);
      return (!from || day >= from) && (!to || day <= to);
    });
  },

  // Pure: notes by date, newest first by default.
  sortNotes(notes, order = 'desc') {
    const sign = order === 'asc' ? 1 : -1;
    return [...notes].sort((a, b) => sign * (String(a.date).localeCompare(String(b.date)) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
  },

  noteHeading(note) {
    return [this.dmy(note.date), note.title].filter(Boolean).join(' · ');
  },

  field(label, control) {
    return create('label', { className: 'form-group', style: { display: 'grid', gap: '2px', margin: '0' } }, [create('small', { textContent: label }), control]);
  },

  section(titleText) {
    return create('section', { className: 'wealth-records-section', style: { borderTop: '1px solid var(--border-color)', marginTop: '16px', paddingTop: '12px' } }, [create('h4', { textContent: titleText })]);
  },

  async renderPanel(container, targetType, targetId) {
    const documentsBox = create('div');
    const notesBox = create('div');
    container.append(documentsBox, notesBox);
    await Promise.all([
      this.renderDocuments(documentsBox, { load: () => API.documents.list(targetType, targetId), upload: file => API.documents.upload(targetType, targetId, file) }),
      this.renderNotes(notesBox, {
        load: range => API.wealthNotes.list(targetType, targetId, range),
        create: data => API.wealthNotes.create({ targetType, targetId, ...data })
      })
    ]);
  },

  // config: { load(): Promise<documents[]>, upload(file): Promise, targets?: [{value,label}] , title? }
  async renderDocuments(container, config) {
    const section = this.section(config.title || 'Documentos');
    const filters = { name: '', type: '', from: '', to: '' };
    const list = create('div', { className: 'records-list', style: { display: 'grid', gap: '8px', marginTop: '8px' } });
    const nameInput = create('input', { className: 'form-control', type: 'search', 'aria-label': 'Buscar documento por nombre', placeholder: 'Buscar por nombre' });
    const typeSelect = create('select', { className: 'form-control', 'aria-label': 'Filtrar por tipo' }, this.TYPE_OPTIONS.map(([value, label]) => create('option', { value, textContent: label })));
    const fromInput = create('input', { className: 'form-control', type: 'date', 'aria-label': 'Cargados desde' });
    const toInput = create('input', { className: 'form-control', type: 'date', 'aria-label': 'Cargados hasta' });
    const filterBar = create('div', { className: 'records-filters', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end' } }, [
      this.field('Nombre', nameInput), this.field('Tipo', typeSelect), this.field('Desde', fromInput), this.field('Hasta', toInput)
    ]);
    const fileInput = create('input', { className: 'form-control', type: 'file', accept: this.ACCEPT, 'aria-label': 'Seleccionar documento' });
    const uploadButton = create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Cargar documento' });
    const targetSelect = config.targets && config.targets.length > 1
      ? create('select', { className: 'form-control', 'aria-label': 'Asociar el documento a' }, config.targets.map(item => create('option', { value: item.value, textContent: item.label })))
      : null;
    const uploadBar = create('div', { className: 'records-upload', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end', marginTop: '8px' } },
      [fileInput, ...(targetSelect ? [this.field('Asociar a', targetSelect)] : []), uploadButton]);
    const hint = create('small', { className: 'text-muted', textContent: 'PDF, PNG, JPEG, WebP o texto UTF-8. Máximo 20 MiB.' });
    section.append(filterBar, list, uploadBar, hint);
    container.appendChild(section);

    let documents = [];
    const renderList = () => {
      const visible = this.filterDocuments(documents, filters);
      if (!visible.length) {
        list.replaceChildren(Feedback.empty({ message: documents.length ? 'Ningún documento coincide con los filtros.' : Feedback.MESSAGES.noDocuments, ...(documents.length ? {} : { actionLabel: 'Cargar documento', onAction: () => fileInput.focus() }) }));
        return;
      }
      list.replaceChildren(...visible.map(item => this.documentRow(item, reload)));
    };
    const reload = async () => {
      try {
        documents = await config.load();
        renderList();
      } catch (error) {
        list.replaceChildren(Feedback.error(`No se pudieron cargar los documentos: ${error.message}`, { onRetry: reload }));
      }
    };
    [[nameInput, 'name', 'input'], [typeSelect, 'type', 'change'], [fromInput, 'from', 'change'], [toInput, 'to', 'change']].forEach(([control, key, event]) => {
      control.addEventListener(event, () => { filters[key] = control.value; renderList(); });
    });
    uploadButton.addEventListener('click', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) { showToast('Selecciona un archivo', 'error'); return; }
      uploadButton.disabled = true;
      try {
        await config.upload(file, targetSelect ? targetSelect.value : null);
        fileInput.value = '';
        await reload();
        showToast('Documento cargado');
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        uploadButton.disabled = false;
      }
    });
    await reload();
  },

  documentRow(documentRecord, onChanged) {
    const meta = [
      this.typeOf(documentRecord).toUpperCase(), `${(documentRecord.size / 1024).toFixed(1)} KB`,
      `Cargado el ${this.dmy(documentRecord.uploadedAt)}${documentRecord.uploadedByName ? ` por ${documentRecord.uploadedByName}` : ''}`
    ].filter(Boolean).join(' · ');
    const details = create('div', {}, [
      create('strong', { textContent: documentRecord.title }),
      create('div', { textContent: meta, style: { color: 'var(--text-muted)', fontSize: 'var(--font-sm)' } })
    ]);
    const actions = create('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
      create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Ver', 'aria-label': `Ver ${documentRecord.title}`, onClick: () => this.preview(documentRecord) }),
      create('a', { className: 'btn btn-ghost btn-sm', href: API.documents.contentUrl(documentRecord.id, true), textContent: 'Descargar', 'aria-label': `Descargar ${documentRecord.title}` }),
      create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Eliminar', 'aria-label': `Eliminar ${documentRecord.title}`, dataset: { deleteDocument: documentRecord.id }, onClick: () => this.removeDocument(documentRecord, onChanged) })
    ]);
    return create('div', { className: 'card records-row', dataset: { documentId: documentRecord.id }, style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '10px' } }, [details, actions]);
  },

  async removeDocument(documentRecord, onChanged) {
    const { confirmed } = await ConfirmDialog.open({
      title: 'Eliminar documento', danger: true, confirmLabel: 'Eliminar documento',
      message: `Vas a eliminar "${documentRecord.title}". El archivo se borra y deja de aparecer en los comprobantes que lo usan. Esta acción no se puede deshacer.`
    });
    if (!confirmed) return;
    try {
      await API.documents.remove(documentRecord.id);
      showToast('Documento eliminado');
      await onChanged();
    } catch (error) { showToast(error.message, 'error'); }
  },

  // config: { load({from,to}): Promise<notes[]>, create(data): Promise, title? }
  async renderNotes(container, config) {
    const section = this.section(config.title || 'Notas');
    const state = { from: '', to: '', order: 'desc' };
    const list = create('div', { className: 'records-list', style: { display: 'grid', gap: '8px', marginTop: '8px' } });
    const fromInput = create('input', { className: 'form-control', type: 'date', 'aria-label': 'Notas desde' });
    const toInput = create('input', { className: 'form-control', type: 'date', 'aria-label': 'Notas hasta' });
    const clearButton = create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Quitar filtro' });
    const orderButton = create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Más recientes primero', 'aria-label': 'Cambiar el orden por fecha' });
    const filterBar = create('div', { className: 'records-filters', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end' } },
      [this.field('Desde', fromInput), this.field('Hasta', toInput), clearButton, orderButton]);
    const dateInput = create('input', { className: 'form-control', type: 'date', value: new Date().toISOString().slice(0, 10), 'aria-label': 'Fecha de la nota' });
    const titleInput = create('input', { className: 'form-control', type: 'text', maxLength: 120, 'aria-label': 'Título de la nota', placeholder: 'Título (opcional)' });
    const contentInput = create('textarea', { className: 'form-control', rows: 3, 'aria-label': 'Texto de la nota', placeholder: 'Escribe una nota' });
    const addButton = create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Añadir nota' });
    const form = create('div', { className: 'records-form', style: { display: 'grid', gap: '6px', marginTop: '8px' } }, [this.field('Fecha', dateInput), this.field('Título', titleInput), contentInput, addButton]);
    section.append(filterBar, list, form);
    container.appendChild(section);

    const reload = async () => {
      try {
        const notes = this.sortNotes(await config.load({ from: state.from, to: state.to }), state.order);
        if (!notes.length) {
          list.replaceChildren(state.from || state.to
            ? Feedback.empty({ message: Feedback.MESSAGES.noNotesInRange, actionLabel: 'Quitar filtro', onAction: () => clearButton.click() })
            : Feedback.empty({ message: 'No hay notas cargadas.', actionLabel: 'Añadir nota', onAction: () => contentInput.focus() }));
          return;
        }
        list.replaceChildren(...notes.map(note => this.noteRow(note, config, reload)));
      } catch (error) {
        list.replaceChildren(Feedback.error(`No se pudieron cargar las notas: ${error.message}`, { onRetry: reload }));
      }
    };
    fromInput.addEventListener('change', () => { state.from = fromInput.value; reload(); });
    toInput.addEventListener('change', () => { state.to = toInput.value; reload(); });
    clearButton.addEventListener('click', () => { state.from = ''; state.to = ''; fromInput.value = ''; toInput.value = ''; reload(); });
    orderButton.addEventListener('click', () => {
      state.order = state.order === 'desc' ? 'asc' : 'desc';
      orderButton.textContent = state.order === 'desc' ? 'Más recientes primero' : 'Más antiguas primero';
      reload();
    });
    addButton.addEventListener('click', async () => {
      if (!contentInput.value.trim()) { showToast('Escribe una nota', 'error'); return; }
      addButton.disabled = true;
      try {
        await config.create({ date: dateInput.value, title: titleInput.value.trim(), content: contentInput.value.trim() });
        contentInput.value = '';
        titleInput.value = '';
        await reload();
        showToast('Nota guardada');
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        addButton.disabled = false;
      }
    });
    await reload();
  },

  noteRow(note, config, onChanged) {
    const article = create('article', { className: 'card records-row', dataset: { noteId: note.id }, style: { padding: '10px', display: 'grid', gap: '4px' } });
    const show = () => {
      article.replaceChildren(
        create('strong', { textContent: this.noteHeading(note) }),
        create('small', { textContent: note.author || '', style: { color: 'var(--text-muted)' } }),
        create('p', { textContent: note.content, style: { whiteSpace: 'pre-wrap', margin: '0' } }),
        create('div', { style: { display: 'flex', gap: '6px' } }, [
          create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Editar', 'aria-label': 'Editar nota', dataset: { editNote: note.id }, onClick: edit }),
          create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Eliminar', 'aria-label': 'Eliminar nota', dataset: { deleteNote: note.id }, onClick: () => this.removeNote(note, onChanged) })
        ])
      );
    };
    const edit = () => {
      const date = create('input', { className: 'form-control', type: 'date', value: note.date, 'aria-label': 'Fecha de la nota' });
      const title = create('input', { className: 'form-control', type: 'text', maxLength: 120, value: note.title || '', 'aria-label': 'Título de la nota' });
      const content = create('textarea', { className: 'form-control', rows: 3, 'aria-label': 'Texto de la nota' });
      content.value = note.content;
      const save = create('button', { className: 'btn btn-primary btn-sm', type: 'button', textContent: 'Guardar nota', dataset: { saveNote: note.id } });
      save.addEventListener('click', async () => {
        if (!content.value.trim()) { showToast('Escribe una nota', 'error'); return; }
        save.disabled = true;
        try {
          await API.wealthNotes.update(note.id, { date: date.value, title: title.value.trim(), content: content.value.trim() });
          showToast('Nota actualizada');
          await onChanged();
        } catch (error) { showToast(error.message, 'error'); save.disabled = false; }
      });
      article.replaceChildren(this.field('Fecha', date), this.field('Título', title), content,
        create('div', { style: { display: 'flex', gap: '6px' } }, [save, create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Cancelar', onClick: show })]));
    };
    show();
    return article;
  },

  async removeNote(note, onChanged) {
    const { confirmed } = await ConfirmDialog.open({
      title: 'Eliminar nota', danger: true, confirmLabel: 'Eliminar nota',
      message: `Vas a eliminar la nota "${this.noteHeading(note) || 'sin título'}". Esta acción no se puede deshacer.`
    });
    if (!confirmed) return;
    try {
      await API.wealthNotes.remove(note.id);
      showToast('Nota eliminada');
      await onChanged();
    } catch (error) { showToast(error.message, 'error'); }
  },

  async preview(documentRecord) {
    const body = create('div', { style: { minHeight: '120px', maxHeight: '70vh', overflow: 'auto' } });
    try {
      if (documentRecord.contentType.startsWith('text/plain')) {
        const response = await fetch(API.documents.contentUrl(documentRecord.id), { credentials: 'same-origin' });
        if (!response.ok) throw new Error('No se pudo abrir el documento');
        const text = await response.text();
        body.appendChild(create('pre', { textContent: text, style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } }));
      } else if (documentRecord.contentType.startsWith('image/')) {
        body.appendChild(create('img', { src: API.documents.contentUrl(documentRecord.id), alt: documentRecord.title, style: { maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain' } }));
      } else {
        body.appendChild(create('iframe', { src: API.documents.contentUrl(documentRecord.id), title: documentRecord.title, sandbox: 'allow-same-origin', style: { width: '100%', height: '65vh', border: '0' } }));
      }
      Modal.push(documentRecord.title, body, { footer: create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() })]) });
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
};
