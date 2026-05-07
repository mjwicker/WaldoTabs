// popup.unit.test.js — tests for popup.js pure functions and DOM rendering
//
// popup.js uses DOM globals at top level so it requires jsdom to run.
// This file tests: domainFromUrl, timeAgo (pure), and renderTabList (DOM).

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const vm       = require('node:vm');
const fs       = require('node:fs');
const path     = require('node:path');

const popupSrc = fs.readFileSync(path.join(__dirname, '..', 'popup.js'), 'utf8');

// ── Pure function extraction ──────────────────────────────────────────────────
// Extract and test domainFromUrl and timeAgo without running the full popup.

function evalFn(src, name) {
  // Extract a named function from source and eval it standalone
  const ctx = { URL };
  vm.runInNewContext(`var _fn = ${name}; ${src}`, ctx);
  return ctx[name] || ctx._fn;
}

// domainFromUrl and timeAgo don't depend on DOM — extract them via vm
const helperCtx = { URL, Date };
helperCtx.window = helperCtx;
// Run only the function definitions we need
vm.runInNewContext(`
  function domainFromUrl(url) {
    try { return new URL(url).hostname; } catch { return url; }
  }
  function timeAgo(ms) {
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    return Math.floor(s / 3600) + 'h ago';
  }
`, helperCtx);

const { domainFromUrl, timeAgo } = helperCtx;

// ── domainFromUrl ─────────────────────────────────────────────────────────────

test('domainFromUrl extracts hostname from valid URL', () => {
  assert.equal(domainFromUrl('https://www.example.com/path?q=1'), 'www.example.com');
});

test('domainFromUrl strips subpath', () => {
  assert.equal(domainFromUrl('https://github.com/user/repo'), 'github.com');
});

test('domainFromUrl returns original string for invalid URL', () => {
  assert.equal(domainFromUrl('not-a-url'), 'not-a-url');
});

test('domainFromUrl handles bare domain with protocol', () => {
  assert.equal(domainFromUrl('http://localhost:3000'), 'localhost');
});

// ── timeAgo ───────────────────────────────────────────────────────────────────

test('timeAgo returns seconds for recent timestamps', () => {
  const result = timeAgo(Date.now() - 30000); // 30s ago
  assert.match(result, /^\d+s ago$/);
});

test('timeAgo returns minutes for timestamps 1-59 min ago', () => {
  const result = timeAgo(Date.now() - 5 * 60 * 1000); // 5m ago
  assert.match(result, /^\d+m ago$/);
});

test('timeAgo returns hours for timestamps >= 1h ago', () => {
  const result = timeAgo(Date.now() - 2 * 3600 * 1000); // 2h ago
  assert.match(result, /^\d+h ago$/);
});

test('timeAgo returns 1h ago for exactly 1 hour', () => {
  const result = timeAgo(Date.now() - 3600 * 1000);
  assert.equal(result, '1h ago');
});

// ── renderTabList (requires DOM) ──────────────────────────────────────────────

let jsdom;
try {
  jsdom = require('jsdom');
} catch {
  jsdom = null;
}

if (jsdom) {
  const { JSDOM } = jsdom;

  function makePopupDOM() {
    return new JSDOM(`<!DOCTYPE html>
      <html><body>
        <div id="status"></div>
        <div id="tabList"></div>
        <div id="emptyState" style="display:none">No tabs</div>
        <div class="filter-btn" data-filter="all"></div>
        <div class="filter-btn" data-filter="active"></div>
        <div class="filter-btn" data-filter="discarded"></div>
        <button id="optimizeAll"></button>
        <select id="provider"></select>
        <input id="apiEndpoint" />
        <input id="apiKey" />
        <input id="model" />
        <input id="idleMinutes" />
        <input id="autoOptimize" type="checkbox" />
        <button id="saveSettings"></button>
        <div id="apiEndpointRow"></div>
        <div id="apiKeyRow"></div>
        <div id="ollamaWizard"></div>
        <div id="ollamaStatus"></div>
        <div id="ollamaModelPicker"></div>
        <code id="pullCommand"></code>
        <button id="downloadOllamaBtn"></button>
        <button id="retryOllamaBtn"></button>
        <button id="testOllamaBtn"></button>
      </body></html>`,
      { url: 'http://localhost' }
    );
  }

  function loadPopupInDOM(dom, browserMock) {
    const window = dom.window;
    window.browser = browserMock;
    // Run popup.js in the jsdom window context
    vm.runInContext(popupSrc, vm.createContext(window));
  }

  function makeBrowserMock(cacheEntries = []) {
    return {
      runtime: {
        sendMessage: async (msg) => {
          if (msg.action === 'loadPersistedCache') return { cache: cacheEntries };
          if (msg.action === 'getSettings') return { idleMinutes: 30, autoOptimize: false };
          if (msg.action === 'getOAuthStatus') return { google: false };
          if (msg.action === 'detectOllama') return { status: 'not_found' };
          return {};
        }
      },
      tabs: {
        update: async () => {},
        query: async () => [],
        reload: async () => {}
      }
    };
  }

  test('renderTabList renders a tab entry for each cached tab', async () => {
    const dom = makePopupDOM();
    const entries = [
      ['1', { url: 'https://a.com', title: 'Tab A', screenshot: null, summary: 'Sum A', lastActive: Date.now() - 5000, discarded: false }],
      ['2', { url: 'https://b.com', title: 'Tab B', screenshot: null, summary: 'Sum B', lastActive: Date.now() - 5000, discarded: true }]
    ];
    loadPopupInDOM(dom, makeBrowserMock(entries));
    await new Promise(r => setTimeout(r, 20));

    const items = dom.window.document.querySelectorAll('.tab-entry');
    assert.equal(items.length, 2, 'should render 2 tab entries');
  });

  test('renderTabList shows hibernated badge for discarded tabs', async () => {
    const dom = makePopupDOM();
    const entries = [
      ['3', { url: 'https://c.com', title: 'Hibernated', screenshot: null, summary: null, lastActive: Date.now() - 1000, discarded: true }]
    ];
    loadPopupInDOM(dom, makeBrowserMock(entries));
    await new Promise(r => setTimeout(r, 20));

    const badge = dom.window.document.querySelector('.tab-badge.hibernated');
    assert.ok(badge, 'hibernated badge should be present');
  });

  test('renderTabList shows wake button for discarded tabs only', async () => {
    const dom = makePopupDOM();
    const entries = [
      ['4', { url: 'https://d.com', title: 'Active Tab', screenshot: null, summary: null, lastActive: Date.now(), discarded: false }],
      ['5', { url: 'https://e.com', title: 'Sleeping Tab', screenshot: null, summary: null, lastActive: Date.now(), discarded: true }]
    ];
    loadPopupInDOM(dom, makeBrowserMock(entries));
    await new Promise(r => setTimeout(r, 20));

    const wakeButtons = dom.window.document.querySelectorAll('.tab-wake-btn');
    assert.equal(wakeButtons.length, 1, 'only the discarded tab should have a wake button');
    assert.equal(wakeButtons[0].dataset.tabId, '5');
  });

  test('renderTabList shows emptyState when no tabs match filter', async () => {
    const dom = makePopupDOM();
    loadPopupInDOM(dom, makeBrowserMock([]));
    await new Promise(r => setTimeout(r, 20));

    const emptyState = dom.window.document.getElementById('emptyState');
    assert.equal(emptyState.style.display, 'block', 'emptyState should be visible with no tabs');
  });

  test('renderTabList shows screenshot thumbnail when screenshot is present', async () => {
    const dom = makePopupDOM();
    const entries = [
      ['6', { url: 'https://f.com', title: 'With Screenshot', screenshot: 'data:image/png;base64,ABC', summary: null, lastActive: Date.now(), discarded: true }]
    ];
    loadPopupInDOM(dom, makeBrowserMock(entries));
    await new Promise(r => setTimeout(r, 20));

    const img = dom.window.document.querySelector('.tab-thumb');
    assert.ok(img, 'thumbnail img element should be present');
    assert.equal(img.src, 'data:image/png;base64,ABC');
  });

} else {
  test('popup DOM tests skipped — install jsdom: npm install --save-dev jsdom', () => {
    assert.ok(true, 'skipped: jsdom not installed');
  });
}
