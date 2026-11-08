const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function create(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([key, val]) => {
    if (key === 'className') el.className = val;
    else if (key === 'textContent') el.textContent = val;
    else if (key === 'innerHTML') el.innerHTML = val;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), val);
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

function on(el, event, handler, opts) {
  el.addEventListener(event, handler, opts);
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
