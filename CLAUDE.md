# Waldo Tabs — Project Context

Firefox/Zen Browser extension. Agentic tab conductor with resource tracking, hibernation,
AI automation, and puzzle solving. Designed for local-first research workflows. Target: GitHub FOSS publish.

## Planning and Roadmap
See `~/Documents/Waldo/Wiki/projects/waldo-tabs/roadmap.md` for full roadmap, sprint state,
and architecture decisions. The Wiki is the source of truth for all planning — this file is
identity + conventions only.

## Architecture
- **Manifest V3**, Firefox WebExtensions API
- Background service worker (`background.js`) handles all tab monitoring and API calls
- Popup (`popup.html` / `popup.js`) for manual control and settings
- Agentic: content scripts for form fill/click/puzzle solving, Native Msg for Waldo bridge
- API input: OpenAI-compatible `POST /v1/chat/completions` — works with OpenRouter, Ollama,
  llama.cpp server, and Waldo's `/v1/chat/completions` endpoint

## v0.1.1 State
- Hibernation (discard + screenshot + summary) ✅
- Popup UI (settings, optimize buttons) ✅
- Agentic orchestration (TODO v0.2.0)
- Resource tracking (TODO v0.2.0)
- Native Msg host (TODO v0.2.0)

## Commit Convention
- Format: `vX.Y.Z - Short description`
- Independent git repo — not part of WaldoAI versioning
- Co-authored commits: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

## Shared-State Discipline
After any significant task or session:
1. Append to `~/Documents/Waldo/Wiki/log.md`:
   `## [YYYY-MM-DD] claude | action | waldo-tabs — subject`
2. Update `Wiki/projects/waldo-tabs/roadmap.md` if sprint state changed
3. Update `Wiki/sprint.md` task status (⚪ → 🔵 when starting, 🔵 → ✅ when done)
4. Update `Wiki/project-index.md` `updated:` date if any source-of-truth file moved

## Files to Watch (do NOT commit)
- `*.xpi`, `*.zip`, `.web-ext-artifacts/`
- Any file containing API keys
