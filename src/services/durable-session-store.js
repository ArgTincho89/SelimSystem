const fs = require('fs');
const path = require('path');
const session = require('express-session');

const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000;

class DurableSessionStore extends session.Store {
  constructor(filePath, options = {}) {
    super();
    this.filePath = filePath;
    this.ttl = options.ttl || DEFAULT_TTL;
    this.sessions = this._read();
    this.writeSequence = 0;
    this._purgeExpired();
  }

  _read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid session store format');
      return parsed;
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw new Error(`Unable to read durable session store: ${error.message}`);
    }
  }

  _write() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.${process.pid}.${++this.writeSequence}.tmp`;
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(this.sessions), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temporaryPath, this.filePath);
    } catch (error) {
      try { fs.unlinkSync(temporaryPath); } catch {}
      throw error;
    }
  }

  _expiry(sessionData, now = Date.now()) {
    const cookie = sessionData?.cookie || {};
    const expiresAt = cookie.expires ? new Date(cookie.expires).getTime() : NaN;
    if (Number.isFinite(expiresAt)) return expiresAt;
    const maxAge = Number(cookie.originalMaxAge || cookie.maxAge);
    return now + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge : this.ttl);
  }

  _purgeExpired(now = Date.now()) {
    let changed = false;
    for (const [sid, entry] of Object.entries(this.sessions)) {
      if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) {
        delete this.sessions[sid];
        changed = true;
      }
    }
    if (changed) this._write();
  }

  get(sid, callback) {
    try {
      this._purgeExpired();
      const entry = this.sessions[sid];
      callback(null, entry ? entry.session : null);
    } catch (error) { callback(error); }
  }

  set(sid, sessionData, callback = () => {}) {
    try {
      this._purgeExpired();
      this.sessions[sid] = { session: sessionData, expiresAt: this._expiry(sessionData) };
      this._write();
      callback(null);
    } catch (error) { callback(error); }
  }

  touch(sid, sessionData, callback = () => {}) {
    try {
      this._purgeExpired();
      if (this.sessions[sid]) {
        this.sessions[sid].expiresAt = this._expiry(sessionData);
        this._write();
      }
      callback(null);
    } catch (error) { callback(error); }
  }

  destroy(sid, callback = () => {}) {
    try {
      if (Object.prototype.hasOwnProperty.call(this.sessions, sid)) {
        delete this.sessions[sid];
        this._write();
      }
      callback(null);
    } catch (error) { callback(error); }
  }

  clearExpired(callback = () => {}) {
    try {
      this._purgeExpired();
      callback(null);
    } catch (error) { callback(error); }
  }
}

DurableSessionStore.DEFAULT_TTL = DEFAULT_TTL;
module.exports = DurableSessionStore;
