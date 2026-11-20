const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const flush = async () => { for (let index = 0; index < 30; index += 1) await Promise.resolve(); };
const loadForm = () => loadBrowser(['js/utils/format.js', 'js/components/moneyInput.js', 'js/components/transactionForm.js'], ['TransactionForm', 'MoneyInput']);
const inputs = (root, predicate) => root.findAll(element => element.tagName === 'INPUT' && predicate(element));

describe('Evolutivo 10 transaction form', () => {
  it('opens at the top: no focus on Título, the active type button gets the focus and scroll is reset', () => {
    const source = read('js/components/transactionForm.js');
    expect(source).not.toContain('titleInput.focus()');
    expect(source).toContain('TransactionForm.openAtTop(form, [...typeSelector.children]);');
    const { TransactionForm, context } = loadForm();
    const modal = context.create('div');
    const form = context.create('form');
    modal.appendChild(form);
    modal.scrollTop = 120;
    form.scrollTop = 40;
    const buttons = ['expense', 'income'].map((type, index) => context.create('button', { className: `type-btn${index === 1 ? ' active' : ''}` }));
    TransactionForm.openAtTop(form, buttons);
    expect(context.document.activeElement).toBe(buttons[1]);
    expect(form.scrollTop).toBe(0);
    expect(modal.scrollTop).toBe(0);
    const fallback = [context.create('button'), context.create('button')];
    TransactionForm.openAtTop(form, fallback);
    expect(context.document.activeElement).toBe(fallback[0]);
  });

  it('labels the field "Medio de pago" with the fixed options per type', () => {
    const source = read('js/components/transactionForm.js');
    expect(source).toContain("textContent: 'Medio de pago', for: paymentMethodSelect.id");
    expect(source).not.toContain('Medio de pago reutilizable');
    expect(source).not.toContain('API.finance.paymentMethods()');
    const { TransactionForm } = loadForm();
    const values = type => TransactionForm.paymentMethodOptions(type).map(([value]) => value);
    expect(values('expense')).toEqual(['', 'Transferencia', 'Efectivo', 'Débito', 'Crédito', 'Cheque']);
    expect(values('income')).toEqual(['', 'Transferencia', 'Efectivo', 'Débito', 'Cheque']);
    expect(values('refund')).toEqual(['', 'Transferencia', 'Efectivo', 'Débito']);
    expect(TransactionForm.paymentMethodOptions('expense')[0]).toEqual(['', 'Seleccionar']);
    expect(TransactionForm.paymentMethodOptions('income', 'Visa oro').pop()).toEqual(['Visa oro', 'Visa oro (anterior)']);
  });

  it('renders one cheque row per cuota with date, amount and cheque number, prefilled with an even split', () => {
    const { TransactionForm, MoneyInput } = loadForm();
    const cheque = TransactionForm.renderChequeFields({ currency: 'ARS' });
    expect(cheque.element.findAll(element => element.dataset && element.dataset.chequeRow)).toHaveLength(1);
    cheque.setCount(3);
    const rows = cheque.element.findAll(element => element.dataset && element.dataset.chequeRow);
    expect(rows).toHaveLength(3);
    rows.forEach((row, index) => {
      const labels = row.findAll(element => element.tagName === 'LABEL').map(label => label.textContent);
      expect(labels).toEqual([`Vencimiento cuota Nº ${index + 1}`, 'Monto', 'Nº cheque']);
      expect(inputs(row, () => true)).toHaveLength(3);
      expect(row.style.flexWrap).toBe('wrap');
    });
    cheque.setTotal(1000, '2026-01-31');
    expect(cheque.rows.map(row => MoneyInput.value(row.amount))).toEqual([333.33, 333.33, 333.34]);
    expect(cheque.rows.map(row => row.due.value)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(cheque.collect(1000).error).toMatch(/Nº de cheque de la cuota Nº 1/);
    cheque.rows.forEach((row, index) => { row.chequeNumber.value = ['0001-23456789', 'A2', '3'][index]; });
    expect(cheque.collect(1000)).toEqual({ rows: [
      { dueDate: '2026-01-31', amount: 333.33, chequeNumber: '0001-23456789' },
      { dueDate: '2026-02-28', amount: 333.33, chequeNumber: 'A2' },
      { dueDate: '2026-03-31', amount: 333.34, chequeNumber: '3' }
    ] });
    MoneyInput.setValue(cheque.rows[2].amount, 300);
    expect(cheque.collect(1000).error).toMatch(/suma de las cuotas/);
    cheque.rows[0].chequeNumber.value = 'x'.repeat(31);
    expect(cheque.collect(1000).error).toMatch(/hasta 30/);
    cheque.rows[0].due.value = '';
    expect(cheque.collect(1000).error).toMatch(/vencimiento de la cuota Nº 1/);
    cheque.setCount(2);
    expect(cheque.rows).toHaveLength(2);
    MoneyInput.setValue(cheque.rows[1].amount, 0);
    cheque.rows[0].due.value = '2026-01-31';
    cheque.rows[0].chequeNumber.value = '1';
    expect(cheque.collect(1000).error).toMatch(/mayor a cero/);
    cheque.setCount(99);
    expect(cheque.rows).toHaveLength(24);
  });

  it('shows the credit preview with the total interest split evenly', () => {
    const { TransactionForm } = loadForm();
    expect(TransactionForm.creditPreview(1000, 3, 10, 'ARS')).toEqual({ total: 1100, installment: 366.66, last: 366.68, count: 3 });
    const credit = TransactionForm.renderCreditFields({ currency: 'ARS' });
    expect(credit.countInput.id).toBe('transaction-installments-count');
    expect(credit.element.findAll(element => element.tagName === 'LABEL').map(label => label.textContent)).toEqual(['Cuotas', 'Interés (%)']);
    credit.setTotal(1000);
    expect(credit.preview.textContent).toMatch(/^1 cuota de .*1\.000.* \(total .*1\.000.*\)$/);
    credit.countInput.value = '3';
    credit.interestInput.value = '10';
    credit.countInput.dispatch('input');
    expect(credit.preview.textContent).toMatch(/^3 cuotas de .*366,66.* \(total .*1\.100.*\)$/);
    expect(credit.collect()).toEqual({ count: 3, interestPercent: 10 });
    credit.countInput.value = '40';
    expect(credit.collect().error).toMatch(/entre 1 y 36/);
    credit.countInput.value = '2';
    credit.interestInput.value = '-1';
    expect(credit.collect().error).toMatch(/interés/);
    credit.interestInput.value = '';
    expect(credit.collect()).toEqual({ count: 2, interestPercent: 0 });
  });

  it('sends cheque and credit installments instead of creating a card plan', () => {
    const source = read('js/components/transactionForm.js');
    expect(source).toContain('data.chequeInstallments = collected.rows');
    expect(source).toContain("data.paymentMethod = paymentMethodSelect.value || ''");
    expect(source).toContain("const chequeMode = () => !isEdit && ['expense', 'income'].includes(selectedType) && chosenPaymentMethod === 'Cheque';");
    expect(source).toContain("const creditMode = () => !isEdit && selectedType === 'expense' && chosenPaymentMethod === 'Crédito';");
    expect(source).toContain('const available = selectedType === \'expense\' && !chequeMode() && !creditMode();');
  });
});

describe('Evolutivo 10 Inicio, Avisos and undo', () => {
  it('marks pending movements and shows the cheque number', async () => {
    const API = { transactions: { confirm: jest.fn(async () => ({})) } };
    const ConfirmDialog = { open: jest.fn(async () => ({ confirmed: true })) };
    const { HomePage, context } = loadBrowser(['js/utils/format.js', 'js/pages/home.js'], ['HomePage'], { API, ConfirmDialog });
    context.showToast = jest.fn();
    const tx = { id: 't1', titulo: 'Sillones — Cheque cuota 2/3', fecha: '2026-11-25', monto: 100, currencyCode: 'ARS', status: 'pending', chequeInstallment: { number: 2, total: 3, chequeNumber: '12345' } };
    expect(HomePage.chequeLabel(tx)).toBe('Cheque Nº 12345 · cuota 2/3');
    expect(HomePage.chequeLabel({ creditInstallment: { number: 1, total: 6 } })).toBe('Crédito · cuota 1/6');
    expect(HomePage.chequeLabel({})).toBe('');
    expect(HomePage.pendingBadge(tx).textContent).toBe('Pendiente de confirmación');
    expect(HomePage.pendingBadge({ status: 'posted' })).toBeNull();
    const onDone = jest.fn();
    expect(await HomePage.confirmTransaction(tx, onDone)).toBe(true);
    expect(ConfirmDialog.open.mock.calls[0][0].details).toEqual(expect.arrayContaining([['Nº cheque', '12345']]));
    expect(API.transactions.confirm).toHaveBeenCalledWith('t1');
    expect(onDone).toHaveBeenCalled();
    ConfirmDialog.open.mockResolvedValueOnce({ confirmed: false });
    expect(await HomePage.confirmTransaction(tx)).toBe(false);
  });

  it('lists the new alert types and confirms a cheque installment from Avisos', async () => {
    const API = { transactions: { confirm: jest.fn(async () => ({})) } };
    const ConfirmDialog = { open: jest.fn(async () => ({ confirmed: true })) };
    const Router = { navigate: jest.fn() };
    const { AlertsPage, context } = loadBrowser(['js/utils/format.js', 'js/pages/alerts.js'], ['AlertsPage'], { API, ConfirmDialog, Router });
    context.showToast = jest.fn();
    AlertsPage.reload = jest.fn();
    expect(AlertsPage.TYPE_LABELS.transaction_cheque_due).toBe('Cuotas con cheque por confirmar');
    expect(AlertsPage.TYPE_LABELS.credit_installment_upcoming).toBe('Próximas cuotas de crédito');
    const alert = { id: 'txcheque:t1', type: 'transaction_cheque_due', transactionId: 't1', title: 'Cheque cuota 2/3 · Sillones', chequeNumber: '12345', amount: 100, currencyCode: 'ARS', date: '2026-11-25' };
    const actions = AlertsPage.actionsFor(alert);
    expect(actions.map(([label]) => label)).toEqual(['Confirmar imputación', 'Ver movimiento']);
    await actions[0][1]();
    expect(API.transactions.confirm).toHaveBeenCalledWith('t1');
    expect(AlertsPage.reload).toHaveBeenCalled();
    actions[1][1]();
    expect(Router.navigate).toHaveBeenCalledWith('/home?month=2026-11');
    expect(AlertsPage.actionsFor({ type: 'credit_installment_upcoming', date: '2026-12-05' }).map(([label]) => label)).toEqual(['Ver movimiento']);
    ConfirmDialog.open.mockResolvedValueOnce({ confirmed: false });
    await AlertsPage.confirmChequeInstallment(alert);
    expect(API.transactions.confirm).toHaveBeenCalledTimes(1);
  });

  it('undoes a confirmation with the required reason', async () => {
    const API = { transactions: { unconfirm: jest.fn(async () => ({})) } };
    const pushed = [];
    const Modal = { push: (title, body, options) => pushed.push({ title, body, options }), hide: jest.fn() };
    const { UndoDialog, context } = loadBrowser(['js/components/undoDialog.js'], ['UndoDialog'], { API, Modal });
    context.showToast = jest.fn();
    const done = UndoDialog.open({ type: 'transaction.confirmation', transactionId: 't1' });
    const { body, options } = pushed[0];
    expect(pushed[0].title).toBe('Deshacer confirmación');
    body.find(element => element.dataset && element.dataset.undoReason).value = 'Rebotó';
    options.footer.find(element => element.dataset && element.dataset.undoConfirm).click();
    await flush();
    expect(API.transactions.unconfirm).toHaveBeenCalledWith('t1', { reason: 'Rebotó' });
    expect(await done).toBe(true);
    expect(context.showToast).toHaveBeenCalledWith('La cuota volvió a quedar pendiente de confirmación');
  });
});

describe('Evolutivo 10 Configuración > Avisos', () => {
  const config = {
    catalog: [
      { key: 'obligation_overdue', label: 'Obligaciones vencidas', description: 'Siempre', kind: 'info', defaultDays: null, days: null, scopes: [] },
      { key: 'rent_adjustment_due', label: 'Ajustes de alquiler', description: 'Ajustes', kind: 'lead', defaultDays: 30, days: 15, scopes: ['asset'] },
      { key: 'document_pending', label: 'Documentos pendientes', description: 'Docs', kind: 'lookback', defaultDays: 60, days: 60, scopes: ['asset', 'obligation'] },
      { key: 'account_forecast', label: 'Saldo insuficiente', description: 'Saldo', kind: 'lead', defaultDays: 5, days: 5, scopes: ['account'] }
    ],
    settings: { defaults: { rent_adjustment_due: 15 }, overrides: [{ type: 'rent_adjustment_due', scope: 'asset', targetId: 'a1', days: 30, targetName: 'Casa' }] },
    targets: { asset: [{ id: 'a1', name: 'Casa' }, { id: 'a2', name: 'Depto' }], obligation: [{ id: 'o1', name: 'ABL' }], account: [{ id: 'acc', name: 'Banco' }] }
  };

  async function renderPanel(API) {
    const loaded = loadBrowser(['js/utils/format.js', 'js/pages/settings.js'], ['SettingsPage'], { API });
    loaded.context.showToast = jest.fn();
    const { SettingsPage, context } = loaded;
    SettingsPage.settings = { forecastHorizonDays: 30, dailyReview: true };
    SettingsPage.accounts = [];
    SettingsPage.render = jest.fn();
    const panel = context.create('section');
    await SettingsPage.renderAlerts(panel);
    return { SettingsPage, context, panel };
  }

  it('renders the per-type table, the overrides and the add form, and saves everything with one button', async () => {
    const API = {
      alerts: { settings: jest.fn(async () => config), updateSettings: jest.fn(async () => config) },
      accounts: { alerts: jest.fn(async () => []), updateSettings: jest.fn(async () => ({ forecastHorizonDays: 30, dailyReview: true })) }
    };
    const { context, panel } = await renderPanel(API);
    const text = panel.textContent;
    ['Anticipación por tipo de aviso', 'Excepciones específicas', 'Avisos de saldo', 'Siempre visible', 'días antes', 'días hacia atrás'].forEach(item => expect(text).toContain(item));
    const rows = panel.findAll(element => element.dataset && element.dataset.alertType);
    expect(rows.map(row => row.dataset.alertType)).toEqual(['obligation_overdue', 'rent_adjustment_due', 'document_pending', 'account_forecast']);
    expect(inputs(rows[0], () => true)).toHaveLength(0);
    expect(panel.find(element => element.id === 'alert-days-rent_adjustment_due').value).toBe('15');
    expect(panel.find(element => element.dataset && element.dataset.alertOverride === 'rent_adjustment_due:asset:a1').textContent).toContain('Inmueble/Bien: Casa');

    const type = panel.find(element => element.id === 'alert-override-type');
    const scope = panel.find(element => element.id === 'alert-override-scope');
    const target = panel.find(element => element.id === 'alert-override-target');
    expect(type.children.map(option => option.value)).toEqual(['rent_adjustment_due', 'document_pending', 'account_forecast']);
    type.value = 'account_forecast';
    type.dispatch('change');
    expect(scope.children.map(option => option.textContent)).toEqual(['Cuenta']);
    expect(target.children.map(option => option.value)).toEqual(['acc']);
    type.value = 'document_pending';
    type.dispatch('change');
    expect(scope.children.map(option => option.value)).toEqual(['asset', 'obligation']);
    type.value = 'rent_adjustment_due';
    type.dispatch('change');
    target.value = 'a2';
    panel.find(element => element.id === 'alert-override-days').value = '45';
    panel.find(element => element.tagName === 'BUTTON' && element.textContent === 'Agregar').click();
    expect(panel.find(element => element.dataset && element.dataset.alertOverride === 'rent_adjustment_due:asset:a2')).toBeTruthy();

    const form = panel.find(element => element.dataset && element.dataset.alertSettings);
    form.dispatch('submit');
    await flush();
    expect(API.alerts.updateSettings).toHaveBeenCalledWith({
      defaults: { rent_adjustment_due: 15, document_pending: 60, account_forecast: 5 },
      overrides: [
        { type: 'rent_adjustment_due', scope: 'asset', targetId: 'a1', days: 30 },
        { type: 'rent_adjustment_due', scope: 'asset', targetId: 'a2', days: 45 }
      ]
    });
    expect(API.accounts.updateSettings).toHaveBeenCalledWith({ forecastHorizonDays: 30, dailyReview: true });
    expect(context.showToast).toHaveBeenCalledWith('Preferencias de avisos guardadas');

    panel.find(element => element.dataset && element.dataset.alertOverride === 'rent_adjustment_due:asset:a1').find(element => element.tagName === 'BUTTON').click();
    expect(panel.find(element => element.dataset && element.dataset.alertOverride === 'rent_adjustment_due:asset:a1')).toBeNull();
  });

  it('validates the days before saving', async () => {
    const API = {
      alerts: { settings: jest.fn(async () => config), updateSettings: jest.fn() },
      accounts: { alerts: jest.fn(async () => []), updateSettings: jest.fn() }
    };
    const { SettingsPage, panel } = await renderPanel(API);
    expect(SettingsPage.alertSettingsPayload({ rent_due: { value: '400' } }, []).error).toMatch(/0 y 365/);
    expect(SettingsPage.alertSettingsPayload({ rent_due: { value: '1.5' } }, []).error).toMatch(/0 y 365/);
    panel.find(element => element.id === 'alert-days-rent_adjustment_due').value = '-3';
    panel.find(element => element.dataset && element.dataset.alertSettings).dispatch('submit');
    await flush();
    expect(API.alerts.updateSettings).not.toHaveBeenCalled();
  });
});
