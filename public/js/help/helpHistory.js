// Saved conversations of the "Ayuda" assistant. The history lives on the server, per account
// (GET/POST /api/help-chats through API.helpChats), so it follows the user to any browser or device. This module is
// a thin async client with an in-memory cache per user.
//
// A chat that cannot be saved (no connection, server error) is never lost: it stays in a small retry buffer (memory
// plus localStorage, keyed per user) and is sent again by flushPending() on the next open. Pending chats are shown
// in the history meanwhile. Every localStorage access is wrapped in try/catch.
//
// Stored chats are flattened to { startedAt, endedAt, title, messages: [{ from: 'bot' | 'user', text, at }] }.
const HelpHistory = {
  PENDING_PREFIX: 'pate_help_pending_',
  MAX_MESSAGES: 500,
  MAX_TEXT: 4000,
  MAX_TITLE: 120,
  MAX_PENDING: 20,

  cache: {},
  memoryPending: {},

  // The API client; replaceable in tests.
  api() {
    return typeof API !== 'undefined' && API.helpChats ? API.helpChats : null;
  },

  storage() {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      return null;
    }
  },

  hasInteraction(chat) {
    return Boolean(chat && Array.isArray(chat.messages) && chat.messages.some(message => message && message.from === 'user'));
  },

  // One plain-text line per bot message: menus list their options, leaves their numbered steps and tip.
  flattenText(message) {
    if (!message) return '';
    if (message.from === 'user' || !message.type || message.type === 'text') return String(message.text || '');
    const lines = [];
    if (message.title && message.nodeId !== 'root') lines.push(message.title);
    if (message.type === 'menu' && message.text) lines.push(message.text);
    if (message.type === 'leaf') {
      (message.steps || []).forEach((step, index) => lines.push(`${index + 1}. ${step}`));
      if (message.tip) lines.push(`Si algo no cierra: ${message.tip}`);
    }
    (message.options || []).forEach(option => lines.push(`${option.key} · ${option.label}`));
    return lines.join('\n');
  },

  toPayload(chat) {
    const messages = (chat.messages || []).slice(-this.MAX_MESSAGES).map(message => ({
      from: message.from === 'user' ? 'user' : 'bot',
      text: this.flattenText(message).slice(0, this.MAX_TEXT),
      at: message.at || chat.startedAt
    }));
    return {
      startedAt: chat.startedAt,
      endedAt: chat.endedAt || new Date().toISOString(),
      title: String(chat.title || 'Conversación').slice(0, this.MAX_TITLE),
      messages
    };
  },

  sort(chats) {
    const time = chat => {
      const value = Date.parse(chat && chat.startedAt);
      return Number.isNaN(value) ? 0 : value;
    };
    return chats.slice().sort((a, b) => time(b) - time(a) || String(b.endedAt || '').localeCompare(String(a.endedAt || '')));
  },

  // ───── Retry buffer ─────

  pendingKey(userId) {
    return `${this.PENDING_PREFIX}${userId}`;
  },

  readPending(userId) {
    const inMemory = this.memoryPending[userId] || [];
    const storage = this.storage();
    let stored = [];
    if (storage) {
      try {
        const parsed = JSON.parse(storage.getItem(this.pendingKey(userId)) || '[]');
        stored = Array.isArray(parsed) ? parsed.filter(chat => chat && typeof chat.id === 'string' && Array.isArray(chat.messages)) : [];
      } catch {
        stored = [];
      }
    }
    const byId = new Map();
    [...stored, ...inMemory].forEach(chat => byId.set(chat.id, chat));
    return [...byId.values()];
  },

  writePending(userId, chats) {
    const kept = this.sort(chats).slice(0, this.MAX_PENDING);
    this.memoryPending[userId] = kept;
    const storage = this.storage();
    if (!storage) return;
    try {
      if (kept.length) storage.setItem(this.pendingKey(userId), JSON.stringify(kept));
      else storage.removeItem(this.pendingKey(userId));
    } catch { /* the in-memory copy still retries during this visit */ }
  },

  // Keeps an interacted chat for a later retry (also used when the page is closing).
  addPending(userId, chat) {
    if (!userId || !this.hasInteraction(chat)) return false;
    const entry = { id: String(chat.id), pending: true, ...this.toPayload(chat) };
    this.writePending(userId, [entry, ...this.readPending(userId).filter(item => item.id !== entry.id)]);
    return true;
  },

  // ───── Server ─────

  // Fetches the user's chats; pending ones are merged in. Throws when the server cannot be reached (the cache and
  // the pending chats remain available through cached()).
  async list(userId) {
    if (!userId) return [];
    const api = this.api();
    if (!api) throw new Error('El historial no está disponible');
    const chats = await api.list();
    this.cache[userId] = Array.isArray(chats) ? chats.filter(chat => chat && typeof chat.id === 'string' && Array.isArray(chat.messages)) : [];
    return this.cached(userId);
  },

  cached(userId) {
    if (!userId) return [];
    return this.sort([...this.readPending(userId), ...(this.cache[userId] || [])]);
  },

  get(userId, id) {
    return this.cached(userId).find(chat => chat.id === id) || null;
  },

  // Saves a closed chat. Resolves true when the server stored it; false when there was nothing to save or the
  // request failed (then the chat waits in the retry buffer). Never rejects.
  async save(userId, chat) {
    if (!userId || !this.hasInteraction(chat)) return false;
    const api = this.api();
    try {
      if (!api) throw new Error('El historial no está disponible');
      const saved = await api.save(this.toPayload(chat));
      this.cache[userId] = [saved, ...(this.cache[userId] || []).filter(item => item.id !== saved.id)];
      this.writePending(userId, this.readPending(userId).filter(item => item.id !== String(chat.id)));
      return true;
    } catch (error) {
      if (!this.isPermanent(error)) this.addPending(userId, chat);
      return false;
    }
  },

  // A rejected payload (400/413) will never be accepted: retrying it would only fill the buffer.
  isPermanent(error) {
    return Boolean(error && (error.status === 400 || error.status === 413));
  },

  // Sends every pending chat again; returns how many are still pending.
  async flushPending(userId) {
    if (!userId) return 0;
    const api = this.api();
    const pending = this.readPending(userId);
    if (!api || !pending.length) return pending.length;
    const remaining = [];
    for (const chat of pending) {
      try {
        const { id, pending: flag, ...payload } = chat;
        const saved = await api.save(payload);
        this.cache[userId] = [saved, ...(this.cache[userId] || []).filter(item => item.id !== saved.id)];
      } catch (error) {
        if (!this.isPermanent(error)) remaining.push(chat);
      }
    }
    this.writePending(userId, remaining);
    return remaining.length;
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = HelpHistory;
