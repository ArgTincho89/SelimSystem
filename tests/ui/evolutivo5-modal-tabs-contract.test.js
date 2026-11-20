const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 5 panel modal and tabs contract', () => {
  describe('Modal panel layout', () => {
    const { context, Modal } = loadBrowser(['js/components/modal.js'], ['Modal'], {});
    const root = context.document.createElement('div');
    context.document.registry['#modal-root'] = root;
    const dialogs = () => root.findAll(element => element.attributes.role === 'dialog');

    afterEach(() => { Modal.discard(); });

    it('keeps the default modal exactly as before when no layout is given', () => {
      Modal.show('Titulo', 'texto');
      const [dialog] = dialogs();
      expect(dialog.className).toBe('card fade-in');
      expect(dialog.style.maxWidth).toBe('658px');
      expect(dialog.style.overflowY).toBe('auto');
      expect(dialog.style.display).toBeUndefined();
      expect(root.findAll(element => element.className.includes('modal-panel'))).toHaveLength(0);
    });

    it('lays out a panel with a fixed header above a scrolling body and a fullscreen-on-mobile class', () => {
      const header = context.document.createElement('div');
      header.className = 'rental-header';
      const body = context.document.createElement('div');
      Modal.show('Titulo', body, { layout: 'panel', header, width: '1100px', widthScale: 1.3, fullscreenOnMobile: true });
      const [dialog] = dialogs();
      expect(dialog.className).toBe('card fade-in modal-panel modal-fullscreen-mobile');
      expect(dialog.style).toMatchObject({ maxWidth: '1430px', overflowY: 'hidden', display: 'flex', flexDirection: 'column' });
      const wrapper = dialog.children.find(child => child.className === 'modal-panel-header');
      const scroll = dialog.children.find(child => child.className === 'modal-panel-body');
      expect(wrapper.children[0]).toBe(header);
      expect(scroll.children[0]).toBe(body);
      expect(dialog.children.indexOf(wrapper)).toBeLessThan(dialog.children.indexOf(scroll));
      expect(root.find(element => element.className.includes('modal-overlay-fullscreen'))).toBeTruthy();
    });
  });

  describe('Tabs', () => {
    const { context, Tabs } = loadBrowser(['js/components/tabs.js'], ['Tabs']);
    const build = (render = id => () => { const element = context.document.createElement('p'); element.textContent = `contenido ${id}`; return element; }) => Tabs.create({
      tabs: [{ id: 'a', label: 'A', render: render('a') }, { id: 'b', label: 'B', render: render('b') }, { id: 'c', label: 'C', render: render('c') }],
      initial: 'a', label: 'Secciones'
    });
    const tab = (tabs, id) => tabs.element.find(element => element.attributes.role === 'tab' && element.dataset.tab === id);
    const panel = (tabs, id) => tabs.element.find(element => element.dataset.tabPanel === id);

    it('exposes tablist/tab/tabpanel roles with aria-selected', () => {
      const tabs = build();
      expect(tabs.element.find(element => element.attributes.role === 'tablist').attributes['aria-label']).toBe('Secciones');
      expect(tab(tabs, 'a').attributes['aria-selected']).toBe('true');
      expect(tab(tabs, 'b').attributes['aria-selected']).toBe('false');
      expect(panel(tabs, 'a').attributes.role).toBe('tabpanel');
      expect(panel(tabs, 'a').attributes['aria-labelledby']).toBe(tab(tabs, 'a').attributes.id);
      expect(panel(tabs, 'a').hidden).toBe(false);
      expect(panel(tabs, 'b').hidden).toBe(true);
    });

    it('selects on click, renders lazily and keeps rendered panels', async () => {
      const calls = [];
      const tabs = build(id => () => { calls.push(id); const element = context.document.createElement('p'); element.textContent = `c ${id}`; return element; });
      await Promise.resolve();
      expect(calls).toEqual(['a']);
      tab(tabs, 'b').click();
      await Promise.resolve(); await Promise.resolve();
      expect(tabs.current()).toBe('b');
      expect(panel(tabs, 'b').textContent).toBe('c b');
      tab(tabs, 'a').click();
      tab(tabs, 'b').click();
      await Promise.resolve();
      expect(calls).toEqual(['a', 'b']);
    });

    it('moves with the arrow keys, wrapping around, and focuses the new tab', () => {
      const tabs = build();
      const right = tab(tabs, 'a').dispatch('keydown', { key: 'ArrowRight' });
      expect(right.defaultPrevented).toBe(true);
      expect(tabs.current()).toBe('b');
      expect(context.document.activeElement).toBe(tab(tabs, 'b'));
      tab(tabs, 'b').dispatch('keydown', { key: 'ArrowRight' });
      tab(tabs, 'c').dispatch('keydown', { key: 'ArrowRight' });
      expect(tabs.current()).toBe('a');
      tab(tabs, 'a').dispatch('keydown', { key: 'ArrowLeft' });
      expect(tabs.current()).toBe('c');
    });

    it('refresh renders the panel again and select ignores unknown ids', async () => {
      let count = 0;
      const tabs = Tabs.create({ tabs: [{ id: 'a', label: 'A', render: () => { count += 1; const element = context.document.createElement('p'); element.textContent = `n${count}`; return element; } }] });
      await Promise.resolve();
      await tabs.refresh('a');
      expect(panel(tabs, 'a').textContent).toBe('n2');
      tabs.select('nope');
      expect(tabs.current()).toBe('a');
    });

    it('shows an alert when a panel fails to render', async () => {
      const tabs = Tabs.create({ tabs: [{ id: 'a', label: 'A', render: () => { throw new Error('falló'); } }] });
      await Promise.resolve(); await Promise.resolve();
      expect(panel(tabs, 'a').textContent).toContain('No se pudo cargar esta sección: falló');
    });
  });

  describe('Rental modal source', () => {
    const source = read('js/pages/rentalModal.js');

    it('has the five tabs with Resumen first and as default', () => {
      expect(source).toContain("[['resumen', 'Resumen'], ['periodos', 'Períodos'], ['contratos', 'Contratos'], ['documentos', 'Documentos'], ['notas', 'Notas']]");
      expect(source).toContain("initial: options.tab || 'resumen'");
    });

    it('opens as a wide panel with a fixed header and full screen on mobile', () => {
      expect(source).toContain("layout: 'panel', header: ctx.header, width: '1100px', widthScale: this.WIDTH_SCALE, fullscreenOnMobile: true");
      expect(source).toContain('WIDTH_SCALE: 1.3,');
    });

    it('has the global header actions, with "Finalizar alquiler" in red and separated', () => {
      ['Editar alquiler', 'Actualizar alquiler', 'Finalizar alquiler'].forEach(label => expect(source).toContain(`'${label}'`));
      expect(source).toContain("'btn btn-danger btn-sm rental-finish'");
      expect(source).toContain('rental-header-separator');
      expect(source).toContain('!ctx.readOnly && !ended');
    });

    it('shows the status with text and icon and the header facts', () => {
      expect(source).toContain('statusBadge(header.status)');
      ['Inquilino', 'Vigencia', 'Monto mensual vigente', 'Próximo cobro', 'Próximo vencimiento'].forEach(label => expect(source).toContain(`'${label}'`));
    });

    it('shows a card per modality with its actions, the collection progress and alerts only when they apply', () => {
      ['Composición del alquiler', 'Avance de cobros', 'períodos cobrados', 'cobrados', 'Alertas', 'Ver períodos', 'Registrar cobro'].forEach(text => expect(source).toContain(text));
      expect(source).toContain('if (alerts.length) root.appendChild(this.renderAlerts(ctx, alerts))');
      expect(source).toContain('role: \'progressbar\'');
    });

    it('does not contain the sections removed from the rental modal', () => {
      ['Gastos recuperables', 'Movimientos atribuidos', 'Reclamos de reintegro', 'Registrar gasto recuperable', 'Análisis económico', 'Evolución mensual', 'Historial de titularidad', 'Declarar nuevo alquiler'].forEach(text => expect(source).not.toContain(text));
      expect(source).not.toMatch(/\bconfirm\(|\bprompt\(|\balert\(/);
    });

    it('is registered with tabs.js in the page and the service worker', () => {
      ['/js/components/tabs.js', '/js/pages/rentalModal.js'].forEach(script => {
        expect(read('index.html')).toContain(script);
        expect(read('sw.js')).toContain(`'${script}'`);
      });
    });
  });
});
