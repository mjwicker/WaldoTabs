// tests/helpers/loadBackground.js — loads background.js into a vm context
//
// background.js is a non-module script, so we use vm.runInNewContext to inject
// a fake `browser` global and other dependencies.
//
// Usage:
//   const { loadBackground, sendMessage } = require('./loadBackground');
//   const { browser } = installBrowserMock({ ... });
//   const ctx = loadBackground({ browser, fetch: mockFetch });
//   await ctx.loadTabCache();                     // call functions directly
//   const resp = await sendMessage(browser, msg); // use message router

'use strict';

const vm   = require('node:vm');
const fs   = require('node:fs');
const path = require('node:path');

const BG_PATH = path.join(__dirname, '..', '..', 'background.js');

function loadBackground({ browser, fetch: mockFetch } = {}) {
  const src = fs.readFileSync(BG_PATH, 'utf8');

  // Capture any setInterval calls so tests can trigger them manually
  const intervals = [];
  const mockSetInterval = (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; };
  const mockClearInterval = () => {};

  const ctx = vm.createContext({
    browser,
    fetch: mockFetch || (() => Promise.reject(new Error('fetch not mocked — seed via loadBackground({ fetch })'))),
    console,
    setInterval:   mockSetInterval,
    clearInterval: mockClearInterval,
    setTimeout,
    clearTimeout,
    Promise,
    URL,
    URLSearchParams,
    _intervals: intervals
  });

  vm.runInContext(src, ctx);

  // background.js calls loadTabCache() at the bottom (line 399).
  // It's async; flush microtasks so storage is read before tests run.
  // Callers should: await ctx._ready before asserting cache state.
  ctx._ready = new Promise(resolve => setTimeout(resolve, 0));

  return ctx;
}

// Helper: invoke the registered onMessage handler and await the response.
// Resolves with undefined if the handler completes without calling sendResponse
// (e.g. unrecognised action falls through the if-chain).
async function sendMessage(browser, msg) {
  return new Promise((resolve) => {
    const handler = browser.runtime.onMessage._listeners[0];
    if (!handler) throw new Error('No onMessage listener registered — did loadBackground run?');

    let settled = false;
    const sendResponse = (r) => {
      if (!settled) { settled = true; resolve(r); }
    };

    const ret = handler(msg, {}, sendResponse);
    // If the handler returns a Promise (async), wait for it to finish.
    // If it finishes without having called sendResponse, resolve with undefined.
    if (ret && typeof ret.then === 'function') {
      ret.then(() => { if (!settled) { settled = true; resolve(undefined); } })
         .catch(() => { if (!settled) { settled = true; resolve(undefined); } });
    } else if (!settled) {
      // Synchronous handler that didn't call sendResponse
      resolve(undefined);
    }
  });
}

module.exports = { loadBackground, sendMessage };
