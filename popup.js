// popup.js — hub: tab manager + Chat / Settings launchers
'use strict';

// ─── Browser-compatible logger (mirrors WaldoTabsLogger API from logging_utils.js) ─
class WaldoTabsLogger {
  constructor(name) {
    this._prefix = `[WaldoTabs:${name}]`;
  }
  debug(msg, ...args) { console.debug(this._prefix, msg, ...args); }
  info(msg, ...args)  { console.log(this._prefix, msg, ...args); }
  warn(msg, ...args)  { console.warn(this._prefix, msg, ...args); }
  error(msg, ...args) { console.error(this._prefix, msg, ...args); }
}

const logger = new WaldoTabsLogger('popup');

const status = document.getElementById('status');
const tabList = document.getElementById('tabList');
const emptyState = document.getElementById('emptyState');
const filterBtns = document.querySelectorAll('.filter-btn');
let currentFilter = 'all';
let cachedTabs = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(msg, type = '') {
  status.textContent = msg;
  status.className = type;
}

function domainFromUrl(url) {
  try { return new URL(url).hostname; } catch (err) {
    logger.warn('domainFromUrl: invalid URL', url, err);
    return url;
  }
}

function timeAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ─── Provider badge ───────────────────────────────────────────────────────────

async function loadProviderBadge() {
  const settings = await browser.runtime.sendMessage({ action: 'getSettings' });
  const badge = document.getElementById('providerBadge');
  if (settings._provider) {
    const names = {
      openrouter: 'OpenRouter', ollama: 'Ollama', openai: 'OpenAI',
      anthropic: 'Anthropic', mistral: 'Mistral', google: 'Google AI', custom: 'Custom'
    };
    badge.textContent = names[settings._provider] || settings._provider;
    badge.className = 'provider-badge connected';
  } else {
    badge.textContent = 'No AI';
    badge.className = 'provider-badge';
  }
}

// ─── Hub buttons ─────────────────────────────────────────────────────────────

document.getElementById('openChat').addEventListener('click', () => {
  browser.sidebarAction.open();
  window.close();
});

document.getElementById('openSettings').addEventListener('click', () => {
  browser.tabs.create({ url: browser.runtime.getURL('options.html') });
  window.close();
});

// ─── Tab List ─────────────────────────────────────────────────────────────────

function renderTabList(tabs) {
  const filtered = tabs.filter(([, v]) => {
    if (currentFilter === 'active') return !v.discarded;
    if (currentFilter === 'discarded') return v.discarded;
    return true;
  });

  tabList.querySelectorAll('.tab-entry').forEach(el => el.remove());

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  for (const [tabId, tab] of filtered) {
    const entry = document.createElement('div');
    entry.className = `tab-entry${tab.discarded ? ' discarded' : ''}`;
    entry.dataset.tabId = tabId;

    // Thumbnail — src set via attribute, never innerHTML
    const thumb = tab.screenshot ? document.createElement('img') : document.createElement('div');
    if (tab.screenshot) {
      thumb.className = 'tab-thumb';
      thumb.alt = 'screenshot';
      thumb.loading = 'lazy';
      thumb.src = tab.screenshot;         // data URL from captureVisibleTab
    } else {
      thumb.className = 'tab-thumb-placeholder';
      thumb.textContent = '🌐';
    }

    // Info block — all user/AI text via textContent (never innerHTML)
    const info = document.createElement('div');
    info.className = 'tab-info';

    const titleEl = document.createElement('div');
    titleEl.className = 'tab-title';
    titleEl.textContent = tab.title || '(no title)';  // page title: untrusted

    const domainEl = document.createElement('div');
    domainEl.className = 'tab-domain';
    domainEl.textContent = domainFromUrl(tab.url);    // derived from URL: untrusted

    const summaryEl = document.createElement('div');
    summaryEl.className = 'tab-summary';
    summaryEl.textContent = tab.summary || 'No summary yet.';  // AI output: untrusted

    const metaEl = document.createElement('div');
    metaEl.className = 'tab-meta';

    const statusBadge = document.createElement('span');
    statusBadge.className = tab.discarded ? 'tab-badge hibernated' : 'tab-badge active';
    statusBadge.textContent = tab.discarded ? '💤 Hibernated' : '● Active';

    const timeBadge = document.createElement('span');
    timeBadge.className = 'tab-badge';
    timeBadge.textContent = timeAgo(tab.lastActive);

    metaEl.append(statusBadge, timeBadge);
    info.append(titleEl, domainEl, summaryEl, metaEl);
    entry.append(thumb, info);

    if (tab.discarded) {
      const wakeBtn = document.createElement('button');
      wakeBtn.className = 'tab-wake-btn';
      wakeBtn.dataset.tabId = tabId;
      wakeBtn.textContent = 'Wake';
      entry.appendChild(wakeBtn);
    }

    entry.addEventListener('click', (e) => {
      if (e.target.classList.contains('tab-wake-btn')) return;
      browser.tabs.update(parseInt(tabId), { active: true });
    });

    tabList.appendChild(entry);
  }
}

async function reloadTabList() {
  const resp = await browser.runtime.sendMessage({ action: 'loadPersistedCache' });
  cachedTabs = resp.cache;
  renderTabList(cachedTabs);
}

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTabList(cachedTabs);
  });
});

tabList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.tab-wake-btn');
  if (!btn) return;
  e.stopPropagation();
  setStatus('Waking tab...');
  try {
    await browser.tabs.reload(parseInt(btn.dataset.tabId));
    setStatus('Tab woken.', 'ok');
    await reloadTabList();
  } catch (err) {
    setStatus('Failed: ' + err.message, 'err');
  }
});

document.getElementById('optimizeAll').addEventListener('click', async () => {
  setStatus('Optimizing...');
  const tabs = await browser.tabs.query({ active: false, discarded: false });
  let count = 0;
  for (const tab of tabs) {
    if (tab.id) {
      await browser.runtime.sendMessage({ action: 'optimizeTab', tabId: tab.id });
      count++;
    }
  }
  setStatus(`Optimized ${count} tab(s).`, 'ok');
  await reloadTabList();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

loadProviderBadge();
reloadTabList();
