const { responsibilityFor, portionsFor } = require('../../src/services/obligations');

describe('responsibilityFor', () => {
  it('uses the live obligation when the occurrence is not pinned', () => {
    expect(responsibilityFor({ responsibilityType: 'tenant' }, {})).toEqual({ responsibilityType: 'tenant', responsibilitySplit: null });
    expect(responsibilityFor({}, undefined)).toEqual({ responsibilityType: 'owner', responsibilitySplit: null });
  });

  it('prefers the pinned occurrence responsibility', () => {
    const split = { type: 'percentage', ownerPercent: 50, tenantPercent: 50 };
    const result = responsibilityFor({ responsibilityType: 'tenant' }, { responsibilityType: 'shared', responsibilitySplit: split });
    expect(result).toEqual({ responsibilityType: 'shared', responsibilitySplit: split });
    expect(portionsFor(result, 1000)).toEqual({ owner: 500, tenant: 500 });
  });
});
