const { validateHolders } = require('./asset-holders');
const { validateOwnershipSet } = require('../utils/ownership-overlap');

function isoDay(offsetDays = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function samePercentage(a, b) {
  return (a == null ? null : a) === (b == null ? null : b);
}

/**
 * Diff the requested holders against the asset's current ownership records.
 * Unchanged open holders stay; changed/removed ones close as of yesterday
 * (or are edited/removed in place when they start today or later); new or
 * changed holders open today.
 */
function diffHolders(current, desired, today) {
  const yesterday = isoDay(-1);
  const plan = { close: [], update: [], remove: [], create: [], resulting: [] };
  const open = current.filter(record => !record.endDate);
  const keptIds = new Set();
  const handled = new Set();
  for (const record of open) {
    const want = desired.find(item => item.ownerId === record.ownerId);
    if (want && samePercentage(want.percentage, record.percentage)) {
      keptIds.add(record.id);
      handled.add(want.ownerId);
      plan.resulting.push(record);
    } else if (record.startDate >= today) {
      if (want) {
        plan.update.push({ id: record.id, percentage: want.percentage });
        plan.resulting.push({ ...record, percentage: want.percentage });
        handled.add(want.ownerId);
      } else {
        plan.remove.push(record.id);
      }
    } else {
      plan.close.push({ id: record.id, endDate: yesterday });
      plan.resulting.push({ ...record, endDate: yesterday });
    }
  }
  for (const record of current.filter(item => item.endDate)) plan.resulting.push(record);
  for (const want of desired) {
    if (handled.has(want.ownerId)) continue;
    const fresh = { ownerId: want.ownerId, startDate: today, endDate: null, percentage: want.percentage, notes: '' };
    plan.create.push(fresh);
    plan.resulting.push(fresh);
  }
  return plan;
}

/**
 * Validate the whole composite payload without writing anything.
 * `validateAsset` is injected by the route to avoid a circular dependency.
 */
function validate(db, userId, body, existing, validateAsset) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'El cuerpo no es válido' };
  const asset = body.asset;
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) return { error: 'Faltan los datos del bien' };
  const parsedAsset = validateAsset(asset, existing, db, userId);
  if (parsedAsset.error) return { error: parsedAsset.error };
  const holders = validateHolders(body.owners);
  if (holders.error) return { error: holders.error };
  for (const holder of holders.value) {
    const owner = db.findById('legalOwners', holder.ownerId, userId);
    if (!owner || (Array.isArray(owner.roles) && !owner.roles.includes('owner'))) return { error: 'Titular legal no encontrado' };
  }
  if (body.rental !== undefined && body.rental !== null) return { error: 'El alquiler todavía no se puede guardar desde el formulario' };
  if (body.obligationResponsibilities !== undefined && !Array.isArray(body.obligationResponsibilities)) {
    return { error: 'Las responsabilidades deben ser una lista' };
  }
  const today = isoDay();
  const current = existing ? db.findAll('assetOwnerships', userId).filter(record => record.assetId === existing.id) : [];
  const plan = diffHolders(current, holders.value, today);
  const overlap = validateOwnershipSet(plan.resulting);
  if (overlap.error) return { error: overlap.error };
  return { value: { asset: parsedAsset.value, statusNotes: asset.statusNotes, plan } };
}

/** Write a validated payload. Throws on failure; the caller resets the cache. */
function apply(db, userId, existing, parsed) {
  let asset;
  if (existing) {
    asset = db.update('assets', existing.id, parsed.asset, userId);
    if (asset.status !== existing.status) {
      db.create('assetStatusHistory', { assetId: asset.id, status: asset.status, changedAt: new Date().toISOString(), notes: parsed.statusNotes || '' }, userId);
    }
  } else {
    asset = db.create('assets', parsed.asset, userId);
    db.create('assetStatusHistory', { assetId: asset.id, status: asset.status, changedAt: asset.createdAt, notes: 'Estado inicial' }, userId);
  }
  const { plan } = parsed;
  plan.close.forEach(item => db.update('assetOwnerships', item.id, { endDate: item.endDate }, userId));
  plan.update.forEach(item => db.update('assetOwnerships', item.id, { percentage: item.percentage }, userId));
  plan.remove.forEach(id => db.remove('assetOwnerships', id, userId));
  plan.create.forEach(record => db.create('assetOwnerships', { ...record, assetId: asset.id }, userId));
  return asset;
}

module.exports = { validate, apply, diffHolders };
