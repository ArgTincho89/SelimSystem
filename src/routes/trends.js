const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getIncomeBreakdown, getIncomePercentages, getIncomeIva, roundCents } = require('../utils/income');
const ledger = require('../services/account-ledger');
const incomeAttribution = require('../services/income-attribution');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { from, to, categoryId } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'Parámetros from y to requeridos (formato YYYY-MM)' });
  }

  const transactions = db.findAll('transactions', userId);
  ledger.ensureSetup(db, userId);
  const activeCurrency = ledger.getSettings(db, userId).appCurrency || 'ARS';
  const today = ledger.localDateForUser(db, userId);
  const categories = db.findAll('categories', userId);

  const months = [];
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);

  let currentYear = fromYear;
  let currentMonth = fromMonth;

  while (currentYear < toYear || (currentYear === toYear && currentMonth <= toMonth)) {
    const monthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    months.push(monthStr);

    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  const monthlyData = months.map(month => {
    const allMonthTx = ledger.getMonthMovements(db, userId, transactions, month).filter(tx =>
      (!tx.isRecurringInstance || tx.occurrenceStatus === 'posted') && (!tx.recurrente || tx.fecha <= today)
    );
    const monthTx = allMonthTx.filter(tx => ledger.accountForMovement(db, userId, tx)?.currency === activeCurrency);
    const incomeBreakdownByHolder = incomeAttribution.holderTotals(db, userId, allMonthTx);
    const currencyTotals = ledger.incomeByCurrency(db, userId, transactions, month);
    const selectedTotals = currencyTotals[activeCurrency] || { incomeMinor: 0, expensesMinor: 0, refundsMinor: 0, savingsMinor: 0 };
    const factor = 10 ** ledger.currencyPrecision(activeCurrency);

    let ingresos = 0;
    let ingresosA = 0;
    let ingresosB = 0;
    let ingresosAMinor = 0;
    let ingresosBMinor = 0;
    let ivaAcumuladoMinor = 0;
    let gastos = 0;
    let reembolsos = 0;
    const porCategoria = {};

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

    monthTx.forEach(t => {
      const amountMinor = Number.isSafeInteger(t.amountMinor) ? t.amountMinor : (ledger.toMinorUnits(t.monto, activeCurrency) || 0);
      if (t.tipo === 'income') {
        const breakdown = getIncomeBreakdown(t);
        ingresosAMinor += ledger.toMinorUnits(breakdown.a, activeCurrency) || 0;
        ingresosBMinor += ledger.toMinorUnits(breakdown.b, activeCurrency) || 0;
        ivaAcumuladoMinor += ledger.toMinorUnits(getIncomeIva(t), activeCurrency) || 0;
      } else if (t.tipo === 'expense') {
        if (porCategoria[t.categoryId]) {
          porCategoria[t.categoryId].gastosMinor += amountMinor;
        }
      } else if (t.tipo === 'refund') {
        if (porCategoria[t.categoryId]) {
          porCategoria[t.categoryId].reembolsosMinor += amountMinor;
        }
      }
    });

    db.findAll('transfers', userId).filter(item => item.status === 'posted' && item.feeMinor && (item.postedAt || item.fecha)?.startsWith(month) && item.fromCurrency === activeCurrency).forEach(item => {
      if (porCategoria[item.feeCategoryId]) porCategoria[item.feeCategoryId].gastosMinor += item.feeMinor;
    });

    Object.values(porCategoria).forEach(cat => {
      cat.gastos = cat.gastosMinor / factor;
      cat.reembolsos = cat.reembolsosMinor / factor;
      cat.neto = (cat.gastosMinor - cat.reembolsosMinor) / factor;
    });

    ingresos = selectedTotals.incomeMinor / factor;
    gastos = selectedTotals.expensesMinor / factor;
    reembolsos = selectedTotals.refundsMinor / factor;
    ingresosA = ingresosAMinor / factor;
    ingresosB = ingresosBMinor / factor;
    const gastosNetosSeleccionados = (selectedTotals.expensesMinor - selectedTotals.refundsMinor) / factor;
    const normalizedIncome = selectedTotals.normalizedIncomeMinor / factor;
    const incomePercentages = getIncomePercentages(ingresosA, ingresosB);

    return {
      month,
       ingresos: roundCents(ingresos),
       ingresosA: roundCents(ingresosA),
       ingresosB: roundCents(ingresosB),
       porcentajeA: incomePercentages.porcentajeA,
       porcentajeB: incomePercentages.porcentajeB,
       ingresosDesglose: {
         A: roundCents(ingresosA),
         B: roundCents(ingresosB),
         porcentajeA: incomePercentages.porcentajeA,
         porcentajeB: incomePercentages.porcentajeB
       },
        ivaAcumulado: ledger.fromMinorUnits(ivaAcumuladoMinor, activeCurrency),
        incomeBreakdownByHolder,
        ivaByHolder: incomeBreakdownByHolder.map(({ ownerId, ownerName, currency, iva }) => ({ ownerId, ownerName, currency, amount: iva })),
       gastos: Math.round(gastos * 100) / 100,
       reembolsos: Math.round(reembolsos * 100) / 100,
       gastosNetos: Math.round(gastosNetosSeleccionados * 100) / 100,
       ahorro: Math.round((ingresos - gastosNetosSeleccionados) * 100) / 100,
       activeCurrency,
       normalizedIncome,
       currencyTotals: Object.values(currencyTotals).map(total => ({
         currency: total.currency,
         income: total.incomeMinor / (10 ** ledger.currencyPrecision(total.currency)),
         expenses: total.expensesMinor / (10 ** ledger.currencyPrecision(total.currency)),
         refunds: total.refundsMinor / (10 ** ledger.currencyPrecision(total.currency)),
         savings: total.savingsMinor / (10 ** ledger.currencyPrecision(total.currency))
       })),
        porCategoria: Object.values(porCategoria).filter(c => c.gastos > 0 || c.reembolsos > 0).map(cat => {
          const { gastosMinor, reembolsosMinor, ...publicCategory } = cat;
          return publicCategory;
        })
    };
  });

  const categoryTrends = {};
  if (categoryId) {
    const cat = categories.find(c => c.id === categoryId);
    if (!cat) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    categoryTrends[categoryId] = {
      nombre: cat.nombre,
      color: cat.color,
      months: monthlyData.map(md => {
        const catData = md.porCategoria.find(c => c.categoryId === categoryId);
        return {
          month: md.month,
          gastos: catData ? catData.gastos : 0,
          reembolsos: catData ? catData.reembolsos : 0,
          neto: catData ? catData.neto : 0
        };
      })
    };
  } else {
    categories.forEach(cat => {
      const hasData = monthlyData.some(md =>
        md.porCategoria.some(c => c.categoryId === cat.id && (c.gastos > 0 || c.reembolsos > 0))
      );

      if (hasData) {
        categoryTrends[cat.id] = {
          nombre: cat.nombre,
          color: cat.color,
          months: monthlyData.map(md => {
            const catData = md.porCategoria.find(c => c.categoryId === cat.id);
            return {
              month: md.month,
              gastos: catData ? catData.gastos : 0,
              reembolsos: catData ? catData.reembolsos : 0,
              neto: catData ? catData.neto : 0
            };
          })
        };
      }
    });
  }

  res.json({
    from,
    to,
    monthlyData,
    categoryTrends
  });
});

module.exports = router;
