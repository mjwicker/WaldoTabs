// chat.unit.test.js — tests for chat, getPageContext, and pageAction handlers
// Uses the same browserMock + loadBackground helpers as the existing suite.
//
// NOTE: scripting.executeScript mock returns { result: seed.extractedText } for all
// calls. To control what getPageContext / pageAction return, seed extractedText with
// the desired value (string for getPageContext, object for pageAction).
'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { installBrowserMock } = require('./helpers/browserMock');
const { loadBackground, sendMessage } = require('./helpers/loadBackground');

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeJsonResponse(body, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

function makeFetch(responses = {}) {
  return async (url) => {
    for (const [pattern, handler] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return typeof handler === 'function' ? handler(url) : handler;
      }
    }
    throw new Error(`Unmocked fetch: ${url}`);
  };
}

// ─── chat handler ─────────────────────────────────────────────────────────────

test('chat returns model content on success (OpenRouter path)', async () => {
  const { browser } = installBrowserMock({
    local: {
      settings: {
        _provider: 'openrouter',
        apiEndpoint: 'https://openrouter.ai/api',
        apiKey: 'sk-or-test',
        model: 'llama-3-8b'
      }
    }
  });

  const mockFetch = makeFetch({
    '/v1/chat/completions': makeJsonResponse({
      choices: [{ message: { content: 'Hello from the model.' } }]
    })
  });

  const ctx = loadBackground({ browser, fetch: mockFetch });
  await ctx._ready;

  const resp = await sendMessage(browser, {
    action: 'chat',
    messages: [{ role: 'user', content: 'Hello' }]
  });

  assert.equal(resp.content, 'Hello from the model.');
  assert.equal(resp.error, undefined);
});

test('chat returns error when API fetch throws a network error', async () => {
  const { browser } = installBrowserMock({
    local: {
      settings: {
        _provider: 'openrouter',
        apiEndpoint: 'https://openrouter.ai/api',
        apiKey: 'sk-or-test',
        model: 'llama-3-8b'
      }
    }
  });

  const mockFetch = makeFetch({
    '/v1/chat/completions': async () => { throw new Error('Network down'); }
  });

  const ctx = loadBackground({ browser, fetch: mockFetch });
  await ctx._ready;

  const resp = await sendMessage(browser, {
    action: 'chat',
    messages: [{ role: 'user', content: 'Hello' }]
  });

  assert.ok(resp.error, 'response should have an error field');
  assert.ok(resp.error.includes('Network down'), `unexpected error: ${resp.error}`);
});

test('chat returns "No AI provider" error when no apiEndpoint is set', async () => {
  // Default settings have apiEndpoint: '' → callWithSavedSettings throws immediately
  const { browser } = installBrowserMock();

  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, {
    action: 'chat',
    messages: [{ role: 'user', content: 'Hello' }]
  });

  assert.ok(resp.error, 'response should have an error field');
  assert.ok(
    resp.error.includes('No AI provider'),
    `expected "No AI provider" in error, got: ${resp.error}`
  );
});

test('chat returns error when API returns non-ok status', async () => {
  const { browser } = installBrowserMock({
    local: {
      settings: {
        _provider: 'openai',
        apiEndpoint: 'https://api.openai.com',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini'
      }
    }
  });

  const mockFetch = makeFetch({
    '/v1/chat/completions': makeJsonResponse({ error: 'Unauthorized' }, false)
  });

  const ctx = loadBackground({ browser, fetch: mockFetch });
  await ctx._ready;

  const resp = await sendMessage(browser, {
    action: 'chat',
    messages: [{ role: 'user', content: 'Hello' }]
  });

  assert.ok(resp.error, 'should return error on non-ok API status');
});

// ─── getPageContext handler ───────────────────────────────────────────────────

test('getPageContext returns title, url, content from active tab', async () => {
  // Tab must have active: true so tabs.query({ active: true }) returns it
  const { browser } = installBrowserMock({
    tabs: [{ id: 42, title: 'Test Page', url: 'https://example.com', active: true }],
    extractedText: 'Page body text here.'
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, { action: 'getPageContext' });

  assert.equal(resp.title,   'Test Page');
  assert.equal(resp.url,     'https://example.com');
  assert.equal(resp.content, 'Page body text here.');
  assert.equal(resp.error,   undefined);
});

test('getPageContext returns error when no active tab exists', async () => {
  // Empty tab list → query returns [] → tab is undefined → error path
  const { browser } = installBrowserMock({ tabs: [] });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, { action: 'getPageContext' });

  assert.ok(resp.error, 'should return error when no active tab');
});

test('getPageContext content is empty string when page has no text', async () => {
  const { browser } = installBrowserMock({
    tabs: [{ id: 1, title: 'Empty', url: 'https://empty.com', active: true }],
    extractedText: ''
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, { action: 'getPageContext' });

  assert.equal(resp.title,   'Empty');
  assert.equal(resp.content, '');
});

// ─── pageAction handler ───────────────────────────────────────────────────────

test('pageAction returns observation object from content script', async () => {
  // scripting.executeScript returns seed.extractedText as result[0].result
  // So seed extractedText with the object that _waldoTabsAction returns
  const actionResult = { ok: true, observation: 'Clicked [0]: Submit' };

  const { browser } = installBrowserMock({
    tabs: [{ id: 7, title: 'Page', url: 'https://example.com', active: true }],
    extractedText: actionResult
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, {
    action: 'pageAction',
    tool:   'click',
    args:   { index: 0 }
  });

  assert.equal(resp.ok,          true);
  assert.equal(resp.observation, 'Clicked [0]: Submit');
});

test('pageAction returns list_interactive observation', async () => {
  const actionResult = {
    ok: true,
    observation: 'Interactive elements (use index to act):\n[0] button — Submit\n[1] a — Home'
  };

  const { browser } = installBrowserMock({
    tabs: [{ id: 8, title: 'Page', url: 'https://example.com', active: true }],
    extractedText: actionResult
  });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, {
    action: 'pageAction',
    tool:   'list_interactive',
    args:   {}
  });

  assert.ok(resp.ok,          'ok should be true');
  assert.ok(resp.observation.includes('[0] button'), `got: ${resp.observation}`);
});

test('pageAction returns error when no active tab exists', async () => {
  const { browser } = installBrowserMock({ tabs: [] });

  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, {
    action: 'pageAction',
    tool:   'click',
    args:   { index: 0 }
  });

  assert.ok(resp.error, 'should return error when no active tab');
});

// ─── Ollama contract regression ───────────────────────────────────────────────
// These tests verify the SUCCESS paths (failure paths already covered in messages.unit.test.js).
// Regression goal: consumers MUST read result.detected / result.ok, never result.status.

test('detectOllama: detected=true and models list when Ollama running', async () => {
  const { browser } = installBrowserMock();

  const mockFetch = makeFetch({
    '/api/tags': makeJsonResponse({
      models: [{ name: 'llama3.2:latest' }, { name: 'phi3:3.8b' }]
    })
  });

  const ctx = loadBackground({ browser, fetch: mockFetch });
  await ctx._ready;

  const resp = await sendMessage(browser, { action: 'detectOllama' });

  assert.equal(resp.detected, true,  'must use detected not status');
  assert.ok(Array.isArray(resp.models));
  assert.equal(resp.models.length, 2);
  assert.ok(resp.models.includes('llama3.2:latest'));
  assert.equal(resp.status, undefined, 'status field must NOT be present (contract regression)');
});

test('testOllamaModel: ok=true when model is present in Ollama', async () => {
  const { browser } = installBrowserMock();

  const mockFetch = makeFetch({
    '/api/tags': makeJsonResponse({
      models: [{ name: 'llama3.2:latest' }, { name: 'phi3:3.8b' }]
    })
  });

  const ctx = loadBackground({ browser, fetch: mockFetch });
  await ctx._ready;

  // Should match 'llama3.2' → 'llama3.2:latest' (startsWith logic in background.js)
  const resp = await sendMessage(browser, { action: 'testOllamaModel', model: 'llama3.2' });

  assert.equal(resp.ok, true,    'must use ok not status');
  assert.equal(resp.status, undefined, 'status field must NOT be present (contract regression)');
});

test('testOllamaModel: ok=false with error message when model not in Ollama', async () => {
  const { browser } = installBrowserMock();

  const mockFetch = makeFetch({
    '/api/tags': makeJsonResponse({
      models: [{ name: 'llama3.2:latest' }]
    })
  });

  const ctx = loadBackground({ browser, fetch: mockFetch });
  await ctx._ready;

  const resp = await sendMessage(browser, { action: 'testOllamaModel', model: 'mistral' });

  assert.equal(resp.ok, false);
  assert.ok(typeof resp.error === 'string', 'resp.error must be a string when ok=false');
  assert.ok(resp.error.includes('mistral'), `error should mention the model name, got: ${resp.error}`);
});
