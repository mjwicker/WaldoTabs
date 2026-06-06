// background.js — service worker (brain of the extension)
// v0.2.0: tabCache persisted to browser.storage.local (survives worker suspension)

let tabCache = new Map();

function isGoogleDomain(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'google.com' || host.endsWith('.google.com');
  } catch { return false; }
}

// ─── Cache Persistence ───────────────────────────────────────────────────────

// Load tabCache from storage on startup. Called on every worker wake.
async function loadTabCache() {
  const stored = await browser.storage.local.get('tabCache');
  if (stored.tabCache) {
    tabCache = new Map(Object.entries(stored.tabCache));
    console.log(`[WaldoTabs] Loaded ${tabCache.size} tabs from cache.`);
  }
}

// Save tabCache to storage. Call on every mutation.
async function persistTabCache() {
  const obj = Object.fromEntries(tabCache);
  await browser.storage.local.set({ tabCache: obj });
}

// Load on worker startup (first wake) and on extension install/update.
browser.runtime.onStartup.addListener(loadTabCache);
browser.runtime.onInstalled.addListener(loadTabCache);

// ─── Tab Tracking ─────────────────────────────────────────────────────────────

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    updateTabCache(tabId, tab);
  }
});

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  const key = String(tabId);
  if (tabCache.has(key)) {
    tabCache.get(key).lastActive = Date.now();
    await persistTabCache();
  }
});

browser.tabs.onRemoved.addListener(async (tabId) => {
  tabCache.delete(String(tabId));
  await persistTabCache();
});

// ─── Message Handlers ─────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'initiateGoogleOAuth') {
    const result = await initiateGoogleOAuth();
    sendResponse(result);
    return true;
  }

  if (message.action === 'getOAuthStatus') {
    const status = await getOAuthStatus();
    sendResponse(status);
    return true;
  }

  if (message.action === 'disconnectGoogle') {
    const result = await disconnectGoogle();
    sendResponse(result);
    return true;
  }

  if (message.action === 'optimizeTab') {
    const tab = await browser.tabs.get(message.tabId);
    if (isGoogleDomain(tab.url)) {
      sendResponse({ success: true, skipped: 'google-domain' });
      return true;
    }
    await prepareForDiscard(tab);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'wakeTab') {
    await browser.tabs.reload(message.tabId);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'getCachedState') {
    sendResponse({ cache: Array.from(tabCache.entries()) });
    return true;
  }

  if (message.action === 'getSettings') {
    const settings = await browser.storage.local.get('settings');
    sendResponse(settings.settings || defaultSettings());
    return true;
  }

  if (message.action === 'saveSettings') {
    await browser.storage.local.set({ settings: message.settings });
    sendResponse({ success: true });
    return true;
  }

  // v0.2.0: return persisted cache for popup to reconstruct state
  if (message.action === 'loadPersistedCache') {
    await loadTabCache();
    sendResponse({ cache: Array.from(tabCache.entries()) });
    return true;
  }

  // ── Chat — general conversation + page Q&A ──────────────────────────────────
  // sidebar.js sends { action: 'chat', messages: [...] }
  // messages is a full conversation history; sidebar prepends page context when toggled.
  if (message.action === 'chat') {
    try {
      const content = await callWithSavedSettings(message.messages, { maxTokens: 1000 });
      sendResponse({ content });
    } catch (err) {
      sendResponse({ error: err.message });
    }
    return true;
  }

  // ── getPageContext — extract readable text from the active tab ───────────────
  // Returns { title, url, content } so sidebar can prepend it as context.
  if (message.action === 'getPageContext') {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { sendResponse({ error: 'No active tab' }); return true; }

      const result = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (typeof window._waldoTabsQuickExtract === 'function') {
            return window._waldoTabsQuickExtract(6000);
          }
          return document.body?.innerText?.substring(0, 6000) || '';
        }
      });
      sendResponse({
        title:   tab.title || '',
        url:     tab.url   || '',
        content: result[0]?.result || ''
      });
    } catch (err) {
      sendResponse({ error: err.message });
    }
    return true;
  }

  // ── pageAction — execute a single primitive on the active tab ────────────────
  // sidebar.js sends { action: 'pageAction', tool, args } after user approves.
  // Supported tools: list_interactive | click | fill | scroll
  if (message.action === 'pageAction') {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { sendResponse({ error: 'No active tab' }); return true; }

      const { tool, args } = message;
      const result = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: (t, a) => {
          // All primitives are defined in content.js via window._waldoTabsAction
          if (typeof window._waldoTabsAction !== 'function') {
            return { error: 'Content script not loaded. Try refreshing the page.' };
          }
          return window._waldoTabsAction(t, a);
        },
        args: [tool, args || {}]
      });
      sendResponse(result[0]?.result || { error: 'No result' });
    } catch (err) {
      sendResponse({ error: err.message });
    }
    return true;
  }

  // Ollama detection — popup.js / options.js call this to discover local Ollama
  // and list available models. Returns { detected: false, models: [] } on any error
  // so the popup can display a graceful "not found" state without throwing.
  if (message.action === 'detectOllama') {
    try {
      const resp = await fetch('http://localhost:11434/api/tags');
      if (resp.ok) {
        const data = await resp.json();
        const models = (data.models || []).map(m => m.name);
        sendResponse({ detected: true, models });
      } else {
        sendResponse({ detected: false, models: [] });
      }
    } catch {
      sendResponse({ detected: false, models: [] });
    }
    return true;
  }

  // Ollama model validation — popup.js calls this before saving a model selection.
  // Checks whether the named model is present in Ollama's installed models list.
  // Matches by exact name or name-without-tag (e.g. 'llama3.2' matches 'llama3.2:latest').
  if (message.action === 'testOllamaModel') {
    try {
      const resp = await fetch('http://localhost:11434/api/tags');
      if (resp.ok) {
        const data = await resp.json();
        const models = (data.models || []).map(m => m.name);
        const matched = models.some(
          name => name === message.model || name.startsWith(message.model + ':')
        );
        sendResponse(matched
          ? { ok: true }
          : { ok: false, error: `Model "${message.model}" not found in Ollama` }
        );
      } else {
        sendResponse({ ok: false, error: 'Ollama not reachable' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message || 'Connection failed' });
    }
    return true;
  }
});

// ─── Core Functions ────────────────────────────────────────────────────────────

async function updateTabCache(tabId, tab) {
  const key = String(tabId);
  if (tabCache.has(key)) {
    tabCache.get(key).url = tab.url;
    tabCache.get(key).title = tab.title;
    tabCache.get(key).lastActive = Date.now();
  } else {
    tabCache.set(key, {
      url: tab.url,
      title: tab.title,
      screenshot: null,
      summary: null,
      lastActive: Date.now(),
      discarded: false
    });
  }
  await persistTabCache();
}

async function prepareForDiscard(tab) {
  try {
    // Capture screenshot before discarding
    const screenshot = await browser.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 75
    });

    // Extract readable text via content script (Readability-powered)
    let rawText = '';
    try {
      const extractResult = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (typeof window._waldoTabsQuickExtract === 'function') {
            return window._waldoTabsQuickExtract(6000);
          }
          return document.body?.innerText?.substring(0, 6000) || '';
        }
      });
      rawText = extractResult[0]?.result || '';
    } catch (err) {
      console.warn('[WaldoTabs] Readability extraction failed, using innerText:', err);
      try {
        const fallback = await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.body?.innerText?.substring(0, 6000) || ''
        });
        rawText = fallback[0]?.result || '';
      } catch (_) {
        rawText = '';
      }
    }

    // Optionally summarize via API (OpenRouter / local Ollama / Waldo / Google Gemini)
    const settingsData = await browser.storage.local.get('settings');
    const settings = settingsData.settings || defaultSettings();
    let summary;
    if (settings._provider === 'google') {
      const token = await getGoogleAccessToken();
      if (token) {
        try {
          summary = await callModelGemini([
            { role: 'user', content: `Summarize this webpage in 1-2 sentences: ${rawText.substring(0, 3000)}` }
          ], settings, token);
        } catch { summary = rawText.substring(0, 500); }
      } else {
        summary = rawText.substring(0, 500);
      }
    } else {
      summary = settings.apiEndpoint
        ? await summarizeViaApi(rawText, settings)
        : rawText.substring(0, 500); // fallback: first 500 chars
    }

    tabCache.set(String(tab.id), {
      url: tab.url,
      title: tab.title,
      screenshot,
      summary,
      lastActive: tabCache.get(String(tab.id))?.lastActive || Date.now(),
      discarded: true
    });
    await persistTabCache(); // v0.2.0: persist after every discard

    await browser.tabs.discard(tab.id);
    console.log(`[WaldoTabs] Discarded: ${tab.title}`);

  } catch (err) {
    console.error('[WaldoTabs] Failed to prepare tab:', tab.title, err);
  }
}

// ─── Unified model caller ─────────────────────────────────────────────────────

// OpenAI-compatible — works with OpenRouter, Ollama, llama.cpp, WaldoAI, OpenAI, etc.
async function callModel(messages, settings, { maxTokens = 500 } = {}) {
  const resp = await fetch(`${settings.apiEndpoint}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiKey ? { 'Authorization': `Bearer ${settings.apiKey}` } : {})
    },
    body: JSON.stringify({
      model: settings.model || 'gpt-4o-mini',
      messages,
      max_tokens: maxTokens
    })
  });
  if (!resp.ok) throw new Error(`API error ${resp.status}`);
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from model');
  return content;
}

// Google Gemini — separate path (different auth + endpoint shape)
async function callModelGemini(messages, settings, accessToken) {
  const userContent = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n');
  const systemPrompt = messages.find(m => m.role === 'system')?.content || '';
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userContent}` : userContent;

  const model = encodeURIComponent(settings.model || 'gemini-2.0-flash');
  const resp = await fetch(
    `${settings.apiEndpoint}/v1beta3/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`  // OAuth token in header, never in URL
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { maxOutputTokens: 500 }
      })
    }
  );
  if (!resp.ok) throw new Error(`Gemini error ${resp.status}`);
  const data = await resp.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty Gemini response');
  return content;
}

// Dispatch to the right caller based on saved settings
async function callWithSavedSettings(messages, opts = {}) {
  const settingsData = await browser.storage.local.get('settings');
  const settings = settingsData.settings || defaultSettings();
  if (!settings.apiEndpoint) throw new Error('No AI provider configured. Open Settings to set one up.');

  if (settings._provider === 'google') {
    const token = await getGoogleAccessToken();
    if (!token) throw new Error('Google not connected. Open Settings and connect your Google account.');
    return callModelGemini(messages, settings, token);
  }
  return callModel(messages, settings, opts);
}

async function summarizeViaApi(text, settings) {
  // Thin wrapper — delegates to callModel so summarisation stays in sync
  try {
    return await callModel([
      { role: 'system', content: 'Summarize this webpage content in 1-2 sentences.' },
      { role: 'user',   content: text.substring(0, 4000) }
    ], settings, { maxTokens: 100 });
  } catch {
    return text.substring(0, 500);
  }
}

function shouldDiscard(tab, settings) {
  const cached = tabCache.get(String(tab.id));
  if (!cached) return false;
  const idleMs = (settings.idleMinutes || 30) * 60 * 1000;
  return Date.now() - cached.lastActive > idleMs;
}

function defaultSettings() {
  return {
    apiEndpoint: '',
    apiKey: '',
    model: 'gpt-4o-mini',
    idleMinutes: 30,
    autoOptimize: false
  };
}

// ─── Auto-Optimization Loop ──────────────────────────────────────────────────────

// Fires every 5 minutes when autoOptimize is enabled.
// v0.2.0: also re-loads cache from storage first in case worker was suspended.
setInterval(async () => {
  // Re-hydrate from storage in case worker was killed since last interval
  await loadTabCache();

  const settingsData = await browser.storage.local.get('settings');
  const settings = settingsData.settings || defaultSettings();
  if (!settings.autoOptimize) return;

  const tabs = await browser.tabs.query({ active: false, discarded: false });
  for (const tab of tabs) {
    if (tab.id && shouldDiscard(tab, settings)) {
      await prepareForDiscard(tab);
    }
  }
}, 5 * 60 * 1000);

// ─── OAuth Bridge (Google AI / Gemini) ─────────────────────────────────────────

const OAUTH_CONFIG = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: 'YOUR_GOOGLE_OAUTH_CLIENT_ID', // TODO: Replace with real client ID from Google Cloud Console
    scopes: 'https://www.googleapis.com/auth/generative-language.retriever',
  }
};

function getOAuthRedirectUri() {
  return browser.identity.getRedirectURL();
}

async function initiateGoogleOAuth() {
  const config = OAUTH_CONFIG.google;
  const redirectUri = getOAuthRedirectUri();

  const authUrl = new URL(config.authUrl);
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', config.scopes);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  try {
    const responseUrl = await browser.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true
    });

    const params = new URL(responseUrl);
    const code = params.searchParams.get('code');
    if (!code) throw new Error('No authorization code returned');

    const tokenData = await exchangeCodeForToken(code, redirectUri);

    await browser.storage.session.set({
      'oauth_google_access_token': tokenData.access_token,
      'oauth_google_refresh_token': tokenData.refresh_token,
      'oauth_google_expiry': Date.now() + (tokenData.expires_in * 1000),
      'oauth_google_connected': true
    });

    return { success: true, provider: 'google' };
  } catch (err) {
    console.error('[WaldoTabs] Google OAuth failed:', err);
    return { success: false, error: err.message, provider: 'google' };
  }
}

async function exchangeCodeForToken(code, redirectUri) {
  const config = OAUTH_CONFIG.google;
  const resp = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Token exchange failed: ${err.error_description || resp.status}`);
  }
  return resp.json();
}

async function getGoogleAccessToken() {
  const stored = await browser.storage.session.get([
    'oauth_google_access_token',
    'oauth_google_refresh_token',
    'oauth_google_expiry',
    'oauth_google_connected'
  ]);

  if (!stored.oauth_google_connected) return null;

  // Refresh if within 5 minutes of expiry
  const fiveMin = 5 * 60 * 1000;
  if (stored.oauth_google_expiry - Date.now() < fiveMin) {
    try {
      const resp = await fetch(OAUTH_CONFIG.google.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: OAUTH_CONFIG.google.clientId,
          refresh_token: stored.oauth_google_refresh_token,
          grant_type: 'refresh_token'
        })
      });
      const data = await resp.json();
      await browser.storage.session.set({
        'oauth_google_access_token': data.access_token,
        'oauth_google_expiry': Date.now() + (data.expires_in * 1000)
      });
      return data.access_token;
    } catch {
      return stored.oauth_google_access_token;
    }
  }
  return stored.oauth_google_access_token;
}

async function getOAuthStatus() {
  const stored = await browser.storage.session.get('oauth_google_connected');
  return { google: stored.oauth_google_connected || false };
}

async function disconnectGoogle() {
  await browser.storage.session.remove([
    'oauth_google_access_token',
    'oauth_google_refresh_token',
    'oauth_google_expiry',
    'oauth_google_connected'
  ]);
  return { success: true };
}

async function summarizeViaGoogleGemini(text, apiEndpoint, accessToken) {
  try {
    const resp = await fetch(`${apiEndpoint}/v1beta3/models/gemini-2.0-flash:generateContent?key=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Summarize this in 1-2 sentences: ${text.substring(0, 3000)}` }] }],
        generationConfig: { maxOutputTokens: 100 }
      })
    });
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || text.substring(0, 500);
  } catch {
    return text.substring(0, 500);
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
// Initial load on first script execution (onStartup may not fire if worker already running)
loadTabCache();
