const HelpTree = require('../../public/js/help/helpTree');
const HelpEngine = require('../../public/js/help/helpEngine');

describe('Help assistant conversational engine', () => {
  const firstLeafPath = () => {
    // Follows option 1 until a leaf: root -> tx -> tx-new -> tx-new-expense.
    const path = [];
    let node = HelpTree.nodes.root;
    while (!node.steps) { path.push('1'); node = HelpTree.nodes[node.options[0].next]; }
    return { path, leaf: node };
  };

  it('starts with a welcome message and the main menu without navigation options', () => {
    const engine = HelpEngine.create(HelpTree);
    const messages = engine.start();
    expect(messages[0]).toEqual({ type: 'text', text: HelpEngine.WELCOME });
    expect(messages[1].type).toBe('menu');
    expect(messages[1].nodeId).toBe('root');
    expect(messages[1].options.map(option => option.key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(engine.current()).toBe('root');
  });

  it('advances on a valid choice and offers back (9) and main menu (0)', () => {
    const engine = HelpEngine.create(HelpTree);
    engine.start();
    const result = engine.choose(' 2 ');
    expect(result.valid).toBe(true);
    expect(engine.current()).toBe('acc');
    const keys = result.messages[0].options.map(option => option.key);
    expect(keys.slice(-2)).toEqual(['9', '0']);
    expect(result.messages[0].options.slice(-2).map(option => option.label)).toEqual([HelpEngine.BACK_LABEL, HelpEngine.MENU_LABEL]);
  });

  it('keeps the node and answers kindly on invalid input', () => {
    const engine = HelpEngine.create(HelpTree);
    engine.start();
    engine.choose('1');
    ['42', 'hola', '', '7'].forEach(input => {
      const result = engine.choose(input);
      expect(result.valid).toBe(false);
      expect(engine.current()).toBe('tx');
      expect(result.messages[0].type).toBe('text');
      expect(result.messages[0].text).toMatch(/número/);
      expect(result.messages[0].text).toContain('9 o 0');
      expect(result.messages[1].nodeId).toBe('tx');
    });
  });

  it('goes back one step with 9 or "atrás", and to the main menu with 0 or "menú"', () => {
    const engine = HelpEngine.create(HelpTree);
    engine.start();
    engine.choose('1');
    engine.choose('2');
    expect(engine.path()).toEqual(['root', 'tx', 'tx-rec']);
    expect(engine.choose('9').messages[0].nodeId).toBe('tx');
    engine.choose('2');
    expect(engine.choose('Atrás').messages[0].nodeId).toBe('tx');
    engine.choose('2');
    const menu = engine.choose('0');
    expect(menu.messages[0].nodeId).toBe('root');
    expect(engine.path()).toEqual(['root']);
    engine.choose('3');
    expect(engine.choose('MENÚ').messages[0].nodeId).toBe('root');
  });

  it('handles 9 and 0 on the main menu without breaking', () => {
    const engine = HelpEngine.create(HelpTree);
    engine.start();
    expect(engine.choose('9').messages.map(message => message.type)).toEqual(['text', 'menu']);
    expect(engine.choose('0').messages[0].text).toMatch(/menú principal/);
    expect(engine.current()).toBe('root');
  });

  it('shows a leaf with its steps, only accepts navigation there, and returns with 9', () => {
    const engine = HelpEngine.create(HelpTree);
    engine.start();
    const { path, leaf } = firstLeafPath();
    let last;
    path.forEach(key => { last = engine.choose(key); });
    const message = last.messages[0];
    expect(message.type).toBe('leaf');
    expect(message.steps).toEqual(leaf.steps);
    expect(message.tip).toBe(leaf.tip);
    expect(message.options.map(option => option.key)).toEqual(['9', '0']);
    expect(engine.choose('1').valid).toBe(false);
    expect(engine.current()).toBe(leaf.id);
    expect(engine.choose('9').messages[0].type).toBe('menu');
    expect(engine.current()).toBe('tx-new');
  });

  it('titles the conversation with the deepest topic reached and labels typed keys', () => {
    const engine = HelpEngine.create(HelpTree);
    engine.start();
    expect(engine.title()).toBe('Conversación sin tema');
    expect(engine.labelFor('4')).toBe(HelpTree.nodes.root.options[3].label);
    engine.choose('4');
    engine.choose('2');
    engine.choose('2');
    engine.choose('0');
    expect(engine.title()).toBe(HelpTree.nodes['rent-col-partial'].title);
  });

  it('normalizes input', () => {
    expect(HelpEngine.normalize(' 03. ', '9', '0')).toBe('3');
    expect(HelpEngine.normalize('volver', '9', '0')).toBe('9');
    expect(HelpEngine.normalize('Menu principal', '9', '0')).toBe('0');
    expect(HelpEngine.normalize(null, '9', '0')).toBe('');
  });

  it('rejects a tree without a root', () => {
    expect(() => HelpEngine.create({ nodes: {} })).toThrow();
  });
});
