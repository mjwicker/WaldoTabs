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

// ── _waldoTabsAction: list_interactive (2026-07-02 regression) ────────────────
// Bug: list_interactive never returned the page's title/URL, only a list of button/link
// labels. Without "Use this page" enabled, that left the model with zero grounding for
// "what site is this" — it confidently hallucinated a site name instead of saying it
// didn't know. Uses jsdom (unlike the tests above) since list_interactive needs a real
// querySelectorAll-capable DOM plus a real `location`, not the hand-rolled mockDoc.

let jsdom;
try {
  jsdom = require('jsdom');
} catch {
  jsdom = null;
}

if (jsdom) {
  const { JSDOM } = jsdom;

  function makeActionContext(html, url = 'https://apnews.com/hub/us-news') {
    const dom = new JSDOM(html, { url });
    // jsdom has no layout engine — getBoundingClientRect() always returns 0x0, which would
    // make list_interactive's visibility filter (correctly, for a real browser) exclude
    // every element. Stub it so elements read as "visible" for this DOM-query test.
    dom.window.Element.prototype.getBoundingClientRect = () => ({ width: 100, height: 20, top: 0, left: 0 });
    vm.runInContext(src, vm.createContext(dom.window));
    return dom.window;
  }

  test('list_interactive includes the page title and URL so the model has grounding', async () => {
    const window = makeActionContext(`
      <title>US employers still reluctant to add jobs - AP News</title>
      <body><button>More</button></body>
    `);

    const result = await window._waldoTabsAction('list_interactive', {});

    assert.ok(result.ok);
    assert.ok(
      result.observation.startsWith('Page: US employers still reluctant to add jobs - AP News — https://apnews.com/hub/us-news'),
      `expected page identity line first, got: ${result.observation.slice(0, 150)}`
    );
    assert.ok(result.observation.includes('[0] button'), 'should still list interactive elements');
  });

  test('list_interactive still includes page identity when no interactive elements exist', async () => {
    const window = makeActionContext(`
      <title>Empty Page</title>
      <body></body>
    `, 'https://example.com/empty');

    const result = await window._waldoTabsAction('list_interactive', {});

    assert.ok(result.observation.includes('Page: Empty Page — https://example.com/empty'));
    assert.ok(result.observation.includes('No interactive elements found'));
  });

  test('list_interactive falls back to "(no title)" when the page has no title', async () => {
    const window = makeActionContext(`<body><a href="/x">Link</a></body>`, 'https://example.com/');

    const result = await window._waldoTabsAction('list_interactive', {});

    assert.ok(result.observation.includes('Page: (no title) — https://example.com/'));
  });

  // ── _waldoTabsAction: read_content (2026-07-02) ──────────────────────────────
  // On-demand page reading for the agentic loop — lets the model answer "what does this
  // page say" even when "Use this page" is off, instead of only seeing element labels.

  test('read_content returns page title, URL, and body text (innerText fallback)', async () => {
    const window = makeActionContext(`
      <title>US employers still reluctant to add jobs - AP News</title>
      <body><p>placeholder</p></body>
    `, 'https://apnews.com/article/jobs-report-june');
    // jsdom has no layout engine, so innerText is never populated from parsed HTML the way
    // a real browser would — stub it directly, same reason _waldoTabsExtract's own tests
    // (above) use a hand-rolled mockDoc instead of jsdom for this exact fallback path.
    Object.defineProperty(window.document.body, 'innerText', {
      value: 'Employers pulled back on hiring in June as economic uncertainty persisted across most sectors.\n'.repeat(3),
      configurable: true
    });

    const result = await window._waldoTabsAction('read_content', {});

    assert.ok(result.ok);
    assert.ok(
      result.observation.startsWith('Page: US employers still reluctant to add jobs - AP News — https://apnews.com/article/jobs-report-june'),
      `expected page identity line first, got: ${result.observation.slice(0, 150)}`
    );
    assert.ok(result.observation.includes('Employers pulled back on hiring'), 'should include actual page text');
  });

  test('read_content includes byline when Readability provides one', async () => {
    const window = makeActionContext(`<title>Article</title><body><p>Body text long enough to pass filters.</p></body>`,
      'https://example.com/article');
    window.Readability = function () {
      return { parse: () => ({
        title: 'Full Article Title', byline: 'Jane Reporter',
        textContent: 'The full article body goes here.', excerpt: '...', length: 33
      }) };
    };

    const result = await window._waldoTabsAction('read_content', {});

    assert.ok(result.observation.startsWith('Page: Full Article Title (by Jane Reporter) — https://example.com/article'));
    assert.ok(result.observation.includes('The full article body goes here.'));
  });

  test('read_content reports no readable content rather than an empty/confusing observation', async () => {
    const window = makeActionContext(`<title>Blank</title><body></body>`, 'https://example.com/blank');

    const result = await window._waldoTabsAction('read_content', {});

    assert.ok(result.observation.includes('(no readable content found on this page)'));
  });
} else {
  test('list_interactive page-identity tests skipped — install jsdom: npm install --save-dev jsdom', () => {
    assert.ok(true, 'skipped: jsdom not installed');
  });
}
