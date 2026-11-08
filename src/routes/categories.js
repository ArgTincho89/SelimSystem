const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const categories = db.findAll('categories', req.session.userId);
  categories.sort((a, b) => (a.orden || 0) - (b.orden || 0));
  res.json(categories);
});

router.post('/', (req, res) => {
  const { nombre, color, orden, parentId } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }

  const db = req.app.locals.db;
  const userId = req.session.userId;

  if (parentId) {
    const parent = db.findById('categories', parentId, userId);
    if (!parent) {
      return res.status(400).json({ error: 'Categoría padre no encontrada' });
    }
    if (parent.parentId) {
      return res.status(400).json({ error: 'No se pueden crear subcategorías de una subcategoría' });
    }
  }

  const existing = db.findAll('categories', userId);
  const maxOrden = existing.reduce((max, c) => Math.max(max, c.orden || 0), 0);

  const category = db.create('categories', {
    userId,
    nombre: nombre.trim(),
    color: color || null,
    orden: orden !== undefined ? orden : maxOrden + 1,
    parentId: parentId || null
  }, userId);

  res.status(201).json(category);
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { id } = req.params;
  const { nombre, color, orden, parentId } = req.body;

  const category = db.findById('categories', id, userId);
  if (!category) {
    return res.status(404).json({ error: 'Categoría no encontrada' });
  }

  if (parentId !== undefined) {
    if (parentId === id) {
      return res.status(400).json({ error: 'Una categoría no puede ser padre de sí misma' });
    }
    if (parentId) {
      const parent = db.findById('categories', parentId, userId);
      if (!parent) {
        return res.status(400).json({ error: 'Categoría padre no encontrada' });
      }
      if (parent.parentId) {
        return res.status(400).json({ error: 'No se pueden crear subcategorías de una subcategoría' });
      }
    }
  }

  const updates = {};
  if (nombre !== undefined) updates.nombre = nombre.trim();
  if (color !== undefined) updates.color = color;
  if (orden !== undefined) updates.orden = orden;
  if (parentId !== undefined) updates.parentId = parentId || null;

  const updated = db.update('categories', id, updates, userId);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { id } = req.params;

  const category = db.findById('categories', id, userId);
  if (!category) {
    return res.status(404).json({ error: 'Categoría no encontrada' });
  }

  const transactions = db.findAll('transactions', userId);
  const hasTransactions = transactions.some(t => t.categoryId === id);
  const hasTransferFees = db.findAll('transfers', userId).some(transfer => transfer.feeCategoryId === id && transfer.feeMinor > 0);
  if (hasTransactions || hasTransferFees) {
    return res.status(409).json({ error: 'No se puede eliminar: tiene transacciones asociadas' });
  }

  db.remove('categories', id, userId);
  res.json({ ok: true });
});

router.patch('/reorder', (req, res) => {
  const { orderedIds } = req.body;

  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'Se requiere un array orderedIds' });
  }

  const db = req.app.locals.db;
  const userId = req.session.userId;

  orderedIds.forEach((id, index) => {
    db.update('categories', id, { orden: index + 1 }, userId);
  });

  const categories = db.findAll('categories', userId);
  categories.sort((a, b) => (a.orden || 0) - (b.orden || 0));
  res.json(categories);
});

module.exports = router;
