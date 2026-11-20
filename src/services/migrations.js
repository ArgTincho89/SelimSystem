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
 * Accounts: `parentId` null only when undefined (sub-accounts).
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
    const accounts = db.findAll('accounts', user.id);
    if (accounts.some(account => account.parentId === undefined)) {
      db.replace('accounts', user.id, accounts.map(account => {
        if (account.parentId !== undefined) return account;
        updated += 1;
        return { ...account, parentId: null };
      }));
    }
    updated += require('./rental-declarations').backfillDeclarations(db, user.id);
  }
  return { updated };
}

/**
 * Startup pass of the rental batch: tenant obligations whose rental already ended go back to the
 * owner, and pending links of abandoned declaration drafts are cleared. Idempotent (the daily job and
 * the obligation reads apply the same rules).
 */
function migrateRentalResponsibilities(db) {
  return { updated: require('./obligations').runResponsibilityMaintenance(db) };
}

/**
 * Idempotent backfill: rent collection incomes saved without a classification were shown as A
 * (locación) on the rental screen but counted as B by the A vs B analytics. Persist the same
 * classification the rental screen derives (allocation, collection, then contract modality).
 */
function rentLineClass(db, userId, allocation, collection) {
  if (allocation.clasificacion) return allocation.clasificacion;
  if (collection.clasificacion === 'A' || collection.clasificacion === 'B') return collection.clasificacion;
  const rentals = require('./rentals');
  const occurrence = db.findById('rentOccurrences', allocation.occurrenceId, userId);
  const contract = occurrence ? db.findById('rentalContracts', occurrence.contractId, userId) : null;
  const modality = occurrence?.modality || (contract ? rentals.modalityOf(contract) : null);
  if (!modality) return null;
  return modality === 'locacion' ? 'A' : 'B';
}

function rentClassificationPatch(db, userId, transaction) {
  const ledger = require('./account-ledger');
  const collections = db.findAll('rentCollections', userId)
    .filter(item => item.transactionId === transaction.id || item.id === transaction.rentCollectionId);
  if (!collections.length) return null;
  const allocations = db.findAll('rentCollectionAllocations', userId);
  const lines = [];
  collections.forEach(collection => allocations
    .filter(item => item.collectionId === collection.id)
    .forEach(allocation => lines.push({ amountMinor: allocation.amountMinor || 0, cls: rentLineClass(db, userId, allocation, collection) })));
  if (!lines.length || lines.some(line => !line.cls)) return null;
  const hasA = lines.some(line => line.cls === 'A');
  const hasB = lines.some(line => line.cls === 'B');
  if (!(hasA && hasB)) return { clasificacion: hasA ? 'A' : 'B', montoA: null, montoB: null };
  const currency = transaction.currencyCode || collections[0].currencyCode;
  const totalMinor = Number.isSafeInteger(transaction.amountMinor) ? transaction.amountMinor : ledger.toMinorUnits(transaction.monto, currency);
  const aMinor = lines.filter(line => line.cls === 'A').reduce((sum, line) => sum + line.amountMinor, 0);
  if (totalMinor === null || aMinor > totalMinor) return null;
  return { clasificacion: 'Mixto', montoA: ledger.fromMinorUnits(aMinor, currency), montoB: ledger.fromMinorUnits(totalMinor - aMinor, currency) };
}

function migrateRentCollectionClassification(db) {
  let updated = 0;
  for (const user of db.findAll('users')) {
    const pending = db.findAll('transactions', user.id)
      .filter(item => item.tipo === 'income' && item.rentCollectionId && !item.clasificacion);
    pending.forEach(transaction => {
      const patch = rentClassificationPatch(db, user.id, transaction);
      if (!patch) return;
      db.update('transactions', transaction.id, patch, user.id);
      db.findAll('rentCollections', user.id)
        .filter(item => (item.transactionId === transaction.id || item.id === transaction.rentCollectionId) && !item.clasificacion)
        .forEach(item => db.update('rentCollections', item.id, { clasificacion: patch.clasificacion }, user.id));
      updated += 1;
    });
  }
  return { updated };
}

module.exports = { migrateEvolutivo, migrateEvolutivo2, migrateEvolutivo3, migrateRentalResponsibilities, migrateRentCollectionClassification };
