const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo S5 UI contract', () => {
  it('exposes the resolution API client', () => {
    const source = read('js/api.js');
    ['createResolution', 'voidResolution', 'listResolutions', '/resolution`', '/obligations/resolutions?'].forEach(text => expect(source).toContain(text));
  });

  it('renders the resolved badge, portions and actions on obligation occurrences', () => {
    const source = read('js/pages/obligations.js');
    expect(source).toContain("resolved: 'Resuelto por inquilino'");
    expect(source).toContain("['resolved', 'Resueltas por inquilino']");
    expect(source).toContain('badge-resolved');
    expect(source).toContain('Propietario ${occurrence.ownerDueAmount}');
    expect(source).toContain('Inquilino ${occurrence.tenantDueAmount}');
    expect(source).toContain('Resolver (pagó el inquilino)');
    expect(source).toContain('Anular resolución');
    expect(read('css/components.css')).toContain('.badge-resolved');
  });

  it('exposes the resolve dialog fields', () => {
    const source = read('js/pages/obligations.js');
    ['showResolveModal', "'Inquilino'", 'Período (AAAA-MM)', 'Importe pagado por el inquilino', 'Fecha de resolución', 'Subir comprobantes nuevos', "'Notas'", 'Registrar resolución'].forEach(text => expect(source).toContain(text));
    expect(source).toContain('API.obligations.createResolution');
    expect(source).toContain('API.documents.uploadTargets({ occurrenceId: occurrence.id, tenantEntityId: tenant.value }');
    expect(source).toContain('API.obligations.voidResolution');
  });

  it('bumps the service worker cache name to v22 or later', () => {
    const version = Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1]);
    expect(version).toBeGreaterThanOrEqual(22);
  });
});
