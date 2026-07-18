// lib/observability.js — browser-safe logger + ops events for WaldoTabs
//
// Service workers and extension pages cannot use node:fs. This module is loaded
// before background/popup/sidebar/options scripts (see manifest + HTML).
//
// API (globalThis):
//   WaldoTabsLogger(name) — console logger with [WaldoTabs:name] prefix
//   waldoTabsEmitEvent(code, { job, severity, message, ...fields })
//     → ring buffer in browser.storage.local under key "waldoTabsEvents"
//     Never throws. Keeps last MAX_EVENTS records.

(function (global) {
  'use strict';

  const MAX_EVENTS = 200;
  const STORAGE_KEY = 'waldoTabsEvents';

  // Finite catalog — unknown codes still write (one-time console warn).
  const EVENT_CODES = new Set([
    'JOB_START', 'JOB_END', 'JOB_FAIL',
    'TAB_DISCARD_OK', 'TAB_DISCARD_FAIL',
    'SUMMARY_OK', 'SUMMARY_FAIL',
    'STORAGE_FAIL', 'OAUTH_FAIL', 'API_FAIL',
    'HIBERNATE_SWEEP',
  ]);
  const _unknownWarned = new Set();

  class WaldoTabsLogger {
    constructor(name) {
      this._prefix = `[WaldoTabs:${name}]`;
    }
    debug(msg, ...args) { console.debug(this._prefix, msg, ...args); }
    info(msg, ...args)  { console.log(this._prefix, msg, ...args); }
    warn(msg, ...args)  { console.warn(this._prefix, msg, ...args); }
    error(msg, ...args) { console.error(this._prefix, msg, ...args); }
  }

  /**
   * Append one structured ops event to storage ring buffer. Never throws.
   * @param {string} eventCode
   * @param {{ job?: string, severity?: string, message?: string, [k: string]: any }} opts
   */
  function waldoTabsEmitEvent(eventCode, opts = {}) {
    try {
      const code = String(eventCode || 'UNKNOWN');
      if (!EVENT_CODES.has(code) && !_unknownWarned.has(code)) {
        _unknownWarned.add(code);
        console.warn('[WaldoTabs:events] unknown event_code', code, '(still writing)');
      }
      const record = {
        ts: new Date().toISOString(),
        job: opts.job || 'extension',
        severity: (opts.severity || 'INFO').toUpperCase(),
        event_code: code,
        message: opts.message || '',
      };
      for (const [k, v] of Object.entries(opts)) {
        if (k === 'job' || k === 'severity' || k === 'message') continue;
        if (v !== undefined && v !== null) record[k] = v;
      }

      const browserApi = global.browser || global.chrome;
      if (!browserApi?.storage?.local) {
        // Fallback when storage unavailable (tests / non-extension)
        if (!global.__waldoTabsEventsMem) global.__waldoTabsEventsMem = [];
        global.__waldoTabsEventsMem.push(record);
        if (global.__waldoTabsEventsMem.length > MAX_EVENTS) {
          global.__waldoTabsEventsMem.splice(0, global.__waldoTabsEventsMem.length - MAX_EVENTS);
        }
        return;
      }

      browserApi.storage.local.get(STORAGE_KEY).then((stored) => {
        const prev = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
        prev.push(record);
        const next = prev.length > MAX_EVENTS ? prev.slice(-MAX_EVENTS) : prev;
        return browserApi.storage.local.set({ [STORAGE_KEY]: next });
      }).catch((err) => {
        console.warn('[WaldoTabs:events] storage write failed', err);
      });
    } catch (err) {
      console.warn('[WaldoTabs:events] emit failed', err);
    }
  }

  global.WaldoTabsLogger = WaldoTabsLogger;
  global.waldoTabsEmitEvent = waldoTabsEmitEvent;
  global.WALDO_TABS_EVENT_CODES = EVENT_CODES;
  global.WALDO_TABS_EVENTS_KEY = STORAGE_KEY;
})(typeof globalThis !== 'undefined' ? globalThis : this);
