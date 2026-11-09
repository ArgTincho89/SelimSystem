const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const ROLES = new Set(['owner', 'tenant', 'provider', 'payment_responsible', 'other']);
const CONTACT_FIELDS = { email: 254, phone: 80, address: 500, taxIdentification: 120 };

function validateOwner(body, existing = null) {
  const name = body.name === undefined ? existing?.name : body.name;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 160) return { error: 'El nombre debe tener entre 1 y 160 caracteres' };
  const kind = body.kind === undefined ? (existing?.kind || 'entity') : body.kind;
  if (!['person', 'entity'].includes(kind)) return { error: 'El tipo debe ser persona u organización' };
  const roles = body.roles === undefined ? (existing?.roles || ['owner']) : body.roles;
  if (!Array.isArray(roles) || !roles.length || roles.some(role => !ROLES.has(role))) {
    return { error: 'Los roles deben ser owner, tenant, provider, payment_responsible u other' };
  }
  const value = { name: name.trim(), kind, roles: [...new Set(roles)] };
  const roleLabel = body.roleLabel === undefined ? existing?.roleLabel : body.roleLabel;
  if (roleLabel !== undefined && roleLabel !== null) {
    if (typeof roleLabel !== 'string' || roleLabel.trim().length > 80) return { error: 'La etiqueta del rol no es válida' };
    if (roleLabel.trim()) value.roleLabel = roleLabel.trim();
  }
  for (const [field, max] of Object.entries(CONTACT_FIELDS)) {
    const valueForField = body[field] === undefined ? (existing?.[field] || '') : body[field];
    if (typeof valueForField !== 'string' || valueForField.trim().length > max) return { error: `El campo ${field} no es válido` };
    value[field] = valueForField.trim();
  }
  const notes = body.notes === undefined ? (existing?.notes || '') : body.notes;
  if (typeof notes !== 'string' || notes.length > 2000) return { error: 'Las notas no son válidas' };
  value.notes = notes.trim();
  return { value };
}

function ownerResponse(owner) {
  return { ...owner, roles: Array.isArray(owner.roles) ? owner.roles : ['owner'] };
}

router.get('/', (req, res) => {
  res.json(req.app.locals.db.findAll('legalOwners', req.session.userId).map(ownerResponse).sort((a, b) => a.name.localeCompare(b.name)));
});

router.get('/:id', (req, res) => {
  const owner = req.app.locals.db.findById('legalOwners', req.params.id, req.session.userId);
  if (!owner) return res.status(404).json({ error: 'Persona u organización no encontrada' });
  res.json(ownerResponse(owner));
});

router.post('/', (req, res) => {
  const parsed = validateOwner(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const owner = req.app.locals.db.create('legalOwners', parsed.value, req.session.userId);
  res.status(201).json(ownerResponse(owner));
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const existing = db.findById('legalOwners', req.params.id, userId);
  if (!existing) return res.status(404).json({ error: 'Persona u organización no encontrada' });
  const parsed = validateOwner(req.body || {}, existing);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  res.json(ownerResponse(db.update('legalOwners', existing.id, parsed.value, userId)));
});

module.exports = router;
