const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo S2 UI contract', () => {
  it('exposes the responsibility selector and conditional split fields', () => {
    const source = read('js/pages/obligations.js');
    ['owner', 'tenant', 'shared', 'third', 'none'].forEach(type => expect(source).toContain(`['${type}',`));
    expect(source).toContain('responsibilityType: responsibilityType.value');
    expect(source).toContain('responsibleThirdEntityId:');
    expect(source).toContain('rentalContractId: rentalContract.value');
    expect(source).toContain("type: 'percentage', ownerPercent");
    expect(source).toContain('ownerFixedMinor');
    expect(source).toContain('ruleText');
  });

  it('shows the responsibility in the obligation list', () => {
    expect(read('js/pages/obligations.js')).toContain('Responsabilidad: ${this.responsibilityLabel(item)}');
  });

  it('lets the API client link documents to the new targets', () => {
    const source = read('js/api.js');
    ['occurrenceId', 'rentOccurrenceId', 'transactionId', 'tenantEntityId'].forEach(field => expect(source).toContain(field));
    expect(source).toContain('uploadTargets');
  });

  it('bumps the service worker cache name to v20 or later', () => {
    const version = Number(read('sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1]);
    expect(version).toBeGreaterThanOrEqual(20);
  });
});
