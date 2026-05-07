// content.unit.test.js — tests for content.js Readability extraction

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const vm       = require('node:vm');
const fs       = require('node:fs');
const path     = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

// Runs content.js in a fake window context and returns the window object
// with _waldoTabsExtract and _waldoTabsQuickExtract attached.
function makeContext({ bodyText = '', readabilityResult = null } = {}) {
  const mockDoc = {
    title: 'Mock Title',
    body: {
      innerText: bodyText,
      cloneNode: () => mockDoc.body
    }
  };

  const ctx = { document: mockDoc, console };

  if (readabilityResult !== null) {
    ctx.Readability = function () {
      return { parse: () => readabilityResult };
    };
  }

  // content.js is an IIFE that assigns to window.*, and window === globalThis in browser.
  // In vm we make window point to the context itself.
  ctx.window = ctx;

  vm.runInNewContext(src, ctx);
  return ctx;
}

// ── _waldoTabsQuickExtract ────────────────────────────────────────────────────

test('_waldoTabsQuickExtract uses Readability when available', () => {
  const ctx = makeContext({
    readabilityResult: { textContent: 'Readability extracted content', title: 'Title', length: 28 }
  });

  const result = ctx._waldoTabsQuickExtract(1000);
  assert.equal(result, 'Readability extracted content');
});

test('_waldoTabsQuickExtract falls back to innerText when Readability absent', () => {
  const ctx = makeContext({ bodyText: 'Plain text from innerText' });

  const result = ctx._waldoTabsQuickExtract(1000);
  assert.equal(result, 'Plain text from innerText');
});

test('_waldoTabsQuickExtract respects maxLength', () => {
  const ctx = makeContext({ bodyText: 'A'.repeat(500) });

  const result = ctx._waldoTabsQuickExtract(100);
  assert.equal(result.length, 100);
});

test('_waldoTabsQuickExtract falls back when Readability parse returns null', () => {
  const ctx = makeContext({
    bodyText: 'Fallback text',
    readabilityResult: null  // parse() returns null
  });
  // Force Readability to be defined but return null
  ctx.Readability = function () { return { parse: () => null }; };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);

  const result = ctx._waldoTabsQuickExtract(1000);
  assert.equal(result, 'Fallback text');
});

test('_waldoTabsQuickExtract falls back when Readability throws', () => {
  const ctx = { document: { title: 'T', body: { innerText: 'Safe fallback', cloneNode: () => ({}) } }, console };
  ctx.Readability = function () { return { parse: () => { throw new Error('parse error'); } }; };
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);

  const result = ctx._waldoTabsQuickExtract(1000);
  assert.equal(result, 'Safe fallback');
});

// ── _waldoTabsExtract ─────────────────────────────────────────────────────────

test('_waldoTabsExtract returns structured object with source: readability', async () => {
  const ctx = makeContext({
    readabilityResult: {
      title: 'Article Title',
      byline: 'Author Name',
      textContent: 'Full article body text',
      excerpt: 'Short excerpt',
      length: 22
    }
  });

  const result = await ctx._waldoTabsExtract({ maxLength: 1000 });
  assert.equal(result.source, 'readability');
  assert.equal(result.title, 'Article Title');
  assert.equal(result.byline, 'Author Name');
  assert.equal(result.content, 'Full article body text');
  assert.equal(result.excerpt, 'Short excerpt');
});

test('_waldoTabsExtract returns structured object with source: innerText when no Readability', async () => {
  const bodyText = [
    'This is a long enough line to pass the 20 char filter',
    'Another line of content here that is also long enough',
    'Short'  // filtered out (< 20 chars)
  ].join('\n');

  const ctx = makeContext({ bodyText });

  const result = await ctx._waldoTabsExtract({ maxLength: 10000 });
  assert.equal(result.source, 'innerText');
  assert.equal(result.title, 'Mock Title');
  assert.ok(result.content.includes('This is a long enough line'));
  assert.ok(!result.content.includes('Short'), 'lines under 20 chars should be filtered');
});

test('_waldoTabsExtract respects maxLength', async () => {
  const ctx = makeContext({
    readabilityResult: {
      title: 'T',
      byline: null,
      textContent: 'X'.repeat(5000),
      excerpt: '',
      length: 5000
    }
  });

  const result = await ctx._waldoTabsExtract({ maxLength: 100 });
  assert.equal(result.content.length, 100);
});

test('_waldoTabsExtract uses default maxLength of 6000', async () => {
  const ctx = makeContext({ bodyText: 'Y'.repeat(10000) });

  const result = await ctx._waldoTabsExtract();
  assert.ok(result.content.length <= 6000, 'default maxLength should cap at 6000');
});
