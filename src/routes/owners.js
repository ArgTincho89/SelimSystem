const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const ROLES = new Set(['owner', 'tenant', 'provider', 'payment_responsible', 'other']);
const CONTACT_FIELDS = { email: 254, phone: 80, address: 500, taxIdentification: 120 };

function pick(body, existing, field) {
  return body[field] === undefined ? existing?.[field] : body[field];
}

function validatePersonFields(body, existing) {
  const first = pick(body, existing, 'firstName');
  const last = pick(body, existing, 'lastName');
  if (typeof first !== 'string' || !first.trim() || first.trim().length > 80) return { error: 'El nombre de la persona es obligatorio (máximo 80 caracteres)' };
  if (last !== undefined && last !== null && (typeof last !== 'string' || last.trim().length > 80)) return { error: 'El apellido no es válido' };
  const value = { firstName: first.trim(), lastName: (last || '').trim(), dni: null };
  const dni = pick(body, existing, 'dni');
  if (dni !== undefined && dni !== null) {
    if (typeof dni !== 'string' || dni.trim().length > 20 || !/^[0-9.]*$/.test(dni.trim())) return { error: 'El DNI no es válido' };
    value.dni = dni.trim();
  }
  value.name = `${value.firstName} ${value.lastName}`.trim();
  return { value };
}

function validateOwner(body, existing = null, db = null, userId = null) {
  const kind = body.kind === undefined ? (existing?.kind || 'entity') : body.kind;
  if (!['person', 'entity'].includes(kind)) return { error: 'El tipo debe ser persona u organización' };
  const sendsPersonFields = body.firstName !== undefined || body.lastName !== undefined;
  let personValue = null;
  if (kind === 'person' && (sendsPersonFields || (body.dni !== undefined && existing?.firstName !== undefined))) {
    const person = validatePersonFields(body, existing);
    if (person.error) return person;
    personValue = person.value;
  }
  const name = personValue && sendsPersonFields ? personValue.name : (body.name === undefined ? existing?.name : body.name);
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 160) return { error: 'El nombre debe tener entre 1 y 160 caracteres' };
  const roles = body.roles === undefined ? (existing?.roles || ['owner']) : body.roles;
  if (!Array.isArray(roles) || !roles.length || roles.some(role => !ROLES.has(role))) {
    return { error: 'Los roles deben ser owner, tenant, provider, payment_responsible u other' };
  }
  const value = { name: name.trim(), kind, roles: [...new Set(roles)] };
  if (personValue) Object.assign(value, { firstName: personValue.firstName, lastName: personValue.lastName, dni: personValue.dni });
  if (kind === 'entity' && existing?.firstName !== undefined && existing?.firstName !== null) Object.assign(value, { firstName: null, lastName: null, dni: null });
  const expenseCategoryId = pick(body, existing, 'expenseCategoryId');
  if (expenseCategoryId !== undefined && expenseCategoryId !== null) {
    if (typeof expenseCategoryId !== 'string' || !expenseCategoryId) return { error: 'La categoría de gasto no es válida' };
    if (!value.roles.includes('provider')) return { error: 'La categoría de gasto solo aplica a proveedores' };
    if (db && !db.findById('categories', expenseCategoryId, userId)) return { error: 'La categoría de gasto no existe' };
    value.expenseCategoryId = expenseCategoryId;
  } else if (expenseCategoryId === null) {
    value.expenseCategoryId = null;
  }
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
  const parsed = validateOwner(req.body || {}, null, req.app.locals.db, req.session.userId);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const owner = req.app.locals.db.create('legalOwners', parsed.value, req.session.userId);
  res.status(201).json(ownerResponse(owner));
});

router.put('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const existing = db.findById('legalOwners', req.params.id, userId);
  if (!existing) return res.status(404).json({ error: 'Persona u organización no encontrada' });
  const parsed = validateOwner(req.body || {}, existing, db, userId);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  res.json(ownerResponse(db.update('legalOwners', existing.id, parsed.value, userId)));
});

const REFERENCES = [
  ['accounts', item => item.ownerId],
  ['assetOwnerships', item => item.ownerId],
  ['rentalContracts', item => item.tenantIds || []],
  ['obligations', item => [item.providerEntityId, item.responsibleEntityId, item.responsibleThirdEntityId]],
  ['obligationResolutions', item => item.tenantEntityId],
  ['documents', item => [item.entityId, item.tenantEntityId]]
];

router.delete('/:id', (req, res) => {
  const db = req.app.locals.db;
  const userId = req.session.userId;
  const existing = db.findById('legalOwners', req.params.id, userId);
  if (!existing) return res.status(404).json({ error: 'Persona u organización no encontrada' });
  const referenced = REFERENCES.some(([collection, ids]) => db.findAll(collection, userId).some(item => [ids(item)].flat().includes(existing.id)));
  if (referenced) return res.status(409).json({ error: 'No se puede eliminar: está en uso en cuentas, bienes, contratos, obligaciones o documentos' });
  db.remove('legalOwners', existing.id, userId);
  res.json({ ok: true });
});

module.exports = router;
