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

module.exports = { migrateEvolutivo };
