const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 3 S3 asset form simplification UI contract', () => {
  const source = read('js/pages/assets.js');
  const modal = source.slice(source.indexOf('showAssetModal(asset = null'), source.indexOf('legacyLines(asset)'));
  const details = source.slice(source.indexOf('async showDetails(id)'), source.indexOf('async showDetails(id)') + 4500);

  it('has the cadastral text, construction date and live age text', () => {
    expect(modal).toContain("'Identificación catastral'");
    expect(modal).toContain('fields.cadastralId.maxLength = 100');
    expect(modal).toContain("'Fecha de construcción', { type: 'date'");
    expect(modal).toContain('Antigüedad (dato anterior)');
    expect(modal).toContain('this.ageText(fields.constructionDate.value)');
    expect(modal).toContain("on(fields.constructionDate, 'input', refreshAge)");
    expect(modal).toContain('payload.constructionDate = fields.constructionDate.value || null');
  });

  it('computes the age text in years, or months under one year', () => {
    const start = source.indexOf('  ageText(dateValue');
    const end = source.indexOf('  showAssetModal(asset = null');
    const ctx = {};
    vm.runInNewContext(`obj = { ${source.slice(start, end).trim().replace(/,\s*$/, '')} }`, ctx);
    const now = new Date(2026, 10, 9);
    expect(ctx.obj.ageText('2010-03-15', now)).toBe('Antigüedad: 16 años');
    expect(ctx.obj.ageText('2025-11-09', now)).toBe('Antigüedad: 1 año');
    expect(ctx.obj.ageText('2026-05-10', now)).toBe('Antigüedad: 5 meses');
    expect(ctx.obj.ageText('2026-10-09', now)).toBe('Antigüedad: 1 mes');
    expect(ctx.obj.ageText('2999-01-01', now)).toBe('');
    expect(ctx.obj.ageText('', now)).toBe('');
  });

  it('has no condition select, rental block or numeric age in the form', () => {
    expect(modal).not.toContain('fields.condition');
    expect(modal).not.toContain("'Condición'");
    expect(modal).not.toContain('renderRentalAndObligations');
    expect(modal).not.toContain('fields.ageYears');
    expect(source).not.toContain('data-rental-block');
  });

  it('puts the obligations list under "Obligaciones del bien"', () => {
    expect(source).toContain("h4', { textContent: 'Obligaciones del bien' }");
    expect(source).not.toContain("h4', { textContent: 'Identificación catastral' }");
  });

  it('removes the holder add/end blocks from the details modal', () => {
    expect(source).not.toContain('Añadir titularidad');
    expect(source).not.toContain('Finalizar titularidad hoy');
    expect(source).not.toContain('addOwnership(id');
    expect(details).toContain('Historial de titularidad');
  });

  it('offers a Ver button that opens the edit modal read-only', () => {
    expect(source).toContain("textContent: 'Ver', onClick");
    expect(source).toContain('{ readOnly: true }');
    expect(modal).toContain("const readOnly = Boolean(options.readOnly)");
    expect(modal).toContain("form.querySelectorAll('input, select, textarea, button').forEach(control => { control.disabled = true; })");
    expect(modal).toMatch(/readOnly\s*\?\s*create\('div', \{\}, \[create\('button'[^\]]*'Cerrar'/);
    expect(modal).toContain("'Ver bien'");
  });

  it('asks for an inline confirmation before every edit save (no window.confirm)', () => {
    expect(modal).toContain('Estás por modificar datos del bien. Revisá los cambios antes de confirmar.');
    expect(modal).toContain('if (editing && !saveConfirmed)');
    expect(modal).toContain("textContent: 'Confirmar y guardar'");
    expect(modal).toContain("textContent: 'Volver'");
    expect(source).not.toContain('window.confirm');
  });

  it('does not send condition or rental from the UI', () => {
    expect(modal).not.toMatch(/payload\.condition/);
    expect(modal).not.toContain('rental:');
  });

  it('bumps the service worker cache to v34 or later', () => {
    expect(Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(34);
  });
});
