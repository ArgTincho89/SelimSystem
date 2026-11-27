const HelpTree = require('../../public/js/help/helpTree');

describe('Help assistant decision tree', () => {
  const nodes = HelpTree.list;
  const byId = HelpTree.nodes;
  const isLeaf = node => Array.isArray(node.steps);

  it('has unique ids and a root menu with the app main topics', () => {
    const ids = nodes.map(node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(byId[HelpTree.ROOT_ID]).toBeDefined();
    const labels = byId.root.options.map(option => option.label).join(' | ');
    ['Transacciones', 'Cuentas', 'Bienes', 'Alquileres', 'Obligaciones', 'Avisos', 'Configuración', 'Perfil', 'Logs'].forEach(topic => expect(labels).toContain(topic));
  });

  it('points every option to an existing node', () => {
    nodes.forEach(node => (node.options || []).forEach(option => {
      expect(typeof option.label).toBe('string');
      expect(option.label.trim()).not.toBe('');
      expect(byId[option.next]).toBeDefined();
    }));
  });

  it('reaches every node from the root', () => {
    const seen = new Set([HelpTree.ROOT_ID]);
    const queue = [HelpTree.ROOT_ID];
    while (queue.length) {
      (byId[queue.shift()].options || []).forEach(option => {
        if (!seen.has(option.next)) { seen.add(option.next); queue.push(option.next); }
      });
    }
    expect(nodes.filter(node => !seen.has(node.id)).map(node => node.id)).toEqual([]);
  });

  it('is either a menu with options or a leaf with steps, and keeps 9 and 0 free for navigation', () => {
    nodes.forEach(node => {
      expect(typeof node.title).toBe('string');
      if (isLeaf(node)) {
        expect(node.options).toBeUndefined();
        expect(node.steps.length).toBeGreaterThan(0);
        node.steps.forEach(step => expect(step.trim().length).toBeGreaterThan(5));
        if (node.tip !== undefined) expect(node.tip.trim()).not.toBe('');
      } else {
        expect(Array.isArray(node.options)).toBe(true);
        expect(node.options.length).toBeGreaterThan(0);
        expect(node.options.length).toBeLessThanOrEqual(HelpTree.MAX_OPTIONS);
        expect(node.text.trim()).not.toBe('');
      }
    });
    expect(HelpTree.MAX_OPTIONS).toBeLessThan(Number(HelpTree.BACK_KEY));
  });

  it('is rich: 8 main topics and more than 100 leaf resolutions', () => {
    expect(byId.root.options).toHaveLength(8);
    expect(nodes.filter(isLeaf).length).toBeGreaterThan(100);
  });

  it('is pure data (no DOM access in the module)', () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../../public/js/help/helpTree.js'), 'utf8');
    expect(source).not.toMatch(/document\.|localStorage|fetch\(/);
  });
});
