// options.js — full settings page
'use strict';

const PROVIDERS = {
  openrouter: { endpoint: 'https://openrouter.ai/api', authMethod: 'apikey' },
  ollama:     { endpoint: 'http://localhost:11434',     authMethod: 'local'  },
  google:     { endpoint: 'https://generativelanguage.googleapis.com', authMethod: 'oauth' },
  openai:     { endpoint: 'https://api.openai.com',     authMethod: 'apikey' },
  anthropic:  { endpoint: 'https://api.anthropic.com',  authMethod: 'apikey' },
  mistral:    { endpoint: 'https://api.mistral.ai',     authMethod: 'apikey' },
  custom:     { endpoint: '',                           authMethod: 'apikey' },
};

let currentSettings = {};

// ─── Status helpers ───────────────────────────────────────────────────────────

function setGlobal(msg, type = '') {
  const el = document.getElementById('globalStatus');
  el.textContent = msg;
  el.className = type;
}

function setCardStatus(providerId, msg, type = '') {
  const el = document.getElementById(`status-${providerId}`);
  if (!el) return;
  el.textContent = msg;
  el.className = `card-status${type ? ' ' + type : ''}`;
}

// ─── Card expand/collapse ─────────────────────────────────────────────────────

document.querySelectorAll('.card-header').forEach(header => {
  header.addEventListener('click', () => {
    const card = header.closest('.provider-card');
    card.classList.toggle('expanded');
  });
});

// ─── Load saved settings ──────────────────────────────────────────────────────

async function loadSettings() {
  currentSettings = await browser.runtime.sendMessage({ action: 'getSettings' });

  const p = currentSettings._provider;

  // Populate key/model fields from saved settings
  if (p && p !== 'ollama' && p !== 'google') {
    const keyInput = document.getElementById(`key-${p}`);
    if (keyInput) keyInput.value = currentSettings.apiKey || '';
    const modelInput = document.getElementById(`model-${p}`);
    if (modelInput) modelInput.value = currentSettings.model || '';
    if (p === 'custom') {
      const epInput = document.getElementById('endpoint-custom');
      if (epInput) epInput.value = currentSettings.apiEndpoint || '';
    }
  }
  if (p === 'ollama') {
    const modelInput = document.querySelector('input[name="ollamaModel"]');
    const saved = currentSettings.model;
    if (saved) {
      const radio = document.querySelector(`input[name="ollamaModel"][value="${CSS.escape(saved)}"]`);
      if (radio) radio.checked = true;
    }
  }
  if (p === 'google') {
    const m = document.getElementById('model-google');
    if (m) m.value = currentSettings.model || 'gemini-2.0-flash';
  }

  document.getElementById('idleMinutes').value = currentSettings.idleMinutes || 30;
  document.getElementById('autoOptimize').checked = currentSettings.autoOptimize || false;

  // Mark active provider card
  if (p) {
    document.querySelectorAll('.provider-card').forEach(c => c.classList.remove('active-provider'));
    const activeCard = document.getElementById(`card-${p}`);
    if (activeCard) {
      activeCard.classList.add('active-provider');
      activeCard.classList.add('expanded');
    }
    setCardStatus(p, '✓ Active', 'connected');
  }

  // Google OAuth status
  const oauthStatus = await browser.runtime.sendMessage({ action: 'getOAuthStatus' });
  if (oauthStatus.google) {
    setCardStatus('google', '✓ Connected', 'connected');
    document.getElementById('googleConnectBtn').style.display = 'none';
    document.getElementById('googleDisconnectBtn').style.display = 'inline-block';
  }

  // Ollama auto-detect
  await detectOllama();
}

// ─── Save a provider as active ────────────────────────────────────────────────

async function selectProvider(providerId) {
  const p = PROVIDERS[providerId];
  const settings = {
    _provider:    providerId,
    apiEndpoint:  providerId === 'ollama'  ? p.endpoint
                : providerId === 'google'  ? p.endpoint
                : providerId === 'custom'  ? (document.getElementById('endpoint-custom')?.value.trim() || '')
                : p.endpoint,
    apiKey:       providerId === 'ollama'  ? ''
                : providerId === 'google'  ? ''
                : document.getElementById(`key-${providerId}`)?.value.trim() || '',
    model:        providerId === 'ollama'
                    ? (document.querySelector('input[name="ollamaModel"]:checked')?.value || 'llama3.2')
                : providerId === 'google'
                    ? document.getElementById('model-google')?.value.trim() || 'gemini-2.0-flash'
                : document.getElementById(`model-${providerId}`)?.value.trim() || '',
    idleMinutes:  parseInt(document.getElementById('idleMinutes').value) || 30,
    autoOptimize: document.getElementById('autoOptimize').checked,
  };

  await browser.runtime.sendMessage({ action: 'saveSettings', settings });
  currentSettings = settings;

  // Update UI
  document.querySelectorAll('.provider-card').forEach(c => {
    c.classList.remove('active-provider');
    const id = c.id.replace('card-', '');
    setCardStatus(id, '');
  });
  const card = document.getElementById(`card-${providerId}`);
  if (card) card.classList.add('active-provider');
  setCardStatus(providerId, '✓ Active', 'connected');
  setGlobal(`✅ ${providerId} selected.`, 'ok');
}

// ─── Test connection ──────────────────────────────────────────────────────────

async function testConnection(providerId) {
  setGlobal(`Testing ${providerId}…`);
  const p = PROVIDERS[providerId];

  if (providerId === 'ollama') {
    try {
      const resp = await fetch('http://localhost:11434/api/tags');
      if (resp.ok) {
        const data = await resp.json();
        const n = data.models?.length || 0;
        setCardStatus('ollama', `✓ ${n} model(s)`, 'connected');
        setGlobal(`✅ Ollama connected — ${n} model(s) available.`, 'ok');
      } else {
        setCardStatus('ollama', '✗ Not reachable', 'error');
        setGlobal('❌ Ollama not reachable at localhost:11434.', 'err');
      }
    } catch {
      setCardStatus('ollama', '✗ Not found', 'error');
      setGlobal('❌ Ollama not running. Download from ollama.com/download.', 'err');
    }
    return;
  }

  if (p.authMethod === 'oauth') {
    setGlobal('Google: click "Connect Google account" to authenticate.', '');
    return;
  }

  const endpoint = providerId === 'custom'
    ? document.getElementById('endpoint-custom')?.value.trim()
    : p.endpoint;
  const apiKey = document.getElementById(`key-${providerId}`)?.value.trim();
  const model  = document.getElementById(`model-${providerId}`)?.value.trim();

  if (!endpoint) { setGlobal('❌ No endpoint set.', 'err'); return; }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const resp = await fetch(`${endpoint}/v1/chat/completions`, {
      method: 'POST', headers,
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5
      })
    });
    if (resp.ok) {
      setCardStatus(providerId, '✓ Connected', 'connected');
      setGlobal(`✅ ${providerId} connected.`, 'ok');
    } else {
      const err = await resp.json().catch(() => ({}));
      const msg = err.error?.message || `HTTP ${resp.status}`;
      setCardStatus(providerId, '✗ Error', 'error');
      setGlobal(`❌ ${providerId}: ${msg}`, 'err');
    }
  } catch (err) {
    setCardStatus(providerId, '✗ Failed', 'error');
    setGlobal(`❌ ${providerId}: ${err.message}`, 'err');
  }
}

// ─── Ollama detection ─────────────────────────────────────────────────────────

async function detectOllama() {
  const detectEl = document.getElementById('ollamaDetect');
  detectEl.className = 'ollama-detect';
  detectEl.textContent = 'Checking for Ollama…';

  const result = await browser.runtime.sendMessage({ action: 'detectOllama' });
  const modelSection = document.getElementById('ollamaModelSection');
  const downloadBtn  = document.getElementById('downloadOllamaBtn');

  if (result.detected) {
    detectEl.className = 'ollama-detect ok';
    detectEl.textContent = `✅ Ollama running — ${result.models.length} model(s) installed`;
    modelSection.style.display = 'block';
    downloadBtn.style.display = 'none';
    setCardStatus('ollama', '✓ Detected', 'connected');
  } else {
    detectEl.className = 'ollama-detect err';
    detectEl.textContent = '❌ Ollama not found at localhost:11434. Is it running?';
    modelSection.style.display = 'none';
    downloadBtn.style.display = 'inline-block';
    setCardStatus('ollama', '✗ Not found', 'error');
  }
}

document.getElementById('retryOllamaBtn').addEventListener('click', detectOllama);

// Update pull command when model radio changes
document.querySelectorAll('input[name="ollamaModel"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    document.getElementById('pullCommand').textContent = `ollama pull ${e.target.value}`;
  });
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────

document.getElementById('googleConnectBtn').addEventListener('click', async () => {
  setGlobal('Launching Google sign-in…');
  const result = await browser.runtime.sendMessage({ action: 'initiateGoogleOAuth' });
  if (result.success) {
    setCardStatus('google', '✓ Connected', 'connected');
    setGlobal('✅ Google AI connected.', 'ok');
    document.getElementById('googleConnectBtn').style.display = 'none';
    document.getElementById('googleDisconnectBtn').style.display = 'inline-block';
  } else {
    setGlobal(`❌ Google OAuth failed: ${result.error}`, 'err');
  }
});

document.getElementById('googleDisconnectBtn').addEventListener('click', async () => {
  await browser.runtime.sendMessage({ action: 'disconnectGoogle' });
  setCardStatus('google', '');
  setGlobal('Google AI disconnected.', '');
  document.getElementById('googleConnectBtn').style.display = 'inline-block';
  document.getElementById('googleDisconnectBtn').style.display = 'none';
});

// ─── Select / Test button delegation ─────────────────────────────────────────

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, provider } = btn.dataset;
  if (action === 'select') await selectProvider(provider);
  if (action === 'test')   await testConnection(provider);
});

// ─── Behaviour save (auto-save on change) ────────────────────────────────────

async function saveBehaviour() {
  const settings = {
    ...currentSettings,
    idleMinutes:  parseInt(document.getElementById('idleMinutes').value) || 30,
    autoOptimize: document.getElementById('autoOptimize').checked,
  };
  await browser.runtime.sendMessage({ action: 'saveSettings', settings });
  currentSettings = settings;
}

document.getElementById('idleMinutes').addEventListener('change', saveBehaviour);
document.getElementById('autoOptimize').addEventListener('change', saveBehaviour);

// ─── Init ─────────────────────────────────────────────────────────────────────

loadSettings();
