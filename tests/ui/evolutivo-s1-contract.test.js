const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo S1 UI contract', () => {
  it('offers the new holder roles in the entities page', () => {
    const source = read('js/pages/entities.js');
    expect(source).toContain("['payment_responsible', 'Responsable de pago']");
    expect(source).toContain("['other', 'Otro']");
    expect(source).toContain('payment_responsible: ');
  });

  it('exposes external identifier fields on the obligations page', () => {
    const source = read('js/pages/obligations.js');
    expect(source).toContain('externalIdentifier: identifier || null');
    expect(source).toContain('externalIdentifierType: identifier ? identifierKind.value : null');
    expect(source).toContain("['policy', 'Póliza']");
  });

  it('bumps the service worker cache name', () => {
    const source = read('sw.js');
    expect(source).toMatch(/CACHE_NAME = 'selimsystem-v(19|[2-9]\d)'/);
    expect(source).not.toContain('selimsystem-v18');
  });
});
