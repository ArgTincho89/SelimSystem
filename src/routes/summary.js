const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getIncomeBreakdown, getIncomePercentages, getIncomeIva, roundCents, percentOf } = require('../utils/income');
const ledger = require('../services/account-ledger');
const incomeAttribution = require('../services/income-attribution');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { month } = req.query;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Parámetro month requerido (formato YYYY-MM)' });
  }

  const transactions = db.findAll('transactions', userId);
  ledger.ensureSetup(db, userId);
  const settings = ledger.getSettings(db, userId);
  const appCurrency = settings?.appCurrency || 'ARS';
  const today = ledger.localDateForUser(db, userId);
  const monthTransactions = ledger.getMonthMovements(db, userId, transactions, month).filter(transaction =>
    (!transaction.isRecurringInstance || transaction.occurrenceStatus === 'posted') &&
    (!transaction.recurrente || transaction.fecha <= today)
  );
  const currencyTransactions = monthTransactions.filter(transaction => ledger.accountForMovement(db, userId, transaction)?.currency === appCurrency);
  const incomeBreakdownByHolder = incomeAttribution.holderTotals(db, userId, monthTransactions);

  let totalIngresos = 0;
  let totalIngresosA = 0;
  let totalIngresosB = 0;
  let totalIngresosAMinor = 0;
  let totalIngresosBMinor = 0;
  let totalIvaMinor = 0;
  let totalGastos = 0;
  let totalReembolsos = 0;
  let totalFijos = 0;
  let totalVariables = 0;
  let totalFijosMinor = 0;
  let totalVariablesMinor = 0;

  const porCategoria = {};

  const categories = db.findAll('categories', userId);
  const catMap = {};
  categories.forEach(c => catMap[c.id] = c);

  categories.forEach(cat => {
    porCategoria[cat.id] = {
      categoryId: cat.id,
      nombre: cat.nombre,
      color: cat.color,
      parentId: cat.parentId || null,
      gastosMinor: 0,
      reembolsosMinor: 0,
      gastos: 0,
      reembolsos: 0,
      neto: 0
    };
  });

  currencyTransactions.forEach(t => {
    const amountMinor = Number.isSafeInteger(t.amountMinor) ? t.amountMinor : (ledger.toMinorUnits(t.monto, appCurrency) || 0);
    if (t.tipo === 'income') {
      const breakdown = getIncomeBreakdown(t);
      totalIngresosAMinor += ledger.toMinorUnits(breakdown.a, appCurrency) || 0;
      totalIngresosBMinor += ledger.toMinorUnits(breakdown.b, appCurrency) || 0;
      totalIvaMinor += ledger.toMinorUnits(getIncomeIva(t), appCurrency) || 0;
    } else if (t.tipo === 'expense') {
      if (t.clasificacion === 'fijo') {
        totalFijosMinor += amountMinor;
      } else {
        totalVariablesMinor += amountMinor;
      }
      if (porCategoria[t.categoryId]) {
        porCategoria[t.categoryId].gastosMinor += amountMinor;
      }
    } else if (t.tipo === 'refund') {
      if (porCategoria[t.categoryId]) {
        porCategoria[t.categoryId].reembolsosMinor += amountMinor;
      }
    }
  });

  const postedFees = db.findAll('transfers', userId).filter(item => item.status === 'posted' && item.feeMinor && (item.postedAt || item.fecha)?.startsWith(month) && item.fromCurrency === appCurrency);
  postedFees.forEach(item => {
    if (porCategoria[item.feeCategoryId]) porCategoria[item.feeCategoryId].gastosMinor += item.feeMinor;
    totalVariablesMinor += item.feeMinor;
  });

  const currencyTotals = ledger.incomeByCurrency(db, userId, transactions, month);
  const selectedTotals = currencyTotals[appCurrency] || {
    currency: appCurrency, originalIncomeMinor: 0, normalizedIncomeMinor: 0, incomeMinor: 0,
    expensesMinor: 0, refundsMinor: 0, savingsMinor: 0
  };
  const factor = 10 ** ledger.currencyPrecision(appCurrency);
  totalIngresos = selectedTotals.incomeMinor / factor;
  totalGastos = selectedTotals.expensesMinor / factor;
  totalReembolsos = selectedTotals.refundsMinor / factor;
  const normalizedIncome = selectedTotals.normalizedIncomeMinor / factor;
  const gastosNetosMinor = selectedTotals.expensesMinor - selectedTotals.refundsMinor;
  const ahorroMinor = selectedTotals.incomeMinor - gastosNetosMinor;
  const gastosNetos = gastosNetosMinor / factor;
  const ahorro = ahorroMinor / factor;
  totalIngresosA = totalIngresosAMinor / factor;
  totalIngresosB = totalIngresosBMinor / factor;
  totalFijos = totalFijosMinor / factor;
  totalVariables = totalVariablesMinor / factor;
  const incomePercentages = getIncomePercentages(totalIngresosA, totalIngresosB);

  Object.values(porCategoria).forEach(cat => {
    cat.gastos = cat.gastosMinor / factor;
    cat.reembolsos = cat.reembolsosMinor / factor;
    cat.neto = (cat.gastosMinor - cat.reembolsosMinor) / factor;
  });

  Object.values(porCategoria).forEach(cat => {
    if (!cat.parentId) {
      const children = Object.values(porCategoria).filter(c => c.parentId === cat.categoryId);
      children.forEach(child => {
        cat.gastosMinor += child.gastosMinor;
        cat.reembolsosMinor += child.reembolsosMinor;
        cat.gastos = cat.gastosMinor / factor;
        cat.reembolsos = cat.reembolsosMinor / factor;
        cat.neto = (cat.gastosMinor - cat.reembolsosMinor) / factor;
      });
    }
  });

  const categoriasOrdenadas = Object.values(porCategoria)
    .filter(cat => cat.gastos > 0 || cat.reembolsos > 0)
    .sort((a, b) => b.neto - a.neto);

  const childMap = {};
  categoriasOrdenadas.forEach(cat => {
    if (cat.parentId) {
      if (!childMap[cat.parentId]) childMap[cat.parentId] = [];
      childMap[cat.parentId].push(cat);
    }
  });

  const stripMinorFields = cat => {
    const { gastosMinor, reembolsosMinor, ...publicCategory } = cat;
    return publicCategory;
  };
  const parentsWithChildren = [];
  categoriasOrdenadas.filter(c => !c.parentId).forEach(cat => {
    parentsWithChildren.push({ ...stripMinorFields(cat), children: (childMap[cat.categoryId] || []).map(stripMinorFields) });
  });

  Object.keys(childMap).forEach(parentId => {
    if (!parentsWithChildren.find(p => p.categoryId === parentId)) {
      const parentData = porCategoria[parentId];
      if (parentData) {
         parentsWithChildren.push({ ...stripMinorFields(parentData), children: childMap[parentId].map(stripMinorFields) });
      }
    }
  });

  const goals = db.findAll('goals', userId).filter(g =>
     g.meses && g.meses.includes(month) && (g.currencyCode || 'EUR') === appCurrency
  );
  const metas = goals.map(g => {
    let meta = 0;
    if (g.modo === 'monto_fijo') {
      meta = ledger.fromMinorUnits(ledger.toMinorUnits(g.montoFijo || 0, appCurrency) || 0, appCurrency);
    } else if (g.modo === 'porcentaje_salario') {
      meta = percentOf(g.salarioEstimado || 0, g.porcentaje || 0);
    } else if (g.modo === 'porcentaje_ingresos_dinamico') {
      meta = percentOf(totalIngresos, g.porcentaje || 0);
    }

    let progresoActual = 0;
    if (g.tipo === 'ahorro_mensual') {
      progresoActual = ahorro;
    } else if (g.tipo === 'gasto_categoria') {
      const cat = porCategoria[g.categoryId];
      progresoActual = cat ? cat.neto : 0;
    } else if (g.tipo === 'gasto_general') {
      progresoActual = gastosNetos;
    }

    return {
      id: g.id,
      tipo: g.tipo,
      modo: g.modo,
      meta: ledger.fromMinorUnits(ledger.toMinorUnits(meta, appCurrency) || 0, appCurrency),
      progresoActual: ledger.fromMinorUnits(ledger.toMinorUnits(progresoActual, appCurrency) || 0, appCurrency),
      categoryId: g.categoryId || null,
      categoryName: g.categoryName || null
    };
  });

  res.json({
    month,
    ingresos: totalIngresos,
    ingresosA: roundCents(totalIngresosA),
    ingresosB: roundCents(totalIngresosB),
    porcentajeA: incomePercentages.porcentajeA,
    porcentajeB: incomePercentages.porcentajeB,
    ingresosDesglose: {
      A: roundCents(totalIngresosA),
      B: roundCents(totalIngresosB),
      porcentajeA: incomePercentages.porcentajeA,
      porcentajeB: incomePercentages.porcentajeB
    },
    ivaAcumulado: ledger.fromMinorUnits(totalIvaMinor, appCurrency),
    incomeBreakdownByHolder,
    ivaByHolder: incomeBreakdownByHolder.map(({ ownerId, ownerName, currency, iva }) => ({ ownerId, ownerName, currency, amount: iva })),
    gastos: totalGastos,
    reembolsos: totalReembolsos,
    gastosNetos,
    ahorro,
    normalizedIncome,
    fijos: totalFijos,
    variables: totalVariables,
    porCategoria: parentsWithChildren,
    metas,
    activeCurrency: appCurrency,
    currencyTotals: Object.values(currencyTotals).map(total => ({
      currency: total.currency,
      originalIncome: total.originalIncomeMinor / (10 ** ledger.currencyPrecision(total.currency)),
      normalizedIncome: total.normalizedIncomeMinor / (10 ** ledger.currencyPrecision(total.currency)),
      income: total.incomeMinor / (10 ** ledger.currencyPrecision(total.currency)),
      expenses: total.expensesMinor / (10 ** ledger.currencyPrecision(total.currency)),
      refunds: total.refundsMinor / (10 ** ledger.currencyPrecision(total.currency)),
      savings: total.savingsMinor / (10 ** ledger.currencyPrecision(total.currency))
    }))
  });
});

const VALID_COMPARE = [1, 3, 6, 12];

function getCumulativeDaily(transactions, month, currency) {
  const dailyTotals = {};
  let maxDay = 0;
  transactions.forEach(t => {
    if (t.tipo === 'expense' || t.tipo === 'refund') {
      const day = parseInt(t.fecha.split('-')[2], 10);
      const amountMinor = Number.isSafeInteger(t.amountMinor) ? t.amountMinor : (ledger.toMinorUnits(t.monto, currency) || 0);
      const amount = t.tipo === 'refund' ? -amountMinor : amountMinor;
      dailyTotals[day] = (dailyTotals[day] || 0) + amount;
      if (day > maxDay) maxDay = day;
    }
  });

  if (maxDay === 0) return [];

  const result = [];
  let cumulative = 0;
  for (let d = 1; d <= maxDay; d++) {
    if (dailyTotals[d]) {
      cumulative += dailyTotals[d];
    }
    result.push({ day: d, cumulative: ledger.fromMinorUnits(cumulative, currency) });
  }
  return result;
}

function getMonthLabel(month) {
  const [year, m] = month.split('-');
  const names = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${names[parseInt(m) - 1]} ${year}`;
}

router.get('/burn-rate', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { month, compare } = req.query;

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Parámetro month requerido (formato YYYY-MM)' });
  }

  const compareNum = parseInt(compare, 10) || 1;
  if (!VALID_COMPARE.includes(compareNum)) {
    return res.status(400).json({ error: `Compare inválido. Debe ser: ${VALID_COMPARE.join(', ')}` });
  }

  const allTransactions = db.findAll('transactions', userId);
  ledger.ensureSetup(db, userId);
  const appCurrency = ledger.getSettings(db, userId).appCurrency || 'ARS';
  const today = ledger.localDateForUser(db, userId);
  const onlyActiveCurrency = list => list.filter(tx =>
    (!tx.isRecurringInstance || tx.occurrenceStatus === 'posted') &&
    (!tx.recurrente || tx.fecha <= today) && ledger.accountForMovement(db, userId, tx)?.currency === appCurrency
  );
  const withPostedFees = (list, selectedMonth) => list.concat(db.findAll('transfers', userId)
    .filter(transfer => transfer.status === 'posted' && transfer.feeMinor && (transfer.postedAt || transfer.fecha)?.startsWith(selectedMonth) && transfer.fromCurrency === appCurrency)
    .map(transfer => ({ tipo: 'expense', fecha: transfer.postedAt || transfer.fecha, amountMinor: transfer.feeMinor, currencyCode: appCurrency })));
  const currentMonthTransactions = withPostedFees(onlyActiveCurrency(ledger.getMonthMovements(db, userId, allTransactions, month)), month);
  const currentMonth = getCumulativeDaily(currentMonthTransactions, month, appCurrency);

  const [year, m] = month.split('-').map(Number);
  const historical = [];
  const historicalMonths = [];

  for (let i = 1; i <= compareNum; i++) {
    let histMonth = m - i;
    let histYear = year;
    while (histMonth <= 0) { histMonth += 12; histYear--; }
    const histMonthStr = `${histYear}-${String(histMonth).padStart(2, '0')}`;
    historicalMonths.push(histMonthStr);
    const histTx = withPostedFees(onlyActiveCurrency(ledger.getMonthMovements(db, userId, allTransactions, histMonthStr)), histMonthStr);
    const histDaily = getCumulativeDaily(histTx, histMonthStr, appCurrency);
    histDaily.forEach(d => {
      historical.push({ ...d, month: histMonthStr });
    });
  }

  const currentDay = Number(ledger.localDateForUser(db, userId).split('-')[2]);
  const currentEntry = currentMonth.find(d => d.day === currentDay) || { cumulative: 0 };
  const currentSpent = currentEntry.cumulative;

  let avgHistorical = 0;
  if (historicalMonths.length > 0) {
    const monthTotals = historicalMonths.map(mStr => {
      const monthDaily = historical.filter(h => h.month === mStr);
      return monthDaily.length > 0 ? monthDaily[monthDaily.length - 1].cumulative : 0;
    });
    avgHistorical = monthTotals.reduce((a, b) => a + b, 0) / monthTotals.length;
  }

  const percentage = avgHistorical > 0 ? Math.round(((currentSpent - avgHistorical) / avgHistorical) * 100) : 0;
  const direction = currentSpent > avgHistorical ? 'up' : currentSpent < avgHistorical ? 'down' : 'flat';

  let text;
  if (historicalMonths.length === 0) {
    text = 'Sin datos históricos';
  } else if (direction === 'up') {
    text = `+${Math.abs(percentage)}% vs promedio`;
  } else if (direction === 'down') {
    text = `-${Math.abs(percentage)}% vs promedio`;
  } else {
    text = 'Igual al promedio';
  }

  const labels = historicalMonths.map(getMonthLabel);

  res.json({
    month,
    currentDay,
    currentMonth,
    historical,
    indicator: { text, percentage, direction }
  });
});

module.exports = router;
