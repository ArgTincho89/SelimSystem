const assetHistory = require('../../src/services/asset-history');

describe('asset history range resolution', () => {
  const current = '2026-11';

  it('defaults to the current month', () => {
    expect(assetHistory.resolveRange({}, current).value).toMatchObject({ from: '2026-11', to: '2026-11', year: '2026', month: '11' });
  });

  it('resolves a month, a whole year (month omitted or "all") and a year-only default', () => {
    expect(assetHistory.resolveRange({ year: '2024', month: '3' }, current).value).toMatchObject({ from: '2024-03', to: '2024-03', month: '03' });
    expect(assetHistory.resolveRange({ year: '2024', month: 'all' }, current).value).toMatchObject({ from: '2024-01', to: '2024-12', month: 'all' });
    expect(assetHistory.resolveRange({ year: '2024' }, current).value).toMatchObject({ from: '2024-01', to: '2024-12', month: 'all' });
    expect(assetHistory.resolveRange({ month: '05' }, current).value).toMatchObject({ from: '2026-05', to: '2026-05' });
  });

  it('accepts a custom range up to 36 months and rejects longer or malformed ones', () => {
    expect(assetHistory.resolveRange({ from: '2024-01', to: '2026-12' }, current).value).toMatchObject({ from: '2024-01', to: '2026-12' });
    expect(assetHistory.resolveRange({ from: '2024-01', to: '2027-01' }, current).error).toBe('El rango no puede superar los 36 meses');
    expect(assetHistory.resolveRange({ from: '2024-5', to: '2024-06' }, current).error).toBe('Los meses deben tener formato YYYY-MM');
    expect(assetHistory.resolveRange({ from: '2024-06', to: '2024-01' }, current).error).toBe('El mes inicial no puede ser posterior al mes final');
    expect(assetHistory.resolveRange({ from: '2024-01', to: '2024-02', year: '2024' }, current).error).toContain('pero no ambos');
  });

  it('rejects invalid year and month values', () => {
    expect(assetHistory.resolveRange({ year: '24' }, current).error).toBe('El año no es válido');
    expect(assetHistory.resolveRange({ year: '2024', month: '13' }, current).error).toBe('El mes no es válido');
    expect(assetHistory.resolveRange({ year: '2024', month: 'abc' }, current).error).toBe('El mes no es válido');
  });
});
