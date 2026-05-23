// auto-optimize.unit.test.js — tests for auto-optimization loop and shouldDiscard logic
//
// Tests the auto-optimize setInterval loop (background.js:296) and shouldDiscard
// idle-math logic (background.js:277). The loop queries inactive, non-discarded tabs
// and discards those whose lastActive is older than idleMinutes threshold.

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { installBrowserMock } = require('./helpers/browserMock');
const { loadBackground, sendMessage } = require('./helpers/loadBackground');

test('Auto-optimize loop: autoOptimize=false means loop does nothing', async () => {
  // Set up: tab with old lastActive but autoOptimize disabled
  const oldTime = 0; // epoch — definitely idle
  const { browser } = installBrowserMock({
    tabs: [{ id: 50, url: 'https://idle.com', title: 'Idle Tab', active: false, discarded: false }],
    local: {
      settings: { autoOptimize: false, idleMinutes: 30 },
      tabCache: {
        '50': { url: 'https://idle.com', title: 'Idle Tab', lastActive: oldTime, discarded: false }
      }
    }
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  // Track if discard was called
  let discardCalled = false;
  const origDiscard = browser.tabs.discard;
  browser.tabs.discard = async (id) => {
    discardCalled = true;
    return origDiscard(id);
  };

  // Trigger the auto-optimize loop
  await ctx._intervals[0].fn();
  await new Promise(r => setTimeout(r, 20));

  // Verify discard was NOT called when autoOptimize=false
  assert.equal(discardCalled, false, 'Loop should not discard tabs when autoOptimize=false');

  // Verify tab is NOT marked as discarded
  const resp = await sendMessage(browser, { action: 'getCachedState' });
  const entry = resp.cache.find(([id]) => String(id) === '50');
  assert.ok(entry, 'Tab should still be in cache');
  assert.equal(entry[1].discarded, false, 'Tab should not be marked discarded');
});

test('Auto-optimize loop: idle tab IS discarded by loop', async () => {
  // Set up: tab with lastActive = 0 (epoch, very old), autoOptimize enabled
  const oldTime = 0; // epoch — definitely older than 30 minutes
  const { browser } = installBrowserMock({
    tabs: [{ id: 51, url: 'https://idle.com', title: 'Old Idle Tab', active: false, discarded: false }],
    local: {
      settings: { autoOptimize: true, idleMinutes: 30 },
      tabCache: {
        '51': { url: 'https://idle.com', title: 'Old Idle Tab', lastActive: oldTime, discarded: false }
      }
    }
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  // Trigger the auto-optimize loop
  await ctx._intervals[0].fn();
  await new Promise(r => setTimeout(r, 20));

  // Verify tab is marked as discarded in cache
  const resp = await sendMessage(browser, { action: 'getCachedState' });
  const entry = resp.cache.find(([id]) => String(id) === '51');
  assert.ok(entry, 'Tab should be in cache');
  assert.equal(entry[1].discarded, true, 'Idle tab should be marked discarded');
});

test('Auto-optimize loop: recently-active tab is NOT discarded', async () => {
  // Set up: tab with lastActive = Date.now() (right now), autoOptimize enabled
  const recentTime = Date.now();
  const { browser } = installBrowserMock({
    tabs: [{ id: 52, url: 'https://active.com', title: 'Recent Tab', active: false, discarded: false }],
    local: {
      settings: { autoOptimize: true, idleMinutes: 30 },
      tabCache: {
        '52': { url: 'https://active.com', title: 'Recent Tab', lastActive: recentTime, discarded: false }
      }
    }
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  // Track if discard was called
  let discardCalled = false;
  const origDiscard = browser.tabs.discard;
  browser.tabs.discard = async (id) => {
    discardCalled = true;
    return origDiscard(id);
  };

  // Trigger the auto-optimize loop
  await ctx._intervals[0].fn();
  await new Promise(r => setTimeout(r, 20));

  // Verify discard was NOT called for recently-active tab
  assert.equal(discardCalled, false, 'Recently-active tab should not be discarded');

  // Verify tab is NOT marked as discarded
  const resp = await sendMessage(browser, { action: 'getCachedState' });
  const entry = resp.cache.find(([id]) => String(id) === '52');
  assert.ok(entry, 'Tab should be in cache');
  assert.equal(entry[1].discarded, false, 'Recently-active tab should not be marked discarded');
});

test('Auto-optimize loop: active tab is excluded by query', async () => {
  // Set up: tab with active: true and old lastActive
  // browser.tabs.query({ active: false }) should exclude it
  const oldTime = 0;
  const { browser } = installBrowserMock({
    tabs: [{ id: 53, url: 'https://active-now.com', title: 'Active Tab', active: true, discarded: false }],
    local: {
      settings: { autoOptimize: true, idleMinutes: 30 },
      tabCache: {
        '53': { url: 'https://active-now.com', title: 'Active Tab', lastActive: oldTime, discarded: false }
      }
    }
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  // Track if discard was called
  let discardCalled = false;
  const origDiscard = browser.tabs.discard;
  browser.tabs.discard = async (id) => {
    discardCalled = true;
    return origDiscard(id);
  };

  // Trigger the auto-optimize loop
  await ctx._intervals[0].fn();
  await new Promise(r => setTimeout(r, 20));

  // Verify discard was NOT called (active tabs excluded by query)
  assert.equal(discardCalled, false, 'Active tabs should not be passed to discard logic');
});

test('Auto-optimize loop: already-discarded tab is excluded by query', async () => {
  // Set up: tab with discarded: true and old lastActive
  // browser.tabs.query({ discarded: false }) should exclude it
  const oldTime = 0;
  const { browser } = installBrowserMock({
    tabs: [{ id: 54, url: 'https://discarded.com', title: 'Already Discarded', active: false, discarded: true }],
    local: {
      settings: { autoOptimize: true, idleMinutes: 30 },
      tabCache: {
        '54': { url: 'https://discarded.com', title: 'Already Discarded', lastActive: oldTime, discarded: true }
      }
    }
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  // Track if discard was called
  let discardCalled = false;
  const origDiscard = browser.tabs.discard;
  browser.tabs.discard = async (id) => {
    discardCalled = true;
    return origDiscard(id);
  };

  // Trigger the auto-optimize loop
  await ctx._intervals[0].fn();
  await new Promise(r => setTimeout(r, 20));

  // Verify discard was NOT called (already-discarded tabs excluded by query)
  assert.equal(discardCalled, false, 'Already-discarded tabs should not be processed');
});
