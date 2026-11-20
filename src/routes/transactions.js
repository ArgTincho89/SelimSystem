const crypto = require('crypto');
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { generateRecurringInstances, getMonthTransactions } = require('../utils/recurring');
const { roundCents, sumCents } = require('../utils/income');
const ledger = require('../services/account-ledger');
const rentals = require('../services/rentals');
const finance = require('../services/finance');
const incomeAttribution = require('../services/income-attribution');
const installments = require('../services/transaction-installments');
const obligations = require('../services/obligations');
const obligationPayments = require('../services/obligation-payments');
const { isPendingTransaction } = require('../utils/transaction-status');

const router = express.Router();

router.use(requireAuth);

// A mirror expense (rent paid by a titular tenant) follows its rent collection: it is changed or removed from there.
const MIRROR_LOCKED = 'Este gasto es el espejo de un cobro de alquiler: para corregirlo o eliminarlo, deshacé el cobro desde el alquiler';

// "Factura a nombre de" of an expense with IVA. Empty means the owner of the expense account.
function expenseVatHolderFields(db, userId, ivaHolderId) {
  if (ivaHolderId === undefined || ivaHolderId === null || ivaHolderId === '') return { fields: { ivaHolderId: null, ivaHolderName: null } };
  const owner = typeof ivaHolderId === 'string' ? db.findById('legalOwners', ivaHolderId, userId) : null;
  if (!owner) return { error: 'El titular de la factura no es válido' };
  return { fields: { ivaHolderId: owner.id, ivaHolderName: owner.name } };
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { month, accountId } = req.query;

  ledger.ensureSetup(db, userId);

  const transactions = db.findAll('transactions', userId);

  let filtered;
  if (month) {
    filtered = ledger.getMonthMovements(db, userId, transactions, month);
  } else {
    filtered = transactions;
  }

  filtered = filtered.filter(transaction => !accountId || ledger.accountForMovement(db, userId, transaction)?.id === accountId)
    .map(transaction => {
      const account = ledger.accountForMovement(db, userId, transaction);
      return account ? { ...transaction, accountId: transaction.accountId || account.id, currencyCode: transaction.currencyCode || account.currency, accountName: account.nombre } : transaction;
    });

  const transferEvents = db.findAll('transfers', userId)
    .filter(item => (!month || item.fecha?.startsWith(month)) && (!accountId || item.fromAccountId === accountId || item.toAccountId === accountId))
    .map(item => {
      const from = db.findById('accounts', item.fromAccountId, userId);
      const to = db.findById('accounts', item.toAccountId, userId);
      return {
        id: item.id, tipo: 'transfer', isTransfer: true, transferId: item.id,
        titulo: item.reference || (item.fromCurrency === item.toCurrency ? 'Transferencia' : 'Conversión'), notes: item.notes || '',
        fecha: item.fecha, status: item.status, postedAt: item.postedAt,
        accountId: item.fromAccountId, accountName: `${from?.nombre || 'Cuenta archivada'} → ${to?.nombre || 'Cuenta archivada'}`,
        accountIds: [item.fromAccountId, item.toAccountId], fromAccountName: from?.nombre || 'Cuenta archivada', toAccountName: to?.nombre || 'Cuenta archivada',
        fromAccountId: item.fromAccountId, toAccountId: item.toAccountId,
        currencyCode: item.fromCurrency, fromCurrency: item.fromCurrency, toCurrency: item.toCurrency,
        monto: ledger.fromMinorUnits(item.sentMinor, item.fromCurrency),
        receivedAmount: ledger.fromMinorUnits(item.receivedMinor, item.toCurrency),
        feeAmount: ledger.fromMinorUnits(item.feeMinor || 0, item.fromCurrency),
        totalDebit: ledger.fromMinorUnits(item.sentMinor + (item.feeMinor || 0), item.fromCurrency)
      };
    });
  filtered.push(...transferEvents);

  filtered.sort((a, b) => {
    if (a.fecha === b.fecha) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
    return b.fecha.localeCompare(a.fecha);
  });

  res.json(filtered);
});

router.get('/recurring-total', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { month } = req.query;

  if (!month) {
    return res.status(400).json({ error: 'Parámetro month requerido' });
  }

  ledger.ensureSetup(db, userId);
  const currency = ledger.getSettings(db, userId).appCurrency || 'ARS';
  const transactions = db.findAll('transactions', userId);
  let totalRecurrentesMinor = 0;
  const recurrentes = [];

  transactions.forEach(tx => {
    if (tx.recurrente && tx.frecuencia) {
      const instances = generateRecurringInstances(tx, month);
      if (instances.length > 0 && tx.tipo === 'expense' && ledger.accountForMovement(db, userId, tx)?.currency === currency) {
        totalRecurrentesMinor += Number.isSafeInteger(tx.amountMinor) ? tx.amountMinor : (ledger.toMinorUnits(tx.monto, currency) || 0);
        recurrentes.push({
          titulo: tx.titulo,
          monto: tx.monto,
          categoryId: tx.categoryId
        });
      }
    }
  });

  res.json({
    month,
    currency,
    total: ledger.fromMinorUnits(totalRecurrentesMinor, currency),
    items: recurrentes
  });
});

router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { id } = req.params;

  ledger.ensureSetup(db, userId);

  const transaction = db.findById('transactions', id, userId);
  if (!transaction) {
    return res.status(404).json({ error: 'Transacción no encontrada' });
  }
  const account = ledger.accountForMovement(db, userId, transaction);
  res.json(account ? { ...transaction, accountId: transaction.accountId || account.id, currencyCode: transaction.currencyCode || account.currency, accountName: account.nombre } : transaction);
});

router.post('/', (req, res) => {
  const { tipo, monto, titulo, categoryId, fecha, recurrente, frecuencia, fechaFin, clasificacion, montoA, montoB, ivaPorcentaje, comments } = req.body;

  if (!tipo || !['expense', 'income', 'refund'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo inválido. Debe ser: expense, income o refund' });
  }

  if (monto === undefined || monto === null || typeof monto !== 'number' || monto <= 0) {
    return res.status(400).json({ error: 'El monto debe ser un número positivo' });
  }

  if ((tipo === 'expense' || tipo === 'refund') && !categoryId) {
    return res.status(400).json({ error: 'Los gastos y reembolsos requieren una categoría' });
  }

  if (recurrente && frecuencia && !['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'].includes(frecuencia)) {
    return res.status(400).json({ error: 'Frecuencia inválida. Debe ser: monthly, bimonthly, quarterly, semiannual o annual' });
  }

  if (comments !== undefined && typeof comments !== 'string') {
    return res.status(400).json({ error: 'Los comentarios deben ser texto' });
  }

  if (tipo === 'income') {
    if (clasificacion && !['A', 'B', 'Mixto'].includes(clasificacion)) {
      return res.status(400).json({ error: 'Clasificación de ingreso inválida. Debe ser: A, B o Mixto' });
    }
    if (montoA !== undefined || montoB !== undefined) {
      if (clasificacion !== 'Mixto' || typeof montoA !== 'number' || typeof montoB !== 'number' || montoA < 0 || montoB < 0 || sumCents(montoA, montoB) !== roundCents(monto)) {
        return res.status(400).json({ error: 'Los importes A y B deben ser positivos o cero y sumar el monto total' });
      }
    } else if (clasificacion === 'Mixto') {
      return res.status(400).json({ error: 'La clasificación Mixto requiere importes A y B' });
    }
    if (ivaPorcentaje !== undefined && ivaPorcentaje !== null && (typeof ivaPorcentaje !== 'number' || !Number.isFinite(ivaPorcentaje) || ivaPorcentaje < 0 || ivaPorcentaje > 100)) {
      return res.status(400).json({ error: 'El IVA debe ser un número entre 0 y 100' });
    }
  } else if (montoA !== undefined || montoB !== undefined) {
    return res.status(400).json({ error: 'Los importes A y B solo son válidos para ingresos' });
  } else if (ivaPorcentaje !== undefined && ivaPorcentaje !== null && tipo !== 'expense') {
    return res.status(400).json({ error: 'El IVA solo es válido para ingresos y gastos' });
  } else if (ivaPorcentaje !== undefined && ivaPorcentaje !== null && (typeof ivaPorcentaje !== 'number' || !Number.isFinite(ivaPorcentaje) || ivaPorcentaje < 0 || ivaPorcentaje > 100)) {
    return res.status(400).json({ error: 'El IVA debe ser un número entre 0 y 100' });
  } else if (clasificacion && !['fijo', 'variable'].includes(clasificacion)) {
    return res.status(400).json({ error: 'Clasificación inválida. Debe ser: fijo o variable' });
  }

  const db = req.app.locals.db;
  const userId = req.session.userId;

  ledger.ensureSetup(db, userId);
  const settings = ledger.getSettings(db, userId);
  const fallbackAccount = ledger.accountsForUser(db, userId, false).find(account => account.primary);
  const accountId = req.body.accountId || fallbackAccount?.id;
  const account = db.findById('accounts', accountId, userId);
  if (!account || !account.activo) return res.status(400).json({ error: 'Seleccioná una cuenta activa' });
  const amountMinor = ledger.moneyInput(monto, account.currency);
  if (amountMinor === null) return res.status(400).json({ error: 'El monto no es válido para la moneda de la cuenta' });

  let categoryName = null;
  if (categoryId) {
    const category = db.findById('categories', categoryId, userId);
    if (!category) {
      return res.status(400).json({ error: 'Categoría no encontrada' });
    }
    categoryName = category.nombre;
  }

  const finalTitulo = (titulo && titulo.trim()) || categoryName || 'Sin título';
  const refundSourceId = req.body.refundSourceId || null;
  if (refundSourceId && (tipo !== 'refund' || db.findById('transactions', refundSourceId, userId)?.tipo !== 'expense')) {
    return res.status(400).json({ error: 'El gasto de origen del reembolso no es válido' });
  }
  const paymentMethodId = req.body.paymentMethodId || null;
  if (paymentMethodId && !db.findById('paymentMethods', paymentMethodId, userId)) return res.status(400).json({ error: 'El medio de pago no es válido' });
  const paymentMethod = req.body.paymentMethod === undefined || req.body.paymentMethod === null ? '' : req.body.paymentMethod;
  if (typeof paymentMethod !== 'string' || !installments.methodAllowed(paymentMethod, tipo)) return res.status(400).json({ error: 'El medio de pago no es válido' });
  const expenseIva = tipo === 'expense' && ivaPorcentaje !== undefined && ivaPorcentaje !== null && ivaPorcentaje > 0;
  const vatHolder = expenseVatHolderFields(db, userId, expenseIva ? req.body.ivaHolderId : null);
  if (vatHolder.error) return res.status(400).json({ error: vatHolder.error });
  const purchaseDate = fecha || ledger.localDateForUser(db, userId);
  const plan = installmentPlan(db, userId, req.body, { tipo, paymentMethod, amountMinor, currency: account.currency, purchaseDate });
  if (plan.error) return res.status(400).json({ error: plan.error });

  const base = {
    userId,
    tipo,
    monto: ledger.fromMinorUnits(amountMinor, account.currency),
    amountMinor,
    accountId: account.id,
    currencyCode: account.currency,
    ...(tipo === 'income' ? incomeAttribution.incomeHolderSnapshot(db, userId, account) : {}),
    titulo: finalTitulo,
    categoryId: categoryId || null,
    refundSourceId,
    paymentMethodId,
    paymentMethod,
    fecha: purchaseDate,
    recurrente: recurrente || false,
    frecuencia: recurrente ? (frecuencia || 'monthly') : null,
    fechaFin: recurrente ? (fechaFin || null) : null,
    clasificacion: tipo === 'income' ? (clasificacion || null) : (clasificacion || 'variable'),
    montoA: tipo === 'income' && clasificacion === 'Mixto' ? roundCents(montoA) : null,
    montoB: tipo === 'income' && clasificacion === 'Mixto' ? roundCents(montoB) : null,
    ivaPorcentaje: (tipo === 'income' || expenseIva) && ivaPorcentaje !== undefined && ivaPorcentaje !== null ? roundCents(ivaPorcentaje) : null,
    ...(tipo === 'expense' ? vatHolder.fields : {}),
    ...(comments !== undefined ? { comments } : {})
  };

  if (req.body.obligationPayment !== undefined && req.body.obligationPayment !== null) {
    return createObligationPayment(req, res, { tipo, account, plan, base });
  }

  if (!plan.records) {
    const transaction = db.create('transactions', base, userId);
    ledger.refreshAlerts(db, userId);
    return res.status(201).json(transaction);
  }
  // Every record was validated above: the installments are written in one go.
  const created = plan.records(base, finalTitulo).map(record => db.create('transactions', record, userId));
  if (plan.assetId) {
    created.forEach(record => db.create('movementAllocations', {
      transactionId: record.id, amountMinor: record.amountMinor, amount: record.monto, currencyCode: record.currencyCode,
      assetId: plan.assetId, obligationId: null, occurrenceId: null, contractId: null, rentOccurrenceId: null, complete: true
    }, userId));
  }
  ledger.refreshAlerts(db, userId);
  res.status(201).json({ ...created[0], installments: created });
});

// "Atribución del movimiento" of a new expense pointing at a due date (vencimiento): the expense is saved as a payment
// of that occurrence through the same service as "Registrar pago" (same record, validation and audit entry). The whole
// movement is the payment, so it pays one occurrence; it is reverted with "Revertir pago", like any other payment.
function createObligationPayment(req, res, { tipo, account, plan, base }) {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const input = req.body.obligationPayment;
  if (tipo !== 'expense') return res.status(400).json({ error: 'Solo un gasto puede registrar el pago de un vencimiento' });
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.occurrenceId !== 'string') return res.status(400).json({ error: 'El vencimiento a pagar no es válido' });
  if (plan.records) return res.status(400).json({ error: 'Las cuotas no se pueden combinar con el pago de un vencimiento' });
  if (req.body.recurrente) return res.status(400).json({ error: 'El pago de un vencimiento no puede ser recurrente' });
  const occurrence = db.findById('obligationOccurrences', input.occurrenceId, userId);
  const obligation = occurrence ? db.findById('obligations', occurrence.obligationId, userId) : null;
  if (!occurrence || !obligation) return res.status(400).json({ error: 'El vencimiento a pagar no es válido' });
  if (typeof req.body.comments !== 'string' || !req.body.comments.trim()) return res.status(400).json({ error: 'Los comentarios son obligatorios para registrar el pago de un vencimiento' });
  const userTitle = typeof req.body.titulo === 'string' ? req.body.titulo.trim() : '';
  const result = obligationPayments.register(db, userId, {
    obligation, occurrence,
    input: {
      amount: req.body.monto, accountId: account.id, categoryId: req.body.categoryId, date: base.fecha,
      // An empty title falls back to the due date title, as in "Registrar pago".
      paymentMethod: base.paymentMethod, title: userTitle, notes: req.body.comments,
      idempotencyKey: typeof input.idempotencyKey === 'string' ? input.idempotencyKey : crypto.randomUUID()
    },
    extraFields: { clasificacion: base.clasificacion, ivaPorcentaje: base.ivaPorcentaje, ivaHolderId: base.ivaHolderId, ivaHolderName: base.ivaHolderName }
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  const occurrenceView = obligations.occurrenceView(db, userId, occurrence, ledger.localDateForUser(db, userId));
  if (result.replayed) return res.json({ ...result.transaction, paidOccurrence: occurrenceView, replayed: true });
  res.locals.activityMeta = { ...obligationPayments.activityMeta(db, userId, obligation, occurrence, result), action: 'obligation.payment' };
  ledger.refreshAlerts(db, userId);
  res.status(201).json({ ...result.transaction, paidOccurrence: occurrenceView });
}

// Installment flows of a new transaction. Returns {} (single transaction), { records(base, title), assetId } or { error }.
function installmentPlan(db, userId, body, { tipo, paymentMethod, amountMinor, currency, purchaseDate }) {
  const { chequeInstallments, creditInstallments } = body;
  if (chequeInstallments === undefined && creditInstallments === undefined) return {};
  if (chequeInstallments !== undefined && creditInstallments !== undefined) return { error: 'Elegí cuotas con cheque o con crédito, no ambas' };
  if (body.recurrente) return { error: 'Las cuotas no se pueden combinar con una transacción recurrente' };
  if (body.clasificacion === 'Mixto') return { error: 'La clasificación Mixto no admite cuotas' };
  if (!installments.isValidDate(purchaseDate)) return { error: 'La fecha no es válida' };
  let assetId = null;
  if (body.attributionAssetId !== undefined && body.attributionAssetId !== null && body.attributionAssetId !== '') {
    if (typeof body.attributionAssetId !== 'string' || !db.findById('assets', body.attributionAssetId, userId)) return { error: 'El bien de la atribución no es válido' };
    assetId = body.attributionAssetId;
  }
  if (chequeInstallments !== undefined) {
    if (!['expense', 'income'].includes(tipo)) return { error: 'Las cuotas con cheque solo se admiten en gastos e ingresos' };
    if (paymentMethod !== 'Cheque') return { error: 'Las cuotas con cheque requieren el medio de pago Cheque' };
    const schedule = installments.chequeSchedule(chequeInstallments, amountMinor, currency);
    if (schedule.error) return schedule;
    const chequeGroupId = crypto.randomUUID();
    return {
      assetId,
      records: (base, title) => schedule.rows.map(row => ({
        ...base, monto: ledger.fromMinorUnits(row.amountMinor, currency), amountMinor: row.amountMinor, fecha: row.dueDate,
        titulo: `${title} — Cheque cuota ${row.number}/${row.total}`, paymentMethod: 'Cheque', status: 'pending', chequeGroupId,
        chequeInstallment: { number: row.number, total: row.total, dueDate: row.dueDate, originalDate: purchaseDate, chequeNumber: row.chequeNumber, baseTitle: title }
      }))
    };
  }
  if (tipo !== 'expense') return { error: 'Las cuotas con crédito solo se admiten en gastos' };
  if (paymentMethod !== 'Crédito') return { error: 'Las cuotas con crédito requieren el medio de pago Crédito' };
  if (!creditInstallments || typeof creditInstallments !== 'object' || Array.isArray(creditInstallments)) return { error: 'Las cuotas de crédito no son válidas' };
  const interestPercent = creditInstallments.interestPercent === undefined || creditInstallments.interestPercent === null ? 0 : creditInstallments.interestPercent;
  const schedule = installments.creditSchedule({ baseMinor: amountMinor, count: creditInstallments.count, interestPercent, purchaseDate });
  if (schedule.error) return schedule;
  const creditGroupId = crypto.randomUUID();
  return {
    assetId,
    records: (base, title) => schedule.rows.map(row => {
      const amount = { monto: ledger.fromMinorUnits(row.amountMinor, currency), amountMinor: row.amountMinor, paymentMethod: 'Crédito' };
      // A single installment is an ordinary expense on the purchase date (with the interest applied, if any).
      if (row.total === 1) return { ...base, ...amount };
      return {
        ...base, ...amount, fecha: row.date, titulo: `«${title}» — cuota ${row.number}/${row.total}`, creditGroupId,
        creditInstallment: { number: row.number, total: row.total, interestPercent, purchaseDate, purchaseTitle: title, baseAmountMinor: amountMinor }
      };
    })
  };
}

// Confirms a pending transaction (a cheque installment): from now on it counts in the totals of its month.
router.post('/:id/confirm', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const transaction = db.findById('transactions', req.params.id, userId);
  if (!transaction) return res.status(404).json({ error: 'Transacción no encontrada' });
  if (!isPendingTransaction(transaction)) return res.status(409).json({ error: 'La transacción no está pendiente de confirmación' });
  const updated = db.update('transactions', transaction.id, { status: 'posted', confirmedAt: new Date().toISOString() }, userId);
  ledger.refreshAlerts(db, userId);
  res.json(updated);
});

// Undoes a confirmation (with a reason): the transaction goes back to pending and leaves the totals again.
router.post('/:id/unconfirm', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const transaction = db.findById('transactions', req.params.id, userId);
  if (!transaction) return res.status(404).json({ error: 'Transacción no encontrada' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason || reason.length > 500) return res.status(400).json({ error: 'Indicá el motivo (hasta 500 caracteres)' });
  if (isPendingTransaction(transaction) || !transaction.confirmedAt) return res.status(409).json({ error: 'La transacción no tiene una confirmación para deshacer' });
  const updated = db.update('transactions', transaction.id, { status: 'pending', confirmedAt: null, unconfirmedAt: new Date().toISOString(), unconfirmReason: reason }, userId);
  ledger.refreshAlerts(db, userId);
  res.json(updated);
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { id } = req.params;
  const { tipo, monto, titulo, categoryId, fecha, recurrente, frecuencia, fechaFin, clasificacion, montoA, montoB, ivaPorcentaje, comments } = req.body;

  const transaction = db.findById('transactions', id, userId);
  if (!transaction) {
    return res.status(404).json({ error: 'Transacción no encontrada' });
  }
  if (transaction.obligationOccurrenceId) return res.status(409).json({ error: 'Los pagos vinculados a obligaciones son inmutables; usá "Revertir pago" para anularlos y registrá uno nuevo si hace falta' });
  if (transaction.rentCollectionId) return res.status(409).json({ error: 'Para corregir un cobro de alquiler, eliminá la transacción: el período vuelve a quedar pendiente de cobro' });
  if (transaction.mirrorRentCollectionId) return res.status(409).json({ error: MIRROR_LOCKED });

  const updates = {};
  const paymentMethodId = req.body.paymentMethodId !== undefined ? (req.body.paymentMethodId || null) : transaction.paymentMethodId || null;
  if (paymentMethodId && !db.findById('paymentMethods', paymentMethodId, userId)) return res.status(400).json({ error: 'El medio de pago no es válido' });
  if (req.body.paymentMethod !== undefined) {
    // A legacy free-text value is kept as long as it is not changed; any new value must be one of the fixed methods.
    const nextTipo = tipo !== undefined ? tipo : transaction.tipo;
    const unchanged = req.body.paymentMethod === (transaction.paymentMethod || '');
    if (typeof req.body.paymentMethod !== 'string' || (!unchanged && !installments.methodAllowed(req.body.paymentMethod, nextTipo))) return res.status(400).json({ error: 'El medio de pago no es válido' });
    updates.paymentMethod = req.body.paymentMethod;
  }
  if (req.body.paymentMethodId !== undefined) updates.paymentMethodId = paymentMethodId;
  const accountId = req.body.accountId !== undefined ? req.body.accountId : transaction.accountId;
  if (accountId !== undefined) {
    const account = db.findById('accounts', accountId, userId);
    if (!account) return res.status(400).json({ error: 'Cuenta no encontrada' });
    if (req.body.accountId !== undefined && !account.activo) return res.status(400).json({ error: 'Seleccioná una cuenta activa' });
    updates.accountId = account.id;
    updates.currencyCode = account.currency;
    const finalAmount = monto !== undefined ? monto : transaction.monto;
    const amountMinor = ledger.moneyInput(finalAmount, account.currency);
    if (amountMinor === null) return res.status(400).json({ error: 'El monto no es válido para la moneda de la cuenta' });
    if (req.body.accountId !== undefined && req.body.accountId !== transaction.accountId && finalAmount !== ledger.fromMinorUnits(amountMinor, account.currency)) {
      return res.status(400).json({ error: 'El importe no representa una cantidad válida en la moneda nueva; revisalo antes de cambiar la cuenta' });
    }
    updates.amountMinor = amountMinor;
    if (monto !== undefined) updates.monto = ledger.fromMinorUnits(amountMinor, account.currency);
  }
  const finalTipo = tipo !== undefined ? tipo : transaction.tipo;
  if (req.body.refundSourceId !== undefined) {
    if (req.body.refundSourceId && (finalTipo !== 'refund' || db.findById('transactions', req.body.refundSourceId, userId)?.tipo !== 'expense')) return res.status(400).json({ error: 'El gasto de origen del reembolso no es válido' });
    updates.refundSourceId = req.body.refundSourceId || null;
  } else if (finalTipo !== 'refund' && transaction.refundSourceId) {
    updates.refundSourceId = null;
  }
  if (comments !== undefined) {
    if (typeof comments !== 'string') return res.status(400).json({ error: 'Los comentarios deben ser texto' });
    updates.comments = comments;
  }
  if (montoA !== undefined || montoB !== undefined) {
    if (finalTipo !== 'income') return res.status(400).json({ error: 'Los importes A y B solo son válidos para ingresos' });
    const finalMonto = monto !== undefined ? monto : transaction.monto;
    const finalClasificacion = clasificacion !== undefined ? clasificacion : transaction.clasificacion;
    if (finalClasificacion !== 'Mixto' || typeof montoA !== 'number' || typeof montoB !== 'number' || montoA < 0 || montoB < 0 || sumCents(montoA, montoB) !== roundCents(finalMonto)) {
      return res.status(400).json({ error: 'Los importes A y B deben ser positivos o cero y sumar el monto total' });
    }
  }
  if (ivaPorcentaje !== undefined && ivaPorcentaje !== null) {
    if (finalTipo !== 'income' && finalTipo !== 'expense') return res.status(400).json({ error: 'El IVA solo es válido para ingresos y gastos' });
    if (typeof ivaPorcentaje !== 'number' || !Number.isFinite(ivaPorcentaje) || ivaPorcentaje < 0 || ivaPorcentaje > 100) {
      return res.status(400).json({ error: 'El IVA debe ser un número entre 0 y 100' });
    }
  }
  if (tipo !== undefined) {
    if (!['expense', 'income', 'refund'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido' });
    }
    updates.tipo = tipo;
  }
  if (monto !== undefined) {
    if (typeof monto !== 'number' || monto <= 0) {
      return res.status(400).json({ error: 'El monto debe ser un número positivo' });
    }
    if (accountId === undefined) {
      updates.monto = Math.round(monto * 100) / 100;
      updates.amountMinor = ledger.toMinorUnits(updates.monto, transaction.currencyCode || 'EUR');
    }
  }
  if (titulo !== undefined) updates.titulo = titulo.trim();
  if (categoryId !== undefined) updates.categoryId = categoryId || null;
  if (fecha !== undefined) updates.fecha = fecha;
  if (recurrente !== undefined) updates.recurrente = recurrente;
  if (recurrente === false) {
    updates.frecuencia = null;
    updates.fechaFin = null;
  } else if (frecuencia !== undefined) {
    if (frecuencia && !['monthly', 'bimonthly', 'quarterly', 'semiannual', 'annual'].includes(frecuencia)) {
      return res.status(400).json({ error: 'Frecuencia inválida' });
    }
    updates.frecuencia = frecuencia || 'monthly';
  }
  if (recurrente !== false && fechaFin !== undefined) {
    updates.fechaFin = fechaFin || null;
  }
  if (clasificacion !== undefined) {
    const validClassifications = finalTipo === 'income' ? ['A', 'B', 'Mixto'] : ['fijo', 'variable'];
    if (!validClassifications.includes(clasificacion)) {
      return res.status(400).json({ error: 'Clasificación inválida' });
    }
    updates.clasificacion = clasificacion;
  }
  if (ivaPorcentaje !== undefined) {
    updates.ivaPorcentaje = ivaPorcentaje === null ? null : roundCents(ivaPorcentaje);
  }
  if (finalTipo === 'expense') {
    const finalIva = ivaPorcentaje !== undefined ? ivaPorcentaje : transaction.ivaPorcentaje;
    if (!(Number(finalIva) > 0)) {
      if (transaction.ivaHolderId || transaction.ivaPorcentaje) Object.assign(updates, { ivaPorcentaje: null, ivaHolderId: null, ivaHolderName: null });
    } else if (req.body.ivaHolderId !== undefined) {
      const vatHolder = expenseVatHolderFields(db, userId, req.body.ivaHolderId);
      if (vatHolder.error) return res.status(400).json({ error: vatHolder.error });
      Object.assign(updates, vatHolder.fields);
    }
  } else if (transaction.ivaHolderId) {
    Object.assign(updates, { ivaHolderId: null, ivaHolderName: null });
  }

  const finalCategoryId = updates.categoryId !== undefined ? updates.categoryId : transaction.categoryId;

  if (finalTipo === 'income' && clasificacion === undefined && !['A', 'B', 'Mixto', null, undefined].includes(transaction.clasificacion)) {
    updates.clasificacion = null;
  }
  if (finalTipo !== 'income' && transaction.tipo === 'income' && tipo !== undefined && clasificacion === undefined) {
    updates.clasificacion = 'variable';
    updates.montoA = null;
    updates.montoB = null;
    updates.ivaPorcentaje = null;
  }
  if (finalTipo === 'income' && clasificacion !== 'Mixto' && clasificacion !== undefined) {
    updates.montoA = null;
    updates.montoB = null;
  }
  if (finalTipo === 'income' && (clasificacion === 'Mixto' || (clasificacion === undefined && transaction.clasificacion === 'Mixto')) && (montoA === undefined || montoB === undefined)) {
    if (clasificacion === 'Mixto' || monto !== undefined) {
      return res.status(400).json({ error: 'La clasificación Mixto requiere importes A y B' });
    }
  }

  if (finalTipo === 'income' && (clasificacion === 'Mixto' || (clasificacion === undefined && transaction.clasificacion === 'Mixto')) && montoA !== undefined && montoB !== undefined) {
    updates.montoA = roundCents(montoA);
    updates.montoB = roundCents(montoB);
  } else if (finalTipo !== 'income' && (montoA !== undefined || montoB !== undefined)) {
    return res.status(400).json({ error: 'Los importes A y B solo son válidos para ingresos' });
  }

  if ((finalTipo === 'expense' || finalTipo === 'refund') && !finalCategoryId) {
    return res.status(400).json({ error: 'Los gastos y reembolsos requieren una categoría' });
  }

  if (finalCategoryId) {
    const category = db.findById('categories', finalCategoryId, userId);
    if (!category) {
      return res.status(400).json({ error: 'Categoría no encontrada' });
    }
  }

  const hasFinancialAssociations = db.findAll('movementAllocations', userId).some(item => item.transactionId === transaction.id)
    || db.findAll('recoverableExpenseClaims', userId).some(item => item.transactionId === transaction.id)
    || Boolean(transaction.recoverableClaimId)
    || db.findAll('recoveries', userId).some(item => item.transactionId === transaction.id);
  const finalAccount = db.findById('accounts', updates.accountId || transaction.accountId, userId);
  const finalAmountMinor = updates.amountMinor === undefined ? finance.transactionMinor(transaction, db, userId) : updates.amountMinor;
  const financialIdentityChanged = finalTipo !== transaction.tipo
    || finalAmountMinor !== finance.transactionMinor(transaction, db, userId)
    || (updates.accountId !== undefined && updates.accountId !== transaction.accountId)
    || (finalAccount && finalAccount.currency !== finance.transactionCurrency(transaction, db, userId));
  if (hasFinancialAssociations && financialIdentityChanged) return res.status(409).json({ error: 'Este movimiento tiene asignaciones o historial de reintegros; no se puede cambiar su importe, tipo, cuenta o moneda' });

  const linkedNormalization = db.findAll('transfers', userId).some(transfer => [...(transfer.normalizationAllocations || []), ...(transfer.pendingAllocations || [])].some(item => item.sourceType === 'income' && item.sourceId === transaction.id));
  if (transaction.tipo === 'income' && linkedNormalization && (updates.monto !== undefined || updates.accountId !== undefined || finalTipo !== 'income')) {
    return res.status(409).json({ error: 'Este ingreso sostiene conversiones vinculadas; revierte primero las conversiones' });
  }

  if (req.body.effectiveFromDate !== undefined) {
    const effectiveFromDate = req.body.effectiveFromDate;
    if (!transaction.recurrente || !transaction.frecuencia || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFromDate)) return res.status(400).json({ error: 'La edición futura requiere una fecha de ocurrencia válida' });
    const currentStart = transaction.effectiveFromDate || transaction.fecha;
    if (effectiveFromDate < currentStart) return res.status(409).json({ error: 'No se puede aplicar una edición a una versión anterior de la recurrencia' });
    const isOccurrence = ledger.getMonthMovements(db, userId, db.findAll('transactions', userId), effectiveFromDate.slice(0, 7))
      .some(item => item.isRecurringInstance && item.originalId === transaction.id && item.fecha === effectiveFromDate);
    if (!isOccurrence) return res.status(400).json({ error: 'La fecha no corresponde a una ocurrencia programada' });
    if (effectiveFromDate > currentStart) {
      const end = new Date(`${effectiveFromDate}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() - 1);
      db.create('recurrenceRevisions', {
        templateId: transaction.id,
        effectiveFromDate: currentStart,
        effectiveUntilDate: end.toISOString().slice(0, 10),
        template: { ...transaction }
      }, userId);
    }
    updates.effectiveFromDate = effectiveFromDate;
  }

  const updated = db.update('transactions', id, updates, userId);
  ledger.refreshAlerts(db, userId);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { id } = req.params;

  const transaction = db.findById('transactions', id, userId);
  if (!transaction) {
    return res.status(404).json({ error: 'Transacción no encontrada' });
  }

  if (transaction.obligationOccurrenceId) return res.status(409).json({ error: 'Los pagos vinculados a obligaciones no se pueden eliminar; usá "Revertir pago" en la obligación' });
  if (transaction.mirrorRentCollectionId) return res.status(409).json({ error: MIRROR_LOCKED });
  if (transaction.rentCollectionId) {
    const result = rentals.reverseCollection(db, userId, transaction.rentCollectionId, req.app.locals.documentStorage);
    if (result.error) return res.status(result.status || 409).json({ error: result.error });
    return res.json({ ok: true, collectionId: result.collectionId, reopenedOccurrenceIds: result.reopenedOccurrenceIds, reconciliationReset: result.reconciliationReset });
  }

  const linkedNormalization = db.findAll('transfers', userId).some(transfer => [...(transfer.normalizationAllocations || []), ...(transfer.pendingAllocations || [])].some(item => item.sourceType === 'income' && item.sourceId === transaction.id));
  const linkedRefund = db.findAll('transactions', userId).some(item => item.tipo === 'refund' && item.refundSourceId === transaction.id);
  if (linkedNormalization || linkedRefund) return res.status(409).json({ error: 'Este movimiento tiene referencias activas; resuélvelas antes de eliminarlo' });
  const hasFinancialAssociations = db.findAll('movementAllocations', userId).some(item => item.transactionId === transaction.id)
    || db.findAll('recoverableExpenseClaims', userId).some(item => item.transactionId === transaction.id)
    || transaction.recoverableClaimId
    || db.findAll('recoveries', userId).some(item => item.transactionId === transaction.id);
  if (hasFinancialAssociations) return res.status(409).json({ error: 'Este movimiento tiene asignaciones o historial de reintegros; no se puede eliminar' });

  db.remove('transactions', id, userId);
  const removedDocumentIds = releaseReceipts(req, db, userId, id);
  ledger.refreshAlerts(db, userId);
  res.json({ ok: true, ...(removedDocumentIds.length ? { deletedDocumentIds: removedDocumentIds } : {}) });
});

// Receipts attached only to a deleted movement go with it (metadata and stored file); a receipt that also
// belongs to something else (an asset, an obligation...) just loses the link to the movement.
function releaseReceipts(req, db, userId, transactionId) {
  const otherTargets = ['assetId', 'entityId', 'obligationId', 'contractId', 'occurrenceId', 'rentOccurrenceId', 'tenantEntityId', 'declarationId'];
  const removed = [];
  db.findAll('documents', userId).filter(item => item.transactionId === transactionId).forEach(item => {
    if (otherTargets.some(field => item[field])) {
      db.update('documents', item.id, { transactionId: null }, userId);
      return;
    }
    db.remove('documents', item.id, userId);
    removed.push(item.id);
    try { req.app.locals.documentStorage?.remove(userId, item.storageKey); } catch { /* an orphan file is harmless */ }
  });
  return removed;
}

router.post('/:id/occurrences/:date/post', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const template = db.findById('transactions', req.params.id, userId);
  const { date } = req.params;
  if (!template || !template.recurrente || !template.frecuencia) return res.status(404).json({ error: 'Recurrencia no encontrada' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < template.fecha || (template.fechaFin && date > template.fechaFin)) return res.status(400).json({ error: 'Fecha de ocurrencia no válida' });
  if (date > ledger.localDateForUser(db, userId)) return res.status(409).json({ error: 'La ocurrencia futura sigue programada y no se puede contabilizar todavía' });
  const occurrence = ledger.getMonthMovements(db, userId, [template], date.slice(0, 7)).find(item => item.isRecurringInstance && item.fecha === date);
  if (!occurrence) return res.status(404).json({ error: 'No existe una ocurrencia en esa fecha' });
  if (occurrence.occurrenceStatus === 'posted') return res.json(occurrence);
  const account = ledger.accountForMovement(db, userId, occurrence);
  const amountMinor = ledger.moneyInput(occurrence.monto, account.currency);
  const existing = db.findAll('recurringOccurrences', userId).find(item => item.templateId === template.id && item.date === date);
  const snapshot = {
    tipo: occurrence.tipo, accountId: account.id, currencyCode: account.currency,
    monto: ledger.fromMinorUnits(amountMinor, account.currency), titulo: occurrence.titulo,
    categoryId: occurrence.categoryId, clasificacion: occurrence.clasificacion,
    comments: occurrence.comments
  };
  const stored = existing
    ? db.update('recurringOccurrences', existing.id, { status: 'posted', amountMinor, overrides: { ...snapshot, ...(existing.overrides || {}) }, postedAt: ledger.localDateForUser(db, userId) }, userId)
    : db.create('recurringOccurrences', { templateId: template.id, date, status: 'posted', amountMinor, overrides: snapshot, postedAt: ledger.localDateForUser(db, userId) }, userId);
  ledger.refreshAlerts(db, userId);
  res.status(201).json({ ...occurrence, occurrenceId: stored.id, occurrenceStatus: 'posted', amountMinor });
});

router.put('/:id/occurrences/:date', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const template = db.findById('transactions', req.params.id, userId);
  const { date } = req.params;
  if (!template || !template.recurrente || !template.frecuencia) return res.status(404).json({ error: 'Recurrencia no encontrada' });
  const allowed = ['monto', 'titulo', 'categoryId', 'accountId', 'comments', 'clasificacion'];
  const overrides = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  const account = db.findById('accounts', overrides.accountId || template.accountId, userId) || ledger.accountForMovement(db, userId, template);
  if (!account || !account.activo) return res.status(400).json({ error: 'Seleccioná una cuenta activa' });
  if (overrides.categoryId && !db.findById('categories', overrides.categoryId, userId)) return res.status(400).json({ error: 'Categoría no encontrada' });
  if (overrides.categoryId === null || (overrides.categoryId === undefined && !template.categoryId)) return res.status(400).json({ error: 'Los gastos requieren una categoría' });
  if (overrides.comments !== undefined && typeof overrides.comments !== 'string') return res.status(400).json({ error: 'Los comentarios deben ser texto' });
  const amount = overrides.monto === undefined ? template.monto : overrides.monto;
  const amountMinor = ledger.moneyInput(amount, account.currency);
  if (amountMinor === null) return res.status(400).json({ error: 'El monto no es válido para la moneda de la cuenta' });
  overrides.accountId = account.id;
  overrides.currencyCode = account.currency;
  overrides.monto = ledger.fromMinorUnits(amountMinor, account.currency);
  const old = db.findAll('recurringOccurrences', userId).find(item => item.templateId === template.id && item.date === date);
  const occurrence = old
    ? db.update('recurringOccurrences', old.id, { overrides, amountMinor }, userId)
    : db.create('recurringOccurrences', { templateId: template.id, date, status: 'scheduled', overrides, amountMinor }, userId);
  ledger.refreshAlerts(db, userId);
  res.json(occurrence);
});

router.delete('/:id/occurrences/:date', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const template = db.findById('transactions', req.params.id, userId);
  const { date } = req.params;
  if (!template || !template.recurrente || !template.frecuencia) return res.status(404).json({ error: 'Recurrencia no encontrada' });
  const existing = db.findAll('recurringOccurrences', userId).find(item => item.templateId === template.id && item.date === date);
  if (existing?.status === 'posted') return res.status(409).json({ error: 'Una ocurrencia contabilizada no se puede omitir; corrige la transacción publicada' });
  const occurrence = existing
    ? db.update('recurringOccurrences', existing.id, { status: 'skipped' }, userId)
    : db.create('recurringOccurrences', { templateId: template.id, date, status: 'skipped', overrides: {} }, userId);
  ledger.refreshAlerts(db, userId);
  res.json(occurrence);
});

module.exports = router;
