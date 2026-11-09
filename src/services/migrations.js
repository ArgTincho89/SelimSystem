/**
 * Idempotent startup backfill for the "evolutivo" change.
 * Adds default values for new optional obligation fields on legacy records.
 * Only writes when a record actually needs a change, so re-running is a no-op.
 */
function migrateEvolutivo(db) {
  let updated = 0;
  for (const user of db.findAll('users')) {
    const obligations = db.findAll('obligations', user.id);
    let changed = false;
    const next = obligations.map(item => {
      const patch = {};
      if (item.responsibilityType === undefined) patch.responsibilityType = 'owner';
      if (item.externalIdentifier === undefined) patch.externalIdentifier = null;
      if (item.externalIdentifierType === undefined) patch.externalIdentifierType = null;
      if (!Object.keys(patch).length) return item;
      changed = true;
      updated += 1;
      return { ...item, ...patch };
    });
    if (changed) db.replace('obligations', user.id, next);
  }
  return { updated };
}

/**
 * Idempotent add-only backfill for "evolutivo-2" (owners part).
 * Fills person fields only when undefined; never overwrites existing values.
 */
function migrateEvolutivo2(db) {
  let updated = 0;
  for (const user of db.findAll('users')) {
    const owners = db.findAll('legalOwners', user.id);
    let changed = false;
    const next = owners.map(item => {
      if (item.kind !== 'person') return item;
      const patch = {};
      if (item.firstName === undefined) patch.firstName = item.name;
      if (item.lastName === undefined) patch.lastName = '';
      if (item.dni === undefined) patch.dni = null;
      if (item.expenseCategoryId === undefined) patch.expenseCategoryId = null;
      if (!Object.keys(patch).length) return item;
      changed = true;
      updated += 1;
      return { ...item, ...patch };
    });
    if (changed) db.replace('legalOwners', user.id, next);
  }
  return { updated };
}

module.exports = { migrateEvolutivo, migrateEvolutivo2 };
