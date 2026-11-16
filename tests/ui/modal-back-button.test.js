const fs = require('fs');
const path = require('path');

const modalSource = fs.readFileSync(path.join(__dirname, '../../public/js/components/modal.js'), 'utf8');

function buildModal() {
  const elements = [];
  const makeEl = (tag, props = {}, children = []) => {
    const el = { tag, props, style: props.style || {}, children: [], remove() {}, appendChild(child) { this.children.push(child); return child; }, focus() {} };
    children.forEach(child => el.appendChild(child));
    elements.push(el);
    return el;
  };
  const root = makeEl('div');
  const HTMLElementStub = function () {};
  const factory = new Function('create', '$', '$$', 'on', 'clearElement', 'document', 'HTMLElement',
    `${modalSource}\nreturn Modal;`);
  const Modal = factory(
    (tag, props, children) => makeEl(tag, props, children || []),
    () => root,
    () => [],
    () => {},
    () => {},
    { activeElement: null },
    HTMLElementStub
  );
  return { Modal, elements };
}


const backButtons = elements => elements.filter(el => el.props.className && el.props.className.includes('modal-back'));

describe('Modal back button', () => {
  it('does not show "Atrás" on a top-level dialog', () => {
    const { Modal, elements } = buildModal();
    Modal.show('Ficha', 'x');
    expect(backButtons(elements)).toHaveLength(0);
  });

  it('shows "← Atrás" on a stacked dialog and returns to the dialog below', () => {
    const { Modal, elements } = buildModal();
    Modal.show('Alquiler', 'x');
    Modal.push('Período', 'y');
    const [back] = backButtons(elements);
    expect(back.props.textContent).toBe('← Atrás');
    back.props.onClick();
    expect(Modal.layers).toHaveLength(1);
  });
});

describe('Table grid lines', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../public/css/components.css'), 'utf8');
  it('draws thin borders around every data table and history table cell', () => {
    expect(css).toMatch(/\.data-table th,\s*\.data-table td \{[^}]*border: 1px solid var\(--border-color\)/);
    expect(css).toMatch(/\.asset-history-table th,\s*\.asset-history-table td \{[^}]*border: 1px solid var\(--border-color\)/);
  });
});
