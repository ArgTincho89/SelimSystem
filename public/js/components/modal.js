// Dialogs. `show` replaces every open dialog; `push` opens a dialog on top of the current one (the
// dialogs below keep their state); `hide` closes the top dialog only. `options.onClose` runs when its
// dialog is closed or replaced.
const Modal = {
  previousFocus: null,
  layers: [],

  show(title, content, options = {}) {
    this.discard();
    this.previousFocus = document.activeElement;
    this.open(title, content, options);
  },

  push(title, content, options = {}) {
    if (!this.layers.length) return this.show(title, content, options);
    this.open(title, content, options);
  },

  open(title, content, options) {
    const root = $('#modal-root');
    const depth = this.layers.length;
    const titleId = depth ? `modal-title-${depth}` : 'modal-title';

    const overlay = create('div', {
      className: 'modal-overlay',
      dataset: { modalDepth: String(depth) },
      style: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 150 + depth * 10, padding: '16px'
      }
    });

    const modal = create('div', {
      className: 'card fade-in',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      tabindex: '-1',
      style: { width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto' }
    });

    const header = create('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }
    }, [
      create('h3', { id: titleId, textContent: title, style: { fontSize: 'var(--font-lg)', fontWeight: '700' } }),
      create('button', {
        type: 'button',
        'aria-label': 'Cerrar',
        textContent: '✕',
        style: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' },
        onClick: () => this.hide()
      })
    ]);

    modal.appendChild(header);

    if (typeof content === 'string') {
      const body = create('div', { innerHTML: content });
      modal.appendChild(body);
    } else if (content instanceof HTMLElement) {
      modal.appendChild(content);
    }

    if (options.footer) {
      const footer = create('div', {
        style: { marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }
      });
      if (typeof options.footer === 'string') {
        footer.innerHTML = options.footer;
      } else {
        footer.appendChild(options.footer);
      }
      modal.appendChild(footer);
    }

    overlay.appendChild(modal);
    on(modal, 'keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.hide();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = $$('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])', modal)
        .filter(element => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    on(overlay, 'click', (e) => {
      if (e.target === overlay) this.hide();
    });

    this.layers.push({ overlay, onClose: options.onClose || null, returnFocus: depth ? document.activeElement : null });
    root.appendChild(overlay);
    const firstFocusable = $('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', modal);
    (firstFocusable || modal).focus();
  },

  // Closes the top dialog; the one below (if any) becomes active again.
  hide() {
    const layer = this.layers.pop();
    if (layer) layer.overlay.remove();
    if (layer && layer.onClose) { try { layer.onClose(); } catch { /* a close hook never blocks closing */ } }
    if (this.layers.length) {
      if (layer?.returnFocus?.isConnected) layer.returnFocus.focus();
      return;
    }
    clearElement($('#modal-root'));
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
    this.previousFocus = null;
  },

  // Drops every open dialog (running their close hooks), without restoring focus.
  discard() {
    const layers = this.layers.splice(0);
    clearElement($('#modal-root'));
    layers.reverse().forEach(layer => { if (layer.onClose) { try { layer.onClose(); } catch { /* ignore */ } } });
  }
};
