const { getIncomeIva } = require('../../src/utils/income');

describe('getIncomeIva with ivaIncluded', () => {
  it('extracts IVA from a gross amount', () => {
    expect(getIncomeIva({ tipo: 'income', monto: 121000, clasificacion: 'A', ivaPorcentaje: 21, ivaIncluded: true })).toBe(21000);
  });
  it('keeps net behavior without the flag', () => {
    expect(getIncomeIva({ tipo: 'income', monto: 100000, clasificacion: 'A', ivaPorcentaje: 21 })).toBe(21000);
  });
  it('returns 0 without IVA percent', () => {
    expect(getIncomeIva({ tipo: 'income', monto: 100, clasificacion: 'A', ivaPorcentaje: null, ivaIncluded: true })).toBe(0);
  });
});
