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
    updated += migrateAssetsAndContracts(db, user.id);
  }
  return { updated };
}

const PROPERTY_KIND_TABLE = [
  [/depart|dpto|flat|apartment/, 'departamento'],
  [/casa|house/, 'casa'],
  [/galp|warehouse/, 'galpon'],
  [/lote|terreno|lot/, 'lote']
];

function propertyKindFrom(propertyType) {
  const text = String(propertyType || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const hit = PROPERTY_KIND_TABLE.find(([regex]) => regex.test(text));
  return hit ? hit[1] : null;
}

function migrateAssetsAndContracts(db, userId) {
  let updated = 0;
  const contracts = db.findAll('rentalContracts', userId);
  const activeAssetIds = new Set(contracts.filter(item => item.status === 'active').map(item => item.assetId));
  const assets = db.findAll('assets', userId);
  const fill = (item, defaults) => {
    const patch = {};
    for (const [key, value] of Object.entries(defaults)) if (item[key] === undefined) patch[key] = value;
    if (!Object.keys(patch).length) return item;
    updated += 1;
    return { ...item, ...patch };
  };
  const nextAssets = assets.map(asset => {
    if (asset.type === 'movable') return fill(asset, { vehicleType: 'automovil', brand: '', plate: '', mileage: '', color: '' });
    if (asset.type !== 'immovable') return asset;
    return fill(asset, {
      condition: asset.usageStatus === 'rented' || activeAssetIds.has(asset.id) ? 'rented' : 'not_rented',
      propertyKind: propertyKindFrom(asset.propertyType),
      coveredAreaM2: typeof asset.area === 'number' && Number.isFinite(asset.area) ? Math.round(asset.area) : null,
      freeAreaM2: null, ageYears: null, characteristics: ''
    });
  });
  const nextContracts = contracts.map(item => fill(item, { adjustmentFrequencyMonths: null, adjustmentCriterion: null, contractKind: 'rental' }));
  if (nextAssets.some((item, index) => item !== assets[index])) db.replace('assets', userId, nextAssets);
  if (nextContracts.some((item, index) => item !== contracts[index])) db.replace('rentalContracts', userId, nextContracts);
  return updated;
}

/**
 * Idempotent add-only backfill for "evolutivo-3".
 * Assets: `cadastralId` and `constructionDate` null on immovables only when undefined.
 * Contracts: each contract without a declaration gets its own `rentalDeclarations` record plus
 * `declarationId`, `modality` and `ivaPercent` (only the fields that are undefined).
 */
function migrateEvolutivo3(db) {
  let updated = 0;
  for (const user of db.findAll('users')) {
    const assets = db.findAll('assets', user.id);
    let changed = false;
    const next = assets.map(asset => {
      if (asset.type !== 'immovable') return asset;
      const patch = {};
      if (asset.cadastralId === undefined) patch.cadastralId = null;
      if (asset.constructionDate === undefined) patch.constructionDate = null;
      if (!Object.keys(patch).length) return asset;
      changed = true;
      updated += 1;
      return { ...asset, ...patch };
    });
    if (changed) db.replace('assets', user.id, next);
    updated += require('./rental-declarations').backfillDeclarations(db, user.id);
  }
  return { updated };
}

module.exports = { migrateEvolutivo, migrateEvolutivo2, migrateEvolutivo3 };
