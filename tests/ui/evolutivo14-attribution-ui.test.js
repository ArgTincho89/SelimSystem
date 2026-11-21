const fs = require('fs');
const path = require('path');
const { FakeElement, loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const flush = async () => { for (let index = 0; index < 40; index += 1) await Promise.resolve(); };
const loadForm = (globals = {}) => loadBrowser(['js/utils/format.js', 'js/components/moneyInput.js', 'js/components/transactionForm.js'], ['TransactionForm', 'MoneyInput'], globals);

const assets = [{ id: 'a1', name: 'Casa Sur' }, { id: 'a2', name: 'Cochera' }];
const obligations = [
  {
    id: 'o1', title: 'Tasa municipal', assetId: 'a1', currencyCode: 'ARS', occurrences: [
      { id: 'c1', date: '2026-03-05', status: 'expected', remainingAmount: 100, currencyCode: 'ARS' },
      { id: 'c2', date: '2026-02-05', status: 'paid', remainingAmount: 0, currencyCode: 'ARS' },
      { id: 'c3', date: '2026-04-05', status: 'cancelled', remainingAmount: 100, currencyCode: 'ARS' }
    ]
  },
  { id: 'o2', title: 'Seguro auto', assetId: 'a2', currencyCode: 'ARS', occurrences: [{ id: 'c4', date: '2026-03-10', status: 'expected', remainingAmount: 50, currencyCode: 'ARS' }] },
  { id: 'o3', title: 'Monotributo', assetId: null, currencyCode: 'ARS', occurrences: [{ id: 'c5', date: '2026-03-20', status: 'partial', remainingAmount: 30, currencyCode: 'ARS' }] }
];
const rentals = [{ id: 'r1', assetId: 'a1', tenants: [{ name: 'Ana' }], occurrences: [{ id: 'p1', date: '2026-03-01' }] }];
const values = options => options.map(option => option.value);

describe('Evolutivo 14 two-step attribution: helpers', () => {
  it('lists the assets plus "Obligaciones sin bien" (expenses only, when such obligations exist)', () => {
    const { TransactionForm } = loadForm();
    expect(TransactionForm.attributionAssetOptions(assets, obligations, 'expense')).toEqual([['', 'Sin atribución'], ['a1', 'Casa Sur'], ['a2', 'Cochera'], [TransactionForm.NO_ASSET, 'Obligaciones sin bien']]);
    expect(TransactionForm.attributionAssetOptions(assets, obligations, 'income').map(([value]) => value)).toEqual(['', 'a1', 'a2']);
    expect(TransactionForm.attributionAssetOptions(assets, obligations.slice(0, 2), 'expense').map(([value]) => value)).toEqual(['', 'a1', 'a2']);
  });

  it('filters the detail select by asset and type, with pending due dates labelled for payment', () => {
    const { TransactionForm } = loadForm();
    expect(TransactionForm.attributionDetailOptions({ assetId: '', type: 'expense', obligations, rentals })).toEqual([]);
    const expense = TransactionForm.attributionDetailOptions({ assetId: 'a1', type: 'expense', obligations, rentals });
    expect(values(expense)).toEqual(['', 'obligation:o1', 'obligationOccurrence:o1:c1']);
    expect(expense[0].label).toBe('Solo el bien');
    expect(expense[2].label).toMatch(/^Vencimiento · Tasa municipal · 05-03-2026 · pendiente .*100/);
    expect(expense[2]).toMatchObject({ disabled: false, dueDate: true });
    expect(values(TransactionForm.attributionDetailOptions({ assetId: 'a2', type: 'expense', obligations, rentals }))).toEqual(['', 'obligation:o2', 'obligationOccurrence:o2:c4']);
    const unassigned = TransactionForm.attributionDetailOptions({ assetId: TransactionForm.NO_ASSET, type: 'expense', obligations, rentals });
    expect(values(unassigned)).toEqual(['', 'obligation:o3', 'obligationOccurrence:o3:c5']);
    expect(unassigned[0].label).toBe('Elegí una obligación');
    const income = TransactionForm.attributionDetailOptions({ assetId: 'a1', type: 'income', obligations, rentals });
    expect(values(income)).toEqual(['', 'contract:r1', 'rentOccurrence:r1:p1']);
    expect(income.map(option => option.label)).toEqual(['Solo el bien', 'Contrato · Ana', 'Período de alquiler · 01-03-2026']);
    expect(values(TransactionForm.attributionDetailOptions({ assetId: 'a1', type: 'refund', obligations, rentals }))).toEqual(['']);
  });

  it('when editing, due dates are informational: only the stored one stays enabled, even if already paid', () => {
    const { TransactionForm } = loadForm();
    const options = TransactionForm.attributionDetailOptions({ assetId: 'a1', type: 'expense', obligations, rentals, isEdit: true, keep: 'obligationOccurrence:o1:c2' });
    expect(options.filter(option => option.dueDate).map(option => [option.value, option.disabled])).toEqual([
      ['obligationOccurrence:o1:c1', true], ['obligationOccurrence:o1:c2', false]
    ]);
  });

  it('shows the payment hint only for a due date on a new expense, and the "Registrar pago" hint when editing', () => {
    const { TransactionForm } = loadForm();
    expect(TransactionForm.attributionHint({ type: 'expense', isEdit: false, detail: 'obligationOccurrence:o1:c1' })).toBe('Se registrará como pago de este vencimiento');
    expect(TransactionForm.attributionHint({ type: 'expense', isEdit: false, detail: 'obligation:o1' })).toBe('');
    expect(TransactionForm.attributionHint({ type: 'income', isEdit: false, detail: 'obligationOccurrence:o1:c1' })).toBe('');
    expect(TransactionForm.attributionHint({ type: 'expense', isEdit: true, detail: '', hasDueDates: true })).toBe('Para registrar el pago de un movimiento existente usá Registrar pago');
    expect(TransactionForm.attributionHint({ type: 'expense', isEdit: true, detail: '', hasDueDates: false })).toBe('');
  });

  it('maps stored allocations to the two selects and back to the allocations API', () => {
    const { TransactionForm } = loadForm();
    expect(TransactionForm.attributionSelection({ assetId: 'a1', obligationId: 'o1', occurrenceId: 'c1' })).toEqual({ assetId: 'a1', detail: 'obligationOccurrence:o1:c1' });
    expect(TransactionForm.attributionSelection({ obligationId: 'o3' })).toEqual({ assetId: TransactionForm.NO_ASSET, detail: 'obligation:o3' });
    expect(TransactionForm.attributionSelection({ assetId: 'a1', contractId: 'r1', rentOccurrenceId: 'p1' })).toEqual({ assetId: 'a1', detail: 'rentOccurrence:r1:p1' });
    expect(TransactionForm.attributionSelection({ assetId: 'a1', contractId: 'r1' })).toEqual({ assetId: 'a1', detail: 'contract:r1' });
    expect(TransactionForm.attributionSelection({ assetId: 'a2' })).toEqual({ assetId: 'a2', detail: '' });
    expect(TransactionForm.attributionSelection({})).toEqual({ assetId: '', detail: '' });
    const payloads = TransactionForm.allocationPayloads([
      { assetId: 'a1', detail: '', amount: 10 },
      { assetId: 'a1', detail: 'obligationOccurrence:o1:c1', amount: 5 },
      { assetId: TransactionForm.NO_ASSET, detail: 'obligation:o3', amount: 3 },
      { assetId: 'a1', detail: 'rentOccurrence:r1:p1', amount: 2 },
      { assetId: 'a1', detail: 'contract:r1', amount: 1 },
      { assetId: '', detail: '', amount: 9 },
      { assetId: 'a2', detail: '', amount: null }
    ]);
    expect(JSON.parse(JSON.stringify(payloads.allocations))).toEqual([
      { assetId: 'a1', amount: 10 }, { assetId: 'a1', obligationId: 'o1', occurrenceId: 'c1', amount: 5 }, { obligationId: 'o3', amount: 3 },
      { assetId: 'a1', contractId: 'r1', rentOccurrenceId: 'p1', amount: 2 }, { assetId: 'a1', contractId: 'r1', amount: 1 }
    ]);
    expect(TransactionForm.allocationPayloads([{ assetId: TransactionForm.NO_ASSET, detail: '', amount: 1 }]).error).toBe('Elegí la obligación o el vencimiento de «Obligaciones sin bien»');
  });

  it('turns one due date row of a new expense into a payment of the whole movement', () => {
    const { TransactionForm } = loadForm();
    const row = { assetId: 'a1', detail: 'obligationOccurrence:o1:c1', amount: 100 };
    expect(TransactionForm.obligationPaymentFor({ type: 'expense', isEdit: false, entries: [row], total: 100 })).toEqual({ obligationId: 'o1', occurrenceId: 'c1' });
    expect(TransactionForm.obligationPaymentFor({ type: 'expense', isEdit: true, entries: [row], total: 100 })).toEqual({});
    expect(TransactionForm.obligationPaymentFor({ type: 'income', isEdit: false, entries: [row], total: 100 })).toEqual({});
    expect(TransactionForm.obligationPaymentFor({ type: 'expense', isEdit: false, entries: [{ assetId: 'a1', detail: 'obligation:o1', amount: 100 }], total: 100 })).toEqual({});
    expect(TransactionForm.obligationPaymentFor({ type: 'expense', isEdit: false, entries: [row, { ...row, detail: 'obligationOccurrence:o2:c4' }], total: 100 }).error).toMatch(/un solo vencimiento/);
    expect(TransactionForm.obligationPaymentFor({ type: 'expense', isEdit: false, entries: [row, { assetId: 'a2', detail: '', amount: 1 }], total: 100 }).error).toMatch(/única atribución/);
    expect(TransactionForm.obligationPaymentFor({ type: 'expense', isEdit: false, entries: [{ ...row, amount: 60 }], total: 100 }).error).toMatch(/igual al monto/);
    expect(TransactionForm.obligationPaymentFor({ type: 'expense', isEdit: false, entries: [{ ...row, amount: null }], total: 100 }).error).toMatch(/igual al monto/);
  });
});

describe('Evolutivo 14 two-step attribution: the form', () => {
  const originalQuery = FakeElement.prototype.querySelector;
  beforeAll(() => {
    // The form reads its labels with querySelector('label'): enough of it for this test.
    FakeElement.prototype.querySelector = function querySelector(selector) {
      return /^[a-z]+$/.test(selector) ? this.find(element => element !== this && element.tagName === selector.toUpperCase()) : null;
    };
    Object.defineProperty(FakeElement.prototype, 'parentElement', { configurable: true, get() { return this.parentNode; } });
    Object.defineProperty(FakeElement.prototype, 'options', { configurable: true, get() { return this.children; } });
    Object.defineProperty(FakeElement.prototype, 'selectedIndex', { configurable: true, get() { return this.children.findIndex(option => option.attributes.value === this.value); } });
  });
  afterAll(() => {
    FakeElement.prototype.querySelector = originalQuery;
    ['parentElement', 'options', 'selectedIndex'].forEach(name => delete FakeElement.prototype[name]);
  });

  const open = async ({ transaction = null, allocations = [] } = {}) => {
    let shown = null;
    const API = {
      categories: { list: async () => [{ id: 'cat1', nombre: 'Impuestos' }] },
      accounts: { list: async () => [{ id: 'acc1', nombre: 'Caja', currency: 'ARS', activo: true, primary: true }] },
      transactions: { list: async () => [], create: jest.fn(async data => ({ id: 'tx-new', ...data })), update: jest.fn(async () => ({})) },
      assets: { list: async () => assets },
      obligations: { list: async () => obligations },
      rentals: { list: async () => rentals },
      owners: { list: async () => [] },
      finance: { associations: async () => ({ allocations }), setAllocations: jest.fn(async () => ({})) },
      documents: { uploadTargets: jest.fn(async () => ({ id: 'd1' })) }
    };
    const Modal = { show: (title, body, options) => { shown = { title, body, footer: options.footer }; }, hide: jest.fn() };
    const loaded = loadForm({ API, Modal, localStorage: { getItem: () => null, setItem: () => {} } });
    loaded.context.showToast = jest.fn();
    const onSave = jest.fn();
    await loaded.TransactionForm.show(onSave, transaction);
    await flush();
    const rows = () => shown.body.findAll(element => element.dataset && element.dataset.attributionRow);
    const button = text => shown.body.find(element => element.tagName === 'BUTTON' && element.textContent === text);
    const save = async () => { shown.footer.find(element => element.textContent === 'Guardar').click(); await flush(); };
    return { ...loaded, API, shown, rows, button, save, onSave };
  };
  const selects = row => row.findAll(element => element.tagName === 'SELECT');
  const optionValues = select => select.children.map(option => option.attributes.value);
  const detailGroup = row => row.find(element => element.dataset && element.dataset.attributionDetail);
  const hintOf = row => row.find(element => element.dataset && element.dataset.attributionHint);
  const choose = (select, value) => { select.value = value; select.dispatch('change'); };

  it('starts with "Bien" only; the optional detail appears once a bien is chosen and lists only its items', async () => {
    const form = await open();
    form.button('+ Añadir atribución').click();
    const [row] = form.rows();
    const [asset, detail] = selects(row);
    const labels = row.findAll(element => element.tagName === 'LABEL').map(label => label.textContent);
    expect(labels).toEqual(['Bien', 'Importe', 'Obligación o período (opcional)']);
    expect(optionValues(asset)).toEqual(['', 'a1', 'a2', form.TransactionForm.NO_ASSET]);
    expect(asset.children.map(option => option.textContent)).toContain('Obligaciones sin bien');
    expect(detailGroup(row).style.display).toBe('none');
    expect(row.style.flexWrap).toBe('wrap');
    choose(asset, 'a2');
    expect(detailGroup(row).style.display).toBe('');
    expect(optionValues(detail)).toEqual(['', 'obligation:o2', 'obligationOccurrence:o2:c4']);
    choose(asset, form.TransactionForm.NO_ASSET);
    expect(optionValues(detail)).toEqual(['', 'obligation:o3', 'obligationOccurrence:o3:c5']);
  });

  it('shows the payment hint for a due date, prefills the amount and saves a payment without allocations', async () => {
    const form = await open();
    const amount = form.shown.body.find(element => element.id === 'transaction-amount');
    form.MoneyInput.setValue(amount, 100);
    form.shown.body.find(element => element.id === 'transaction-comments').value = 'Pagado en el banco';
    form.button('+ Añadir atribución').click();
    const [row] = form.rows();
    const [asset, detail] = selects(row);
    choose(asset, 'a1');
    expect(hintOf(row).style.display).toBe('none');
    choose(detail, 'obligationOccurrence:o1:c1');
    expect(hintOf(row).textContent).toBe('Se registrará como pago de este vencimiento');
    expect(hintOf(row).style.display).toBe('');
    expect(form.MoneyInput.value(row.find(element => element.attributes && element.attributes['aria-label'] === 'Importe atribuido'))).toBe(100);
    await form.save();
    expect(form.API.transactions.create).toHaveBeenCalledTimes(1);
    const sent = form.API.transactions.create.mock.calls[0][0];
    expect(sent).toMatchObject({ tipo: 'expense', monto: 100, comments: 'Pagado en el banco', titulo: '', obligationPayment: { occurrenceId: 'c1' } });
    expect(sent.obligationPayment.idempotencyKey).toEqual(expect.any(String));
    expect(form.API.finance.setAllocations).not.toHaveBeenCalled();
    expect(form.context.showToast).toHaveBeenCalledWith('Pago del vencimiento registrado');
  });

  it('refuses a due date payment without comments or for part of the movement', async () => {
    const form = await open();
    form.MoneyInput.setValue(form.shown.body.find(element => element.id === 'transaction-amount'), 100);
    form.button('+ Añadir atribución').click();
    const [row] = form.rows();
    const [asset, detail] = selects(row);
    choose(asset, 'a1');
    choose(detail, 'obligationOccurrence:o1:c1');
    await form.save();
    expect(form.context.showToast).toHaveBeenLastCalledWith('Los comentarios son obligatorios para registrar el pago de un vencimiento', 'error');
    form.MoneyInput.setValue(row.find(element => element.attributes && element.attributes['aria-label'] === 'Importe atribuido'), 40);
    await form.save();
    expect(form.context.showToast.mock.calls.pop()[0]).toMatch(/igual al monto/);
    expect(form.API.transactions.create).not.toHaveBeenCalled();
  });

  it('saves an asset-only attribution through the allocations API', async () => {
    const form = await open();
    form.MoneyInput.setValue(form.shown.body.find(element => element.id === 'transaction-amount'), 100);
    form.button('+ Añadir atribución').click();
    const [row] = form.rows();
    choose(selects(row)[0], 'a2');
    form.MoneyInput.setValue(row.find(element => element.attributes && element.attributes['aria-label'] === 'Importe atribuido'), 70);
    await form.save();
    expect(form.API.transactions.create.mock.calls[0][0]).not.toHaveProperty('obligationPayment');
    expect(form.API.finance.setAllocations.mock.calls[0][0]).toBe('tx-new');
    expect(JSON.parse(JSON.stringify(form.API.finance.setAllocations.mock.calls[0][1].allocations))).toEqual([{ assetId: 'a2', amount: 70 }]);
  });

  it('hides due dates for an income and offers the rentals of the bien instead', async () => {
    const form = await open();
    form.button('+ Añadir atribución').click();
    const [row] = form.rows();
    choose(selects(row)[0], 'a1');
    form.shown.body.find(element => element.dataset && element.dataset.type === 'income').click();
    const [asset, detail] = selects(row);
    expect(optionValues(asset)).toEqual(['', 'a1', 'a2']);
    expect(asset.value).toBe('a1');
    expect(optionValues(detail)).toEqual(['', 'contract:r1', 'rentOccurrence:r1:p1']);
    expect(hintOf(row).style.display).toBe('none');
  });

  it('editing preselects bien and detail from the stored allocation and keeps other due dates informational', async () => {
    const transaction = { id: 'tx1', tipo: 'expense', monto: 100, titulo: 'Tasa', fecha: '2026-03-05', accountId: 'acc1', categoryId: 'cat1' };
    const form = await open({ transaction, allocations: [{ assetId: 'a1', obligationId: 'o1', occurrenceId: 'c2', amount: 100, complete: true }] });
    const [row] = form.rows();
    const [asset, detail] = selects(row);
    expect(asset.value).toBe('a1');
    expect(detail.value).toBe('obligationOccurrence:o1:c2');
    const due = detail.children.filter(option => String(option.attributes.value).startsWith('obligationOccurrence:'));
    expect(due.map(option => [option.attributes.value, option.hasAttribute('disabled')])).toEqual([['obligationOccurrence:o1:c1', true], ['obligationOccurrence:o1:c2', false]]);
    expect(hintOf(row).textContent).toBe('Para registrar el pago de un movimiento existente usá Registrar pago');
    await form.save();
    expect(form.API.transactions.update).toHaveBeenCalledTimes(1);
    expect(form.API.transactions.update.mock.calls[0][1]).not.toHaveProperty('obligationPayment');
    expect(JSON.parse(JSON.stringify(form.API.finance.setAllocations.mock.calls[0][1].allocations))).toEqual([{ assetId: 'a1', obligationId: 'o1', occurrenceId: 'c2', amount: 100 }]);
  });

  it('keeps the receipts of a payment on its due date and the installment rule of one asset', () => {
    const source = read('js/components/transactionForm.js');
    expect(source).toContain('DocumentViewer.uploadAll(attachment.files(), { transactionId: savedTransactionId, occurrenceId: payment.occurrenceId })');
    expect(source).toContain("return showToast('Las cuotas solo admiten la atribución a un bien', 'error');");
    expect(source).toContain("textContent: 'Obligación o período (opcional)'");
    expect(source).not.toContain('allocationTargets');
  });
});
