# WaldoTabs Observability

How to watch the extension plant — console logs, storage events, Node test logs.

Ops traffic stays **in-project**. `Wiki/log.md` is for agent/dev work only.

See: `Wiki/concepts/logging-and-observability.md`.

---

## Lanes

| Lane | Path / surface | Role |
|------|----------------|------|
| **Browser console** | DevTools for background / popup / sidebar | Human live debug (`[WaldoTabs:name]` prefix) |
| **Events spine (browser)** | `browser.storage.local` key `waldoTabsEvents` | Ring buffer (last ~200 JSON events) |
| **Events spine (Node)** | `waldotabs_data/logs/events.jsonl` | Tests / Node helpers only (gitignored) |
| **Domain state** | `browser.storage.local` (`tabCache`, settings) | Product data — not the ops bus |
| **Wiki** | `Wiki/log.md` | Agent/dev only |

---

## Modules

| File | Environment | API |
|------|-------------|-----|
| `lib/observability.js` | Extension (background, pages) | `WaldoTabsLogger`, `waldoTabsEmitEvent` |
| `logging_utils.js` | Node tests | `WaldoTabsLogger` (file), `emitEvent` |

Load order: `lib/observability.js` before page scripts (manifest + HTML).

---

## Debug order

1. Browser console (filter `WaldoTabs`)  
2. Storage events — Application → Extension Storage → `waldoTabsEvents`  
3. Reproduce with `npm test` if Node path involved  
4. Domain: `tabCache` / settings in storage  

```js
// In background DevTools console:
browser.storage.local.get('waldoTabsEvents').then(console.log)
```

---

## Event codes

`JOB_*`, `TAB_DISCARD_OK` / `TAB_DISCARD_FAIL`, `SUMMARY_OK` / `SUMMARY_FAIL`,  
`STORAGE_FAIL`, `OAUTH_FAIL`, `API_FAIL`, `HIBERNATE_SWEEP`

Schema: `ts`, `job`, `severity`, `event_code`, `message` (+ optional fields).

**Contract:** emit never throws.

---

## Who emits what

| Surface | Events |
|---------|--------|
| `background.js` discard / summary / OAuth paths | `TAB_DISCARD_*`, `SUMMARY_*`, `OAUTH_FAIL`, `API_FAIL` |

---

## Anti-patterns

| Avoid | Prefer |
|-------|--------|
| Silent `catch {}` | `logger.error` + emit on fail paths |
| Node `logging_utils` in service worker | `lib/observability.js` only |
| Ops spam in Wiki | storage events / console |
