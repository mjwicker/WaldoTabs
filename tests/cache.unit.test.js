// cache.unit.test.js — verifies tabCache persistence (task 0.1)
//
// The v0.2.0 fix: tabCache is an in-memory Map backed by browser.storage.local
// so it survives MV3 service worker suspension. These tests verify that fix.

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { installBrowserMock } = require('./helpers/browserMock');
const { loadBackground, sendMessage } = require('./helpers/loadBackground');

// ── Helpers ───────────────────────────────────────────────────────────────────

// Normalizes objects returned from the vm context into plain-realm JS.
// Needed because Array.from() inside the vm creates arrays in the vm's realm,
// which have a different prototype than main-realm arrays and fail deepStrictEqual.
function plain(val) { return JSON.parse(JSON.stringify(val)); }

function freshTab(id, overrides = {}) {
  return {
    id,
    url: `https://example.com/page-${id}`,
    title: `Page ${id}`,
    windowId: 1,
    active: false,
    discarded: false,
    ...overrides
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('cold start with empty storage: cache is empty', async () => {
  const { browser } = installBrowserMock();
  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, { action: 'getCachedState' });
  assert.equal(plain(resp.cache).length, 0);
});

test('cold start with seeded storage: cache is rehydrated', async () => {
  const stored = {
    tabCache: {
      101: { url: 'https://a.com', title: 'A', screenshot: null, summary: 'sum', lastActive: 1000, discarded: true }
    }
  };
  const { browser } = installBrowserMock({ local: stored });
  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, { action: 'getCachedState' });
  assert.equal(resp.cache.length, 1);
  assert.equal(resp.cache[0][0], '101');
  assert.equal(resp.cache[0][1].title, 'A');
});

test('onInstalled fires loadTabCache and rehydrates cache', async () => {
  const stored = {
    tabCache: {
      202: { url: 'https://b.com', title: 'B', screenshot: null, summary: null, lastActive: 2000, discarded: false }
    }
  };
  const { browser } = installBrowserMock({ local: stored });
  const ctx = loadBackground({ browser });
  await ctx._ready;

  // Simulate worker restart: fire onInstalled
  await browser._fire('runtime.onInstalled', { reason: 'install' });
  await new Promise(r => setTimeout(r, 0));

  const resp = await sendMessage(browser, { action: 'getCachedState' });
  assert.equal(resp.cache.length, 1);
  assert.equal(resp.cache[0][1].title, 'B');
});

test('onStartup fires loadTabCache and rehydrates cache', async () => {
  const stored = {
    tabCache: {
      303: { url: 'https://c.com', title: 'C', screenshot: null, summary: null, lastActive: 3000, discarded: false }
    }
  };
  const { browser } = installBrowserMock({ local: stored });
  const ctx = loadBackground({ browser });
  await ctx._ready;

  await browser._fire('runtime.onStartup');
  await new Promise(r => setTimeout(r, 0));

  const resp = await sendMessage(browser, { action: 'getCachedState' });
  assert.equal(resp.cache.length, 1);
  assert.equal(resp.cache[0][1].title, 'C');
});

test('tab load event updates cache and persists to storage', async () => {
  const { browser } = installBrowserMock({ tabs: [freshTab(10)] });
  const ctx = loadBackground({ browser });
  await ctx._ready;

  const tab = freshTab(10);
  await browser._fire('tabs.onUpdated', 10, { status: 'complete' }, tab);
  await new Promise(r => setTimeout(r, 0));

  // Cache should contain tab 10
  const resp = await sendMessage(browser, { action: 'getCachedState' });
  const entry = resp.cache.find(([id]) => id === '10' || id === 10);
  assert.ok(entry, 'tab 10 should be in cache');
  assert.equal(entry[1].url, tab.url);

  // Storage should be persisted
  const stored = await browser.storage.local.get('tabCache');
  assert.ok(stored.tabCache, 'tabCache should be in storage');
  const key = Object.keys(stored.tabCache).find(k => k == 10);
  assert.ok(key, 'tab 10 should be in persisted storage');
});

test('tab removed event deletes from cache and persists', async () => {
  const stored = {
    tabCache: {
      50: { url: 'https://d.com', title: 'D', screenshot: null, summary: null, lastActive: 5000, discarded: false }
    }
  };
  const { browser } = installBrowserMock({ local: stored });
  const ctx = loadBackground({ browser });
  await ctx._ready;

  await browser._fire('tabs.onRemoved', 50);
  await new Promise(r => setTimeout(r, 0));

  const resp = await sendMessage(browser, { action: 'getCachedState' });
  assert.equal(resp.cache.length, 0, 'cache should be empty after tab removal');

  const persisted = await browser.storage.local.get('tabCache');
  assert.ok(!persisted.tabCache?.[50], 'removed tab should not be in storage');
});

test('tab activated event updates lastActive and persists', async () => {
  const now = Date.now();
  const stored = {
    tabCache: {
      77: { url: 'https://e.com', title: 'E', screenshot: null, summary: null, lastActive: 1000, discarded: false }
    }
  };
  const { browser } = installBrowserMock({ local: stored });
  const ctx = loadBackground({ browser });
  await ctx._ready;

  await browser._fire('tabs.onActivated', { tabId: 77 });
  await new Promise(r => setTimeout(r, 0));

  const persisted = await browser.storage.local.get('tabCache');
  assert.ok(persisted.tabCache?.['77']?.lastActive >= now, 'lastActive should be updated');
});

test('worker restart simulation: persist then reload', async () => {
  // Phase 1: first worker instance — builds up cache
  const { browser: browser1 } = installBrowserMock({ tabs: [freshTab(99)] });
  const ctx1 = loadBackground({ browser: browser1 });
  await ctx1._ready;

  await browser1._fire('tabs.onUpdated', 99, { status: 'complete' }, freshTab(99));
  await new Promise(r => setTimeout(r, 0));

  // Get the persisted state from first worker's storage
  const persisted = await browser1.storage.local.get('tabCache');
  assert.ok(persisted.tabCache?.[99], 'tab 99 should be persisted after first worker');

  // Phase 2: second worker instance starts cold (worker was killed)
  // Seed the new mock with the data the first worker persisted
  const { browser: browser2 } = installBrowserMock({ local: persisted });
  const ctx2 = loadBackground({ browser: browser2 });
  await ctx2._ready;

  // New worker should recover the tab from storage
  const resp = await sendMessage(browser2, { action: 'getCachedState' });
  assert.equal(resp.cache.length, 1, 'restarted worker should recover cached tab');
  assert.ok(String(resp.cache[0][0]) === '99', 'recovered tab should be tab 99');
});

test('loadPersistedCache message rehydrates and returns cache', async () => {
  const stored = {
    tabCache: {
      88: { url: 'https://f.com', title: 'F', screenshot: null, summary: null, lastActive: 8000, discarded: false }
    }
  };
  const { browser } = installBrowserMock({ local: stored });
  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, { action: 'loadPersistedCache' });
  assert.ok(Array.isArray(resp.cache), 'response should contain cache array');
  assert.equal(resp.cache.length, 1);
  assert.equal(resp.cache[0][1].title, 'F');
});
