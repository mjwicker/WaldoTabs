// messages.unit.test.js — tests for all runtime.onMessage action handlers

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { installBrowserMock } = require('./helpers/browserMock');
const { loadBackground, sendMessage } = require('./helpers/loadBackground');

// ── getCachedState ────────────────────────────────────────────────────────────

test('getCachedState returns empty array with no cached tabs', async () => {
  const { browser } = installBrowserMock();
  loadBackground({ browser });
  await new Promise(r => setTimeout(r, 0));

  const resp = await sendMessage(browser, { action: 'getCachedState' });
  assert.ok(Array.isArray(resp.cache));
  assert.equal(resp.cache.length, 0);
});

test('getCachedState returns seeded tabs', async () => {
  const { browser } = installBrowserMock({
    local: {
      tabCache: {
        1: { url: 'https://a.com', title: 'A', screenshot: null, summary: null, lastActive: 100, discarded: false }
      }
    }
  });
  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, { action: 'getCachedState' });
  assert.equal(resp.cache.length, 1);
});

// ── getSettings / saveSettings ────────────────────────────────────────────────

test('getSettings returns default settings when none saved', async () => {
  const { browser } = installBrowserMock();
  loadBackground({ browser });
  await new Promise(r => setTimeout(r, 0));

  const resp = await sendMessage(browser, { action: 'getSettings' });
  assert.equal(typeof resp, 'object');
  assert.ok('idleMinutes' in resp, 'default settings should have idleMinutes');
  assert.ok('autoOptimize' in resp, 'default settings should have autoOptimize');
});

test('saveSettings persists to storage and getSettings reads it back', async () => {
  const { browser } = installBrowserMock();
  loadBackground({ browser });
  await new Promise(r => setTimeout(r, 0));

  const newSettings = {
    _provider: 'openai',
    apiEndpoint: 'https://api.openai.com',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
    idleMinutes: 60,
    autoOptimize: true
  };

  const saveResp = await sendMessage(browser, { action: 'saveSettings', settings: newSettings });
  assert.equal(saveResp.success, true);

  const getResp = await sendMessage(browser, { action: 'getSettings' });
  assert.equal(getResp.idleMinutes, 60);
  assert.equal(getResp.autoOptimize, true);
  assert.equal(getResp._provider, 'openai');
});

test('saveSettings and getSettings round-trip preserves API key', async () => {
  const { browser } = installBrowserMock();
  loadBackground({ browser });
  await new Promise(r => setTimeout(r, 0));

  await sendMessage(browser, { action: 'saveSettings', settings: { apiKey: 'sk-secret-key' } });
  const resp = await sendMessage(browser, { action: 'getSettings' });
  assert.equal(resp.apiKey, 'sk-secret-key');
});

// ── wakeTab ───────────────────────────────────────────────────────────────────

test('wakeTab returns success: true', async () => {
  const { browser } = installBrowserMock({ tabs: [{ id: 5, url: 'https://x.com', discarded: true }] });
  loadBackground({ browser });
  await new Promise(r => setTimeout(r, 0));

  const resp = await sendMessage(browser, { action: 'wakeTab', tabId: 5 });
  assert.equal(resp.success, true);
});

// ── optimizeTab ───────────────────────────────────────────────────────────────

test('optimizeTab returns success: true for a known tab', async () => {
  const tab = { id: 7, url: 'https://optimize.com', title: 'Opt', windowId: 1 };
  const { browser } = installBrowserMock({
    tabs: [tab],
    local: { settings: { apiEndpoint: '', apiKey: '' } }
  });
  loadBackground({ browser });
  await new Promise(r => setTimeout(r, 0));

  await browser._fire('tabs.onUpdated', 7, { status: 'complete' }, tab);
  await new Promise(r => setTimeout(r, 0));

  const resp = await sendMessage(browser, { action: 'optimizeTab', tabId: 7 });
  assert.equal(resp.success, true);
});

// ── unknown action ────────────────────────────────────────────────────────────

test('unknown action returns undefined (handler returns nothing)', async () => {
  const { browser } = installBrowserMock();
  loadBackground({ browser });
  await new Promise(r => setTimeout(r, 0));

  const resp = await sendMessage(browser, { action: 'nonExistentAction' });
  assert.equal(resp, undefined);
});

// ── detectOllama / testOllamaModel — gap documentation ───────────────────────

test('detectOllama action is not yet handled by background.js (documents gap)', async () => {
  const { browser } = installBrowserMock();
  loadBackground({ browser });
  await new Promise(r => setTimeout(r, 0));

  const resp = await sendMessage(browser, { action: 'detectOllama' });
  // popup.js calls this but background.js has no handler yet — tracked in roadmap task 1.4
  assert.equal(resp, undefined, 'detectOllama handler not yet implemented (Phase 1.4)');
});

test('testOllamaModel action is not yet handled by background.js (documents gap)', async () => {
  const { browser } = installBrowserMock();
  loadBackground({ browser });
  await new Promise(r => setTimeout(r, 0));

  const resp = await sendMessage(browser, { action: 'testOllamaModel', model: 'llama3.2' });
  assert.equal(resp, undefined, 'testOllamaModel handler not yet implemented (Phase 1.4)');
});
