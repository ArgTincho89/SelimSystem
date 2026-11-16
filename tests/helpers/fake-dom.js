const fs = require('fs');
const path = require('path');
const vm = require('vm');

// A tiny DOM for the UI contract tests (the Jest environment is `node`, there is no jsdom). It implements
// only what the shared helpers (`create`, `on`) and the components under test use.
class FakeTextNode {
  constructor(text) { this.nodeType = 3; this.textContent = String(text); this.dataset = {}; this.attributes = {}; this.className = ''; this.tagName = '#text'; }
}

class FakeElement {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.tabIndex = 0;
    this.className = '';
    this._text = '';
    this.parentNode = null;
    const element = this;
    this.classList = {
      toggle(name, force) {
        const names = new Set(element.className.split(' ').filter(Boolean));
        const on = force === undefined ? !names.has(name) : force;
        if (on) names.add(name); else names.delete(name);
        element.className = [...names].join(' ');
      },
      contains: name => element.className.split(' ').includes(name)
    };
  }

  get textContent() {
    return this._text + this.children.map(child => child.textContent).join('');
  }

  set textContent(value) { this._text = String(value); this.children = []; }

  get id() { return this.attributes.id || ''; }

  set id(value) { this.attributes.id = String(value); }

  setAttribute(name, value) { this.attributes[name] = String(value); }

  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }

  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }

  append(...nodes) { nodes.forEach(node => this.appendChild(typeof node === 'string' ? new FakeTextNode(node) : node)); }

  prepend(node) { node.parentNode = this; this.children.unshift(node); }

  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }

  addEventListener(event, handler) { (this.listeners[event] = this.listeners[event] || []).push(handler); }

  dispatch(event, payload = {}) {
    const info = { type: event, target: this, preventDefault() { info.defaultPrevented = true; }, stopPropagation() {}, ...payload };
    (this.listeners[event] || []).forEach(handler => handler(info));
    return info;
  }

  click() { return this.dispatch('click'); }

  focus() { FakeElement.active = this; }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }

  get firstChild() { return this.children[0] || null; }

  removeChild(child) { child.remove(); return child; }

  querySelector() { return null; }

  querySelectorAll() { return []; }

  find(predicate) {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child.find ? child.find(predicate) : (predicate(child) ? child : null);
      if (found) return found;
    }
    return null;
  }

  findAll(predicate, found = []) {
    if (predicate(this)) found.push(this);
    this.children.forEach(child => { if (child.findAll) child.findAll(predicate, found); });
    return found;
  }
}

FakeElement.active = null;

function fakeDocument() {
  return {
    createElement: tag => new FakeElement(tag),
    createTextNode: text => new FakeTextNode(text),
    registry: {},
    querySelector(selector) { return this.registry[selector] || null; },
    querySelectorAll() { return []; },
    get activeElement() { return FakeElement.active; },
    body: new FakeElement('body')
  };
}

const publicDir = path.join(__dirname, '../../public');

// Runs browser scripts from `public/` in one vm context with the fake document. Returns the context and the
// requested top-level bindings (`const Tabs = ...` is not a property of the context, so it is read back).
function loadBrowser(files, names = [], globals = {}) {
  FakeElement.active = null;
  const context = {
    document: fakeDocument(), localStorage: { getItem: () => null }, Intl, Date, Math, JSON, Object, Set, Map, String, Array, Number, Promise, setTimeout, clearTimeout,
    console, HTMLElement: FakeElement, ...globals
  };
  vm.createContext(context);
  vm.runInContext(['js/utils/dom.js', ...files].map(file => fs.readFileSync(path.join(publicDir, file), 'utf8')).join('\n'), context);
  const exported = names.length ? vm.runInContext(`({ ${names.join(', ')} })`, context) : {};
  return { context, ...exported };
}

module.exports = { FakeElement, FakeTextNode, fakeDocument, loadBrowser };
