const express = require('express');
const { requireAuth } = require('../middleware/auth');
const ledger = require('../services/account-ledger');

const router = express.Router();
router.use(requireAuth);

const VALID_TIPOS = ['ahorro_mensual', 'gasto_categoria', 'gasto_general'];
const VALID_MODOS = ['monto_fijo', 'porcentaje_salario', 'porcentaje_ingresos_dinamico'];

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { month } = req.query;

  let goals = db.findAll('goals', userId).map(goal => ({ ...goal, currencyCode: goal.currencyCode || 'EUR' }));

  if (month) {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Formato de mes inválido' });
    }
    ledger.ensureSetup(db, userId);
    const currency = ledger.getSettings(db, userId).appCurrency || 'EUR';
    goals = goals.filter(g => g.currencyCode === currency && g.meses && g.meses.includes(month));
  }

  res.json(goals);
});

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { tipo, modo, montoFijo, porcentaje, salarioEstimado, categoryId, categoryName, meses } = req.body;
  ledger.ensureSetup(db, userId);
  const currencyCode = req.body.currencyCode || ledger.getSettings(db, userId).appCurrency || 'EUR';
  if (!ledger.CURRENCIES.has(currencyCode)) return res.status(400).json({ error: 'Moneda de meta no válida' });

  if (!tipo || !VALID_TIPOS.includes(tipo)) {
    return res.status(400).json({ error: `Tipo inválido. Debe ser: ${VALID_TIPOS.join(', ')}` });
  }
  if (!modo || !VALID_MODOS.includes(modo)) {
    return res.status(400).json({ error: `Modo inválido. Debe ser: ${VALID_MODOS.join(', ')}` });
  }
  if (!Array.isArray(meses) || meses.length === 0) {
    return res.status(400).json({ error: 'Debe seleccionar al menos un mes' });
  }
  if (!meses.every(m => /^\d{4}-\d{2}$/.test(m))) {
    return res.status(400).json({ error: 'Formato de mes inválido en la lista' });
  }

  if (tipo === 'gasto_categoria') {
    if (!categoryId || typeof categoryId !== 'string') {
      return res.status(400).json({ error: 'Para límite de gasto, categoryId es requerido' });
    }
    const cat = db.findById('categories', categoryId, userId);
    if (!cat) {
      return res.status(400).json({ error: 'Categoría no encontrada' });
    }
  }

  if (modo === 'monto_fijo') {
    if (typeof montoFijo !== 'number' || montoFijo <= 0) {
      return res.status(400).json({ error: 'Para monto fijo, montoFijo debe ser un número positivo' });
    }
  } else if (modo === 'porcentaje_salario') {
    if (typeof porcentaje !== 'number' || porcentaje <= 0 || porcentaje > 100) {
      return res.status(400).json({ error: 'Porcentaje debe estar entre 1 y 100' });
    }
    if (typeof salarioEstimado !== 'number' || salarioEstimado <= 0) {
      return res.status(400).json({ error: 'Salario estimado debe ser un número positivo' });
    }
  } else if (modo === 'porcentaje_ingresos_dinamico') {
    if (typeof porcentaje !== 'number' || porcentaje <= 0 || porcentaje > 100) {
      return res.status(400).json({ error: 'Porcentaje debe estar entre 1 y 100' });
    }
  }

  const goal = db.create('goals', {
    userId,
    tipo,
    modo,
    currencyCode,
    categoryId: categoryId || undefined,
    categoryName: categoryName || undefined,
    montoFijo: montoFijo != null ? ledger.fromMinorUnits(ledger.toMinorUnits(montoFijo, currencyCode) || 0, currencyCode) : undefined,
    porcentaje: porcentaje != null ? Math.round(porcentaje * 100) / 100 : undefined,
    salarioEstimado: salarioEstimado != null ? ledger.fromMinorUnits(ledger.toMinorUnits(salarioEstimado, currencyCode) || 0, currencyCode) : undefined,
    meses
  }, userId);

  res.status(201).json(goal);
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { id } = req.params;

  const goal = db.findById('goals', id, userId);
  if (!goal) {
    return res.status(404).json({ error: 'Meta no encontrada' });
  }

  db.remove('goals', id, userId);
  res.json({ ok: true });
});

module.exports = router;
