// popup.js — v1.0 Rich Tab Cache Viewer + Provider Card UI
'use strict';

// ─── State ────────────────────────────────────────────────────────────────────────
const status = document.getElementById('status');
const tabList = document.getElementById('tabList');
const emptyState = document.getElementById('emptyState');
const filterBtns = document.querySelectorAll('.filter-btn');
let currentFilter = 'all';
let cachedTabs = [];

// ─── PROVIDERS ─────────────────────────────────────────────────────────────────────
const PROVIDERS = {
  google: {
    id: 'google',
    name: 'Google AI (Gemini)',
    icon: '🔵',
    authMethod: 'oauth',
    defaultModel: 'gemini-2.0-flash',
    endpoint: 'https://generativelanguage.googleapis.com'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI (GPT-4o)',
    icon: '🟢',
    authMethod: 'apikey',
    defaultModel: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com'
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    icon: '🟡',
    authMethod: 'apikey',
    defaultModel: 'claude-3-5-haiku',
    endpoint: 'https://api.anthropic.com'
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral',
    icon: '🟠',
    authMethod: 'apikey',
    defaultModel: 'mistral-small-2506',
    endpoint: 'https://api.mistral.ai'
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: '🟣',
    authMethod: 'apikey',
    defaultModel: 'meta-llama/llama-3-8b-instruct',
    endpoint: ''
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    icon: '🟣',
    authMethod: 'local',
    defaultModel: 'llama3.2',
    endpoint: 'http://localhost:11434'
  }
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function setStatus(msg, type = '') {
  status.textContent = msg;
  status.className = type;
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function timeAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ─── Tab List Rendering ─────────────────────────────────────────────────────────
function renderTabList(tabs) {
  const filtered = tabs.filter(([, v]) => {
    if (currentFilter === 'active') return !v.discarded;
    if (currentFilter === 'discarded') return v.discarded;
    return true;
  });

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    tabList.querySelectorAll('.tab-entry').forEach(el => el.remove());
    return;
  }

  emptyState.style.display = 'none';
  tabList.querySelectorAll('.tab-entry').forEach(el => el.remove());

  for (const [tabId, tab] of filtered) {
    const entry = document.createElement('div');
    entry.className = `tab-entry${tab.discarded ? ' discarded' : ''}`;
    entry.dataset.tabId = tabId;

    const thumbHtml = tab.screenshot
      ? `<img class="tab-thumb" src="${tab.screenshot}" alt="screenshot" loading="lazy">`
      : `<div class="tab-thumb-placeholder">🌐</div>`;

    const badge = tab.discarded
      ? '<span class="tab-badge hibernated">💤 Hibernated</span>'
      : '<span class="tab-badge active">● Active</span>';

    entry.innerHTML = `
      ${thumbHtml}
      <div class="tab-info">
        <div class="tab-title">${tab.title || '(no title)'}</div>
        <div class="tab-domain">${domainFromUrl(tab.url)}</div>
        <div class="tab-summary">${tab.summary || 'No summary yet.'}</div>
        <div class="tab-meta">
          ${badge}
          <span class="tab-badge">${timeAgo(tab.lastActive)}</span>
        </div>
      </div>
      ${tab.discarded ? `<button class="tab-wake-btn" data-tab-id="${tabId}">Wake</button>` : ''}
    `;

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

// ─── Filter Bar ────────────────────────────────────────────────────────────────
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTabList(cachedTabs);
  });
});

// ─── Tab List Event Delegation (Wake Buttons) ──────────────────────────────────
tabList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.tab-wake-btn');
  if (!btn) return;
  e.stopPropagation();
  const tabId = parseInt(btn.dataset.tabId);
  setStatus('Waking tab...');
  try {
    await browser.tabs.reload(tabId);
    setStatus('Tab woken.', 'ok');
    await reloadTabList();
  } catch (err) {
    setStatus('Failed to wake tab: ' + err.message, 'err');
  }
});

// ─── Optimize All ──────────────────────────────────────────────────────────────
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

// ─── Settings ───────────────────────────────────────────────────────────────────
async function loadSettings() {
  const settings = await browser.runtime.sendMessage({ action: 'getSettings' });

  // Populate provider dropdown
  const providerSelect = document.getElementById('provider');
  providerSelect.innerHTML = '<option value="">Select provider...</option>';
  Object.values(PROVIDERS).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.icon} ${p.name}`;
    providerSelect.appendChild(opt);
  });

  // Load saved provider
  const savedProvider = settings._provider || '';
  providerSelect.value = savedProvider;

  // Apply provider-specific defaults
  if (savedProvider && PROVIDERS[savedProvider]) {
    const p = PROVIDERS[savedProvider];
    if (p.authMethod !== 'oauth') {
      document.getElementById('apiEndpoint').value = settings.apiEndpoint || p.endpoint;
      document.getElementById('model').value = settings.model || p.defaultModel;
    }
  }

  document.getElementById('apiKey').value = settings.apiKey || '';
  document.getElementById('idleMinutes').value = settings.idleMinutes || 30;
  document.getElementById('autoOptimize').checked = settings.autoOptimize || false;

  // Apply provider visibility (show/hide API key, readonly endpoint)
  applyProviderVisibility(savedProvider);

  // Check OAuth status for Google
  if (savedProvider === 'google') {
    const oauthStatus = await browser.runtime.sendMessage({ action: 'getOAuthStatus' });
    if (oauthStatus.google) {
      const googleOpt = providerSelect.querySelector('option[value="google"]');
      if (googleOpt) googleOpt.textContent = '🔵 Google AI (Gemini) ✅';
    }
  }

  // Init Ollama wizard if Ollama provider selected
  await initOllamaWizard();
}

function applyProviderVisibility(providerId) {
  const apiEndpointRow = document.getElementById('apiEndpointRow');
  const apiKeyRow = document.getElementById('apiKeyRow');
  const endpointInput = document.getElementById('apiEndpoint');
  const apiKeyInput = document.getElementById('apiKey');

  if (providerId === 'ollama') {
    endpointInput.value = 'http://localhost:11434';
    endpointInput.placeholder = 'http://localhost:11434';
    endpointInput.readOnly = true;
    apiKeyRow.style.display = 'none';
  } else if (providerId === 'google') {
    endpointInput.value = 'https://generativelanguage.googleapis.com';
    endpointInput.readOnly = true;
    apiKeyRow.style.display = 'flex';
  } else if (providerId) {
    apiKeyRow.style.display = 'flex';
    endpointInput.readOnly = false;
  }

  // Reset defaults when no provider
  if (!providerId) {
    apiEndpointRow.style.display = 'flex';
    apiKeyRow.style.display = 'flex';
    endpointInput.readOnly = false;
  }
}

document.getElementById('provider').addEventListener('change', async (e) => {
  const providerId = e.target.value;
  applyProviderVisibility(providerId);

  if (providerId && PROVIDERS[providerId]) {
    const p = PROVIDERS[providerId];
    document.getElementById('model').value = p.defaultModel;
    if (p.authMethod !== 'oauth' && p.endpoint) {
      document.getElementById('apiEndpoint').value = p.endpoint;
    }
  }

  // Show/hide Ollama wizard
  await initOllamaWizard();
});

document.getElementById('saveSettings').addEventListener('click', async () => {
  const providerId = document.getElementById('provider').value;
  const settings = {
    _provider: providerId,
    apiEndpoint: document.getElementById('apiEndpoint').value.trim(),
    apiKey: document.getElementById('apiKey').value.trim(),
    model: document.getElementById('model').value.trim() || 'gpt-4o-mini',
    idleMinutes: parseInt(document.getElementById('idleMinutes').value) || 30,
    autoOptimize: document.getElementById('autoOptimize').checked
  };

  // Ollama: clear API key
  if (providerId === 'ollama') {
    settings.apiKey = '';
    settings.apiEndpoint = 'http://localhost:11434';
  }

  await browser.runtime.sendMessage({ action: 'saveSettings', settings });
  setStatus('Settings saved.', 'ok');

  // Test connection after save (skip OAuth providers)
  if (providerId && PROVIDERS[providerId]) {
    await testConnection(providerId, settings);
  }
});

async function testConnection(providerId, settings) {
  const p = PROVIDERS[providerId];
  if (!p || p.authMethod === 'oauth') return;

  setStatus(`Testing ${p.name}...`);
  try {
    if (providerId === 'ollama') {
      const resp = await fetch(`${settings.apiEndpoint}/api/tags`);
      if (resp.ok) {
        const data = await resp.json();
        setStatus(`✅ ${p.name} connected — ${data.models?.length || 0} models available.`, 'ok');
      } else {
        setStatus(`❌ ${p.name} connection failed.`, 'err');
      }
      return;
    }

    // OpenAI-compatible test
    const body = {
      model: settings.model || p.defaultModel,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5
    };
    const headers = { 'Content-Type': 'application/json' };
    if (settings.apiKey) {
      headers['Authorization'] = `Bearer ${settings.apiKey}`;
    }

    const resp = await fetch(`${settings.apiEndpoint}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (resp.ok) {
      setStatus(`✅ ${p.name} connected.`, 'ok');
    } else {
      const err = await resp.json().catch(() => ({}));
      setStatus(`❌ ${p.name}: ${err.error?.message || resp.statusText}`, 'err');
    }
  } catch (err) {
    setStatus(`❌ ${p.name}: ${err.message}`, 'err');
  }
}

// ─── Ollama Wizard ─────────────────────────────────────────────────────────────
const ollamaWizard = document.getElementById('ollamaWizard');
const ollamaStatus = document.getElementById('ollamaStatus');
const ollamaModelPicker = document.getElementById('ollamaModelPicker');
const pullCommand = document.getElementById('pullCommand');

async function checkOllama() {
  const resp = await browser.runtime.sendMessage({ action: 'detectOllama' });
  return resp;
}

async function initOllamaWizard() {
  const result = await checkOllama();
  const providerId = document.getElementById('provider').value;

  if (providerId === 'ollama') {
    ollamaWizard.style.display = 'block';
    if (result.status === 'detected') {
      ollamaStatus.textContent = `✅ Ollama detected — ${result.models.length} model(s) available`;
      ollamaStatus.className = 'ok';
      ollamaModelPicker.style.display = 'block';
      document.getElementById('downloadOllamaBtn').style.display = 'none';
    } else {
      ollamaStatus.textContent = '❌ Ollama not found on localhost:11434';
      ollamaStatus.className = 'err';
      ollamaModelPicker.style.display = 'none';
      document.getElementById('downloadOllamaBtn').style.display = 'inline-block';
    }
  } else {
    ollamaWizard.style.display = 'none';
  }
}

// Update pull command when model selection changes
document.querySelectorAll('input[name="ollamaModel"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    pullCommand.textContent = `ollama pull ${e.target.value}`;
  });
});

document.getElementById('downloadOllamaBtn').addEventListener('click', () => {
  window.open('https://ollama.com/download', '_blank');
});

document.getElementById('retryOllamaBtn').addEventListener('click', async () => {
  ollamaStatus.textContent = 'Checking...';
  ollamaStatus.className = '';
  const result = await checkOllama();
  if (result.status === 'detected') {
    ollamaStatus.textContent = `✅ Ollama detected — ${result.models.length} model(s) available`;
    ollamaStatus.className = 'ok';
    ollamaModelPicker.style.display = 'block';
    document.getElementById('downloadOllamaBtn').style.display = 'none';
  } else {
    ollamaStatus.textContent = '❌ Still not found. Is Ollama running?';
    ollamaStatus.className = 'err';
  }
});

document.getElementById('testOllamaBtn').addEventListener('click', async () => {
  const model = document.querySelector('input[name="ollamaModel"]:checked')?.value || 'llama3.2';
  ollamaStatus.textContent = 'Testing...';
  ollamaStatus.className = '';
  const resp = await browser.runtime.sendMessage({ action: 'testOllamaModel', model });
  if (resp.status === 'ok') {
    ollamaStatus.textContent = `✅ Model "${model}" responding correctly!`;
    ollamaStatus.className = 'ok';
  } else {
    ollamaStatus.textContent = `❌ Test failed: ${resp.error}. Run "ollama pull ${model}" first.`;
    ollamaStatus.className = 'err';
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────
loadSettings();
reloadTabList();