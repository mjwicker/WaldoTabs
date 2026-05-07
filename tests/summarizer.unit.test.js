// summarizer.unit.test.js — tests for summarizeViaApi and summarizeViaGoogleGemini
//
// Both functions are called by prepareForDiscard. They are tested indirectly here
// by triggering the 'optimizeTab' flow with a seeded fetch mock.

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { installBrowserMock } = require('./helpers/browserMock');
const { loadBackground, sendMessage } = require('./helpers/loadBackground');

function makeFetch(responses = {}) {
  return async (url, opts) => {
    for (const [pattern, handler] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return typeof handler === 'function' ? handler(url, opts) : handler;
      }
    }
    throw new Error(`Unmocked fetch: ${url}`);
  };
}

function makeJsonResponse(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

test('summarizeViaApi returns model response on success', async () => {
  const tab = { id: 1, url: 'https://test.com', title: 'Test', windowId: 1 };
  const { browser } = installBrowserMock({
    tabs: [tab],
    extractedText: 'Some page content to summarize',
    local: {
      settings: { apiEndpoint: 'https://api.openai.com', apiKey: 'sk-test', model: 'gpt-4o-mini', _provider: 'openai' }
    }
  });

  const mockFetch = makeFetch({
    '/v1/chat/completions': makeJsonResponse({
      choices: [{ message: { content: 'This is the AI summary.' } }]
    })
  });

  const ctx = loadBackground({ browser, fetch: mockFetch });
  await ctx._ready;

  await browser._fire('tabs.onUpdated', 1, { status: 'complete' }, tab);
  await new Promise(r => setTimeout(r, 0));

  await sendMessage(browser, { action: 'optimizeTab', tabId: 1 });
  await new Promise(r => setTimeout(r, 10));

  const resp = await sendMessage(browser, { action: 'getCachedState' });
  const entry = resp.cache.find(([id]) => String(id) === '1');
  assert.ok(entry, 'tab 1 should be in cache');
  assert.equal(entry[1].summary, 'This is the AI summary.');
});

test('summarizeViaApi falls back to first 500 chars on fetch failure', async () => {
  const tab = { id: 2, url: 'https://test.com', title: 'Test2', windowId: 1 };
  const longText = 'X'.repeat(1000);
  const { browser } = installBrowserMock({
    tabs: [tab],
    extractedText: longText,
    local: {
      settings: { apiEndpoint: 'https://api.openai.com', apiKey: 'sk-test', model: 'gpt-4o-mini', _provider: 'openai' }
    }
  });

  const mockFetch = makeFetch({
    '/v1/chat/completions': async () => { throw new Error('Network error'); }
  });

  const ctx = loadBackground({ browser, fetch: mockFetch });
  await ctx._ready;

  await browser._fire('tabs.onUpdated', 2, { status: 'complete' }, tab);
  await new Promise(r => setTimeout(r, 0));

  await sendMessage(browser, { action: 'optimizeTab', tabId: 2 });
  await new Promise(r => setTimeout(r, 10));

  const resp = await sendMessage(browser, { action: 'getCachedState' });
  const entry = resp.cache.find(([id]) => String(id) === '2');
  assert.ok(entry, 'tab 2 should be in cache even after fetch failure');
  // Fallback: first 500 chars of extracted text
  assert.equal(entry[1].summary, longText.substring(0, 500));
});

test('summarizeViaApi falls back when no apiEndpoint configured', async () => {
  const tab = { id: 3, url: 'https://test.com', title: 'Test3', windowId: 1 };
  const content = 'Short page content';
  const { browser } = installBrowserMock({
    tabs: [tab],
    extractedText: content,
    local: {
      settings: { apiEndpoint: '', apiKey: '', model: 'gpt-4o-mini' }
    }
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  await browser._fire('tabs.onUpdated', 3, { status: 'complete' }, tab);
  await new Promise(r => setTimeout(r, 0));

  await sendMessage(browser, { action: 'optimizeTab', tabId: 3 });
  await new Promise(r => setTimeout(r, 10));

  const resp = await sendMessage(browser, { action: 'getCachedState' });
  const entry = resp.cache.find(([id]) => String(id) === '3');
  assert.ok(entry);
  assert.equal(entry[1].summary, content.substring(0, 500));
});

test('summarizeViaGoogleGemini returns model response on success', async () => {
  const tab = { id: 4, url: 'https://test.com', title: 'Test4', windowId: 1 };
  const { browser } = installBrowserMock({
    tabs: [tab],
    extractedText: 'Gemini test content',
    local: {
      settings: {
        _provider: 'google',
        apiEndpoint: 'https://generativelanguage.googleapis.com',
        apiKey: '',
        model: 'gemini-2.0-flash'
      }
    },
    session: {
      oauth_google_access_token: 'mock-token',
      oauth_google_refresh_token: 'mock-refresh',
      oauth_google_expiry: Date.now() + 3600000,
      oauth_google_connected: true
    }
  });

  const mockFetch = makeFetch({
    'generateContent': makeJsonResponse({
      candidates: [{ content: { parts: [{ text: 'Gemini summary here.' }] } }]
    })
  });

  const ctx = loadBackground({ browser, fetch: mockFetch });
  await ctx._ready;

  await browser._fire('tabs.onUpdated', 4, { status: 'complete' }, tab);
  await new Promise(r => setTimeout(r, 0));

  await sendMessage(browser, { action: 'optimizeTab', tabId: 4 });
  await new Promise(r => setTimeout(r, 10));

  const resp = await sendMessage(browser, { action: 'getCachedState' });
  const entry = resp.cache.find(([id]) => String(id) === '4');
  assert.ok(entry);
  assert.equal(entry[1].summary, 'Gemini summary here.');
});

test('summarizeViaGoogleGemini falls back when no OAuth token', async () => {
  const tab = { id: 5, url: 'https://test.com', title: 'Test5', windowId: 1 };
  const { browser } = installBrowserMock({
    tabs: [tab],
    extractedText: 'Fallback content for Gemini',
    local: {
      settings: { _provider: 'google', apiEndpoint: 'https://generativelanguage.googleapis.com' }
    }
    // No session data — not connected
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  await browser._fire('tabs.onUpdated', 5, { status: 'complete' }, tab);
  await new Promise(r => setTimeout(r, 0));

  await sendMessage(browser, { action: 'optimizeTab', tabId: 5 });
  await new Promise(r => setTimeout(r, 10));

  const resp = await sendMessage(browser, { action: 'getCachedState' });
  const entry = resp.cache.find(([id]) => String(id) === '5');
  assert.ok(entry);
  assert.equal(entry[1].summary, 'Fallback content for Gemini'.substring(0, 500));
});
