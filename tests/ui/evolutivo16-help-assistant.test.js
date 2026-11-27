const fs = require('fs');
const path = require('path');
const { loadBrowser } = require('../helpers/fake-dom');

const root = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('Evolutivo 16 help assistant window', () => {
  function setup() {
    const server = [];
    const API = {
      helpChats: {
        list: jest.fn(async () => server.slice()),
        save: jest.fn(async chat => { const saved = { id: `s${server.length + 1}`, ...chat }; server.unshift(saved); return saved; })
      }
    };
    const loaded = loadBrowser(
      ['js/utils/format.js', 'js/help/helpTree.js', 'js/help/helpEngine.js', 'js/help/helpHistory.js', 'js/components/helpAssistant.js'],
      ['HelpAssistant', 'HelpHistory'],
      { API, App: { user: { id: 'u1' } }, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }
    );
    return { ...loaded, API, server };
  }

  const texts = node => node.findAll(item => item.className && String(item.className).includes('help-msg-text')).map(item => item.textContent);
  const userBubbles = assistant => assistant.els.messages.findAll(item => item.className === 'help-msg help-msg-user');
  const chips = assistant => assistant.els.messages.findAll(item => item.tagName === 'BUTTON' && String(item.className).startsWith('help-option'));

  it('opens as a non-modal dialog with the welcome message and the main menu', async () => {
    const { HelpAssistant, context } = setup();
    HelpAssistant.open();
    await flush();
    const dialog = HelpAssistant.root;
    expect(dialog.attributes.role).toBe('dialog');
    expect(dialog.attributes['aria-modal']).toBe('false');
    expect(dialog.attributes['aria-label']).toBe('Asistente de ayuda');
    expect(HelpAssistant.els.messages.attributes.role).toBe('log');
    expect(texts(HelpAssistant.els.messages)[0]).toMatch(/^¡Hola!/);
    expect(chips(HelpAssistant).map(chip => chip.attributes['aria-label'])).toHaveLength(8);
    expect(context.document.activeElement).toBe(HelpAssistant.els.input);
  });

  it('answers typed numbers and chips, and disables older options', async () => {
    const { HelpAssistant } = setup();
    HelpAssistant.open();
    HelpAssistant.send(' 4 ');
    expect(userBubbles(HelpAssistant)[0].textContent).toContain('4 · Alquileres, inquilinos y cobros');
    const latest = chips(HelpAssistant).filter(chip => !chip.disabled);
    expect(latest.map(chip => chip.textContent)).toEqual(expect.arrayContaining(['9Volver al paso anterior', '0Menú principal']));
    latest[1].click();
    expect(HelpAssistant.session.engine.current()).toBe('rent-col');
    HelpAssistant.send('hola');
    expect(texts(HelpAssistant.els.messages).some(text => /no entendí "hola"/.test(text))).toBe(true);
  });

  it('minimizes keeping the conversation, and Escape also minimizes', () => {
    const { HelpAssistant } = setup();
    HelpAssistant.open();
    HelpAssistant.send('1');
    const session = HelpAssistant.session;
    HelpAssistant.minimize();
    expect(HelpAssistant.root.hidden).toBe(true);
    expect(HelpAssistant.bubble.hidden).toBe(false);
    HelpAssistant.restore();
    expect(HelpAssistant.session).toBe(session);
    HelpAssistant.root.dispatch('keydown', { key: 'Escape' });
    expect(HelpAssistant.root.hidden).toBe(true);
  });

  it('saves an interacted chat on close and starts blank on the next open', async () => {
    const { HelpAssistant, API } = setup();
    HelpAssistant.open();
    HelpAssistant.send('2');
    HelpAssistant.close();
    await flush();
    expect(API.helpChats.save).toHaveBeenCalledTimes(1);
    expect(API.helpChats.save.mock.calls[0][0].title).toBe('Cuentas, saldos y transferencias');
    HelpAssistant.open();
    await flush();
    expect(userBubbles(HelpAssistant)).toHaveLength(0);
    const items = HelpAssistant.els.historyList.findAll(item => item.tagName === 'BUTTON');
    expect(items.map(item => item.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Cuentas, saldos y transferencias')]));
  });

  it('does not save a chat without interaction', async () => {
    const { HelpAssistant, API } = setup();
    HelpAssistant.open();
    HelpAssistant.close();
    await flush();
    expect(API.helpChats.save).not.toHaveBeenCalled();
  });

  it('shows a past chat read-only with a banner and returns to the active one', async () => {
    const { HelpAssistant } = setup();
    HelpAssistant.open();
    HelpAssistant.send('3');
    HelpAssistant.close();
    await flush();
    HelpAssistant.open();
    await flush();
    const [past] = HelpAssistant.els.historyList.findAll(item => item.tagName === 'BUTTON' && !String(item.className).includes('help-history-current'));
    past.click();
    expect(HelpAssistant.els.banner.hidden).toBe(false);
    expect(HelpAssistant.els.bannerText.textContent).toMatch(/^Conversación del \d{2}-\d{2}-\d{4} \d{2}:\d{2} — solo lectura$/);
    expect(HelpAssistant.els.input.disabled).toBe(true);
    expect(chips(HelpAssistant).every(chip => chip.disabled)).toBe(true);
    HelpAssistant.backToActive();
    expect(HelpAssistant.els.banner.hidden).toBe(true);
    expect(HelpAssistant.els.input.disabled).toBe(false);
  });

  it('shows a soft notice when the history cannot be loaded, and keeps the chat usable', async () => {
    const { HelpAssistant, API } = setup();
    API.helpChats.list.mockRejectedValue(new Error('offline'));
    HelpAssistant.open();
    await flush();
    await flush();
    expect(HelpAssistant.els.historyList.textContent).toContain('No se pudo cargar el historial');
    HelpAssistant.send('1');
    expect(HelpAssistant.session.engine.current()).toBe('tx');
  });

  it('builds the UI without innerHTML', () => {
    expect(read('public/js/components/helpAssistant.js')).not.toMatch(/innerHTML/);
  });
});
