# Waldo Tabs

**Agentic tab conductor for Firefox — hibernate inactive tabs, summarize with AI, reclaim RAM.**

> A Firefox/Zen Browser extension that hibernates inactive tabs while preserving their content via screenshot and text summary. Designed for research workflows on memory-constrained hardware. Powered by local or cloud AI — no data leaves your machine unless you configure it.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-0.3.4-purple)](#)

---

## What It Does

- **Hibernates inactive tabs** — uses `browser.tabs.discard()` to free RAM while keeping the tab visible in the tab bar
- **Captures before discarding** — screenshot (PNG) + readable text extracted before each discard
- **AI summaries** — optionally sends text to any OpenAI-compatible endpoint for a 1-2 sentence summary
- **On-demand wake** — reload any discarded tab from the popup
- **Auto-optimize mode** — background loop discards tabs idle beyond your threshold (default 30 min)
- **Persistent cache** — tab state survives service worker restarts (v0.2.0+)

> Tab count got you to 8GB of RAM? Waldo Tabs is built for exactly that.

---

## Installation (Development)

1. Install [web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/):
   ```bash
   npm install -g web-ext
   ```

2. Run in Firefox:
   ```bash
   web-ext run
   ```

3. Or load manually: open `about:debugging` -> "This Firefox" -> "Load Temporary Add-on" -> select `manifest.json`

---

## Configuration

Open the extension popup and set:

| Field | Description | Example |
|-------|-------------|---------|
| API Endpoint | Any OpenAI-compatible server | `http://localhost:11434` (Ollama) |
| API Key | Bearer token (optional for local) | `sk-...` or leave blank |
| Model | Model ID for summarization | `gpt-4o-mini`, `llama3.2`, `qwen3` |
| Idle threshold | Minutes before auto-discard | `30` |
| Auto-optimize | Enable background loop | toggle |

**Works with:** OpenRouter, Ollama, llama.cpp server, and any OpenAI-compatible API. Waldo `/v1/chat/completions` drop-in.

---

## AI Provider Setup

### Google AI (Gemini) — OAuth (one-click)
OAuth via browser-native flow — no API key needed. Works on Firefox 78+.
> Setup: Click "Connect Google AI" in the provider card. Sign in with your Google account.

### OpenAI / Anthropic / Mistral / OpenRouter — API Key
Paste your API key into the Bearer Token field. Key is stored locally and never sent anywhere but your configured endpoint.

### Ollama (Local, Free) — Zero Cost
Runs entirely on your machine — no internet, no API key, no cost.
1. Install [Ollama](https://ollama.com/download)
2. Download a model: `ollama pull llama3.2`
3. Waldo Tabs auto-detects Ollama at `http://localhost:11434`

---

## Project Structure

```
WaldoTabs/
├── manifest.json     Extension manifest (Manifest V3)
├── background.js    Service worker — tab monitoring, discard, API calls, cache
├── popup.html       Extension popup UI
├── popup.js         Popup event handlers
├── icons/           Extension icons (48px + 128px)
└── (future)
    ├── content.js      Content script — Readability extraction
    └── native-host/    Native messaging host — Waldo agent bridge
```

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| **v0.3.4** | 2026-07-18 | Observability wiring (browser + Node event logging, `OBSERVABILITY.md`) and v1.0 publish prep (README FAQ, clean CSP audit). |
| **v0.3.3** | 2026-07-02 | Fix `list_interactive` giving the model zero page-identity info (no title/URL), which caused it to hallucinate a site guess instead of saying it didn't know. Add a `read_content` agentic tool so the model can read page text on demand without requiring "Use this page" to be toggled first. |
| **v0.3.2** | 2026-07-02 | Fix background.js message-passing (async listener + sendResponse mismatch was silently returning `true` instead of real responses), Settings-page slider width, inline per-card connection error messages, sidebar provider chip live-updating across tabs, and default OpenRouter model (was hitting free-tier rate limits). Add Ollama pull-now button + `ollama://` deep-link. |
| **v0.3.1** | 2026-06-24 | Fix `manifest.json` `data_collection_permissions` nesting for Firefox AMO (T-TABS-MANIFEST-1). |
| **v0.3.0** | 2026-06-06 | Sidebar chat, agentic page actions (click/fill via content scripts), full settings page, live model wiring, E2E CI. |
| **v0.2.0** | 2026-04-25 | Cache persistence (survives worker restart). Improved popup state. |
| **v0.1.1** | 2026-04-24 | Initial release — hibernation + screenshot + AI summarization |

---

## Privacy

- Nothing leaves your machine unless you configure an external API endpoint
- API keys are stored only in `browser.storage.local` (your browser profile)
- OAuth tokens (when supported) are stored in `browser.storage.session` (cleared on close)
- No telemetry, no analytics, no third-party scripts

---

## FAQ

**Which browsers are supported?**
Firefox and Zen Browser for v1.0 (Manifest V3, `browser.*` APIs). Chrome/Chromium is a future milestone, not yet supported.

**Do I need an AI provider configured to use it?**
No — tab hibernation, screenshot capture, and text extraction all work with no provider configured. AI summaries and agentic page actions (click/fill/read) require one.

**Why does it ask for access to all sites (`<all_urls>`)?**
Hibernation needs to capture a screenshot and extract readable text from whatever tab you're discarding, and agentic actions need to interact with whatever page you're on — both work on arbitrary sites, so the permission is broad by necessity. Nothing is sent anywhere unless you've configured an AI provider, and even then only the specific text/action you trigger is sent, never a background crawl.

**What happens to my discarded tabs if the browser or extension restarts?**
Tab state (screenshot + summary) is cached and survives service worker restarts (since v0.2.0), so a discarded tab still shows its captured content after a restart.

**Is my API key safe?**
It's stored only in `browser.storage.local`, scoped to your browser profile, and only sent to the endpoint you configured — never to Waldo or any third party.

**How do I uninstall / revoke access?**
Remove the extension from `about:addons` like any other Firefox add-on. This also clears its local storage (cached tab state, settings, keys).

---

## Roadmap

See [Wiki/projects/waldo-tabs/roadmap.md](Wiki/projects/waldo-tabs/roadmap.md) for full roadmap:
- v1.0: Provider card UI + OAuth + Ollama wizard + AMO submission
- v1.1: Native messaging to Waldo agent + workflow engine + agentic tab ranking
- v2.0: Chromium port + managed backend

---

## Contributing

Pull requests welcome. See `CLAUDE.md` for architecture context and coding conventions.

---

## License

MIT — open source, self-hostable, no cloud required.
