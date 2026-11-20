const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

const flush = async () => { for (let index = 0; index < 30; index += 1) await Promise.resolve(); };
const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 7 "Registrar cobro": partial payments, cheque and receipt', () => {
  const month = {
    key: 'k1', date: '2025-01-01', status: 'partially_collected',
    totals: [{ currencyCode: 'ARS', remainingMinor: 7100000, remainingAmount: 71000 }],
    parts: [{ occurrenceId: 'o1', modality: 'locacion', currencyCode: 'ARS', remainingMinor: 7100000, remainingAmount: 71000, ivaPercent: 21, status: 'partially_collected' }]
  };
  const setup = ({ confirmed = true } = {}) => {
    let doc = null;
    const MoneyInput = {
      create: ({ value, ariaLabel }) => { const el = doc.createElement('input'); el.value = value == null ? '' : String(value); el.setAttribute('aria-label', ariaLabel); return el; },
      value: el => (el.value === '' ? null : Number(el.value)),
      validateAll: () => true
    };
    const pushed = [];
    const API = {
      rentals: {
        months: jest.fn(async () => [month]),
        collectMonth: jest.fn(async () => ({ id: 'g1', transactionIds: ['t1'], partial: true }))
      },
      accounts: { list: jest.fn(async () => [{ id: 'acc', activo: true, currency: 'ARS', nombre: 'Caja', primary: true }]) },
      finance: { paymentMethods: jest.fn(async () => []) },
      documents: { uploadTargets: jest.fn(async () => ({ id: 'd1' })), contentUrl: id => `/api/documents/${id}/content` }
    };
    const Modal = { push: jest.fn((title, body, options) => pushed.push({ title, body, options })), hide: jest.fn() };
    const ConfirmDialog = { open: jest.fn(async () => ({ confirmed })) };
    const loaded = loadBrowser(['js/utils/format.js', 'js/pages/rentalPeriods.js'], ['RentalPeriods'], {
      API, Modal, MoneyInput, ConfirmDialog, crypto: { randomUUID: () => 'key-12345678' }
    });
    doc = loaded.context.document;
    loaded.context.showToast = jest.fn();
    return { ...loaded, API, Modal, ConfirmDialog, pushed };
  };
  const byLabel = (root, label) => root.find(element => element.attributes && element.attributes['aria-label'] === label);
  const open = async ctx => {
    await ctx.RentalPeriods.collectMonth('a1', 'k1', jest.fn());
    const { body, options } = ctx.pushed[0];
    const submit = options.footer.children[0];
    return { body, submit };
  };

  it('preloads the pending balance and names the period "Parcialmente cancelado"', async () => {
    const ctx = setup();
    const { body } = await open(ctx);
    expect(byLabel(body, 'Importe Locación').value).toBe('71000');
    expect(body.textContent).toContain('Parcialmente cancelado: saldo pendiente');
    expect(body.textContent).toContain('Parcialmente cancelado · saldo pendiente');
  });

  it('asks whether a lower amount is a partial payment; "No" keeps the form and sends nothing', async () => {
    const ctx = setup({ confirmed: false });
    const { body, submit } = await open(ctx);
    byLabel(body, 'Importe Locación').value = '50000';
    submit.click();
    await flush();
    expect(ctx.ConfirmDialog.open).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pago parcial', confirmLabel: 'Sí, es un pago parcial', cancelLabel: 'No' }));
    expect(ctx.ConfirmDialog.open.mock.calls[0][0].message).toContain('valor inferior al total');
    expect(ctx.API.rentals.collectMonth).not.toHaveBeenCalled();
    expect(byLabel(body, 'Importe Locación').value).toBe('50000');
    expect(ctx.Modal.hide).not.toHaveBeenCalled();
  });

  it('"Sí" saves the partial collection and uploads the receipt linked to its income', async () => {
    const ctx = setup({ confirmed: true });
    const { body, submit } = await open(ctx);
    byLabel(body, 'Importe Locación').value = '50000';
    byLabel(body, 'Comprobante de pago (opcional)').files = [{ name: 'recibo.pdf', size: 100 }];
    submit.click();
    await flush();
    expect(ctx.API.rentals.collectMonth).toHaveBeenCalledWith({ idempotencyKey: 'key-12345678', lines: [expect.objectContaining({ occurrenceId: 'o1', amount: 50000, accountId: 'acc', method: '' })] });
    expect(ctx.API.rentals.collectMonth.mock.calls[0][0].lines[0].chequeDays).toBeUndefined();
    expect(ctx.API.documents.uploadTargets).toHaveBeenCalledWith({ transactionId: 't1' }, { name: 'recibo.pdf', size: 100 });
    expect(ctx.Modal.hide).toHaveBeenCalled();
  });

  it('does not ask when the full balance is collected', async () => {
    const ctx = setup();
    const { submit } = await open(ctx);
    submit.click();
    await flush();
    expect(ctx.ConfirmDialog.open).not.toHaveBeenCalled();
    expect(ctx.API.rentals.collectMonth).toHaveBeenCalled();
  });

  it('"Cheque" shows the required "Días" field and sends them', async () => {
    const ctx = setup();
    const { body, submit } = await open(ctx);
    const method = byLabel(body, 'Medio de cobro (Locación)');
    const chequeBox = body.find(element => element.dataset && element.dataset.chequeFields);
    expect(chequeBox.style.display).toBe('none');
    method.value = 'Cheque';
    method.dispatch('input');
    expect(chequeBox.style.display).toBe('grid');
    submit.click();
    await flush();
    expect(ctx.API.rentals.collectMonth).not.toHaveBeenCalled();
    expect(body.textContent).toContain('indicá en cuántos días se cobra el cheque');
    const days = byLabel(body, 'Días para cobrar el cheque (Locación)');
    days.value = '30';
    days.dispatch('input');
    expect(body.find(element => element.dataset && element.dataset.chequeDue).textContent).toContain('Se cobra el');
    submit.click();
    await flush();
    expect(ctx.API.rentals.collectMonth.mock.calls[0][0].lines[0]).toMatchObject({ method: 'Cheque', chequeDays: 30 });
  });

  it('rejects attachments of a type the server does not accept', async () => {
    const ctx = setup();
    const { body, submit } = await open(ctx);
    byLabel(body, 'Comprobante de pago (opcional)').files = [{ name: 'malware.exe', size: 10 }];
    submit.click();
    await flush();
    expect(ctx.API.rentals.collectMonth).not.toHaveBeenCalled();
    expect(body.textContent).toContain('formato no admitido');
  });

  it('pure helpers: partial detection, cheque method and due date, pending text', () => {
    const { RentalPeriods } = setup();
    expect(RentalPeriods.isPartialCollection([{ amount: 100, remaining: 100 }])).toBe(false);
    expect(RentalPeriods.isPartialCollection([{ amount: 99.99, remaining: 100 }])).toBe(true);
    expect(RentalPeriods.isPartialCollection([{ amount: 100, remaining: 100 }, { amount: 0, remaining: 50 }])).toBe(true);
    expect(RentalPeriods.isChequeMethod(' CHEQUE ')).toBe(true);
    expect(RentalPeriods.isChequeMethod('Transferencia')).toBe(false);
    expect(RentalPeriods.chequeDueDate('2026-11-17', 30)).toBe('2026-12-17');
    expect(RentalPeriods.chequeDueDate('x', 3)).toBe('');
    expect(RentalPeriods.pendingText([{ currencyCode: 'ARS', remaining: 0 }])).toBe('');
    expect(RentalPeriods.chequeText({ days: 30, dueDate: '2026-12-17', cashedAt: null })).toBe('Cheque a 30 días · se cobra el 17-12-2026 · pendiente de cobro');
  });

  it('shows "Parcialmente cancelado" with the pending balance in the periods table', () => {
    const { RentalPeriods } = setup();
    const cell = RentalPeriods.periodStateCell({ state: 'partial', totals: [{ currencyCode: 'ARS', remaining: 71000 }] });
    expect(cell.textContent).toContain('Parcialmente cancelado');
    expect(cell.textContent).toContain('Saldo pendiente');
    expect(RentalPeriods.periodStateCell({ state: 'collected', totals: [] }).textContent).toContain('Cobrado');
    const source = read('js/pages/assetHistory.js');
    expect(source).toContain("statusBadge(row.kind === 'rent' ? rentStatus(state) : state");
  });
});
