const express = require('express');
const { requireAuth } = require('../middleware/auth');

// Saved conversations of the in-app "Ayuda" assistant, per account. They are support transcripts, not business
// data: they are not written to the activity log (see SKIPPED in services/activity-log.js).
const router = express.Router();
router.use(requireAuth);

const COLLECTION = 'help_chats';
const MAX_CHATS = 100;
const MAX_MESSAGES = 500;
const MAX_TEXT = 4000;
const MAX_TITLE = 120;
const SENDERS = new Set(['bot', 'user']);

const isTimestamp = value => typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
const time = chat => Date.parse(chat.startedAt) || 0;
const newestFirst = (a, b) => time(b) - time(a) || String(b.endedAt).localeCompare(String(a.endedAt));

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Datos de la conversación inválidos' };
  const { startedAt, endedAt, title, messages } = body;
  if (!isTimestamp(startedAt) || !isTimestamp(endedAt)) return { error: 'Las fechas de la conversación son inválidas' };
  if (Date.parse(endedAt) < Date.parse(startedAt)) return { error: 'La conversación no puede terminar antes de empezar' };
  if (title !== undefined && typeof title !== 'string') return { error: 'El título de la conversación es inválido' };
  if (!Array.isArray(messages) || !messages.length) return { error: 'La conversación no tiene mensajes' };
  if (messages.length > MAX_MESSAGES) return { error: `La conversación supera los ${MAX_MESSAGES} mensajes` };
  for (const message of messages) {
    if (!message || typeof message !== 'object' || !SENDERS.has(message.from)) return { error: 'Cada mensaje debe ser del asistente o de la persona usuaria' };
    if (typeof message.text !== 'string' || message.text.length > MAX_TEXT) return { error: `Cada mensaje debe ser un texto de hasta ${MAX_TEXT} caracteres` };
    if (!isTimestamp(message.at)) return { error: 'La hora de un mensaje es inválida' };
  }
  if (!messages.some(message => message.from === 'user')) return { error: 'Solo se guardan conversaciones con al menos una respuesta' };
  return {
    chat: {
      startedAt,
      endedAt,
      title: (String(title || '').trim() || 'Conversación').slice(0, MAX_TITLE),
      messages: messages.map(message => ({ from: message.from, text: message.text, at: message.at }))
    }
  };
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  res.json(db.findAll(COLLECTION, req.session.userId).sort(newestFirst));
});

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const { chat, error } = validate(req.body);
  if (error) return res.status(400).json({ error });
  const created = db.create(COLLECTION, { userId, ...chat }, userId);
  // Keep the newest MAX_CHATS conversations: the oldest ones are dropped.
  const all = db.findAll(COLLECTION, userId).sort(newestFirst);
  if (all.length > MAX_CHATS) db.replace(COLLECTION, userId, all.slice(0, MAX_CHATS));
  return res.status(201).json(created);
});

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  if (!db.remove(COLLECTION, req.params.id, req.session.userId)) return res.status(404).json({ error: 'Conversación no encontrada' });
  return res.json({ ok: true });
});

module.exports = router;
module.exports.LIMITS = { MAX_CHATS, MAX_MESSAGES, MAX_TEXT, MAX_TITLE };
