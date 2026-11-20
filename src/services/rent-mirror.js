const ledger = require('./account-ledger');

/**
 * "Gasto espejo" (evolutivo-13): when the tenant of a rented asset is itself a titular of the user, the rent it
 * pays is also an expense of that titular. Every rent collection whose contract has a titular tenant creates one
 * mirror expense on an account of that tenant: same amount, currency, posting date and payment method as the
 * income line, and the same IVA (credit VAT for the tenant titular) when the income line applies IVA.
 * With several titular tenants the first one of the contract (tenantIds order) pays.
 * The mirror carries `mirrorOfTransactionId` (the income) and `mirrorRentCollectionId` (the collection); the
 * collection stores `mirrorTransactionId`. It is read-only and goes away when the collection is undone.
 */
const fail = (error, status = 400) => ({ error, status });

const isOwner = entity => Boolean(entity) && (entity.roles || ['owner']).includes('owner');

// First tenant of the contract that is also a titular (role owner), or null.
function titularTenant(db, userId, contract) {
  for (const tenantId of contract?.tenantIds || []) {
    const tenant = db.findById('legalOwners', tenantId, userId);
    if (isOwner(tenant)) return tenant;
  }
  return null;
}

// Active accounts of the tenant titular in one currency, primary first, then account order.
function tenantAccounts(db, userId, tenant, currency) {
  return db.findAll('accounts', userId)
    .filter(account => account.activo && account.ownerId === tenant.id && account.currency === currency)
    .sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)) || (a.order ?? 0) - (b.order ?? 0));
}

function periodLabel(period) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || ''));
  return match ? `${match[2]}/${match[1]}` : '';
}

function rentCategoryId(db, userId) {
  const category = db.findAll('categories', userId).find(item => String(item.nombre || '').trim().toLowerCase() === 'alquiler');
  return category ? category.id : null;
}

/**
 * Validates the mirror of one income line before anything is written. Returns `{ value: null }` when the contract
 * has no titular tenant, `{ value: plan }` when a mirror must be written, or `{ error, status }`.
 * `accountId` is the account chosen in the form ("Cuenta del inquilino (titular)"); empty picks the default.
 */
function plan(db, userId, { contract, occurrence, currency, accountId, amountMinor, ivaPercent, ivaIncluded, date, paymentMethodId, method }) {
  const tenant = titularTenant(db, userId, contract);
  if (!tenant) return { value: null };
  let account;
  if (accountId !== undefined && accountId !== null && accountId !== '') {
    account = typeof accountId === 'string' ? db.findById('accounts', accountId, userId) : null;
    if (!account || !account.activo || account.ownerId !== tenant.id) return fail(`Seleccioná una cuenta activa del inquilino ${tenant.name} para registrar su gasto`);
    if (account.currency !== currency) return fail(`La cuenta del inquilino ${tenant.name} debe estar en ${currency}`);
  } else {
    account = tenantAccounts(db, userId, tenant, currency)[0];
    if (!account) return fail(`El inquilino ${tenant.name} es titular: creá primero una cuenta en ${currency} a su nombre para registrar su gasto de alquiler`);
  }
  const asset = contract?.assetId ? db.findById('assets', contract.assetId, userId) : null;
  const period = periodLabel(occurrence?.period);
  const iva = ivaPercent !== null && ivaPercent !== undefined && Number(ivaPercent) > 0;
  return { value: {
    tenant, account, amountMinor, date, paymentMethodId: paymentMethodId || null, method: method || '',
    titulo: ['Alquiler pagado —', asset?.name, period].filter(Boolean).join(' '),
    ivaPorcentaje: iva ? Number(ivaPercent) : null, ivaIncluded: iva ? Boolean(ivaIncluded) : false
  } };
}

/** Writes the mirror expense of a planned line (inside the caller's atomic block). */
function write(db, userId, mirror, { incomeTransactionId, collectionId }) {
  const { account, tenant } = mirror;
  const iva = mirror.ivaPorcentaje !== null;
  return db.create('transactions', {
    userId, tipo: 'expense', monto: ledger.fromMinorUnits(mirror.amountMinor, account.currency), amountMinor: mirror.amountMinor,
    accountId: account.id, currencyCode: account.currency, titulo: mirror.titulo, categoryId: rentCategoryId(db, userId), refundSourceId: null,
    paymentMethodId: mirror.paymentMethodId, paymentMethod: mirror.method, fecha: mirror.date, recurrente: false, frecuencia: null, fechaFin: null,
    clasificacion: 'fijo', montoA: null, montoB: null, ivaPorcentaje: mirror.ivaPorcentaje, ivaIncluded: mirror.ivaIncluded,
    ivaHolderId: iva ? tenant.id : null, ivaHolderName: iva ? tenant.name : null,
    mirrorOfTransactionId: incomeTransactionId, mirrorRentCollectionId: collectionId
  }, userId);
}

/** Mirror expenses of these collections that still exist (for the undo). */
function mirrorsOf(db, userId, collections) {
  return collections.map(collection => (collection.mirrorTransactionId ? db.findById('transactions', collection.mirrorTransactionId, userId) : null)).filter(Boolean);
}

module.exports = { titularTenant, tenantAccounts, plan, write, mirrorsOf, isOwner };
