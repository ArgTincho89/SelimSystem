// Floating "Ayuda" assistant: a WhatsApp-like, non-modal chat window over the app that walks the user through the
// static HelpTree with numbered options. HelpEngine drives the conversation, HelpHistory stores closed chats on
// the server (per account), with a retry buffer when the connection fails.
//
// Controls: "Historial" toggles the left panel of past chats; "+" starts a new conversation; "—" minimizes to a
// compact "Ayuda" bubble that keeps the conversation; "✕" closes, saving the chat to the history when the user
// interacted, so the next "Ayuda" opens a blank chat. Escape minimizes (it never discards anything). The window
// is resized by dragging its top-left corner (or with the arrow keys on that handle); the size is remembered per
// browser. On phone widths the window takes the whole screen.
const HelpAssistant = {
  SIZE_KEY: 'pate_help_size',
  MIN_WIDTH: 320,
  MIN_HEIGHT: 360,
  DEFAULT_WIDTH: 460,
  DEFAULT_HEIGHT: 600,
  WIDE_FROM: 620,
  KEY_STEP: 24,

  root: null,
  bubble: null,
  els: {},
  session: null,
  viewingId: null,
  historyOpen: null,
  minimized: false,
  historyStatus: 'idle',
  listening: false,
  seq: 0,

  // ───────────── Public actions ─────────────

  open() {
    this.ensureDom();
    const userId = this.userId();
    if (this.session && this.session.userId !== userId) this.archiveSession();
    if (!this.session) this.startSession();
    this.viewingId = null;
    this.minimized = false;
    this.root.hidden = false;
    this.bubble.hidden = true;
    this.applySize(this.loadSize());
    this.renderAll();
    this.focusInput();
    this.loadHistory();
  },

  minimize() {
    if (!this.root || this.root.hidden) return;
    this.minimized = true;
    this.root.hidden = true;
    this.bubble.hidden = false;
    this.bubble.focus();
  },

  restore() {
    if (!this.root) return this.open();
    this.minimized = false;
    this.root.hidden = false;
    this.bubble.hidden = true;
    this.renderAll();
    this.focusInput();
    return undefined;
  },

  close() {
    if (!this.root) return;
    this.archiveSession();
    this.viewingId = null;
    this.minimized = false;
    this.root.hidden = true;
    this.bubble.hidden = true;
    const navButton = typeof document !== 'undefined' ? document.querySelector('#navbar [data-action="help"]') : null;
    if (navButton) navButton.focus();
  },

  newChat() {
    this.archiveSession();
    this.startSession();
    this.viewingId = null;
    this.renderAll();
    this.focusInput();
  },

  // Sends a user answer (typed text or a chip key) to the engine and appends both sides of the exchange.
  send(raw, chipLabel = '') {
    if (!this.session || this.viewingId) return;
    const text = String(raw == null ? '' : raw).trim();
    if (!text) {
      this.focusInput();
      return;
    }
    const label = chipLabel || this.session.engine.labelFor(text);
    this.pushMessage({ from: 'user', text: label ? `${text} · ${label}` : text });
    const result = this.session.engine.choose(text);
    result.messages.forEach(message => this.pushMessage({ from: 'bot', ...message }));
    if (this.els.input) this.els.input.value = '';
    this.renderHistoryList();
    this.focusInput();
  },

  showPast(id) {
    const chat = HelpHistory.get(this.session ? this.session.userId : this.userId(), id);
    if (!chat) return;
    this.viewingId = id;
    if (!this.isWide()) this.historyOpen = false;
    this.renderAll();
    if (this.els.backButton) this.els.backButton.focus();
  },

  backToActive() {
    this.viewingId = null;
    if (!this.session) this.startSession();
    this.renderAll();
    this.focusInput();
  },

  toggleHistory() {
    this.historyOpen = !this.isHistoryOpen();
    this.renderLayout();
  },

  // ───────────── Session ─────────────

  userId() {
    return typeof App !== 'undefined' && App.user && App.user.id ? String(App.user.id) : '';
  },

  startSession() {
    const engine = HelpEngine.create(HelpTree);
    this.session = { id: `help-${Date.now()}-${++this.seq}`, userId: this.userId(), startedAt: new Date().toISOString(), engine, messages: [] };
    engine.start().forEach(message => this.session.messages.push({ from: 'bot', at: this.session.startedAt, ...message }));
  },

  // Saves the active chat on the server when the user interacted with it, then forgets it. A failed save keeps
  // the chat in HelpHistory's retry buffer, so it still shows in the history and is sent again on the next open.
  archiveSession() {
    if (!this.session) return;
    const chat = this.toChat(this.session);
    const { userId } = this.session;
    this.session = null;
    if (!HelpHistory.hasInteraction(chat)) return Promise.resolve();
    HelpHistory.addPending(userId, chat);
    return HelpHistory.save(userId, chat).then(() => this.renderHistoryList()).catch(() => {});
  },

  // Called before logging out: saves the active chat while the session is still valid, then hides the window.
  async closeBeforeLogout() {
    if (!this.root) return;
    const saving = this.archiveSession();
    this.close();
    try { await saving; } catch { /* the retry buffer keeps the chat */ }
  },

  // Sends pending chats again and refreshes the history from the server; failures only show a soft notice.
  async loadHistory() {
    const userId = this.session ? this.session.userId : this.userId();
    if (!userId) return;
    this.historyStatus = 'loading';
    this.renderHistoryList();
    try {
      await HelpHistory.flushPending(userId);
      await HelpHistory.list(userId);
      this.historyStatus = 'ready';
    } catch {
      this.historyStatus = 'error';
    }
    this.renderHistoryList();
  },

  toChat(session) {
    return { id: session.id, startedAt: session.startedAt, endedAt: new Date().toISOString(), title: session.engine.title(), messages: session.messages };
  },

  pushMessage(message) {
    const entry = { at: new Date().toISOString(), ...message };
    this.session.messages.push(entry);
    if (!this.viewingId) this.appendMessage(entry, true);
  },

  // ───────────── DOM ─────────────

  ensureDom() {
    if (this.root) return;
    const input = create('input', {
      className: 'form-control help-input', type: 'text', inputmode: 'numeric', autocomplete: 'off',
      placeholder: 'Escribí un número…', 'aria-label': 'Escribí el número de la opción', maxlength: '60'
    });
    const send = create('button', { className: 'btn btn-primary help-send', type: 'submit', textContent: 'Enviar', 'aria-label': 'Enviar respuesta', 'data-repeatable': 'true' });
    const form = create('form', { className: 'help-input-bar', 'data-repeatable': 'true' }, [input, send]);
    on(form, 'submit', event => { event.preventDefault(); this.send(input.value); });

    const messages = create('div', { className: 'help-messages', role: 'log', 'aria-live': 'polite', 'aria-label': 'Mensajes del asistente' });
    const bannerText = create('p', { className: 'help-readonly-text' });
    const backButton = create('button', { className: 'btn btn-secondary btn-sm', type: 'button', textContent: 'Volver a la conversación actual', onClick: () => this.backToActive() });
    const bannerNew = create('button', { className: 'btn btn-ghost btn-sm', type: 'button', textContent: 'Nueva conversación', onClick: () => this.newChat() });
    const banner = create('div', { className: 'help-readonly-banner', role: 'status', hidden: true }, [bannerText, create('div', { className: 'help-readonly-actions' }, [backButton, bannerNew])]);
    const chat = create('section', { className: 'help-chat', 'aria-label': 'Conversación' }, [banner, messages, form]);

    const historyList = create('ul', { className: 'help-history-list' });
    const history = create('aside', { className: 'help-history', id: 'help-history-panel', 'aria-label': 'Conversaciones anteriores' }, [
      create('h2', { className: 'help-history-title', textContent: 'Historial' }),
      historyList
    ]);

    const historyToggle = create('button', {
      className: 'help-icon-btn help-history-toggle', type: 'button', textContent: 'Historial',
      'aria-controls': 'help-history-panel', 'aria-expanded': 'false', 'aria-label': 'Mostrar u ocultar el historial de conversaciones',
      onClick: () => this.toggleHistory()
    });
    const header = create('header', { className: 'help-header' }, [
      historyToggle,
      create('div', { className: 'help-header-title' }, [
        create('strong', { textContent: 'Ayuda' }),
        create('span', { className: 'help-header-subtitle', textContent: 'Asistente guiado' })
      ]),
      create('div', { className: 'help-header-actions' }, [
        create('button', { className: 'help-icon-btn', type: 'button', textContent: '+', title: 'Nueva conversación', 'aria-label': 'Nueva conversación', onClick: () => this.newChat() }),
        create('button', { className: 'help-icon-btn', type: 'button', textContent: '—', title: 'Minimizar', 'aria-label': 'Minimizar el asistente', onClick: () => this.minimize() }),
        create('button', { className: 'help-icon-btn', type: 'button', textContent: '✕', title: 'Cerrar', 'aria-label': 'Cerrar el asistente', onClick: () => this.close() })
      ])
    ]);

    const handle = create('div', {
      className: 'help-resize-handle', role: 'separator', tabindex: '0', 'aria-orientation': 'horizontal',
      'aria-label': 'Cambiar el tamaño de la ventana: arrastrá o usá las flechas', title: 'Arrastrá para cambiar el tamaño'
    });
    this.bindResize(handle);

    const root = create('div', { className: 'help-window', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Asistente de ayuda', hidden: true }, [
      handle, header, create('div', { className: 'help-body' }, [history, chat])
    ]);
    on(root, 'keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      this.minimize();
    });

    const bubble = create('button', {
      className: 'help-bubble', type: 'button', hidden: true, 'aria-label': 'Abrir el asistente de ayuda (conversación minimizada)',
      onClick: () => this.restore()
    }, [create('span', { className: 'help-bubble-icon', 'aria-hidden': 'true', textContent: '?' }), create('span', { textContent: 'Ayuda' })]);

    document.body.appendChild(root);
    document.body.appendChild(bubble);
    this.root = root;
    this.bubble = bubble;
    this.els = { input, send, form, messages, banner, bannerText, backButton, history, historyList, historyToggle, handle };
    this.listen();
  },

  // Saves an interacted chat when the page goes away, and closes the window when the session ends (login screen).
  listen() {
    if (this.listening || typeof window === 'undefined' || !window.addEventListener) return;
    this.listening = true;
    // A request cannot be trusted to finish while the page unloads: the chat goes to the retry buffer instead.
    window.addEventListener('pagehide', () => {
      if (this.session) HelpHistory.addPending(this.session.userId, this.toChat(this.session));
    });
    window.addEventListener('hashchange', () => {
      const path = (window.location.hash.slice(1) || '/login').split('?')[0];
      if ((path === '/login' || path === '/reset-password') && this.root) this.close();
    });
  },

  renderAll() {
    this.renderLayout();
    this.renderHistoryList();
    this.renderConversation();
  },

  renderLayout() {
    if (!this.root) return;
    const open = this.isHistoryOpen();
    this.root.classList.toggle('help-wide', this.isWide());
    this.root.classList.toggle('help-history-open', open);
    this.els.historyToggle.setAttribute('aria-expanded', String(open));
  },

  renderHistoryList() {
    if (!this.els.historyList) return;
    const list = this.els.historyList;
    clearElement(list);
    if (this.session) {
      const current = create('button', {
        className: `help-history-item help-history-current${this.viewingId ? '' : ' active'}`, type: 'button',
        'aria-current': this.viewingId ? 'false' : 'true', onClick: () => this.backToActive()
      }, [
        create('span', { className: 'help-history-date', textContent: 'En curso' }),
        create('span', { className: 'help-history-name', textContent: 'Conversación actual' })
      ]);
      list.appendChild(create('li', {}, [current]));
    }
    const chats = HelpHistory.cached(this.session ? this.session.userId : this.userId());
    if (this.historyStatus === 'error') {
      list.appendChild(create('li', { className: 'help-history-notice', role: 'status', textContent: 'No se pudo cargar el historial. Podés seguir usando la ayuda: las conversaciones se guardan cuando vuelva la conexión.' }));
    } else if (this.historyStatus === 'loading' && !chats.length) {
      list.appendChild(create('li', { className: 'help-history-empty', role: 'status', textContent: 'Cargando historial…' }));
      return;
    }
    if (!chats.length) {
      if (this.historyStatus !== 'error') list.appendChild(create('li', { className: 'help-history-empty', textContent: 'Todavía no hay conversaciones guardadas.' }));
      return;
    }
    chats.forEach(chat => {
      const button = create('button', {
        className: `help-history-item${this.viewingId === chat.id ? ' active' : ''}`, type: 'button',
        'aria-current': this.viewingId === chat.id ? 'true' : 'false',
        'aria-label': `Conversación del ${this.dateTime(chat.startedAt)}: ${chat.title}`,
        onClick: () => this.showPast(chat.id)
      }, [
        create('span', { className: 'help-history-date', textContent: this.dateTime(chat.startedAt) }),
        create('span', { className: 'help-history-name', textContent: chat.title }),
        ...(chat.pending ? [create('span', { className: 'help-history-pending', textContent: 'Pendiente de guardar' })] : [])
      ]);
      list.appendChild(create('li', {}, [button]));
    });
  },

  renderConversation() {
    const { messages, banner, bannerText, input, send } = this.els;
    const past = this.viewingId ? HelpHistory.get(this.session ? this.session.userId : this.userId(), this.viewingId) : null;
    if (this.viewingId && !past) this.viewingId = null;
    const readOnly = Boolean(past);
    this.root.classList.toggle('help-readonly', readOnly);
    banner.hidden = !readOnly;
    bannerText.textContent = readOnly ? `Conversación del ${this.dateTime(past.startedAt)} — solo lectura` : '';
    input.disabled = readOnly;
    send.disabled = readOnly;
    input.placeholder = readOnly ? 'Conversación de solo lectura' : 'Escribí un número…';
    // Re-rendering a whole conversation must not be read out again by screen readers.
    messages.setAttribute('aria-live', 'off');
    clearElement(messages);
    const list = readOnly ? past.messages : (this.session ? this.session.messages : []);
    list.forEach(message => this.appendMessage(message, false));
    this.refreshChips(readOnly);
    messages.setAttribute('aria-live', readOnly ? 'off' : 'polite');
    this.scrollToEnd();
  },

  appendMessage(message, live) {
    const container = this.els.messages;
    if (!container) return;
    container.appendChild(this.messageNode(message));
    if (live) {
      this.refreshChips(false);
      this.scrollToEnd();
    }
  },

  // Only the options of the latest bot message are clickable; older ones (and past chats) stay as a record.
  refreshChips(readOnly) {
    const groups = $$('.help-options', this.els.messages);
    groups.forEach((group, index) => {
      const enabled = !readOnly && index === groups.length - 1;
      $$('button', group).forEach(button => { button.disabled = !enabled; });
    });
  },

  messageNode(message) {
    const isUser = message.from === 'user';
    const bubble = create('div', { className: `help-msg ${isUser ? 'help-msg-user' : 'help-msg-bot'}` });
    if (isUser || !message.type || message.type === 'text') {
      // Saved chats are plain text (one line per step or option): keep their line breaks.
      bubble.appendChild(create('p', { className: message.type ? 'help-msg-text' : 'help-msg-text help-msg-plain', textContent: message.text || '' }));
    } else if (message.type === 'menu') {
      if (message.nodeId !== HelpTree.ROOT_ID) bubble.appendChild(create('p', { className: 'help-msg-title', textContent: message.title }));
      if (message.text) bubble.appendChild(create('p', { className: 'help-msg-text', textContent: message.text }));
      bubble.appendChild(this.optionsNode(message.options));
    } else if (message.type === 'leaf') {
      bubble.appendChild(create('p', { className: 'help-msg-title', textContent: message.title }));
      bubble.appendChild(create('ol', { className: 'help-steps' }, (message.steps || []).map(step => create('li', { textContent: step }))));
      if (message.tip) bubble.appendChild(create('p', { className: 'help-tip' }, [create('strong', { textContent: 'Si algo no cierra: ' }), message.tip]));
      bubble.appendChild(create('p', { className: 'help-msg-text help-msg-hint', textContent: '¿Qué querés hacer ahora?' }));
      bubble.appendChild(this.optionsNode(message.options));
    }
    bubble.appendChild(create('span', { className: 'help-msg-time', textContent: this.time(message.at) }));
    return create('div', { className: `help-msg-row ${isUser ? 'help-msg-row-user' : 'help-msg-row-bot'}` }, [bubble]);
  },

  optionsNode(options = []) {
    return create('div', { className: 'help-options', role: 'group', 'aria-label': 'Opciones' }, options.map(option => create('button', {
      className: `help-option${option.nav ? ' help-option-nav' : ''}`, type: 'button', 'data-repeatable': 'true',
      'aria-label': `Opción ${option.key}: ${option.label}`,
      onClick: () => this.send(option.key, option.label)
    }, [create('span', { className: 'help-option-key', textContent: option.key }), create('span', { textContent: option.label })])));
  },

  scrollToEnd() {
    const container = this.els.messages;
    if (container && typeof container.scrollHeight === 'number') container.scrollTop = container.scrollHeight;
  },

  focusInput() {
    if (this.els.input && !this.els.input.disabled && this.root && !this.root.hidden) this.els.input.focus();
  },

  // ───────────── Layout and size ─────────────

  isWide() {
    const width = this.root && this.root.offsetWidth ? this.root.offsetWidth : this.loadSize().width;
    return width >= this.WIDE_FROM && !this.isPhone();
  },

  isPhone() {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 640px)').matches;
  },

  isHistoryOpen() {
    return this.historyOpen === null ? this.isWide() : this.historyOpen;
  },

  bounds() {
    const width = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1280;
    const height = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 800;
    return { maxWidth: Math.max(this.MIN_WIDTH, width - 32), maxHeight: Math.max(this.MIN_HEIGHT, height - 32) };
  },

  clampSize(size) {
    const { maxWidth, maxHeight } = this.bounds();
    const clamp = (value, min, max, fallback) => Math.round(Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback)));
    return {
      width: clamp(Number(size && size.width), this.MIN_WIDTH, maxWidth, this.DEFAULT_WIDTH),
      height: clamp(Number(size && size.height), this.MIN_HEIGHT, maxHeight, this.DEFAULT_HEIGHT)
    };
  },

  loadSize() {
    try {
      return this.clampSize(JSON.parse(localStorage.getItem(this.SIZE_KEY) || 'null') || {});
    } catch {
      return this.clampSize({});
    }
  },

  saveSize(size) {
    try { localStorage.setItem(this.SIZE_KEY, JSON.stringify(size)); } catch { /* the size only lasts this visit */ }
  },

  applySize(size) {
    if (!this.root || !this.root.style || typeof this.root.style.setProperty !== 'function') return;
    this.root.style.setProperty('--help-width', `${size.width}px`);
    this.root.style.setProperty('--help-height', `${size.height}px`);
    this.renderLayout();
  },

  currentSize() {
    if (this.root && this.root.offsetWidth) return { width: this.root.offsetWidth, height: this.root.offsetHeight };
    return this.loadSize();
  },

  // The window is anchored to the bottom-right corner, so dragging the top-left handle up/left makes it larger.
  bindResize(handle) {
    let start = null;
    const move = event => {
      if (!start) return;
      const size = this.clampSize({ width: start.width + (start.x - event.clientX), height: start.height + (start.y - event.clientY) });
      this.applySize(size);
      start.last = size;
    };
    const end = () => {
      if (!start) return;
      if (start.last) this.saveSize(start.last);
      start = null;
      this.root.classList.remove('help-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointerdown', event => {
      if (this.isPhone()) return;
      event.preventDefault();
      const size = this.currentSize();
      start = { x: event.clientX, y: event.clientY, width: size.width, height: size.height, last: null };
      this.root.classList.add('help-resizing');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    });
    handle.addEventListener('keydown', event => {
      const deltas = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      const delta = deltas[event.key];
      if (!delta) return;
      event.preventDefault();
      const size = this.currentSize();
      const next = this.clampSize({ width: size.width + delta[0] * this.KEY_STEP, height: size.height + delta[1] * this.KEY_STEP });
      this.applySize(next);
      this.saveSize(next);
    });
  },

  // ───────────── Formatting ─────────────

  dateTime(iso) {
    if (typeof formatDateTime === 'function') {
      const text = formatDateTime(iso);
      if (text) return text;
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const pad = value => String(value).padStart(2, '0');
    return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },

  time(iso) {
    const text = this.dateTime(iso);
    return text ? text.slice(-5) : '';
  }
};
