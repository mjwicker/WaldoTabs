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

const ROOT = path.join(__dirname, '..', '..');
const OBS_PATH = path.join(ROOT, 'lib', 'observability.js');
const BG_PATH = path.join(ROOT, 'background.js');

function loadBackground({ browser, fetch: mockFetch } = {}) {
  const obsSrc = fs.readFileSync(OBS_PATH, 'utf8');
  const src = fs.readFileSync(BG_PATH, 'utf8');

  // Capture any setInterval calls so tests can trigger them manually
  const intervals = [];
  const mockSetInterval = (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; };
  const mockClearInterval = () => {};

  // Mirror extension load order: lib/observability.js then background.js
  // Provide globalThis so observability's IIFE attaches WaldoTabsLogger / waldoTabsEmitEvent.
  const ctx = {
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
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  vm.runInContext(obsSrc, ctx);
  vm.runInContext(src, ctx);

  // background.js calls loadTabCache() at the bottom (line 399).
  // It's async; flush microtasks so storage is read before tests run.
  // Callers should: await ctx._ready before asserting cache state.
  ctx._ready = new Promise(resolve => setTimeout(resolve, 0));

  return ctx;
}

// Helper: invoke the registered onMessage handler and await the response.
//
// Mirrors real Firefox semantics: if the listener is async (or returns a Promise), its
// *resolved return value* is the response — sendResponse()/return-true is a separate,
// mutually-exclusive calling convention for non-async listeners only (see the 2026-07-02
// regression fix note in background.js). This helper prefers the async return value and
// only falls back to a sendResponse-style callback for listeners that use that pattern.
async function sendMessage(browser, msg) {
  const handler = browser.runtime.onMessage._listeners[0];
  if (!handler) throw new Error('No onMessage listener registered — did loadBackground run?');

  let settled = false;
  let sendResponseValue;
  const sendResponse = (r) => { settled = true; sendResponseValue = r; };

  const ret = handler(msg, {}, sendResponse);

  if (ret && typeof ret.then === 'function') {
    const resolved = await ret;
    // Async listener: its resolved value is the real response, matching Firefox.
    return resolved !== undefined ? resolved : (settled ? sendResponseValue : undefined);
  }
  // Synchronous listener using the sendResponse + return-true callback convention.
  return settled ? sendResponseValue : undefined;
}

module.exports = { loadBackground, sendMessage };
