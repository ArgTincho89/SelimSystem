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
  if (body.targetType === 'obligation' && typeof body.targetId === 'string' && db.findById('obligations', body.targetId, userId)) {
    return { targetType: 'obligation', targetId: body.targetId };
  }
  if (body.targetType === 'contract' && typeof body.targetId === 'string' && db.findById('rentalContracts', body.targetId, userId)) {
    return { targetType: 'contract', targetId: body.targetId };
  }
  if (body.targetType === 'rentOccurrence' && typeof body.targetId === 'string' && db.findById('rentOccurrences', body.targetId, userId)) {
    return { targetType: 'rentOccurrence', targetId: body.targetId };
  }
  if (body.targetType === 'declaration' && typeof body.targetId === 'string' && db.findById('rentalDeclarations', body.targetId, userId)) {
    return { targetType: 'declaration', targetId: body.targetId };
  }
  if (body.targetType === 'rentCollection' && typeof body.targetId === 'string' && db.findById('rentCollections', body.targetId, userId)) {
    return { targetType: 'rentCollection', targetId: body.targetId };
  }
  return null;
}

const TITLE_ERROR = 'El título debe tener hasta 120 caracteres';
const CONTENT_ERROR = 'La nota debe tener entre 1 y 4000 caracteres';

function validTitle(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim().length <= 120);
}

// A rental also owns the notes of its contracts, periods and collections.
function relatedMatcher(db, userId, declarationId) {
  const contractIds = new Set(db.findAll('rentalContracts', userId).filter(item => item.declarationId === declarationId).map(item => item.id));
  const occurrenceIds = new Set(db.findAll('rentOccurrences', userId).filter(item => contractIds.has(item.contractId)).map(item => item.id));
  const collectionIds = new Set(db.findAll('rentCollectionAllocations', userId).filter(item => occurrenceIds.has(item.occurrenceId)).map(item => item.collectionId));
  return note => (note.targetType === 'declaration' && note.targetId === declarationId)
    || (note.targetType === 'contract' && contractIds.has(note.targetId))
    || (note.targetType === 'rentOccurrence' && occurrenceIds.has(note.targetId))
    || (note.targetType === 'rentCollection' && collectionIds.has(note.targetId));
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const target = targetFor(db, userId, req.query);
  if (!target) return res.status(400).json({ error: 'El bien o la persona u organización no es válido' });
  const { from, to } = req.query;
  if ((from !== undefined && !validDate(from)) || (to !== undefined && !validDate(to)) || (from && to && from > to)) {
    return res.status(400).json({ error: 'El rango de fechas no es válido' });
  }
  const matches = target.targetType === 'declaration' && req.query.includeRelated === '1'
    ? relatedMatcher(db, userId, target.targetId)
    : note => note.targetType === target.targetType && note.targetId === target.targetId;
  const notes = db.findAll('wealthNotes', userId)
    .filter(matches)
    .filter(note => (!from || note.date >= from) && (!to || note.date <= to))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  res.json(notes);
});

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const target = targetFor(db, userId, req.body || {});
  if (!target) return res.status(400).json({ error: 'El bien o la persona u organización no es válido' });
  const { date, content, title } = req.body;
  if (date !== undefined && !validDate(date)) return res.status(400).json({ error: 'La fecha de la nota no es válida' });
  if (typeof content !== 'string' || !content.trim() || content.trim().length > 4000) return res.status(400).json({ error: CONTENT_ERROR });
  if (!validTitle(title)) return res.status(400).json({ error: TITLE_ERROR });
  const user = db.findUserById(userId);
  const note = db.create('wealthNotes', {
    ...target,
    date: date || new Date().toISOString().slice(0, 10),
    content: content.trim(),
    ...(typeof title === 'string' && title.trim() ? { title: title.trim() } : {}),
    author: user?.nombre || 'Usuario'
  }, userId);
  res.status(201).json(note);
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const note = db.findById('wealthNotes', req.params.id, userId);
  if (!note) return res.status(404).json({ error: 'Nota no encontrada' });
  const { date, content, title } = req.body || {};
  if (date !== undefined && !validDate(date)) return res.status(400).json({ error: 'La fecha de la nota no es válida' });
  if (content !== undefined && (typeof content !== 'string' || !content.trim() || content.trim().length > 4000)) return res.status(400).json({ error: CONTENT_ERROR });
  if (!validTitle(title)) return res.status(400).json({ error: TITLE_ERROR });
  const patch = {};
  if (date !== undefined) patch.date = date;
  if (content !== undefined) patch.content = content.trim();
  if (title !== undefined) patch.title = typeof title === 'string' ? title.trim() : '';
  res.json(db.update('wealthNotes', note.id, patch, userId));
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const note = db.findById('wealthNotes', req.params.id, userId);
  if (!note) return res.status(404).json({ error: 'Nota no encontrada' });
  db.remove('wealthNotes', note.id, userId);
  res.json({ deleted: true, id: note.id });
});

module.exports = { router, targetFor, validDate };
