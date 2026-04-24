// background.js — service worker (brain of the extension)
// tabCache: tabId -> {url, title, screenshot, summary, lastActive, discarded}
let tabCache = new Map();

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url?.startsWith("http")) {
    updateTabCache(tabId, tab);
  }
});

browser.tabs.onActivated.addListener(({ tabId }) => {
  if (tabCache.has(tabId)) {
    tabCache.get(tabId).lastActive = Date.now();
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  tabCache.delete(tabId);
});

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "optimizeTab") {
    const tab = await browser.tabs.get(message.tabId);
    await prepareForDiscard(tab);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "wakeTab") {
    await browser.tabs.reload(message.tabId);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "getCachedState") {
    sendResponse({ cache: Array.from(tabCache.entries()) });
    return true;
  }

  if (message.action === "getSettings") {
    const settings = await browser.storage.local.get("settings");
    sendResponse(settings.settings || defaultSettings());
    return true;
  }

  if (message.action === "saveSettings") {
    await browser.storage.local.set({ settings: message.settings });
    sendResponse({ success: true });
    return true;
  }
});

async function updateTabCache(tabId, tab) {
  if (tabCache.has(tabId)) {
    tabCache.get(tabId).url = tab.url;
    tabCache.get(tabId).title = tab.title;
  } else {
    tabCache.set(tabId, {
      url: tab.url,
      title: tab.title,
      screenshot: null,
      summary: null,
      lastActive: Date.now(),
      discarded: false
    });
  }
}

async function prepareForDiscard(tab) {
  try {
    // Capture screenshot before discarding
    const screenshot = await browser.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
      quality: 75
    });

    // Extract readable text via content script
    const textResults = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.body?.innerText?.substring(0, 6000) || ""
    });
    const rawText = textResults[0]?.result || "";

    // Optionally summarize via API (OpenRouter / local Ollama / Waldo endpoint)
    const settings = await browser.storage.local.get("settings");
    const summary = settings.settings?.apiEndpoint
      ? await summarizeViaApi(rawText, settings.settings)
      : rawText.substring(0, 500); // fallback: first 500 chars

    tabCache.set(tab.id, {
      url: tab.url,
      title: tab.title,
      screenshot,
      summary,
      lastActive: tabCache.get(tab.id)?.lastActive || Date.now(),
      discarded: true
    });

    await browser.tabs.discard(tab.id);
    console.log(`[TabOptimizer] Discarded: ${tab.title}`);

  } catch (err) {
    console.error("[TabOptimizer] Failed to prepare tab:", tab.title, err);
  }
}

async function summarizeViaApi(text, settings) {
  // OpenAI-compatible endpoint — works with OpenRouter, Ollama, or Waldo /v1/chat/completions
  try {
    const resp = await fetch(`${settings.apiEndpoint}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(settings.apiKey ? { "Authorization": `Bearer ${settings.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: settings.model || "gpt-4o-mini",
        messages: [
          { role: "system", content: "Summarize this webpage content in 1-2 sentences." },
          { role: "user", content: text.substring(0, 4000) }
        ],
        max_tokens: 100
      })
    });
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || text.substring(0, 500);
  } catch {
    return text.substring(0, 500);
  }
}

function shouldDiscard(tab, settings) {
  const cached = tabCache.get(tab.id);
  if (!cached) return false;
  const idleMs = (settings.idleMinutes || 30) * 60 * 1000;
  return Date.now() - cached.lastActive > idleMs;
}

function defaultSettings() {
  return {
    apiEndpoint: "",   // e.g. "http://localhost:11434" (Ollama) or "https://openrouter.ai/api"
    apiKey: "",
    model: "gpt-4o-mini",
    idleMinutes: 30,
    autoOptimize: false
  };
}

// Auto-optimization loop (fires when autoOptimize is enabled)
setInterval(async () => {
  const settingsData = await browser.storage.local.get("settings");
  const settings = settingsData.settings || defaultSettings();
  if (!settings.autoOptimize) return;

  const tabs = await browser.tabs.query({ active: false, discarded: false });
  for (const tab of tabs) {
    if (tab.id && shouldDiscard(tab, settings)) {
      await prepareForDiscard(tab);
    }
  }
}, 5 * 60 * 1000); // check every 5 minutes
