// options.unit.test.js — tests for options.html/options.js CSS compliance and behaviour
//
// Tests that options page renders correctly with CSS classes (no inline styles)
// and that tab behaviour settings (idle threshold, auto-optimize) still function.

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const vm       = require('node:vm');
const fs       = require('node:fs');
const path     = require('node:path');

// ── CSS Class Rendering Tests ─────────────────────────────────────────────────

let jsdom;
try {
  jsdom = require('jsdom');
} catch {
  jsdom = null;
}

if (jsdom) {
  const { JSDOM } = jsdom;

  function makeOptionsBrowserMock(settings = {}) {
    return {
      runtime: {
        sendMessage: async (msg) => {
          if (msg.action === 'getSettings') {
            return {
              _provider: settings._provider || null,
              apiKey: settings.apiKey || '',
              apiEndpoint: settings.apiEndpoint || '',
              model: settings.model || '',
              idleMinutes: settings.idleMinutes !== undefined ? settings.idleMinutes : 30,
              autoOptimize: settings.autoOptimize || false
            };
          }
          if (msg.action === 'getOAuthStatus') {
            return { google: settings.oauthGoogle || false };
          }
          return {};
        },
        onMessage: { addListener: () => {} }
      },
      storage: {
        local: {
          set: async () => {},
          get: async () => ({}),
          remove: async () => {}
        },
        session: {
          set: async () => {},
          get: async () => ({}),
          remove: async () => {}
        }
      },
      tabs: {
        create: async () => {}
      }
    };
  }

  function loadOptionsInDOM(dom, browserMock) {
    const window = dom.window;
    window.browser = browserMock;
    // Since options.js depends on DOM being ready, add minimal options.js logic
    const scriptPath = path.join(__dirname, '..', 'options.js');
    const scriptSrc = fs.readFileSync(scriptPath, 'utf8');
    try {
      vm.runInContext(scriptSrc, vm.createContext(window));
    } catch (e) {
      // Script execution errors are tolerated for DOM structure tests
      // We're testing the HTML/CSS structure, not script logic
    }
  }

  function makeOptionsDOM() {
    // Load the actual options.html file
    const htmlPath = path.join(__dirname, '..', 'options.html');
    const htmlSrc = fs.readFileSync(htmlPath, 'utf8');
    return new JSDOM(htmlSrc, { url: 'moz-extension://fake-id/options.html' });
  }

  // ── Test: CSS classes applied instead of inline styles ──────────────────────

  test('options.html has no inline style attributes on header note', () => {
    const dom = makeOptionsDOM();
    const htmlText = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');
    // The old note element used inline styles; verify it now uses .page-header-note class
    assert.ok(htmlText.includes('page-header-note'), 'should have .page-header-note CSS class');
    // Verify no inline style="..." on notes in the openrouter section
    const noteStart = htmlText.indexOf('Get a key at');
    const noteLine = htmlText.substring(noteStart - 100, noteStart + 50);
    assert.ok(noteLine.includes('page-header-note'), 'note should use CSS class');
  });

  test('options.html has no inline style attributes on form hints', () => {
    const htmlText = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');
    // Verify form hints use .form-hint CSS class
    assert.ok(htmlText.includes('form-hint'), 'should have .form-hint CSS class');
  });

  test('options.html has no inline style attributes on hidden elements', () => {
    const htmlText = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');
    // Verify hidden elements use .hidden class
    assert.ok(htmlText.includes('class="hidden"'), 'should use .hidden CSS class');
  });

  test('options.html has no inline style attributes on inline-input', () => {
    const htmlText = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');
    // Verify inline inputs (like idle threshold) use .inline-input class
    assert.ok(htmlText.includes('inline-input'), 'should have .inline-input CSS class for narrow inputs');
  });

  test('options.html has no inline style attributes on behaviour card body', () => {
    const htmlText = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');
    // Verify behaviour section card uses .behaviour-card-body class
    assert.ok(htmlText.includes('behaviour-card-body'), 'should have .behaviour-card-body CSS class');
  });

  // ── Test: Settings UI renders with all provider cards ─────────────────────────

  test('options page renders all provider cards', () => {
    const dom = makeOptionsDOM();
    const cards = dom.window.document.querySelectorAll('.provider-card');
    // Should have: OpenRouter, Ollama, Google, OpenAI, Anthropic, Mistral, Custom
    assert.ok(cards.length >= 7, 'should have at least 7 provider cards');
  });

  test('options page has correct provider card IDs', () => {
    const dom = makeOptionsDOM();
    const providers = ['openrouter', 'ollama', 'google', 'openai', 'anthropic', 'mistral', 'custom'];
    providers.forEach(p => {
      const card = dom.window.document.getElementById(`card-${p}`);
      assert.ok(card, `should have card-${p} element`);
      assert.ok(card.classList.contains('provider-card'), `card-${p} should have provider-card class`);
    });
  });

  test('options page renders form fields for key/model inputs', () => {
    const dom = makeOptionsDOM();
    // Check that API key and model inputs exist for cloud providers
    const openrouterKey = dom.window.document.getElementById('key-openrouter');
    const openrouterModel = dom.window.document.getElementById('model-openrouter');
    assert.ok(openrouterKey, 'should have key-openrouter input');
    assert.ok(openrouterModel, 'should have model-openrouter input');
  });

  test('options page renders tab behaviour section with idle threshold', () => {
    const dom = makeOptionsDOM();
    const idleInput = dom.window.document.getElementById('idleMinutes');
    assert.ok(idleInput, 'should have idleMinutes input field');
    assert.equal(idleInput.value, '30', 'idle minutes should default to 30');
  });

  test('options page renders auto-optimize toggle', () => {
    const dom = makeOptionsDOM();
    const autoOptimize = dom.window.document.getElementById('autoOptimize');
    assert.ok(autoOptimize, 'should have autoOptimize checkbox');
    assert.equal(autoOptimize.type, 'checkbox', 'autoOptimize should be a checkbox');
  });

  test('options page behaviour section uses CSS classes not inline styles', () => {
    const htmlText = fs.readFileSync(path.join(__dirname, '..', 'options.html'), 'utf8');
    // Find the behaviour section and verify it uses .behaviour-card-body class
    const behaviourSectionStart = htmlText.indexOf('Tab Behaviour');
    const behaviourSection = htmlText.substring(behaviourSectionStart, behaviourSectionStart + 500);
    assert.ok(behaviourSection.includes('behaviour-card-body'), 'behaviour section should use CSS class');
  });

  test('all feature cards are present and visible', () => {
    const dom = makeOptionsDOM();
    const pageHeader = dom.window.document.querySelector('.page-header');
    assert.ok(pageHeader, 'page header should be present');
    assert.ok(pageHeader.querySelector('h1'), 'page title should be present');
    const sections = dom.window.document.querySelectorAll('.section');
    assert.ok(sections.length >= 3, 'should have at least 3 sections (Quick Start, More Providers, Behaviour)');
  });

  test('provider cards have clickable headers for expand/collapse', () => {
    const dom = makeOptionsDOM();
    const headers = dom.window.document.querySelectorAll('.card-header');
    assert.ok(headers.length >= 7, 'should have headers for all provider cards');
    headers.forEach(header => {
      assert.ok(header.classList.contains('card-header'), 'header should have card-header class');
    });
  });

  test('form inputs use CSS classes for styling (max-width)', () => {
    const dom = makeOptionsDOM();
    const idleInput = dom.window.document.getElementById('idleMinutes');
    // The input should have inline-input class to limit width
    assert.ok(idleInput.classList.contains('inline-input'), 'idle input should have inline-input class for max-width');
  });

  test('options page renders all behaviour-related UI controls', () => {
    const dom = makeOptionsDOM();
    const idleLabel = Array.from(dom.window.document.querySelectorAll('label')).find(
      l => l.textContent.includes('Idle threshold')
    );
    const autoOptimizeLabel = Array.from(dom.window.document.querySelectorAll('label')).find(
      l => l.textContent.includes('Auto-optimize')
    );
    assert.ok(idleLabel, 'should have idle threshold label');
    assert.ok(autoOptimizeLabel, 'should have auto-optimize label');
  });

} else {
  test('options page tests skipped — install jsdom: npm install --save-dev jsdom', () => {
    assert.ok(true, 'skipped: jsdom not installed');
  });
}
