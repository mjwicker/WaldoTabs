// tests/helpers/browserMock.js — in-memory browser API mock for WaldoTabs unit tests
//
// Usage:
//   const { installBrowserMock } = require('./browserMock');
//   const { browser, teardown } = installBrowserMock({ local: {}, session: {}, tabs: [] });
//   // ... run code under test ...
//   teardown(); // resets any globals set
//
// To fire browser events in tests:
//   await browser._fire('tabs.onUpdated', tabId, { status: 'complete' }, tabObj);
//   await browser._fire('runtime.onInstalled', { reason: 'install' });

'use strict';

function makeListenerRegistry() {
  const listeners = [];
  return {
    addListener(fn) { listeners.push(fn); },
    removeListener(fn) {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    },
    _listeners: listeners,
    async _fire(...args) {
      for (const fn of listeners) await fn(...args);
    }
  };
}

function makeStorage(initial = {}) {
  let store = Object.assign({}, initial);
  return {
    async get(keys) {
      if (keys == null) return Object.assign({}, store);
      if (typeof keys === 'string') return { [keys]: store[keys] };
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map(k => [k, store[k]]));
      }
      // Object form: keys are defaults
      const result = {};
      for (const [k, def] of Object.entries(keys)) {
        result[k] = store[k] !== undefined ? store[k] : def;
      }
      return result;
    },
    async set(obj) { Object.assign(store, obj); },
    async remove(keys) {
      for (const k of [].concat(keys)) delete store[k];
    },
    _store() { return store; },
    _reset(data = {}) { store = Object.assign({}, data); }
  };
}

function installBrowserMock(seed = {}) {
  const localStore  = makeStorage(seed.local   || {});
  const sessionStore = makeStorage(seed.session || {});

  let tabsData = (seed.tabs || []).map(t => Object.assign({}, t));

  const onUpdated   = makeListenerRegistry();
  const onActivated = makeListenerRegistry();
  const onRemoved   = makeListenerRegistry();
  const onMessage   = makeListenerRegistry();
  const onStartup   = makeListenerRegistry();
  const onInstalled = makeListenerRegistry();

  const browser = {
    storage: {
      local: localStore,
      session: sessionStore
    },

    tabs: {
      query: async (opts = {}) => {
        let result = tabsData.slice();
        if (opts.active    !== undefined) result = result.filter(t => t.active    === opts.active);
        if (opts.discarded !== undefined) result = result.filter(t => t.discarded === opts.discarded);
        return result;
      },
      get: async (tabId) => {
        const t = tabsData.find(t => t.id === tabId);
        if (!t) throw new Error(`Tab ${tabId} not found`);
        return Object.assign({}, t);
      },
      update: async (tabId, props) => {
        const t = tabsData.find(t => t.id === tabId);
        if (t) Object.assign(t, props);
        return t ? Object.assign({}, t) : null;
      },
      reload: async (tabId) => tabId,
      discard: async (tabId) => {
        const t = tabsData.find(t => t.id === tabId);
        if (t) t.discarded = true;
        return tabId;
      },
      captureVisibleTab: async () => seed.screenshot || 'data:image/png;base64,FAKE',
      onUpdated,
      onActivated,
      onRemoved
    },

    scripting: {
      executeScript: async ({ func } = {}) => {
        const text = seed.extractedText != null ? seed.extractedText : 'extracted page text';
        return [{ result: text }];
      }
    },

    runtime: {
      onMessage,
      onStartup,
      onInstalled,
      getRedirectURL: () => 'https://mock.extensions.example/callback',
      sendMessage: async (msg) => {
        let response;
        for (const fn of onMessage._listeners) {
          await new Promise(resolve => {
            const sendResponse = (r) => { response = r; resolve(); };
            const ret = fn(msg, {}, sendResponse);
            // If handler returns falsy (sync), resolve immediately
            if (!ret) resolve();
          });
          if (response !== undefined) break;
        }
        return response;
      }
    },

    identity: {
      getRedirectURL: () => 'https://mock.extensions.example/callback',
      launchWebAuthFlow: async ({ url } = {}) => {
        if (seed.oauthCode) {
          return `https://mock.extensions.example/callback?code=${seed.oauthCode}`;
        }
        throw new Error('No oauthCode seeded in browser mock');
      }
    },

    // Convenience: fire any nested event by dotted path
    // e.g. await browser._fire('tabs.onUpdated', tabId, info, tab)
    _fire: async (path, ...args) => {
      const parts = path.split('.');
      let obj = browser;
      for (const p of parts) obj = obj[p];
      await obj._fire(...args);
    },

    // Convenience: replace tabsData mid-test
    _setTabs: (tabs) => { tabsData = tabs.map(t => Object.assign({}, t)); }
  };

  return { browser, teardown: () => {} };
}

module.exports = { installBrowserMock };
