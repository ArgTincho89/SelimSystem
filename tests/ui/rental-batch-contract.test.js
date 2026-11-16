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

  describe('unified periods table (replaces "Contratos y alquileres" months and the schedule)', () => {
    const loadPeriods = () => {
      const context = { getToday: () => '2026-05-15', localStorage: { getItem: () => null } };
      vm.createContext(context);
      vm.runInContext(`${read('js/utils/format.js')}\n${read('js/pages/rentalPeriods.js')}\nthis.RentalPeriods = RentalPeriods;`, context);
      return context.RentalPeriods;
    };
    const period = (key, state, extra = {}) => ({ period: key, state, parts: [{ modality: 'locacion', currencyCode: 'ARS', expected: 100, state }], obligations: [], ...extra });

    it('shows one row per month and filters by state, modality and month', () => {
      const page = loadPeriods();
      const rows = [period('2026-04', 'collected'), period('2026-05', 'overdue'), period('2026-06', 'pending')];
      expect(page.applyFilters(rows, {}).map(item => item.period)).toEqual(['2026-04', '2026-05', '2026-06']);
      expect(page.applyFilters(rows, { status: 'overdue' }).map(item => item.period)).toEqual(['2026-05']);
      expect(page.applyFilters(rows, { month: '06' }).map(item => item.period)).toEqual(['2026-06']);
      expect(page.applyFilters(rows, { modality: 'comodato' })).toEqual([]);
    });
  });

  describe('contracts', () => {
    const assets = read('js/pages/assets.js');
    const periods = read('js/pages/rentalPeriods.js');

    it('no longer renders the separate Próximos vencimientos / Pagos atrasados lists (the Períodos tab unifies them)', () => {
      ['Pagos atrasados', 'Meses de alquiler', 'Contratos y alquileres', 'scheduleItem'].forEach(text => expect(assets + periods).not.toContain(text));
      expect(periods).not.toContain('Próximos vencimientos');
      expect(periods).toContain("caption: 'Períodos del alquiler'");
    });

    it('shows collected months with the "Cobrado" status badge and "Deshacer cobro" outlined in red', () => {
      expect(periods).toContain("textContent: 'Deshacer cobro', dataset: { undoCollection: 'true' }, style: { border: '1px solid var(--danger)'");
      expect(periods).toContain('statusBadge(state)');
    });

    it('opens the read-only collection detail ("Ver") from contracts and from the home transaction dialog', () => {
      expect(periods).toContain('async showCollectionView(id, options = {})');
      expect(assets).toContain('return RentalPeriods.showCollectionView(id, options);');
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
      expect(Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(40);
    });
  });
});
