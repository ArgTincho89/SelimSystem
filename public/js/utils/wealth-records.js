const WealthRecords = {
  async renderPanel(container, targetType, targetId) {
    const section = create('section', { style: { borderTop: '1px solid var(--border-color)', marginTop: '16px', paddingTop: '12px' } });
    const title = create('h4', { textContent: 'Documentos' });
    const documentList = create('div', { style: { display: 'grid', gap: '8px', marginTop: '8px' } });
    const fileInput = create('input', { className: 'form-control', type: 'file', accept: '.pdf,.png,.jpg,.jpeg,.webp,.txt', 'aria-label': 'Seleccionar documento' });
    const uploadButton = create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Cargar documento' });
    const uploadStatus = create('small', { textContent: 'PDF, PNG, JPEG, WebP o texto UTF-8. Máximo 20 MiB. La vista previa de archivos de Office queda postergada.' });
    section.append(title, documentList, fileInput, uploadButton, uploadStatus);

    const loadDocuments = async () => {
      documentList.replaceChildren();
      const documents = await API.documents.list(targetType, targetId);
      if (!documents.length) documentList.appendChild(create('small', { textContent: 'Todavía no hay documentos.' }));
      documents.forEach(documentRecord => {
        const row = create('div', { className: 'card', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '10px' } });
        const details = create('div', {}, [
          create('strong', { textContent: documentRecord.title }),
          create('div', { textContent: `${documentRecord.contentType.split(';')[0]} · ${(documentRecord.size / 1024).toFixed(1)} KB`, style: { color: 'var(--text-muted)', fontSize: 'var(--font-sm)' } })
        ]);
        const actions = create('div', { style: { display: 'flex', gap: '6px' } });
        actions.appendChild(create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Ver', onClick: () => this.preview(documentRecord) }));
        actions.appendChild(create('a', { className: 'btn btn-ghost btn-sm', href: API.documents.contentUrl(documentRecord.id, true), textContent: 'Descargar' }));
        row.append(details, actions);
        documentList.appendChild(row);
      });
    };
    uploadButton.addEventListener('click', async () => {
      const file = fileInput.files[0];
      if (!file) return showToast('Selecciona un archivo', 'error');
      uploadButton.disabled = true;
      try {
        await API.documents.upload(targetType, targetId, file);
        fileInput.value = '';
        await loadDocuments();
        showToast('Documento cargado');
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        uploadButton.disabled = false;
      }
    });
    container.appendChild(section);

    const notesSection = create('section', { style: { borderTop: '1px solid var(--border-color)', marginTop: '16px', paddingTop: '12px' } });
    notesSection.appendChild(create('h4', { textContent: 'Notas' }));
    const notesList = create('div', { style: { display: 'grid', gap: '8px', marginTop: '8px' } });
    const noteDate = create('input', { className: 'form-control', type: 'date', value: new Date().toISOString().slice(0, 10), 'aria-label': 'Fecha de la nota' });
    const noteContent = create('textarea', { className: 'form-control', rows: 3, placeholder: 'Escribe una nota con fecha' });
    const addNoteButton = create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Añadir nota' });
    notesSection.append(notesList, noteDate, noteContent, addNoteButton);
    container.appendChild(notesSection);

    const loadNotes = async () => {
      notesList.replaceChildren();
      const notes = await API.wealthNotes.list(targetType, targetId);
      if (!notes.length) notesList.appendChild(create('small', { textContent: 'Todavía no hay notas.' }));
      notes.forEach(note => {
        const row = create('article', { className: 'card', style: { padding: '10px' } }, [
          create('small', { textContent: `${note.date} · ${note.author}`, style: { color: 'var(--text-muted)' } }),
          create('p', { textContent: note.content, style: { whiteSpace: 'pre-wrap', marginBottom: '0' } })
        ]);
        notesList.appendChild(row);
      });
    };
    addNoteButton.addEventListener('click', async () => {
      if (!noteContent.value.trim()) return showToast('Escribe una nota', 'error');
      addNoteButton.disabled = true;
      try {
        await API.wealthNotes.create({ targetType, targetId, date: noteDate.value, content: noteContent.value.trim() });
        noteContent.value = '';
        await loadNotes();
        showToast('Nota guardada');
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        addNoteButton.disabled = false;
      }
    });

    try {
      await Promise.all([loadDocuments(), loadNotes()]);
    } catch (error) {
      documentList.replaceChildren(create('small', { textContent: `No se pudieron cargar los archivos o notas: ${error.message}` }));
    }
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
        const image = create('img', { src: API.documents.contentUrl(documentRecord.id), alt: documentRecord.title, style: { maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain' } });
        body.appendChild(image);
      } else {
        const frame = create('iframe', { src: API.documents.contentUrl(documentRecord.id), title: documentRecord.title, sandbox: 'allow-same-origin', style: { width: '100%', height: '65vh', border: '0' } });
        body.appendChild(frame);
      }
      Modal.show(documentRecord.title, body, { footer: create('div', {}, [create('button', { className: 'btn btn-primary', type: 'button', textContent: 'Cerrar', onClick: () => Modal.hide() })]) });
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
};
