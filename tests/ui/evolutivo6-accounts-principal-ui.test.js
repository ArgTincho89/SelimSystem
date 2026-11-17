const fs = require('fs');
const path = require('path');

const settings = fs.readFileSync(path.join(__dirname, '../../public/js/pages/settings.js'), 'utf8');

describe('Evolutivo 6 principal account form contract', () => {
  it('enables the principal checkbox on create and no longer disables it when a principal exists', () => {
    expect(settings).not.toMatch(/if \(!account && this\.accounts\.some\(item => item\.primary && item\.activo\)\) primary\.disabled = true/);
    expect(settings).not.toContain('primary.disabled = Boolean(account?.primary)');
  });

  it('asks for "Nueva cuenta principal" on uncheck and sends newPrimaryId', () => {
    expect(settings).toContain("'Nueva cuenta principal'");
    expect(settings).toContain('newPrimaryId: replacement.value');
    expect(settings).toContain('Elegí una cuenta activa para que sea la nueva principal');
  });

  it('keeps the checkbox checked and disabled with a hint when no account is eligible', () => {
    expect(settings).toMatch(/if \(!replacementOptions\.length\) \{\s*primary\.disabled = true;/);
    expect(settings).toContain('primero necesitás otra cuenta activa');
  });
});
