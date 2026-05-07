// discard.unit.test.js — tests for prepareForDiscard
//
// prepareForDiscard is the core hibernation routine: screenshot → extract → summarize → store → discard.

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { installBrowserMock } = require('./helpers/browserMock');
const { loadBackground, sendMessage } = require('./helpers/loadBackground');

function makeFetch(body) {
  return async () => ({
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body)
  });
}

test('prepareForDiscard stores screenshot in cache entry', async () => {
  const tab = { id: 10, url: 'https://example.com', title: 'Example', windowId: 1 };
  const { browser } = installBrowserMock({
    tabs: [tab],
    screenshot: 'data:image/png;base64,SCREENSHOT',
    extractedText: 'page content',
    local: { settings: { apiEndpoint: '', apiKey: '' } }
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  // Register tab in cache first
  await browser._fire('tabs.onUpdated', 10, { status: 'complete' }, tab);
  await new Promise(r => setTimeout(r, 0));

  await sendMessage(browser, { action: 'optimizeTab', tabId: 10 });
  await new Promise(r => setTimeout(r, 10));

  const resp = await sendMessage(browser, { action: 'getCachedState' });
  const entry = resp.cache.find(([id]) => String(id) === '10');
  assert.ok(entry, 'tab should be in cache after discard');
  assert.equal(entry[1].screenshot, 'data:image/png;base64,SCREENSHOT');
});

test('prepareForDiscard sets discarded: true in cache entry', async () => {
  const tab = { id: 11, url: 'https://example.com', title: 'Example2', windowId: 1 };
  const { browser } = installBrowserMock({
    tabs: [tab],
    local: { settings: { apiEndpoint: '', apiKey: '' } }
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  await browser._fire('tabs.onUpdated', 11, { status: 'complete' }, tab);
  await new Promise(r => setTimeout(r, 0));

  await sendMessage(browser, { action: 'optimizeTab', tabId: 11 });
  await new Promise(r => setTimeout(r, 10));

  const resp = await sendMessage(browser, { action: 'getCachedState' });
  const entry = resp.cache.find(([id]) => String(id) === '11');
  assert.ok(entry);
  assert.equal(entry[1].discarded, true);
});

test('prepareForDiscard calls browser.tabs.discard', async () => {
  const tab = { id: 12, url: 'https://example.com', title: 'Example3', windowId: 1 };
  let discardedTabId = null;
  const { browser } = installBrowserMock({
    tabs: [tab],
    local: { settings: { apiEndpoint: '', apiKey: '' } }
  });
  const origDiscard = browser.tabs.discard;
  browser.tabs.discard = async (id) => { discardedTabId = id; return origDiscard(id); };

  const ctx = loadBackground({ browser });
  await ctx._ready;

  await browser._fire('tabs.onUpdated', 12, { status: 'complete' }, tab);
  await new Promise(r => setTimeout(r, 0));

  await sendMessage(browser, { action: 'optimizeTab', tabId: 12 });
  await new Promise(r => setTimeout(r, 10));

  assert.equal(discardedTabId, 12, 'browser.tabs.discard should be called with the tab id');
});

test('prepareForDiscard persists to storage after discard', async () => {
  const tab = { id: 13, url: 'https://example.com', title: 'Example4', windowId: 1 };
  const { browser } = installBrowserMock({
    tabs: [tab],
    local: { settings: { apiEndpoint: '', apiKey: '' } }
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  await browser._fire('tabs.onUpdated', 13, { status: 'complete' }, tab);
  await new Promise(r => setTimeout(r, 0));

  await sendMessage(browser, { action: 'optimizeTab', tabId: 13 });
  await new Promise(r => setTimeout(r, 10));

  const stored = await browser.storage.local.get('tabCache');
  assert.ok(stored.tabCache, 'tabCache should be in storage');
  const key = Object.keys(stored.tabCache).find(k => k == 13);
  assert.ok(key, 'discarded tab should be persisted');
  assert.equal(stored.tabCache[key].discarded, true);
});

test('wakeTab message calls browser.tabs.reload', async () => {
  let reloadedId = null;
  const { browser } = installBrowserMock({ tabs: [{ id: 20, url: 'https://x.com', discarded: true }] });
  browser.tabs.reload = async (id) => { reloadedId = id; return id; };

  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, { action: 'wakeTab', tabId: 20 });
  assert.equal(resp.success, true);
  assert.equal(reloadedId, 20);
});
