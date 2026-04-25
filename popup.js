// popup.js
const status = document.getElementById('status');
const cacheCount = document.getElementById('cacheCount');

function setStatus(msg, type = '') {
  status.textContent = msg;
  status.className = type;
}

async function loadSettings() {
  const settings = await browser.runtime.sendMessage({ action: 'getSettings' });
  document.getElementById('apiEndpoint').value = settings.apiEndpoint || '';
  document.getElementById('apiKey').value = settings.apiKey || '';
  document.getElementById('model').value = settings.model || '';
  document.getElementById('idleMinutes').value = settings.idleMinutes || 30;
  document.getElementById('autoOptimize').checked = settings.autoOptimize || false;
}

async function updateCacheCount() {
  // v0.2.0: request fresh persisted state from background.js
  const resp = await browser.runtime.sendMessage({ action: 'loadPersistedCache' });
  cacheCount.textContent = resp.cache.length;
}

document.getElementById('optimizeAll').addEventListener('click', async () => {
  setStatus('Optimizing...');
  const tabs = await browser.tabs.query({ active: false, discarded: false });
  let count = 0;
  for (const tab of tabs) {
    await browser.runtime.sendMessage({ action: 'optimizeTab', tabId: tab.id });
    count++;
  }
  setStatus(`Optimized ${count} tab(s).`, 'ok');
  await updateCacheCount();
});

document.getElementById('optimizeCurrent').addEventListener('click', async () => {
  setStatus('Optimizing current tab...');
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    await browser.runtime.sendMessage({ action: 'optimizeTab', tabId: tab.id });
    setStatus('Tab optimized.', 'ok');
    await updateCacheCount();
  }
});

document.getElementById('viewCache').addEventListener('click', async () => {
  const resp = await browser.runtime.sendMessage({ action: 'loadPersistedCache' });
  const cache = resp.cache;
  console.log('[WaldoTabs] Cache:', cache);
  const active = cache.filter(([, v]) => !v.discarded).length;
  const discarded = cache.filter(([, v]) => v.discarded).length;
  setStatus(`${active} active, ${discarded} discarded tab(s). See console for details.`);
});

document.getElementById('saveSettings').addEventListener('click', async () => {
  const settings = {
    apiEndpoint: document.getElementById('apiEndpoint').value.trim(),
    apiKey: document.getElementById('apiKey').value.trim(),
    model: document.getElementById('model').value.trim() || 'gpt-4o-mini',
    idleMinutes: parseInt(document.getElementById('idleMinutes').value) || 30,
    autoOptimize: document.getElementById('autoOptimize').checked
  };
  await browser.runtime.sendMessage({ action: 'saveSettings', settings });
  setStatus('Settings saved.', 'ok');
});

// Init: load persisted cache so popup shows correct state even after worker restart
loadSettings();
updateCacheCount();