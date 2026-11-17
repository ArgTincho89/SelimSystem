// Shared attachments UI: "Ver documento" opens a stacked dialog with the document rendered in an iframe and
// zoom in / zoom out / reset controls; "Descargar" downloads it. Also the optional file field used by every form
// that records a payment or an income, and the upload helper that links the files once the record exists.
// The content endpoint is restricted (strict CSP, no-store), so the file is fetched as a Blob and shown from an
// object URL; only the allowlisted types render inline.
const DocumentViewer = {
  MIME_ALLOWLIST: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'],
  ACCEPT: '.pdf,.png,.jpg,.jpeg,.webp,.txt',
  EXTENSIONS: ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt'],
  MAX_BYTES: 20 * 1024 * 1024,
  ZOOM: { min: 0.25, max: 4, step: 0.25 },

  // Normalized MIME type when it may render inline, '' otherwise (HTML and the like never render).
  mimeOf(contentType) {
    const base = String(contentType || '').split(';')[0].trim().toLowerCase();
    return this.MIME_ALLOWLIST.includes(base) ? base : '';
  },

  // Zoom factor kept inside the allowed range, rounded to two decimals.
  clampZoom(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 1;
    return Math.min(this.ZOOM.max, Math.max(this.ZOOM.min, Math.round(number * 100) / 100));
  },

  contentUrl(id, download = false) {
    if (typeof API !== 'undefined' && API.documents && typeof API.documents.contentUrl === 'function') return API.documents.contentUrl(id, download);
    return `/api/documents/${encodeURIComponent(id)}/content${download ? '?download=1' : ''}`;
  },

  nameOf(doc) {
    return (doc && (doc.title || doc.fileName)) || 'Documento';
  },

  // "Ver documento" and "Descargar" for one document.
  actions(doc, options = {}) {
    const name = this.nameOf(doc);
    return [
      create('button', {
        className: options.viewClass || 'btn btn-secondary btn-sm', type: 'button', textContent: options.viewLabel || 'Ver documento',
        dataset: { documentAction: 'view', documentId: doc.id }, 'aria-label': `Ver documento ${name}`, onClick: () => this.open(doc)
      }),
      create('a', {
        className: options.downloadClass || 'btn btn-ghost btn-sm', href: this.contentUrl(doc.id, true), textContent: options.downloadLabel || 'Descargar',
        dataset: { documentAction: 'download', documentId: doc.id }, 'aria-label': `Descargar ${name}`
      })
    ];
  },

  // One row per document (name + actions). `empty` is shown when there is nothing attached ('' shows nothing).
  list(documents = [], options = {}) {
    const box = create('div', { className: 'document-list', dataset: { documentList: 'true' }, style: { display: 'grid', gap: '6px' } });
    const items = Array.isArray(documents) ? documents.filter(Boolean) : [];
    if (!items.length) {
      const empty = options.empty === undefined ? 'Sin documentos adjuntos.' : options.empty;
      if (empty) box.appendChild(create('small', { className: 'text-muted', textContent: empty }));
      return box;
    }
    items.forEach(doc => box.appendChild(create('div', { className: 'document-row', dataset: { documentRow: doc.id }, style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, [
      create('span', { textContent: this.nameOf(doc) }),
      ...this.actions(doc, options)
    ])));
    return box;
  },

  // Loads the documents linked to `targets` (e.g. { transactionId }) into a list; failures leave the slot empty.
  async listInto(slot, targets, options = {}) {
    let documents = [];
    try { documents = await API.documents.listBy(targets); } catch { return []; }
    const rows = Array.isArray(documents) ? documents : [];
    if (rows.length || options.empty) slot.replaceChildren(this.list(rows, options));
    return rows;
  },

  // Client-side check that mirrors the server rules (type by extension and the 20 MiB limit). '' when valid.
  fileError(file) {
    if (!file) return '';
    const name = String(file.name || '').toLowerCase();
    if (!this.EXTENSIONS.some(extension => name.endsWith(extension))) return `${file.name}: formato no admitido (PDF, PNG, JPG, WEBP o TXT)`;
    if (Number(file.size) > this.MAX_BYTES) return `${file.name}: el archivo supera el límite de 20 MiB`;
    return '';
  },

  // Optional attachment field for payment / income forms.
  fileField(options = {}) {
    const input = create('input', {
      className: 'form-control', type: 'file', accept: this.ACCEPT, multiple: Boolean(options.multiple),
      'aria-label': options.label || 'Adjuntar comprobante', dataset: { attachmentInput: 'true' }
    });
    const element = create('label', { className: 'form-group attachment-field', style: { display: 'grid', gap: '4px', margin: 0 } }, [
      create('span', { textContent: options.label || 'Adjuntar comprobante (opcional)' }),
      input,
      create('small', { className: 'text-muted', textContent: 'PDF, imagen o texto, hasta 20 MiB.' })
    ]);
    const files = () => [...(input.files || [])];
    return { element, input, files, error: () => files().map(file => this.fileError(file)).find(Boolean) || '' };
  },

  // Uploads every file linked to `targets`. Never throws: returns what was uploaded and what failed.
  async uploadAll(files, targets) {
    const uploaded = [];
    const failed = [];
    for (const file of files || []) {
      try { uploaded.push(await API.documents.uploadTargets(targets, file)); }
      catch (error) { failed.push({ file, message: error.message }); }
    }
    return { uploaded, failed };
  },

  // Toast for a record saved while some attachment failed; the record itself is kept.
  reportFailures(failed, recordLabel) {
    if (!failed.length) return;
    showToast(`${recordLabel} se registró, pero no se pudo adjuntar: ${failed.map(item => `${item.file.name} (${item.message})`).join(', ')}`, 'error');
  },

  async open(doc) {
    const name = this.nameOf(doc);
    const viewer = create('div', { className: 'document-viewer', dataset: { documentViewer: doc.id } }, [create('div', { className: 'loading', textContent: 'Cargando documento...' })]);
    let objectUrl = null;
    let closed = false;
    const revoke = () => {
      closed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    };
    Modal.push(name, viewer, { width: '960px', onClose: revoke });
    const downloadLink = create('a', { className: 'btn btn-ghost btn-sm', href: this.contentUrl(doc.id, true), textContent: 'Descargar', dataset: { documentAction: 'download' } });
    try {
      const response = await fetch(this.contentUrl(doc.id), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('No se pudo cargar el documento');
      const raw = await response.blob();
      if (closed) return;
      const type = this.mimeOf(doc.contentType || doc.mimeType || raw.type);
      if (!type) {
        viewer.replaceChildren(create('p', { className: 'text-muted', textContent: 'Este tipo de archivo no se puede mostrar. Descargalo para verlo.' }), downloadLink);
        return;
      }
      objectUrl = URL.createObjectURL(new Blob([raw], { type }));
      viewer.replaceChildren(...this.zoomableFrame(objectUrl, name, downloadLink));
    } catch (error) {
      if (closed) return;
      viewer.replaceChildren(create('p', { className: 'text-muted', textContent: error.message }), downloadLink);
    }
  },

  // The iframe is scaled with a CSS transform inside a scrolling stage, so PDFs, images and text zoom alike.
  zoomableFrame(src, name, downloadLink) {
    let scale = 1;
    const frame = create('iframe', { className: 'document-viewer-frame', src, title: name });
    const sizer = create('div', { className: 'document-viewer-sizer' }, [frame]);
    const stage = create('div', { className: 'document-viewer-stage', dataset: { zoomStage: 'true' } }, [sizer]);
    const level = create('span', { className: 'document-viewer-level', 'aria-live': 'polite', textContent: '100%' });
    const apply = () => {
      const width = stage.clientWidth || 880;
      const height = stage.clientHeight || 560;
      frame.style.width = `${width}px`;
      frame.style.height = `${height}px`;
      frame.style.transform = `scale(${scale})`;
      sizer.style.width = `${Math.round(width * scale)}px`;
      sizer.style.height = `${Math.round(height * scale)}px`;
      level.textContent = `${Math.round(scale * 100)}%`;
    };
    const zoom = next => { scale = this.clampZoom(next); apply(); };
    const toolbar = create('div', { className: 'document-viewer-toolbar' }, [
      create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: '− Alejar', 'aria-label': 'Alejar', dataset: { zoom: 'out' }, onClick: () => zoom(scale - this.ZOOM.step) }),
      create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: '+ Acercar', 'aria-label': 'Acercar', dataset: { zoom: 'in' }, onClick: () => zoom(scale + this.ZOOM.step) }),
      create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Restablecer', 'aria-label': 'Restablecer zoom', dataset: { zoom: 'reset' }, onClick: () => zoom(1) }),
      level,
      downloadLink
    ]);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply); else apply();
    return [toolbar, stage];
  }
};

if (typeof module !== 'undefined') module.exports = { DocumentViewer };
