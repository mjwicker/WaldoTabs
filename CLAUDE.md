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

## Test Discipline

Every new behavior added in a roadmap task ships with at least one `*.unit.test.js` test.
CI (GitHub Actions) must be green before marking any task ✅.

- Test runner: `npm test` (Node built-in `node:test`, no external test framework)
- Harness: `tests/helpers/browserMock.js` + `tests/helpers/loadBackground.js`
- Naming: `*.smoke.test.js` (syntax/manifest) vs `*.unit.test.js` (behavior)
- See `tests/README.md` for how to add tests for new features

Key pattern for new tests:
```js
const { installBrowserMock } = require('./helpers/browserMock');
const { loadBackground, sendMessage } = require('./helpers/loadBackground');
// create fresh mock per test, never share state
```

## Protected Files (Haiku may not touch — Sonnet handles directly)
- `manifest.json` — MV3 manifest; malformed JSON silently breaks the extension
- `background.js` — service worker; high blast radius, all tab logic runs here
- `tests/helpers/browserMock.js` — shared test infrastructure; one bug breaks the entire suite
- `tests/helpers/loadBackground.js` — shared test harness loader

## Commit Convention
- Format: `vX.Y.Z - Short description`
- Independent git repo — not part of WaldoAI versioning
- Co-authored commits: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

### Before Every Commit
1. Update `Wiki/projects/waldo-tabs/changelog.md` — new entry at top (ADDED/FIXED/CHANGED/REMOVED + WHY); explain why changes were made, not just what changed
2. Stage changelog + code in one commit
3. Append to `Wiki/log.md`: `## [YYYY-MM-DD] claude | commit | waldo-tabs — vX.Y.Z description`
4. Update `Wiki/sprint.md` task status if applicable (🔵 → ✅)

Do NOT report a task as complete until the changelog entry is staged.

## Shared-State Discipline
After any significant task or session:
1. Append to `~/Documents/Waldo/Wiki/log.md`:
   `## [YYYY-MM-DD] claude | action | waldo-tabs — subject`
2. Update `Wiki/projects/waldo-tabs/roadmap.md` if sprint state changed
3. Update `Wiki/sprint.md` task status (⚪ → 🔵 when starting, 🔵 → ✅ when done)
4. Update `Wiki/project-index.md` `updated:` date if any source-of-truth file moved

## Key Claims

These are verifiable code-state facts. `doc-check` runs each command and reports VERIFIED or WRONG.

| Claim | Verify with |
|-------|-------------|
| Extension version is reflected in both `manifest.json` and `package.json` | `grep '"version"' manifest.json package.json` — both values must match |
| Extension manifest exists at repo root | `test -f manifest.json` |
| Background script file exists | `test -f background.js` |
| Content script file exists | `test -f content.js` |
| Popup files exist | `test -f popup.html && test -f popup.js` |
| Test suite has at least one unit test | `ls tests/*.unit.test.js` — must return ≥1 file |
| Test helpers exist (harness not broken) | `test -f tests/helpers/browserMock.js && test -f tests/helpers/loadBackground.js` |

## Files to Watch (do NOT commit)
- `*.xpi`, `*.zip`, `.web-ext-artifacts/`
- Any file containing API keys
