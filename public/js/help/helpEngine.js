// Conversational engine of the "Ayuda" assistant. Pure logic over a HelpTree: it keeps the current position
// (a stack of node ids from the root) and turns the user's input into bot messages. No DOM, no storage.
//
// Messages returned to the UI:
//   { type: 'text', text }
//   { type: 'menu', nodeId, title, text, options: [{ key, label }] }
//   { type: 'leaf', nodeId, title, steps: [...], tip, options: [{ key, label }] }
// Numbering scheme: options are 1..8; "9" (or "atrás"/"volver") goes back one step and "0" (or "menú") returns to
// the main menu. Both navigation options are listed under every node except the main menu itself.
const HelpEngine = (() => {
  const WELCOME = '¡Hola! Soy el asistente de ayuda de SelimSystem. Respondé con el número de la opción (o tocá el botón) y te explico paso a paso cómo hacerlo.';
  const BACK_LABEL = 'Volver al paso anterior';
  const MENU_LABEL = 'Menú principal';
  const BACK_WORDS = ['atras', 'volver', 'anterior', 'back'];
  const MENU_WORDS = ['menu', 'menu principal', 'inicio', 'principal'];

  // "  2 ", "2.", "2)", "Atrás", "MENÚ" -> "2", "9", "0"; anything else is returned normalized (and is invalid).
  function normalize(input, backKey, menuKey) {
    const text = String(input == null ? '' : input)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .trim().toLowerCase().replace(/[.)\s]+$/, '');
    if (/^\d+$/.test(text)) return String(Number(text));
    if (BACK_WORDS.includes(text)) return backKey;
    if (MENU_WORDS.includes(text)) return menuKey;
    return text;
  }

  function create(tree) {
    if (!tree || !tree.nodes || !tree.nodes[tree.ROOT_ID]) throw new Error('HelpEngine needs a tree with a root node');
    const ROOT = tree.ROOT_ID;
    const BACK = tree.BACK_KEY || '9';
    const MENU = tree.MENU_KEY || '0';
    let stack = [ROOT];
    let deepest = { depth: 0, title: '' };

    const node = id => tree.nodes[id];
    const currentId = () => stack[stack.length - 1];
    const isLeaf = item => Array.isArray(item.steps);

    function navOptions(id) {
      if (id === ROOT) return [];
      return [{ key: BACK, label: BACK_LABEL, nav: 'back' }, { key: MENU, label: MENU_LABEL, nav: 'menu' }];
    }

    function render(id) {
      const item = node(id);
      if (isLeaf(item)) {
        return { type: 'leaf', nodeId: id, title: item.title, steps: item.steps.slice(), tip: item.tip || '', options: navOptions(id) };
      }
      const options = item.options.map((option, index) => ({ key: String(index + 1), label: option.label }));
      return { type: 'menu', nodeId: id, title: item.title, text: item.text || '', options: options.concat(navOptions(id)) };
    }

    function track() {
      const depth = stack.length - 1;
      if (depth > 0 && depth >= deepest.depth) deepest = { depth, title: node(currentId()).title };
    }

    function availableKeys(id) {
      return render(id).options.map(option => option.key);
    }

    function invalid(raw) {
      const keys = availableKeys(currentId());
      const shown = String(raw == null ? '' : raw).trim();
      const list = keys.length > 1 ? `${keys.slice(0, -1).join(', ')} o ${keys[keys.length - 1]}` : keys[0];
      const text = shown
        ? `Perdón, no entendí "${shown.slice(0, 40)}". Escribí solo el número de una opción: ${list}.`
        : `Escribí el número de una opción: ${list}.`;
      return { valid: false, messages: [{ type: 'text', text }, render(currentId())] };
    }

    return {
      start() {
        stack = [ROOT];
        deepest = { depth: 0, title: '' };
        return [{ type: 'text', text: WELCOME }, render(ROOT)];
      },

      choose(input) {
        const key = normalize(input, BACK, MENU);
        const id = currentId();
        if (key === MENU) {
          const already = id === ROOT;
          stack = [ROOT];
          return { valid: true, messages: [...(already ? [{ type: 'text', text: 'Ya estás en el menú principal.' }] : []), render(ROOT)] };
        }
        if (key === BACK) {
          if (stack.length === 1) return { valid: true, messages: [{ type: 'text', text: 'Ya estás en el menú principal: no hay un paso anterior.' }, render(ROOT)] };
          stack.pop();
          return { valid: true, messages: [render(currentId())] };
        }
        const item = node(id);
        if (isLeaf(item) || !/^\d+$/.test(key)) return invalid(input);
        const option = item.options[Number(key) - 1];
        if (!option || !node(option.next)) return invalid(input);
        stack.push(option.next);
        track();
        return { valid: true, messages: [render(option.next)] };
      },

      current() { return currentId(); },
      path() { return stack.slice(); },
      render,
      // Short title for the history: the deepest topic the conversation reached.
      title() { return deepest.title || 'Conversación sin tema'; },
      // Label shown in the user's bubble for a key of the current node ("2 · Cobrar el alquiler").
      labelFor(input) {
        const key = normalize(input, BACK, MENU);
        const option = render(currentId()).options.find(item => item.key === key);
        return option ? option.label : '';
      }
    };
  }

  return { create, normalize, WELCOME, BACK_LABEL, MENU_LABEL };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = HelpEngine;
