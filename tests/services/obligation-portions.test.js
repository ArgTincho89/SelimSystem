const { portionsFor } = require('../../src/services/obligations');

describe('portionsFor', () => {
  it('assigns the whole amount to the owner for owner, third and none', () => {
    ['owner', 'third', 'none', undefined].forEach(responsibilityType => {
      expect(portionsFor({ responsibilityType }, 10000)).toEqual({ owner: 10000, tenant: 0 });
    });
  });

  it('assigns the whole amount to the tenant', () => {
    expect(portionsFor({ responsibilityType: 'tenant' }, 10000)).toEqual({ owner: 0, tenant: 10000 });
  });

  it('splits shared percentages with the remainder on the owner side', () => {
    const obligation = { responsibilityType: 'shared', responsibilitySplit: { type: 'percentage', ownerPercent: 60, tenantPercent: 40 } };
    expect(portionsFor(obligation, 10000)).toEqual({ owner: 6000, tenant: 4000 });
    const odd = { responsibilityType: 'shared', responsibilitySplit: { type: 'percentage', ownerPercent: 50, tenantPercent: 50 } };
    const result = portionsFor(odd, 1001);
    expect(result.owner + result.tenant).toBe(1001);
  });

  it('caps fixed amounts to the due amount and leaves the remainder to the owner', () => {
    const fixed = { responsibilityType: 'shared', responsibilitySplit: { type: 'fixed', tenantFixedMinor: 3000 } };
    expect(portionsFor(fixed, 10000)).toEqual({ owner: 7000, tenant: 3000 });
    expect(portionsFor(fixed, 2000)).toEqual({ owner: 0, tenant: 2000 });
    const ownerOnly = { responsibilityType: 'shared', responsibilitySplit: { type: 'fixed', ownerFixedMinor: 4000 } };
    expect(portionsFor(ownerOnly, 10000)).toEqual({ owner: 4000, tenant: 6000 });
  });

  it('treats an agreed rule as informational and keeps the owner portion', () => {
    const rule = { responsibilityType: 'shared', responsibilitySplit: { type: 'other', ruleText: 'By usage' } };
    expect(portionsFor(rule, 5000)).toEqual({ owner: 5000, tenant: 0 });
  });

  it('returns zero portions for invalid due amounts', () => {
    expect(portionsFor({ responsibilityType: 'tenant' }, -5)).toEqual({ owner: 0, tenant: 0 });
    expect(portionsFor({ responsibilityType: 'owner' }, undefined)).toEqual({ owner: 0, tenant: 0 });
  });
});
