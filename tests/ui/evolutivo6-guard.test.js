const fs = require('fs');
const path = require('path');
const { FakeElement, loadBrowser } = require('../helpers/fake-dom');

const read = file => fs.readFileSync(path.join(__dirname, '../../public', file), 'utf8');
const flush = async () => { for (let index = 0; index < 10; index += 1) await Promise.resolve(); };

// A fetch whose responses are settled by hand, so a request can be "in flight" while the test clicks again.
const controlledFetch = () => {
  const calls = [];
  const fetch = jest.fn((url, opts) => new Promise((resolve, reject) => {
    calls.push({ url, opts, resolve: (data = {}, ok = true) => resolve({ ok, json: async () => data }), reject });
  }));
  return { fetch, calls };
};

describe('Evolutivo 6 duplicate action guard', () => {
  describe('API in-flight dedupe', () => {
    const setup = () => {
      const { fetch, calls } = controlledFetch();
      const { API } = loadBrowser(['js/api.js'], ['API'], { fetch });
      return { API, fetch, calls };
    };

    it('shares one request between identical writes while the first is in flight', async () => {
      const { API, fetch, calls } = setup();
      const first = API.post('/obligations', { title: 'A' });
      const second = API.post('/obligations', { title: 'A' });
      expect(fetch).toHaveBeenCalledTimes(1);
      calls[0].resolve({ id: 'x' });
      expect(await first).toEqual({ id: 'x' });
      expect(await second).toEqual({ id: 'x' });
    });

    it('sends both writes when the body differs', () => {
      const { API, fetch } = setup();
      API.post('/obligations', { title: 'A' });
      API.post('/obligations', { title: 'B' });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('never deduplicates GET requests', () => {
      const { API, fetch } = setup();
      API.get('/obligations');
      API.get('/obligations');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('sends the same write again once the first one settled', async () => {
      const { API, fetch, calls } = setup();
      const first = API.post('/obligations', { title: 'A' });
      calls[0].resolve({ id: 'x' });
      await first;
      API.post('/obligations', { title: 'A' });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('releases the key after a failure so the user can retry', async () => {
      const { API, fetch, calls } = setup();
      const first = API.post('/obligations', { title: 'A' });
      calls[0].resolve({ error: 'nope' }, false);
      await expect(first).rejects.toThrow('nope');
      API.post('/obligations', { title: 'A' });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('forwards the body of a DELETE request', () => {
      const { API, calls } = setup();
      API.delete('/obligations/o1/resolution', { reason: 'por error' });
      expect(calls[0].opts.method).toBe('DELETE');
      expect(JSON.parse(calls[0].opts.body)).toEqual({ reason: 'por error' });
    });

    it('keeps DELETE without a body working', () => {
      const { API, calls } = setup();
      API.delete('/goals/g1');
      expect(calls[0].opts.body).toBeUndefined();
    });
  });

  describe('busy button state', () => {
    const { guard, create, on, releaseGuards } = loadBrowser([], ['guard', 'create', 'on', 'releaseGuards']);
    const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

    it('disables the button with aria-busy while the action is pending and ignores more clicks', async () => {
      const work = deferred();
      const handler = jest.fn(() => work.promise);
      const button = create('button', { type: 'button', onClick: handler });
      button.click();
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-busy')).toBe('true');
      button.click();
      expect(handler).toHaveBeenCalledTimes(1);
      work.resolve();
      await flush();
      expect(button.disabled).toBe(false);
      expect(button.getAttribute('aria-busy')).toBe('false');
      button.click();
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('restores the button when the action rejects', async () => {
      const work = deferred();
      const button = new FakeElement('button');
      const guarded = guard(button, 'click', () => work.promise);
      const result = guarded({ preventDefault() {} });
      expect(button.disabled).toBe(true);
      work.reject(new Error('fallo'));
      await expect(result).rejects.toThrow('fallo');
      expect(button.disabled).toBe(false);
      expect(button.getAttribute('aria-busy')).toBe('false');
    });

    it('keeps a button that was already disabled disabled after the action', async () => {
      const work = deferred();
      const button = new FakeElement('button');
      button.disabled = true;
      guard(button, 'click', () => work.promise)({});
      work.resolve();
      await flush();
      expect(button.disabled).toBe(true);
    });

    it('does not touch synchronous handlers', () => {
      const button = create('button', { type: 'button', onClick: () => 'done' });
      button.click();
      expect(button.disabled).toBe(false);
      expect(button.getAttribute('aria-busy')).toBeNull();
    });

    it('exempts data-repeatable buttons', async () => {
      const work = deferred();
      const handler = jest.fn(() => work.promise);
      const button = create('button', { type: 'button', dataset: { repeatable: '' }, onClick: handler });
      button.click();
      button.click();
      expect(handler).toHaveBeenCalledTimes(2);
      expect(button.disabled).toBe(false);
      work.resolve();
    });

    it('guards forms: a second submit is ignored and prevented while the first is pending', async () => {
      const work = deferred();
      const handler = jest.fn(() => work.promise);
      const form = new FakeElement('form');
      const submit = form.appendChild(new FakeElement('button'));
      form.querySelectorAll = () => [submit];
      on(form, 'submit', handler);
      form.dispatch('submit');
      expect(submit.disabled).toBe(true);
      const second = form.dispatch('submit');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(second.defaultPrevented).toBe(true);
      work.resolve();
      await flush();
      expect(submit.disabled).toBe(false);
      form.dispatch('submit');
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('guards click listeners added with on() and leaves other events and inputs alone', () => {
      const work = deferred();
      const button = new FakeElement('button');
      on(button, 'click', () => work.promise);
      button.click();
      expect(button.disabled).toBe(true);
      const input = new FakeElement('input');
      on(input, 'click', () => work.promise);
      input.click();
      expect(input.disabled).toBe(false);
      const keydown = jest.fn(() => work.promise);
      on(button, 'keydown', keydown);
      button.dispatch('keydown');
      button.dispatch('keydown');
      expect(keydown).toHaveBeenCalledTimes(2);
    });

    it('releases pending controls when a dialog opens, so a handler awaiting a dialog is never locked forever', () => {
      const never = new Promise(() => {});
      const button = create('button', { type: 'button', onClick: () => never });
      button.click();
      expect(button.disabled).toBe(true);
      releaseGuards();
      expect(button.disabled).toBe(false);
      expect(read('js/components/modal.js')).toContain("typeof releaseGuards === 'function'");
    });

    it('opts out the month navigation arrows (repeatable)', () => {
      expect(read('js/components/monthSelector.js').match(/dataset: \{ repeatable: '' \}/g)).toHaveLength(2);
    });

    it('styles the busy state', () => {
      expect(read('css/components.css')).toMatch(/button\[aria-busy="true"\][^{]*\{[^}]*cursor: progress/);
    });
  });
});
