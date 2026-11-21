// Dialogs. `show` replaces every open dialog; `push` opens a dialog on top of the current one (the
// dialogs below keep their state); `hide` closes the top dialog only. `options.onClose` runs when its
// dialog is closed or replaced. `options.layout: 'panel'` keeps `options.header` (an element) fixed above a
// scrolling body; with `options.fullscreenOnMobile` the dialog fills the screen on phones. `options.widthScale`
// replaces the global width factor for one dialog (only "Ver alquiler" uses it, to keep its size).
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

  // Every dialog is 49.5% wider than its requested width (30% and then 15% more: 1.3 × 1.15; default 440px → 658px);
  // still capped by the viewport through `width: 100%`. Non-pixel widths (e.g. '90vw') are used as given. A dialog
  // may pass its own factor (`options.widthScale`, e.g. 1.3 for "Ver alquiler": 1100px → 1430px).
  WIDTH_SCALE: 1.495,
  scaledWidth(width, scale = this.WIDTH_SCALE) {
    const factor = Number.isFinite(scale) && scale > 0 ? scale : this.WIDTH_SCALE;
    const match = /^(\d+(?:\.\d+)?)px$/.exec(String(width || '440px').trim());
    return match ? `${Math.round(Number(match[1]) * factor)}px` : width;
  },

  open(title, content, options) {
    // A handler waiting on this dialog must not keep its button locked (see guard in utils/dom.js).
    if (typeof releaseGuards === 'function') releaseGuards();
    const root = $('#modal-root');
    const depth = this.layers.length;
    const titleId = depth ? `modal-title-${depth}` : 'modal-title';

    const panel = options.layout === 'panel';
    const overlay = create('div', {
      className: panel && options.fullscreenOnMobile ? 'modal-overlay modal-overlay-fullscreen' : 'modal-overlay',
      dataset: { modalDepth: String(depth) },
      style: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 150 + depth * 10, padding: '16px'
      }
    });

    const modal = create('div', {
      className: panel ? `card fade-in modal-panel${options.fullscreenOnMobile ? ' modal-fullscreen-mobile' : ''}` : 'card fade-in',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      tabindex: '-1',
      style: panel
        ? { width: '100%', maxWidth: this.scaledWidth(options.width, options.widthScale), maxHeight: '92vh', overflowY: 'hidden', display: 'flex', flexDirection: 'column' }
        : { width: '100%', maxWidth: this.scaledWidth(options.width, options.widthScale), maxHeight: '90vh', overflowY: 'auto' }
    });

    // A dialog opened on top of another one gets a top-left "Atrás" button that returns to the dialog below.
    const titleGroup = create('div', { className: 'modal-title-group' }, [
      ...(depth ? [create('button', {
        type: 'button',
        className: 'btn btn-ghost btn-sm modal-back',
        'aria-label': 'Volver a la ventana anterior',
        textContent: '← Atrás',
        onClick: () => this.hide()
      })] : []),
      create('h3', { id: titleId, textContent: title, style: { fontSize: 'var(--font-lg)', fontWeight: '700' } })
    ]);
    const header = create('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }
    }, [
      titleGroup,
      create('button', {
        type: 'button',
        'aria-label': 'Cerrar',
        textContent: '✕',
        style: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' },
        onClick: () => this.hide()
      })
    ]);

    modal.appendChild(header);

    // Panel layout: the header element stays visible while only the body scrolls.
    let bodyHost = modal;
    if (panel) {
      if (options.header instanceof HTMLElement) modal.appendChild(create('div', { className: 'modal-panel-header' }, [options.header]));
      bodyHost = create('div', { className: 'modal-panel-body' });
      modal.appendChild(bodyHost);
    }

    if (typeof content === 'string') {
      const body = create('div', { innerHTML: content });
      bodyHost.appendChild(body);
    } else if (content instanceof HTMLElement) {
      bodyHost.appendChild(content);
    }

    if (options.footer) {
      const footer = create('div', {
        ...(panel ? { className: 'modal-panel-footer' } : {}),
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
    // Dialogs close only through their own close (X) or action buttons: no Escape, no backdrop click.
    on(modal, 'keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
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
