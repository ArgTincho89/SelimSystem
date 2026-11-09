const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');

describe('Evolutivo 3 S1 status label contract', () => {
  const assets = read('js/pages/assets.js');
  const home = read('js/pages/home.js');

  it('does not interpolate raw statuses at the audited asset render sites', () => {
    expect(assets).not.toMatch(/\$\{(asset|item|event|contract)\.status\}/);
    expect(assets).not.toContain("asset.status || 'active'}");
    expect(assets).not.toMatch(/textContent: contract\.status\b/);
    expect(assets).not.toMatch(/\] \|\| item\.status\b/);
  });

  it('routes every audited site through statusLabel', () => {
    ["statusLabel(asset.status || 'active')", 'statusLabel(event.status)', 'statusLabel(item.status)', 'statusLabel(contract.status)'].forEach(call => {
      expect(assets).toContain(call);
    });
    expect(assets).toContain('return statusLabel(status);');
    expect(home).toContain('statusLabel(item.status)');
    expect(home).not.toMatch(/\$\{item\.status\}/);
  });

  it('does not keep a local English-to-Spanish map shadowing the helper', () => {
    expect(assets).not.toMatch(/const statusLabel = \{/);
  });

  it('keeps the pending-outside-results section using the helper (no raw overdue)', () => {
    const line = assets.split('\n').find(row => row.includes('pendingRows.forEach'));
    expect(line).toContain('statusLabel(item.status)');
  });

  it('falls back to statusLabel for unmapped obligation statuses', () => {
    expect(read('js/pages/obligations.js')).toContain('|| statusLabel(value)');
  });
});
