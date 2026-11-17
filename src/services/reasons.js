// Shared validation of the justification text that every undo ("Deshacer") requires: trimmed, 1 to 500 characters.
const MAX_REASON = 500;
const REASON_ERROR = `Indicá el motivo (hasta ${MAX_REASON} caracteres)`;

/** The trimmed reason, or null when it is missing, not a string, blank or too long. */
function parseReason(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= MAX_REASON ? text : null;
}

module.exports = { MAX_REASON, REASON_ERROR, parseReason };
