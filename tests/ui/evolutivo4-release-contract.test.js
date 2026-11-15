const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('Evolutivo 4 release contract', () => {
  it('ships service worker cache v41 and precaches the Logs page', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain("CACHE_NAME = 'selimsystem-v41'");
    expect(sw).toContain("'/js/pages/logs.js'");
    expect(read('public/index.html')).toContain('/js/pages/logs.js');
  });

  it('bumps the package version to 1.12.0 in package.json and the lockfile', () => {
    expect(JSON.parse(read('package.json')).version).toBe('1.12.0');
    const lock = JSON.parse(read('package-lock.json'));
    expect(lock.version).toBe('1.12.0');
    expect(lock.packages[''].version).toBe('1.12.0');
  });

  it('documents the release at the top of the changelog', () => {
    const changelog = read('CHANGELOG.md');
    expect(changelog.indexOf('## [1.12.0] - 2026-11-15')).toBeGreaterThan(-1);
    expect(changelog.indexOf('## [1.12.0]')).toBeLessThan(changelog.indexOf('## [1.11.17]'));
  });
});
