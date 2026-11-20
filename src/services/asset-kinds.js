// User-defined asset kinds. Built-in kinds stay in code; custom ones live in `assetKinds` and are stored on assets as `custom-<slug>`.
const COLLECTION = 'assetKinds';
const BUILT_IN = [['departamento', 'Departamento'], ['casa', 'Casa'], ['galpon', 'Galpón'], ['local', 'Local'], ['lote', 'Lote']];
const MAX_NAME = 50;

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function slug(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isBuiltIn(key) {
  return BUILT_IN.some(([builtIn]) => builtIn === key);
}

function list(db, userId) {
  return db.findAll(COLLECTION, userId).slice().sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

function isValidKey(db, userId, key) {
  return isBuiltIn(key) || db.findAll(COLLECTION, userId).some(kind => kind.key === key);
}

// Returns { value: kind } or { error, status }.
function create(db, userId, rawName) {
  if (typeof rawName !== 'string' || !rawName.trim()) return { error: 'El nombre del tipo es obligatorio', status: 400 };
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (name.length > MAX_NAME) return { error: `El nombre del tipo no puede superar los ${MAX_NAME} caracteres`, status: 400 };
  const normalized = normalize(name);
  const key = `custom-${slug(name)}`;
  if (key === 'custom-') return { error: 'El nombre del tipo no es válido', status: 400 };
  const taken = BUILT_IN.some(([builtIn, label]) => normalize(label) === normalized || builtIn === normalized)
    || db.findAll(COLLECTION, userId).some(kind => normalize(kind.name) === normalized || kind.key === key);
  if (taken) return { error: 'Ese tipo ya existe', status: 409 };
  return { value: db.create(COLLECTION, { name, key }, userId) };
}

module.exports = { COLLECTION, BUILT_IN, MAX_NAME, normalize, slug, list, create, isValidKey };
