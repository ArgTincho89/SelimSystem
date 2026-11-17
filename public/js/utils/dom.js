const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function create(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, val]) => {
    if (key === 'className') el.className = val;
    else if (key === 'textContent') el.textContent = val;
    else if (key === 'innerHTML') el.innerHTML = val;
    else if (key.startsWith('on')) {
      const eventName = key.slice(2).toLowerCase();
      el.addEventListener(eventName, guard(el, eventName, val));
    }
    else if (key === 'dataset') Object.assign(el.dataset, val);
    else if (key === 'style' && typeof val === 'object') Object.assign(el.style, val);
    else if (typeof val === 'boolean') {
      // Boolean attributes are presence-based: disabled="false" still disables.
      if (val) el.setAttribute(key, '');
    } else if (val === null || val === undefined) {
      // Absent attribute: never serialize "null"/"undefined".
    } else el.setAttribute(key, val);
  });
  children.forEach(child => {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  });
  return el;
}

// Duplicate-action guard. A click or submit handler that returns a promise puts its control in a busy state
// (disabled + aria-busy="true") until the promise settles, success or failure; a second click or submit meanwhile
// does nothing. Opt out with data-repeatable on the control (or on the form). Synchronous handlers are untouched.
// Every busy control is also released when a dialog opens (Modal.open calls releaseGuards): a handler that awaits
// a dialog must not keep its button locked while the user decides.
const activeGuards = new Set();
// Bumped on every dialog open, so a handler that opens a dialog before its first await is never locked.
let guardGeneration = 0;

function releaseGuards() {
  guardGeneration += 1;
  [...activeGuards].forEach(release => release());
}

function isRepeatable(el) {
  const marked = node => Boolean(node) && ((node.dataset && node.dataset.repeatable !== undefined) || (node.getAttribute && node.getAttribute('data-repeatable') !== null));
  return marked(el) || (el.tagName === 'FORM' ? false : marked(el.form));
}

function busyTargets(el) {
  if (el.tagName !== 'FORM') return [el];
  const buttons = typeof el.querySelectorAll === 'function' ? [...el.querySelectorAll('button[type="submit"], button:not([type])')] : [];
  return buttons;
}

function guard(el, event, handler) {
  const guarded = ['BUTTON', 'FORM', 'A'].includes(String(el && el.tagName).toUpperCase());
  if (typeof handler !== 'function' || !guarded || (event !== 'click' && event !== 'submit')) return handler;
  return function guardedHandler(evt) {
    if (isRepeatable(el)) return handler.call(this, evt);
    if (el.getAttribute('aria-busy') === 'true') {
      if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
      return undefined;
    }
    const generation = guardGeneration;
    const result = handler.call(this, evt);
    if (!result || typeof result.then !== 'function') return result;
    if (generation !== guardGeneration) return result;
    const targets = busyTargets(el).map(target => ({ target, wasDisabled: Boolean(target.disabled) }));
    el.setAttribute('aria-busy', 'true');
    targets.forEach(({ target }) => { target.disabled = true; target.setAttribute('aria-busy', 'true'); });
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeGuards.delete(release);
      el.setAttribute('aria-busy', 'false');
      targets.forEach(({ target, wasDisabled }) => { target.disabled = wasDisabled; target.setAttribute('aria-busy', 'false'); });
    };
    activeGuards.add(release);
    return result.finally(release);
  };
}

function on(el, event, handler, opts) {
  el.addEventListener(event, guard(el, event, handler), opts);
}

function showToast(message, type = 'success') {
  const existing = $('.toast');
  if (existing) existing.remove();

  const toast = create('div', { className: `toast ${type}`, textContent: message });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function clearElement(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
