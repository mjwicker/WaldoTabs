# Tab Agent Memory Optimizer

A Firefox/Zen Browser extension that hibernates inactive tabs while preserving their content via screenshot and text summary. Designed for research workflows on memory-constrained hardware.

> **Status:** Alpha (v0.1.0). Core tab hibernation works. AI summarization requires an API endpoint (see Configuration).

---

## What It Does

- **Hibernates inactive tabs** — uses `browser.tabs.discard()` to free RAM while keeping the tab visible in the tab bar
- **Captures before discarding** — screenshot (PNG) + readable text extracted before each discard
- **AI summaries** — optionally sends text to any OpenAI-compatible endpoint for a 1-2 sentence summary
- **On-demand wake** — reload any discarded tab from the popup
- **Auto-optimize mode** — background loop discards tabs idle beyond your threshold (default 30 min)

---

## Installation (Development)

1. Install [web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/):
   ```
   npm install -g web-ext
   ```

2. Run in Firefox:
   ```
   web-ext run
   ```

3. Or load manually: open `about:debugging` → "This Firefox" → "Load Temporary Add-on" → select `manifest.json`

---

## Configuration

Open the extension popup and set:

| Field | Description | Example |
|---|---|---|
| API Endpoint | Any OpenAI-compatible server | `http://localhost:11434` (Ollama) |
| API Key | Bearer token (optional for local) | `sk-...` or leave blank |
| Model | Model ID for summarization | `gpt-4o-mini`, `llama3.2`, `qwen3` |
| Idle threshold | Minutes before auto-discard | `30` |
| Auto-optimize | Enable background loop | toggle |

Works with: **OpenRouter**, **Ollama**, **llama.cpp server**, and eventually **Waldo** (`/v1/chat/completions` drop-in).

---

## Project Structure

```
manifest.json    Extension manifest (Manifest V3)
background.js    Service worker — tab monitoring, discard logic, API calls
popup.html       Extension popup UI
popup.js         Popup event handlers
```

---

## License

MIT — open source, self-hostable, no cloud required.
