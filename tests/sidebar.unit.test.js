// sidebar.unit.test.js — tests for sidebar.js live settings sync (2026-07-02 regression)
//
// Bug: the sidebar's provider chip ("No AI" / "OpenRouter" / etc.) was only ever read once,
// at panel init. Settings live in a separate extension page (options.html) — a sidebar panel
// left open across a Settings change kept showing a stale "No AI provider configured" state
// even after the user connected a working provider elsewhere, with no way to know a real
// response actually came from the configured model.

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const vm       = require('node:vm');
const fs       = require('node:fs');
const path     = require('node:path');
const { installBrowserMock } = require('./helpers/browserMock');

let jsdom;
try {
  jsdom = require('jsdom');
} catch {
  jsdom = null;
}

if (jsdom) {
  const { JSDOM } = jsdom;

  function makeSidebarDOM() {
    const htmlPath = path.join(__dirname, '..', 'sidebar.html');
    const htmlSrc = fs.readFileSync(htmlPath, 'utf8');
    return new JSDOM(htmlSrc, { url: 'moz-extension://fake-id/sidebar.html' });
  }

  // Wraps installBrowserMock's real storage + onChanged plumbing with a 'getSettings'
  // responder that mirrors what background.js's real handler returns (the settings
  // object directly, not wrapped) — see background.js's `message.action === 'getSettings'`.
  function makeSidebarBrowserMock(initialSettings = {}) {
    const { browser } = installBrowserMock({ local: { settings: initialSettings } });
    browser.runtime.sendMessage = async (msg) => {
      if (msg.action === 'getSettings') {
        const stored = await browser.storage.local.get('settings');
        return stored.settings || {};
      }
      return {};
    };
    return browser;
  }

  function loadSidebarInDOM(dom, browserMock) {
    const window = dom.window;
    window.browser = browserMock;
    const scriptPath = path.join(__dirname, '..', 'sidebar.js');
    const scriptSrc = fs.readFileSync(scriptPath, 'utf8');
    vm.runInContext(scriptSrc, vm.createContext(window));
  }

  test('sidebar provider chip starts on "No AI" when no provider is configured', async () => {
    const dom = makeSidebarDOM();
    const browserMock = makeSidebarBrowserMock({});
    loadSidebarInDOM(dom, browserMock);
    await new Promise(resolve => setTimeout(resolve, 0));

    const chip = dom.window.document.getElementById('providerChip');
    assert.equal(chip.textContent, 'No AI');
  });

  test('sidebar provider chip updates live when settings change in another extension page', async () => {
    const dom = makeSidebarDOM();
    const browserMock = makeSidebarBrowserMock({}); // starts unconfigured, sidebar left open
    loadSidebarInDOM(dom, browserMock);
    await new Promise(resolve => setTimeout(resolve, 0));

    const chip = dom.window.document.getElementById('providerChip');
    assert.equal(chip.textContent, 'No AI', 'sanity: starts unconfigured');

    // Simulate options.js's selectProvider()/saveBehaviour() — both go through
    // background.js's 'saveSettings' handler, which calls browser.storage.local.set({settings}).
    await browserMock.storage.local.set({
      settings: { _provider: 'openrouter', apiEndpoint: 'https://openrouter.ai/api', apiKey: 'sk-or-test' }
    });

    assert.equal(chip.textContent, 'OpenRouter', 'chip should update live without reopening the sidebar');
    assert.ok(chip.className.includes('connected'), 'chip should carry the connected style');
  });

  test('sidebar provider chip ignores unrelated storage changes (e.g. tabCache updates)', async () => {
    const dom = makeSidebarDOM();
    const browserMock = makeSidebarBrowserMock({
      _provider: 'openrouter', apiEndpoint: 'https://openrouter.ai/api', apiKey: 'sk-or-test'
    });
    loadSidebarInDOM(dom, browserMock);
    await new Promise(resolve => setTimeout(resolve, 0));

    const chip = dom.window.document.getElementById('providerChip');
    assert.equal(chip.textContent, 'OpenRouter', 'sanity: starts configured');

    await browserMock.storage.local.set({ tabCache: { 1: { title: 'unrelated' } } });

    assert.equal(chip.textContent, 'OpenRouter', 'unrelated storage keys should not touch the chip');
  });

} else {
  test('sidebar page tests skipped — install jsdom: npm install --save-dev jsdom', () => {
    assert.ok(true, 'skipped: jsdom not installed');
  });
}
