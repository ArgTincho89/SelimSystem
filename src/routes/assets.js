const express = require('express');
const { requireAuth } = require('../middleware/auth');
const economicOverview = require('../services/economic-overview');
const { validateOwnershipSet } = require('../utils/ownership-overlap');

const router = express.Router();
router.use(requireAuth);

const TYPES = new Set(['movable', 'immovable']);
const USAGE_STATUSES = new Set(['rented', 'family_home', 'own_use', 'vacant', 'renovation', 'own_commercial', 'other']);
const SENSITIVE_DETAIL_KEY = /(card|bank|account|credential|password|secret|token|cvv|pin|iban|routing)/i;

function validDate(value, optional = true) {
  if ((value === undefined || value === null || value === '') && optional) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function boundedString(value, max, required = false) {
  if (value === undefined || value === null) return !required;
  return typeof value === 'string' && value.trim().length <= max && (!required || value.trim().length > 0);
}

function safeDetails(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > 50) return null;
  for (const [key, detail] of entries) {
    if (!key.trim() || key.length > 80 || SENSITIVE_DETAIL_KEY.test(key)) return null;
    if (!['string', 'number', 'boolean'].includes(typeof detail)) return null;
    if (typeof detail === 'string' && detail.length > 500) return null;
    if (typeof detail === 'number' && !Number.isFinite(detail)) return null;
  }
  return Object.fromEntries(entries);
}

function validateAsset(body, existing, db, userId) {
  const type = existing ? existing.type : body.type;
  if (!TYPES.has(type)) return { error: 'El tipo debe ser mueble o inmueble' };
  if (existing && body.type !== undefined && body.type !== existing.type) return { error: 'No se puede cambiar la clasificación del bien' };
  const name = body.name === undefined && existing ? existing.name : body.name;
  if (!boundedString(name, 160, true)) return { error: 'El nombre debe tener entre 1 y 160 caracteres' };
  const fields = ['description', 'subtype', 'propertyType', 'notes', 'location', 'address', 'locality', 'province', 'country'];
  for (const field of fields) {
    if (body[field] !== undefined && !boundedString(body[field], field === 'description' || field === 'notes' ? 4000 : 160)) {
      return { error: `El campo ${field} no es válido` };
    }
  }
  const acquisitionDate = body.acquisitionDate === undefined && existing ? existing.acquisitionDate : (body.acquisitionDate || null);
  if (!validDate(acquisitionDate)) return { error: 'La fecha de adquisición no es válida' };
  const acquisitionValue = body.acquisitionValue === undefined && existing ? existing.acquisitionValue : body.acquisitionValue;
  if (acquisitionValue !== undefined && acquisitionValue !== null && (typeof acquisitionValue !== 'number' || !Number.isFinite(acquisitionValue) || acquisitionValue < 0)) {
    return { error: 'El valor de adquisición debe ser un número igual o mayor que cero' };
  }
  const status = body.status === undefined ? (existing ? existing.status : 'active') : body.status;
  if (!boundedString(status, 40, true)) return { error: 'El estado debe tener entre 1 y 40 caracteres' };
  const result = {
    name: name.trim(), type,
    description: body.description === undefined ? (existing?.description || '') : body.description.trim(),
    acquisitionDate: acquisitionDate || null,
    acquisitionValue: acquisitionValue == null ? null : acquisitionValue,
    status: status.trim(), notes: body.notes === undefined ? (existing?.notes || '') : body.notes.trim(),
    location: body.location === undefined ? (existing?.location || '') : body.location.trim()
  };
  if (type === 'movable') {
    const details = safeDetails(body.details === undefined ? existing?.details : body.details);
    if (!details) return { error: 'Los detalles no son válidos o contienen campos sensibles' };
    result.subtype = body.subtype === undefined ? (existing?.subtype || '') : body.subtype.trim();
    result.details = details;
  } else {
    const propertyType = body.propertyType === undefined ? existing?.propertyType : body.propertyType;
    const usageStatus = body.usageStatus === undefined ? (existing?.usageStatus || 'vacant') : body.usageStatus;
    if (!boundedString(propertyType, 120)) return { error: 'El tipo de inmueble no es válido' };
    if (!USAGE_STATUSES.has(usageStatus)) return { error: 'El estado de uso del inmueble no es válido' };
    for (const field of ['address', 'locality', 'province', 'country']) {
      result[field] = body[field] === undefined ? (existing?.[field] || '') : body[field].trim();
    }
    const area = body.area === undefined ? existing?.area : body.area;
    if (area !== undefined && area !== null && (typeof area !== 'number' || !Number.isFinite(area) || area < 0)) return { error: 'La superficie debe ser un número igual o mayor que cero' };
    result.propertyType = propertyType || '';
    result.area = area == null ? null : area;
    result.usageStatus = usageStatus;
  }
  if (body.status === undefined && existing) result.status = existing.status;
  if (body.statusNotes !== undefined && !boundedString(body.statusNotes, 2000)) return { error: 'La nota del cambio de estado no es válida' };
  return { value: result };
}

function validateOwnership(body, db, userId) {
  const owner = body && typeof body.ownerId === 'string' ? db.findById('legalOwners', body.ownerId, userId) : null;
  if (!owner || (Array.isArray(owner.roles) && !owner.roles.includes('owner'))) return { error: 'Titular legal no encontrado' };
  const startDate = body.startDate || new Date().toISOString().slice(0, 10);
  const endDate = body.endDate || null;
  if (!validDate(startDate, false) || !validDate(endDate) || (endDate && endDate < startDate)) return { error: 'El período de titularidad no es válido' };
  if (body.percentage !== undefined && body.percentage !== null && (typeof body.percentage !== 'number' || !Number.isFinite(body.percentage) || body.percentage < 0 || body.percentage > 100)) return { error: 'El porcentaje debe estar entre 0 y 100' };
  if (body.notes !== undefined && !boundedString(body.notes, 2000)) return { error: 'Las notas de titularidad no son válidas' };
  return { value: { ownerId: body.ownerId, startDate, endDate, percentage: body.percentage == null ? null : body.percentage, notes: body.notes || '' } };
}

function ownershipsForAsset(db, userId, assetId) {
  return db.findAll('assetOwnerships', userId).filter(record => record.assetId === assetId).map(record => ({
    ...record,
    owner: db.findById('legalOwners', record.ownerId, userId)
  }));
}

function assetResponse(db, userId, asset) {
  return {
    ...asset,
    ownerships: ownershipsForAsset(db, userId, asset.id),
    statusHistory: db.findAll('assetStatusHistory', userId).filter(event => event.assetId === asset.id).sort((a, b) => a.changedAt.localeCompare(b.changedAt))
  };
}

function matchesFilter(asset, query, owners, assetOwnerships) {
  const ownerIds = assetOwnerships.filter(item => item.assetId === asset.id).map(item => item.ownerId);
  const locationText = [asset.location, asset.address, asset.locality, asset.province, asset.country].join(' ').toLocaleLowerCase();
  const ownerNames = owners.filter(owner => ownerIds.includes(owner.id)).map(owner => owner.name.toLocaleLowerCase()).join(' ');
  const searchText = [asset.name, asset.description, asset.subtype, asset.propertyType, asset.status, asset.usageStatus, locationText, ownerNames].join(' ').toLocaleLowerCase();
  return (!query.q || searchText.includes(query.q.toLocaleLowerCase()))
    && (!query.type || asset.type === query.type)
    && (!query.ownerId || ownerIds.includes(query.ownerId))
    && (!query.status || asset.status === query.status)
    && (!query.usage || asset.usageStatus === query.usage)
    && (!query.location || locationText.includes(query.location.toLocaleLowerCase()));
}

router.get('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const filters = {
    q: String(req.query.q || '').trim(), type: req.query.type, ownerId: req.query.ownerId,
    status: req.query.status, usage: req.query.usage, location: String(req.query.location || '').trim()
  };
  const assets = db.findAll('assets', userId);
  const owners = db.findAll('legalOwners', userId);
  const ownerships = db.findAll('assetOwnerships', userId);
  res.json(assets.filter(asset => matchesFilter(asset, filters, owners, ownerships)).map(asset => ({
    ...asset,
    owners: ownershipsForAsset(db, userId, asset.id).filter(record => !record.endDate).map(record => record.owner).filter(Boolean)
  })));
});

router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const parsed = validateAsset(req.body || {}, null, db, userId);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const ownershipInputs = req.body.ownerships === undefined ? [] : req.body.ownerships;
  if (!Array.isArray(ownershipInputs)) return res.status(400).json({ error: 'Los titulares deben ser una lista' });
  const ownershipRecords = [];
  for (const item of ownershipInputs) {
    const ownership = validateOwnership(item, db, userId);
    if (ownership.error) return res.status(400).json({ error: ownership.error });
    ownershipRecords.push(ownership.value);
  }
  const overlap = validateOwnershipSet(ownershipRecords);
  if (overlap.error) return res.status(400).json({ error: overlap.error });
  const asset = db.create('assets', parsed.value, userId);
  ownershipRecords.forEach(record => db.create('assetOwnerships', { ...record, assetId: asset.id }, userId));
  db.create('assetStatusHistory', { assetId: asset.id, status: asset.status, changedAt: asset.createdAt, notes: 'Estado inicial' }, userId);
  res.status(201).json(assetResponse(db, userId, asset));
});

router.get('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const asset = db.findById('assets', req.params.id, userId);
  if (!asset) return res.status(404).json({ error: 'Bien no encontrado' });
  res.json(assetResponse(db, userId, asset));
});

router.get('/:id/economics', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const asset = db.findById('assets', req.params.id, userId);
  if (!asset) return res.status(404).json({ error: 'Bien no encontrado' });
  const result = economicOverview.assetEconomics(db, userId, asset, {
    period: req.query.period || 'acquisition', month: req.query.month,
    year: req.query.year, from: req.query.from, to: req.query.to
  });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const asset = db.findById('assets', req.params.id, userId);
  if (!asset) return res.status(404).json({ error: 'Bien no encontrado' });
  const parsed = validateAsset(req.body || {}, asset, db, userId);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const updated = db.update('assets', asset.id, parsed.value, userId);
  if (updated.status !== asset.status) {
    db.create('assetStatusHistory', { assetId: asset.id, status: updated.status, changedAt: new Date().toISOString(), notes: req.body.statusNotes || '' }, userId);
  }
  res.json(assetResponse(db, userId, updated));
});

router.post('/:id/ownerships', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const asset = db.findById('assets', req.params.id, userId);
  if (!asset) return res.status(404).json({ error: 'Bien no encontrado' });
  const parsed = validateOwnership(req.body || {}, db, userId);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const existing = ownershipsForAsset(db, userId, asset.id);
  const overlap = validateOwnershipSet([...existing, parsed.value]);
  if (overlap.error) return res.status(400).json({ error: overlap.error });
  const record = db.create('assetOwnerships', { ...parsed.value, assetId: asset.id }, userId);
  res.status(201).json({ ...record, owner: db.findById('legalOwners', record.ownerId, userId) });
});

router.patch('/:id/ownerships/:ownershipId', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const asset = db.findById('assets', req.params.id, userId);
  if (!asset) return res.status(404).json({ error: 'Bien no encontrado' });
  const ownership = db.findById('assetOwnerships', req.params.ownershipId, userId);
  if (!ownership || ownership.assetId !== asset.id) return res.status(404).json({ error: 'Período de titularidad no encontrado' });
  if (ownership.endDate) return res.status(409).json({ error: 'El período de titularidad ya está cerrado' });
  const endDate = req.body.endDate;
  if (!validDate(endDate, false) || endDate < ownership.startDate) return res.status(400).json({ error: 'La fecha de finalización no es válida' });
  res.json(db.update('assetOwnerships', ownership.id, { endDate }, userId));
});

module.exports = router;
