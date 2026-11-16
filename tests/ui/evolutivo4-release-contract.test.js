const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('Evolutivo 4 release contract', () => {
  it('ships service worker cache v41 or later and precaches the Logs page', () => {
    const sw = read('public/sw.js');
    expect(Number(sw.match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(41);
    expect(sw).toContain("'/js/pages/logs.js'");
    expect(read('public/index.html')).toContain('/js/pages/logs.js');
  });

  it('keeps package.json and the lockfile in the same version, 1.12.0 or later', () => {
    const version = JSON.parse(read('package.json')).version;
    const [major, minor] = version.split('.').map(Number);
    expect(major > 1 || minor >= 12).toBe(true);
    const lock = JSON.parse(read('package-lock.json'));
    expect(lock.version).toBe(version);
    expect(lock.packages[''].version).toBe(version);
  });

  it('documents the release at the top of the changelog', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog.indexOf('## [1.12.0] - 2026-11-15')).toBeGreaterThan(-1);
    expect(changelog.indexOf('## [1.12.0]')).toBeLessThan(changelog.indexOf('## [1.11.17]'));
  });
});
