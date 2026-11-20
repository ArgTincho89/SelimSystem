const alertConfig = require('../../src/services/alert-config');

// Minimal in-memory db with the JsonDB methods the service uses.
function memoryDb(seed = {}) {
  const data = JSON.parse(JSON.stringify(seed));
  let counter = 0;
  return {
    data,
    findAll: collection => (data[collection] || []).map(item => ({ ...item })),
    findById: (collection, id) => (data[collection] || []).find(item => item.id === id) || null,
    create: (collection, item) => {
      const record = { id: `id-${++counter}`, ...item };
      (data[collection] = data[collection] || []).push(record);
      return { ...record };
    },
    update: (collection, id, updates) => {
      const record = data[collection].find(item => item.id === id);
      Object.assign(record, updates);
      return { ...record };
    }
  };
}

describe('alert-config catalog and resolver', () => {
  it('maps every alert type with its default lead and allowed scopes', () => {
    const byKey = Object.fromEntries(alertConfig.CATALOG.map(entry => [entry.key, entry]));
    expect(byKey.obligation_due.defaultDays).toBe(7);
    expect(byKey.tenant_obligation_pending.defaultDays).toBe(7);
    expect(byKey.rent_due.defaultDays).toBe(5);
    expect(byKey.contract_expiry.defaultDays).toBe(30);
    expect(byKey.rent_adjustment_due.defaultDays).toBe(30);
    expect(byKey.cheque_due.defaultDays).toBe(7);
    expect(byKey.transaction_cheque_due.defaultDays).toBe(7);
    expect(byKey.credit_installment_upcoming.defaultDays).toBe(5);
    expect(byKey.card_installment_due.defaultDays).toBe(5);
    expect(byKey.account_forecast.defaultDays).toBe(5);
    expect(byKey.document_pending).toMatchObject({ kind: 'lookback', defaultDays: 60 });
    expect(byKey.obligation_overdue.kind).toBe('info');
    expect(byKey.partial_payment.kind).toBe('info');
    expect(byKey.account_forecast.scopes).toEqual(['account']);
    expect(alertConfig.configurable('obligation_overdue')).toBe(false);
    expect(alertConfig.configurable('rent_due')).toBe(true);
    expect(alertConfig.configurable('unknown')).toBe(false);
  });

  it('resolves rent adjustments at 15 days by default and 30 days for one specific property', () => {
    const settings = {
      defaults: { rent_adjustment_due: 15 },
      overrides: [{ type: 'rent_adjustment_due', scope: 'asset', targetId: 'casa', days: 30 }]
    };
    expect(alertConfig.resolveLeadDays(settings, 'rent_adjustment_due', { assetId: 'casa' })).toBe(30);
    expect(alertConfig.resolveLeadDays(settings, 'rent_adjustment_due', { assetId: 'depto' })).toBe(15);
    expect(alertConfig.resolveLeadDays(settings, 'rent_adjustment_due')).toBe(15);
    expect(alertConfig.maxLeadDays(settings, 'rent_adjustment_due')).toBe(30);
  });

  it('applies obligation > asset > account > user default > catalog default', () => {
    const settings = {
      defaults: { obligation_due: 10, transaction_cheque_due: 3 },
      overrides: [
        { type: 'obligation_due', scope: 'asset', targetId: 'a1', days: 20 },
        { type: 'obligation_due', scope: 'obligation', targetId: 'o1', days: 40 },
        { type: 'transaction_cheque_due', scope: 'account', targetId: 'acc', days: 12 },
        { type: 'transaction_cheque_due', scope: 'asset', targetId: 'a1', days: 9 },
        // A scope the type does not allow is ignored.
        { type: 'rent_due', scope: 'account', targetId: 'acc', days: 99 }
      ]
    };
    expect(alertConfig.resolveLeadDays(settings, 'obligation_due', { assetId: 'a1', obligationId: 'o1' })).toBe(40);
    expect(alertConfig.resolveLeadDays(settings, 'obligation_due', { assetId: 'a1', obligationId: 'o2' })).toBe(20);
    expect(alertConfig.resolveLeadDays(settings, 'obligation_due', { assetId: 'a2', obligationId: 'o2' })).toBe(10);
    expect(alertConfig.resolveLeadDays(settings, 'transaction_cheque_due', { assetId: 'a1', accountId: 'acc' })).toBe(9);
    expect(alertConfig.resolveLeadDays(settings, 'transaction_cheque_due', { accountId: 'acc' })).toBe(12);
    expect(alertConfig.resolveLeadDays(settings, 'transaction_cheque_due', {})).toBe(3);
    expect(alertConfig.resolveLeadDays(settings, 'rent_due', { accountId: 'acc' })).toBe(5);
    expect(alertConfig.resolveLeadDays(settings, 'contract_expiry')).toBe(30);
    expect(alertConfig.resolveLeadDays(settings, 'obligation_overdue')).toBeNull();
    expect(alertConfig.resolveLeadDays(null, 'unknown')).toBeNull();
    expect(alertConfig.maxLeadDays(settings, 'obligation_overdue')).toBe(0);
  });

  it('seeds rent and balance defaults from a customized legacy alertLeadDays without persisting on plain reads', () => {
    const db = memoryDb({ accountSettings: [{ id: 's', alertLeadDays: 12 }] });
    expect(alertConfig.readSettings(db, 'u')).toEqual({ defaults: { rent_due: 12, account_forecast: 12 }, overrides: [] });
    expect(db.data.alertSettings).toBeUndefined();
    expect(alertConfig.leadDaysFor(db, 'u', 'rent_due')).toBe(12);
    const persisted = alertConfig.readSettings(db, 'u', { persist: true });
    expect(persisted.id).toBeDefined();
    expect(db.data.alertSettings).toHaveLength(1);
    db.data.accountSettings[0].alertLeadDays = 3;
    expect(alertConfig.resolver(db, 'u')('rent_due')).toBe(12);
    const untouched = memoryDb({ accountSettings: [{ id: 's', alertLeadDays: 5 }] });
    expect(alertConfig.readSettings(untouched, 'u').defaults).toEqual({});
  });

  it('validates days, types, scopes and targets and dedupes overrides', () => {
    const db = memoryDb({ assets: [{ id: 'a1', name: 'Casa' }], obligations: [{ id: 'o1', title: 'ABL' }], accounts: [{ id: 'acc', nombre: 'Banco' }] });
    const error = input => alertConfig.validateSettings(db, 'u', input).error;
    expect(error(null)).toMatch(/no es válida/);
    expect(error({ defaults: [] })).toMatch(/anticipaciones/);
    expect(error({ defaults: { obligation_overdue: 3 } })).toMatch(/tipo de aviso/);
    expect(error({ defaults: { rent_due: 366 } })).toMatch(/0 y 365/);
    expect(error({ defaults: { rent_due: 1.5 } })).toMatch(/0 y 365/);
    expect(error({ overrides: {} })).toMatch(/excepciones/);
    expect(error({ overrides: [null] })).toMatch(/excepciones/);
    expect(error({ overrides: [{ type: 'nope', scope: 'asset', targetId: 'a1', days: 3 }] })).toMatch(/tipo de aviso/);
    expect(error({ overrides: [{ type: 'rent_due', scope: 'account', targetId: 'acc', days: 3 }] })).toMatch(/alcance/);
    expect(error({ overrides: [{ type: 'rent_due', scope: 'asset', targetId: 'missing', days: 3 }] })).toMatch(/no existe/);
    expect(error({ overrides: [{ type: 'rent_due', scope: 'asset', targetId: 'a1', days: -1 }] })).toMatch(/0 y 365/);
    const ok = alertConfig.validateSettings(db, 'u', {
      defaults: { rent_due: 0 },
      overrides: [
        { type: 'rent_due', scope: 'asset', targetId: 'a1', days: 3 },
        { type: 'rent_due', scope: 'asset', targetId: 'a1', days: 8 },
        { type: 'obligation_due', scope: 'obligation', targetId: 'o1', days: 15 },
        { type: 'account_forecast', scope: 'account', targetId: 'acc', days: 2 }
      ]
    });
    expect(ok.settings.defaults).toEqual({ rent_due: 0 });
    expect(ok.settings.overrides.map(item => [item.type, item.days])).toEqual([['rent_due', 8], ['obligation_due', 15], ['account_forecast', 2]]);
  });

  it('saves and describes the settings with target names', () => {
    const db = memoryDb({ assets: [{ id: 'a1', name: 'Casa' }], obligations: [{ id: 'o1', title: 'ABL' }], accounts: [{ id: 'acc', nombre: 'Banco', activo: true }] });
    alertConfig.saveSettings(db, 'u', { defaults: { rent_adjustment_due: 15 }, overrides: [{ id: 'x', type: 'rent_adjustment_due', scope: 'asset', targetId: 'a1', days: 30 }] });
    db.data.assets.push({ id: 'a2', name: 'Otro' });
    const described = alertConfig.describe(db, 'u');
    expect(described.catalog.find(entry => entry.key === 'rent_adjustment_due').days).toBe(15);
    expect(described.catalog.find(entry => entry.key === 'obligation_overdue').days).toBeNull();
    expect(described.settings.overrides[0]).toMatchObject({ targetName: 'Casa', days: 30 });
    expect(described.targets.asset.map(item => item.name)).toEqual(['Casa', 'Otro']);
    expect(described.targets.obligation[0]).toMatchObject({ id: 'o1', name: 'ABL' });
    expect(described.targets.account[0]).toMatchObject({ id: 'acc', name: 'Banco' });
    db.data.assets = [];
    expect(alertConfig.describe(db, 'u').settings.overrides[0].targetName).toBe('Elemento eliminado');
  });
});
