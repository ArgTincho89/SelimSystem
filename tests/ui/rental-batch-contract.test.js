const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

// Minimal DOM stand-in: enough for Modal to build, stack and remove its layers.
function fakeDom() {
  class FakeElement {
    constructor(tag, props = {}) { this.tag = tag; this.props = props; this.children = []; this.parent = null; }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); this.parent = null; }
    focus() {}
    get isConnected() { return Boolean(this.parent); }
  }
  const root = new FakeElement('div', { id: 'modal-root' });
  const context = {
    HTMLElement: FakeElement,
    document: { activeElement: null },
    create: (tag, props = {}, children = []) => { const element = new FakeElement(tag, props); children.forEach(child => child && element.appendChild(child)); return element; },
    $: selector => (selector === '#modal-root' ? root : null),
    $$: () => [],
    on: () => {},
    clearElement: element => { element.children.forEach(child => { child.parent = null; }); element.children = []; }
  };
  vm.createContext(context);
  vm.runInContext(`${read('js/components/modal.js')}\nthis.Modal = Modal;`, context);
  return { Modal: context.Modal, root, FakeElement };
}

describe('Rental batch UI', () => {
  describe('stacked dialogs', () => {
    it('push keeps the dialog below, hide pops only the top one and runs its close hook', () => {
      const { Modal, root, FakeElement } = fakeDom();
      const closed = [];
      Modal.show('Declarar alquiler', new FakeElement('form'), { onClose: () => closed.push('declaration') });
      Modal.push('Nueva obligación', new FakeElement('form'), { onClose: () => closed.push('obligation') });
      expect(root.children).toHaveLength(2);
      expect(root.children[1].props.style.zIndex).toBeGreaterThan(root.children[0].props.style.zIndex);
      Modal.hide();
      expect(closed).toEqual(['obligation']);
      expect(root.children).toHaveLength(1);
      Modal.hide();
      expect(closed).toEqual(['obligation', 'declaration']);
      expect(root.children).toHaveLength(0);
    });

    it('show replaces every open dialog and push without a dialog behaves like show', () => {
      const { Modal, root, FakeElement } = fakeDom();
      const closed = [];
      Modal.push('Ver cobro', new FakeElement('div'), { onClose: () => closed.push('first') });
      expect(Modal.layers).toHaveLength(1);
      Modal.push('Otro', new FakeElement('div'), { onClose: () => closed.push('second') });
      Modal.show('Nuevo', new FakeElement('div'));
      expect(closed).toEqual(['second', 'first']);
      expect(root.children).toHaveLength(1);
    });
  });

  describe('collection period rule in Contratos y alquileres', () => {
    const loadAssets = () => {
      const context = { getToday: () => '2026-05-15' };
      vm.createContext(context);
      vm.runInContext(`${read('js/pages/assets.js')}\nthis.AssetsPage = AssetsPage;`, context);
      return context.AssetsPage;
    };

    it('uses the current month up to day 10 and the next month afterwards', () => {
      const page = loadAssets();
      expect(page.currentPeriodEnd('2026-05-10')).toBe('2026-05-31');
      expect(page.currentPeriodEnd('2026-05-11')).toBe('2026-06-30');
      expect(page.currentPeriodEnd('2026-12-20')).toBe('2027-01-31');
    });

    it('hides future installments unless they were already collected', () => {
      const page = loadAssets();
      const months = [
        { key: 'm5', date: '2026-05-01', parts: [{ paidMinor: 0 }] },
        { key: 'm6', date: '2026-06-01', parts: [{ paidMinor: 0 }] },
        { key: 'm7', date: '2026-07-01', parts: [{ paidMinor: 0 }] },
        { key: 'm8', date: '2026-08-01', parts: [{ paidMinor: 1000 }] }
      ];
      expect(page.visibleRentMonths(months).map(month => month.key)).toEqual(['m5', 'm6', 'm8']);
    });
  });

  describe('contracts', () => {
    const assets = read('js/pages/assets.js');

    it('renders Próximos vencimientos and red Pagos atrasados with their actions', () => {
      expect(assets).toContain("textContent: 'Próximos vencimientos'");
      expect(assets).toContain("textContent: 'Pagos atrasados', style: { color: 'var(--danger)' }");
      expect(assets).toContain('API.rentals.schedule(asset.id)');
      expect(assets).toContain('scheduleItem: item.id');
    });

    it('shows collected months as green bold "Cobrado" and "Deshacer cobro" outlined in red', () => {
      expect(assets).toContain('textContent: `Cobrado ${amountText}`');
      expect(assets).toContain("color: 'var(--income-color)', fontWeight: '700'");
      expect(assets).toContain("textContent: 'Deshacer cobro', dataset: { undoCollection: 'true' }, style: { border: '1px solid var(--danger)'");
    });

    it('opens the read-only collection detail ("Ver") from contracts and from the home transaction dialog', () => {
      expect(assets).toContain('async showCollectionView(id, options = {})');
      expect(read('js/api.js')).toContain('collectionView(id)');
      expect(read('js/pages/home.js')).toContain('AssetsPage.showCollectionView(tx.rentCollectionId, { stacked: true })');
    });

    it('stacks "Nueva obligación" over the declaration with a pending tenant link released on cancel', () => {
      const declaration = read('js/pages/rentalDeclaration.js');
      expect(declaration).toContain('ObligationsPage.showStackedCreate(');
      expect(declaration).toContain('pendingObligationToken: pendingToken');
      expect(declaration).toContain('API.obligations.releasePending(pendingToken)');
      expect(declaration).toContain('Declarar la finalización del alquiler vigente');
      const obligations = read('js/pages/obligations.js');
      expect(obligations).toContain('async showStackedCreate(context)');
      expect(obligations).toContain('data.pendingDeclarationToken = stacked.pendingDeclarationToken');
      expect(obligations).toContain('(stacked ? Modal.push : Modal.show)');
    });

    it('bumps the service worker cache', () => {
      expect(read('sw.js')).toContain("const CACHE_NAME = 'selimsystem-v40'");
    });
  });
});
