// Client of the server-side help-chat history (API.helpChats) with its retry buffer.
describe('Help assistant history client', () => {
  const memoryStorage = (initial = {}) => {
    const data = { ...initial };
    return {
      data,
      getItem: key => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
      setItem: (key, value) => { data[key] = String(value); },
      removeItem: key => { delete data[key]; }
    };
  };

  const chat = (id, startedAt, interacted = true) => ({
    id,
    startedAt,
    endedAt: startedAt,
    title: `Chat ${id}`,
    messages: [
      { from: 'bot', at: startedAt, type: 'menu', nodeId: 'root', title: 'Menú principal', text: '¿Sobre qué tema?', options: [{ key: '1', label: 'Transacciones' }] },
      ...(interacted ? [{ from: 'user', at: startedAt, text: '1 · Transacciones' }] : []),
      { from: 'bot', at: startedAt, type: 'leaf', nodeId: 'x', title: 'Registrar un gasto', steps: ['Andá a Inicio.', 'Tocá Guardar.'], tip: 'Revisá el mes.', options: [{ key: '9', label: 'Volver' }] }
    ]
  });

  function load({ api, storage = memoryStorage() } = {}) {
    jest.resetModules();
    const HelpHistory = require('../../public/js/help/helpHistory');
    HelpHistory.cache = {};
    HelpHistory.memoryPending = {};
    HelpHistory.api = () => api;
    HelpHistory.storage = () => storage;
    return { HelpHistory, storage };
  }

  const fakeApi = () => {
    const server = [];
    let seq = 0;
    return {
      server,
      list: jest.fn(async () => server.slice().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))),
      save: jest.fn(async payload => { const saved = { id: `s${++seq}`, ...payload }; server.push(saved); return saved; })
    };
  };

  it('saves a flattened chat on the server and lists newest first', async () => {
    const api = fakeApi();
    const { HelpHistory } = load({ api });
    expect(await HelpHistory.save('u1', chat('a', '2026-11-20T10:00:00.000Z'))).toBe(true);
    expect(await HelpHistory.save('u1', chat('b', '2026-11-21T10:00:00.000Z'))).toBe(true);
    const payload = api.save.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(['endedAt', 'messages', 'startedAt', 'title']);
    payload.messages.forEach(message => expect(Object.keys(message).sort()).toEqual(['at', 'from', 'text']));
    expect(payload.messages[2].text).toBe('Registrar un gasto\n1. Andá a Inicio.\n2. Tocá Guardar.\nSi algo no cierra: Revisá el mes.\n9 · Volver');
    const listed = await HelpHistory.list('u1');
    expect(listed.map(item => item.title)).toEqual(['Chat b', 'Chat a']);
    expect(HelpHistory.get('u1', listed[1].id).title).toBe('Chat a');
  });

  it('never saves a chat without user interaction', async () => {
    const api = fakeApi();
    const { HelpHistory, storage } = load({ api });
    expect(await HelpHistory.save('u1', chat('a', '2026-11-20T10:00:00.000Z', false))).toBe(false);
    expect(HelpHistory.addPending('u1', chat('a', '2026-11-20T10:00:00.000Z', false))).toBe(false);
    expect(api.save).not.toHaveBeenCalled();
    expect(storage.data).toEqual({});
  });

  it('keeps a chat whose save failed and retries it on flush', async () => {
    const api = fakeApi();
    api.save.mockRejectedValueOnce(Object.assign(new Error('Sin conexión'), { status: 503 }));
    const { HelpHistory, storage } = load({ api });
    expect(await HelpHistory.save('u1', chat('a', '2026-11-20T10:00:00.000Z'))).toBe(false);
    expect(HelpHistory.cached('u1')).toHaveLength(1);
    expect(HelpHistory.cached('u1')[0].pending).toBe(true);
    expect(JSON.parse(storage.data.pate_help_pending_u1)).toHaveLength(1);
    expect(await HelpHistory.flushPending('u1')).toBe(0);
    expect(api.server).toHaveLength(1);
    expect(storage.data.pate_help_pending_u1).toBeUndefined();
    expect(HelpHistory.cached('u1').map(item => item.pending)).toEqual([undefined]);
  });

  it('drops a chat the server rejects as invalid instead of retrying forever', async () => {
    const api = fakeApi();
    api.save.mockRejectedValue(Object.assign(new Error('Datos inválidos'), { status: 400 }));
    const { HelpHistory } = load({ api });
    expect(await HelpHistory.save('u1', chat('a', '2026-11-20T10:00:00.000Z'))).toBe(false);
    expect(HelpHistory.cached('u1')).toEqual([]);
  });

  it('keeps pending chats per user', async () => {
    const api = fakeApi();
    api.save.mockRejectedValue(new Error('offline'));
    const { HelpHistory } = load({ api });
    await HelpHistory.save('u1', chat('a', '2026-11-20T10:00:00.000Z'));
    expect(HelpHistory.cached('u1')).toHaveLength(1);
    expect(HelpHistory.cached('u2')).toEqual([]);
  });

  it('survives corrupted or unavailable storage and a failing server', async () => {
    const api = fakeApi();
    api.list.mockRejectedValue(new Error('offline'));
    const { HelpHistory } = load({ api, storage: memoryStorage({ pate_help_pending_u1: '{not json' }) });
    expect(HelpHistory.cached('u1')).toEqual([]);
    await expect(HelpHistory.list('u1')).rejects.toThrow('offline');
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
    const second = load({ api: fakeApi(), storage: broken }).HelpHistory;
    expect(second.cached('u1')).toEqual([]);
    expect(await second.save('u1', chat('a', '2026-11-20T10:00:00.000Z'))).toBe(true);
    expect(load({ api: null }).HelpHistory.cached('')).toEqual([]);
  });

  it('caps long chats to the server limits', () => {
    const { HelpHistory } = load({ api: fakeApi() });
    const long = chat('a', '2026-11-20T10:00:00.000Z');
    long.messages = Array.from({ length: 600 }, (_, index) => ({ from: index % 2 ? 'user' : 'bot', at: long.startedAt, text: 'x'.repeat(5000) }));
    const payload = HelpHistory.toPayload(long);
    expect(payload.messages).toHaveLength(HelpHistory.MAX_MESSAGES);
    payload.messages.forEach(message => expect(message.text.length).toBeLessThanOrEqual(HelpHistory.MAX_TEXT));
  });
});
