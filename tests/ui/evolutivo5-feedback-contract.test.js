const fs = require('fs');
const path = require('path');
const { FakeElement, loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const NEW_FILES = ['js/components/feedback.js', 'js/components/tabs.js', 'js/components/dataTable.js', 'js/components/confirmDialog.js', 'js/pages/assetHistory.js', 'js/pages/rentalModal.js', 'js/pages/rentalPeriods.js', 'js/utils/wealth-records.js'];

describe('Evolutivo 5 feedback component and accessibility contract', () => {
  const { Feedback } = loadBrowser([], ['Feedback']);

  it('renders a loading state announced politely', () => {
    const element = Feedback.loading('Cargando documentos...');
    expect(element.textContent).toBe('Cargando documentos...');
    expect(element.attributes.role).toBe('status');
    expect(element.attributes['aria-live']).toBe('polite');
  });

  it('renders an empty state with a message, an optional hint and a suggested action', () => {
    const onAction = jest.fn();
    const element = Feedback.empty({ message: 'No hay documentos cargados.', hint: 'Cargá el primero.', actionLabel: 'Cargar documento', onAction });
    expect(element.textContent).toContain('No hay documentos cargados.');
    expect(element.textContent).toContain('Cargá el primero.');
    const button = element.find(item => item.tagName === 'BUTTON');
    expect(button.textContent).toBe('Cargar documento');
    button.click();
    expect(onAction).toHaveBeenCalled();
    expect(Feedback.empty({ message: 'Sin acción' }).find(item => item.tagName === 'BUTTON')).toBeNull();
  });

  it('renders an error state as an alert with an optional retry', () => {
    const onRetry = jest.fn();
    const element = Feedback.error('No se pudieron cargar las notas.', { onRetry });
    expect(element.attributes.role).toBe('alert');
    expect(element.textContent).toContain('No se pudieron cargar las notas.');
    element.find(item => item.tagName === 'BUTTON').click();
    expect(onRetry).toHaveBeenCalled();
    expect(Feedback.error('Solo texto').find(item => item.tagName === 'BUTTON')).toBeNull();
  });

  it('holds the required empty-state messages', () => {
    expect(Feedback.MESSAGES).toEqual({
      noActiveRental: 'Este inmueble no tiene un alquiler activo.', noPendingPeriods: 'No hay períodos pendientes de cobro.',
      noTenantObligations: 'No hay obligaciones a cargo del inquilino.', noDocuments: 'No hay documentos cargados.',
      noNotesInRange: 'No hay notas en este rango de fechas.', noMovements: 'No hay movimientos en este período.'
    });
    expect(read('js/pages/alerts.js')).toContain('No hay obligaciones a cargo del inquilino.');
  });

  it('is adopted by the redesigned pages and registered in index.html and the service worker', () => {
    ['js/utils/wealth-records.js', 'js/pages/assetHistory.js', 'js/pages/rentalPeriods.js', 'js/pages/alerts.js'].forEach(file => expect(read(file)).toContain('Feedback.'));
    expect(read('index.html')).toContain('/js/components/feedback.js');
    expect(read('sw.js')).toContain("'/js/components/feedback.js'");
  });

  it('never uses the native confirm dialog in the redesigned files or the obligation flows', () => {
    [...NEW_FILES, 'js/pages/obligations.js', 'js/pages/alerts.js', 'js/pages/home.js', 'js/components/transactionForm.js'].forEach(file => {
      expect(read(file)).not.toMatch(/(^|[^.\w])confirm\(/m);
      expect(read(file)).not.toContain('window.confirm');
    });
  });

  it('uses the shared confirmation for every destructive obligation action', () => {
    const obligations = read('js/pages/obligations.js');
    expect(obligations).toContain("title: 'Eliminar obligación', danger: true");
    expect(obligations).toContain("title: 'Anular resolución', confirmLabel: 'Anular resolución'");
    expect(obligations).toContain("title: 'Editar obligación con pagos'");
    expect(read('js/components/transactionForm.js')).toContain("title: 'Eliminar medio de pago', danger: true");
    expect(read('js/pages/rentalPeriods.js')).toContain("title: 'Cancelar período'");
  });

  it('gives the interactive controls of the new blocks accessible names', () => {
    const records = read('js/utils/wealth-records.js');
    ['Buscar documento por nombre', 'Filtrar por tipo', 'Seleccionar documento', 'Fecha de la nota', 'Texto de la nota'].forEach(label => expect(records).toContain(label));
    expect(read('js/pages/rentalPeriods.js')).toContain("'aria-label': 'Buscar por proveedor o texto'");
    expect(read('js/components/tabs.js')).toContain('role: \'tablist\'');
  });

  it('keeps the status badge with text and icon (not color alone)', () => {
    const { statusBadge } = loadBrowser(['js/utils/format.js'], ['statusBadge']);
    ['pending', 'overdue', 'paid', 'collected', 'reverted'].forEach(state => {
      const info = statusBadge(state);
      expect(info.label).toBeTruthy();
      expect(info.icon).toBeTruthy();
    });
  });

  it('has a responsive pass for phones (cards instead of tables, full-width filters)', () => {
    const css = read('css/components.css');
    expect(css).toContain('.asset-history-table td[data-label]::before');
    expect(css).toContain('.records-filters > *');
    expect(css).toContain('.feedback-error');
    expect(css).toContain('modal-fullscreen-mobile');
  });

  it('the empty state of a records block shows its suggested action', async () => {
    const { WealthRecords } = loadBrowser(['js/utils/wealth-records.js'], ['WealthRecords'], { API: {}, ConfirmDialog: {}, Modal: {} });
    const root = new FakeElement('div');
    await WealthRecords.renderDocuments(root, { load: async () => [], upload: jest.fn() });
    expect(root.textContent).toContain('No hay documentos cargados.');
    expect(root.findAll(item => item.tagName === 'BUTTON').map(button => button.textContent)).toEqual(expect.arrayContaining(['Cargar documento']));
  });
});
