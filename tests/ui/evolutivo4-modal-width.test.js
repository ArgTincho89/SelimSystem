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

describe('Modal width option', () => {
  it('keeps the 440px default, 49.5% wider (658px)', () => {
    const { Modal, elements } = buildModal();
    Modal.show('T', 'x');
    const dialog = elements.find(el => el.props.role === 'dialog');
    expect(dialog.style.maxWidth).toBe('658px');
  });

  it('applies a custom width, 49.5% wider', () => {
    const { Modal, elements } = buildModal();
    Modal.show('T', 'x', { width: '760px' });
    const dialog = elements.find(el => el.props.role === 'dialog');
    expect(dialog.style.maxWidth).toBe('1136px');
  });

  it('still fires onClose', () => {
    const { Modal } = buildModal();
    const onClose = jest.fn();
    Modal.show('T', 'x', { width: '900px', onClose });
    Modal.hide();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
