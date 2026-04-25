# Waldo Tabs

**Agentic tab conductor for Firefox — hibernate inactive tabs, summarize with AI, reclaim RAM.**

> A Firefox/Zen Browser extension that hibernates inactive tabs while preserving their content via screenshot and text summary. Designed for research workflows on memory-constrained hardware. Powered by local or cloud AI — no data leaves your machine unless you configure it.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-0.2.0-purple)](#)

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
| **v0.2.0** | 2026-04-25 | Cache persistence (survives worker restart). Improved popup state. |
| **v0.1.1** | 2026-04-24 | Initial release — hibernation + screenshot + AI summarization |

---

## Privacy

- Nothing leaves your machine unless you configure an external API endpoint
- API keys are stored only in `browser.storage.local` (your browser profile)
- OAuth tokens (when supported) are stored in `browser.storage.session` (cleared on close)
- No telemetry, no analytics, no third-party scripts

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
