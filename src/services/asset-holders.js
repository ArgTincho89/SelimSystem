/**
 * Holder percentage rule for the asset form (evolutivo-2).
 * One titular: percentage may be null (implicit 100).
 * More than one: every percentage in (0, 100] and the sum is 100 (+-0.01).
 * Duplicate owners and an empty list are rejected.
 */
function validateHolders(owners) {
  if (!Array.isArray(owners) || owners.length === 0) return { error: 'Debe indicar al menos un titular' };
  const ids = owners.map(item => item && item.ownerId);
  if (ids.some(id => typeof id !== 'string' || !id)) return { error: 'Titular no válido' };
  if (new Set(ids).size !== ids.length) return { error: 'El mismo titular no puede repetirse' };
  if (owners.length === 1) {
    const pct = owners[0].percentage;
    if (pct !== undefined && pct !== null && (typeof pct !== 'number' || !Number.isFinite(pct) || pct <= 0 || pct > 100)) {
      return { error: 'El porcentaje debe ser mayor que 0 y hasta 100' };
    }
    return { value: owners.map(item => ({ ownerId: item.ownerId, percentage: item.percentage == null ? null : item.percentage })) };
  }
  let sum = 0;
  for (const item of owners) {
    const pct = item.percentage;
    if (typeof pct !== 'number' || !Number.isFinite(pct) || pct <= 0 || pct > 100) {
      return { error: 'Cada titular debe tener un porcentaje mayor que 0 y hasta 100' };
    }
    sum += pct;
  }
  if (Math.abs(sum - 100) > 0.01) return { error: 'La suma de los porcentajes debe ser 100' };
  return { value: owners.map(item => ({ ownerId: item.ownerId, percentage: item.percentage })) };
}

module.exports = { validateHolders };
