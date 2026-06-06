// discard-google.unit.test.js — tests for Google provider discard logic
//
// Tests the Google provider-specific discard branch in background.js:166-172
// This covers the logic that skips discard for Google-owned domains

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { installBrowserMock } = require('./helpers/browserMock');
const { loadBackground, sendMessage } = require('./helpers/loadBackground');

test('Google provider tab is NOT discarded (background.js:166-172)', async () => {
  const googleTab = { 
    id: 100, 
    url: 'https://docs.google.com/document/d/123', 
    title: 'Google Doc', 
    windowId: 1 
  };
  
  const { browser } = installBrowserMock({
    tabs: [googleTab],
    local: { settings: { apiEndpoint: '', apiKey: '' } }
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  // Register Google tab in cache
  await browser._fire('tabs.onUpdated', 100, { status: 'complete' }, googleTab);
  await new Promise(r => setTimeout(r, 0));

  // Track if discard was called
  let discardCalled = false;
  const origDiscard = browser.tabs.discard;
  browser.tabs.discard = async (id) => {
    discardCalled = true;
    return origDiscard(id);
  };

  // Attempt to optimize (should NOT discard Google tabs)
  await sendMessage(browser, { action: 'optimizeTab', tabId: 100 });
  await new Promise(r => setTimeout(r, 10));

  // Verify discard was NOT called for Google domain
  assert.equal(discardCalled, false, 'Google tabs should not be discarded');
  
  // Verify tab remains in cache but not discarded
  const resp = await sendMessage(browser, { action: 'getCachedState' });
  const entry = resp.cache.find(([id]) => String(id) === '100');
  assert.ok(entry, 'Google tab should remain in cache');
  assert.equal(entry[1].discarded, false, 'Google tab should not be marked discarded');
});

test('Non-Google provider tab IS discarded normally', async () => {
  const regularTab = { 
    id: 101, 
    url: 'https://example.com/article', 
    title: 'Regular Site', 
    windowId: 1 
  };
  
  const { browser } = installBrowserMock({
    tabs: [regularTab],
    local: { settings: { apiEndpoint: '', apiKey: '' } }
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  // Register regular tab in cache
  await browser._fire('tabs.onUpdated', 101, { status: 'complete' }, regularTab);
  await new Promise(r => setTimeout(r, 0));

  // Track if discard was called
  let discardCalled = false;
  const origDiscard = browser.tabs.discard;
  browser.tabs.discard = async (id) => {
    discardCalled = true;
    return origDiscard(id);
  };

  // Attempt to optimize (should discard regular tabs)
  await sendMessage(browser, { action: 'optimizeTab', tabId: 101 });
  await new Promise(r => setTimeout(r, 10));

  // Verify discard WAS called for non-Google domain
  assert.equal(discardCalled, true, 'Non-Google tabs should be discarded');
  
  // Verify tab is marked as discarded in cache
  const resp = await sendMessage(browser, { action: 'getCachedState' });
  const entry = resp.cache.find(([id]) => String(id) === '101');
  assert.ok(entry, 'Regular tab should remain in cache');
  assert.equal(entry[1].discarded, true, 'Regular tab should be marked discarded');
});

test('Google domains detection covers various Google services', async () => {
  const googleDomains = [
    'https://docs.google.com/document/123',
    'https://drive.google.com/file/456',
    'https://mail.google.com/mail/u/0/',
    'https://calendar.google.com/calendar',
    'https://meet.google.com/abc-def-ghi',
    'https://sites.google.com/view/mysite'
  ];
  
  for (const url of googleDomains) {
    const tab = { id: 200, url, title: 'Google Service', windowId: 1 };
    const { browser } = installBrowserMock({ tabs: [tab] });
    
    const ctx = loadBackground({ browser });
    await ctx._ready;
    
    await browser._fire('tabs.onUpdated', 200, { status: 'complete' }, tab);
    await new Promise(r => setTimeout(r, 0));
    
    let discardCalled = false;
    const origDiscard = browser.tabs.discard;
    browser.tabs.discard = async (id) => {
      discardCalled = true;
      return origDiscard(id);
    };
    
    await sendMessage(browser, { action: 'optimizeTab', tabId: 200 });
    await new Promise(r => setTimeout(r, 10));
    
    assert.equal(discardCalled, false, `Google domain ${url} should not be discarded`);
  }
});