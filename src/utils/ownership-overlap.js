function overlaps(a, b) {
  const endA = a.endDate || '9999-12-31';
  const endB = b.endDate || '9999-12-31';
  return a.startDate <= endB && b.startDate <= endA;
}

function isActiveOn(period, date) {
  return period.startDate <= date && date <= (period.endDate || '9999-12-31');
}

// Validates a full set of ownership periods for one asset. Different holders may
// overlap (co-ownership); the same holder may not, and concurrent percentages
// must not exceed 100 on any date.
function validateOwnershipSet(periods) {
  for (let i = 0; i < periods.length; i += 1) {
    for (let j = i + 1; j < periods.length; j += 1) {
      if (periods[i].ownerId === periods[j].ownerId && overlaps(periods[i], periods[j])) {
        return { error: 'El titular ya tiene un período de titularidad que se solapa con estas fechas' };
      }
    }
  }
  const withPercentage = periods.filter(period => typeof period.percentage === 'number');
  for (const candidate of withPercentage) {
    const total = withPercentage
      .filter(period => isActiveOn(period, candidate.startDate))
      .reduce((sum, period) => sum + period.percentage, 0);
    if (total > 100 + 1e-9) return { error: 'La suma de porcentajes de titularidad simultáneos no puede superar el 100%' };
  }
  return { ok: true };
}

module.exports = { overlaps, validateOwnershipSet };
