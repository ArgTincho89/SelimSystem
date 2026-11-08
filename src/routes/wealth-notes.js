const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function targetFor(db, userId, body) {
  if (body.targetType === 'asset' && typeof body.targetId === 'string' && db.findById('assets', body.targetId, userId)) {
    return { targetType: 'asset', targetId: body.targetId };
  }
  if (body.targetType === 'entity' && typeof body.targetId === 'string' && db.findById('legalOwners', body.targetId, userId)) {
    return { targetType: 'entity', targetId: body.targetId };
  }
  return null;
}

router.get('/', (req, res) => {
  const target = targetFor(req.app.locals.db, req.session.userId, req.query);
  if (!target) return res.status(400).json({ error: 'El bien o la persona u organización no es válido' });
  const notes = req.app.locals.db.findAll('wealthNotes', req.session.userId)
    .filter(note => note.targetType === target.targetType && note.targetId === target.targetId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  res.json(notes);
});

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const target = targetFor(db, userId, req.body || {});
  if (!target) return res.status(400).json({ error: 'El bien o la persona u organización no es válido' });
  const { date, content } = req.body;
  if (date !== undefined && !validDate(date)) return res.status(400).json({ error: 'La fecha de la nota no es válida' });
  if (typeof content !== 'string' || !content.trim() || content.trim().length > 4000) {
    return res.status(400).json({ error: 'La nota debe tener entre 1 y 4000 caracteres' });
  }
  const user = db.findUserById(userId);
  const note = db.create('wealthNotes', {
    ...target,
    date: date || new Date().toISOString().slice(0, 10),
    content: content.trim(),
    author: user?.nombre || 'Usuario'
  }, userId);
  res.status(201).json(note);
});

module.exports = { router, targetFor, validDate };
