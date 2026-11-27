const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const HELP_SCRIPTS = ['/js/help/helpTree.js', '/js/help/helpEngine.js', '/js/help/helpHistory.js', '/js/components/helpAssistant.js'];

describe('Evolutivo 16 release contract', () => {
  it('ships service worker cache v57 or later and version 1.22.x or later', () => {
    expect(Number(read('public/sw.js').match(/CACHE_NAME = 'selimsystem-v(\d+)'/)[1])).toBeGreaterThanOrEqual(57);
    const { version } = JSON.parse(read('package.json'));
    const [major, minor] = version.split('.').map(Number);
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(1022);
    const lock = JSON.parse(read('package-lock.json'));
    expect(lock.version).toBe(version);
    expect(lock.packages[''].version).toBe(version);
  });

  it('loads the help scripts before app.js and caches them offline', () => {
    const index = read('public/index.html');
    const sw = read('public/sw.js');
    HELP_SCRIPTS.forEach(script => {
      expect(index).toContain(`<script src="${script}"></script>`);
      expect(index.indexOf(script)).toBeLessThan(index.indexOf('/js/app.js'));
      expect(sw).toContain(`'${script}'`);
    });
  });

  it('adds an "Ayuda" navbar item that opens the assistant instead of navigating', () => {
    const app = read('public/js/app.js');
    expect(app).toMatch(/data-action="help"[^>]*aria-haspopup="dialog"/);
    expect(app).toContain('<span>Ayuda</span>');
    expect(app).toContain("item.dataset.action === 'help' ? HelpAssistant.open() : Router.navigate(item.dataset.route)");
  });

  it('exposes the help-chat API client and mounts the server route', () => {
    expect(read('public/js/api.js')).toMatch(/helpChats: \{[\s\S]*list\(\) \{ return API\.get\('\/help-chats'\); \}[\s\S]*save\(chat\) \{ return API\.post\('\/help-chats', chat\); \}/);
    expect(read('src/app.js')).toContain("app.use('/api/help-chats', helpChatRoutes);");
  });

  it('documents the release in the changelog, the functional document and the request', () => {
    const changelog = read('CHANGELOG.md');
    const start = changelog.indexOf('## [1.22.0] - 2026-11-27');
    expect(start).toBeGreaterThan(-1);
    const section = changelog.slice(start, changelog.indexOf('## [1.21.0]'));
    ['### Added', 'Ayuda', '9', '0', 'en el servidor por cuenta', 'solo lectura'].forEach(text => expect(section).toContain(text));
    const doc = read('Documento funcional.md');
    expect(doc).toContain(`**Versión del producto:** ${JSON.parse(read('package.json')).version}`);
    expect(doc).toContain('### 13.3 Ayuda (asistente guiado)');
    const request = read('openspec/changes/evolutivo-16/request.md');
    expect(request).toContain('Branch: `evolutivo-16`. Delivery: PR to master');
    ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'].forEach(decision => expect(request).toContain(`- ${decision}:`));
    expect(request).toContain('src/routes/help-chats.js');
  });
});
