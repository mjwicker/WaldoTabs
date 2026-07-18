// logging_utils.js — Node-side session logging + ops events for WaldoTabs
//
// Extension pages use lib/observability.js (console + storage). This module is
// for Node tests and any future native/CLI helpers (node:fs).
//
// Usage:
//   const { WaldoTabsLogger, emitEvent } = require("./logging_utils.js");
//   const logger = new WaldoTabsLogger("session");
//   logger.setFile("/path/to/session.log");
//   emitEvent("TAB_DISCARD_FAIL", { job: "hibernate", severity: "ERROR", message: "..." });

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const LOG_LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };

const REPO = path.resolve(__dirname);
const EVENTS_PATH = path.join(REPO, "waldotabs_data", "logs", "events.jsonl");

const EVENT_CODES = new Set([
  "JOB_START", "JOB_END", "JOB_FAIL",
  "TAB_DISCARD_OK", "TAB_DISCARD_FAIL",
  "SUMMARY_OK", "SUMMARY_FAIL",
  "STORAGE_FAIL", "OAUTH_FAIL", "API_FAIL",
  "HIBERNATE_SWEEP",
]);

const _unknownWarned = new Set();

class WaldoTabsLogger {
  constructor(name, level = "INFO") {
    this._name = `waldotabs.${name}`;
    this._level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    this._filePath = null;
    this._stream = null;
  }

  setFile(filePath) {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      this._filePath = filePath;
      // Touch file so exists immediately for tests/readers
      if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, "", "utf8");
    } catch {
      this._filePath = null;
    }
  }

  setLevel(level) {
    this._level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
  }

  _write(levelName, msg) {
    if ((LOG_LEVELS[levelName] ?? 0) < this._level) return;
    if (!this._filePath) return;
    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, "Z").slice(0, 19);
    const line = `${ts} [${levelName}] ${this._name}: ${msg}\n`;
    try {
      fs.appendFileSync(this._filePath, line, "utf8");
    } catch {
      // never throw from logger
    }
  }

  debug(msg) { this._write("DEBUG", msg); }
  info(msg)  { this._write("INFO",  msg); }
  warn(msg)  { this._write("WARN",  msg); }
  error(msg) { this._write("ERROR", msg); }

  close() {
    this._filePath = null;
  }
}

/**
 * Append one JSON event line. Never throws.
 * @param {string} eventCode
 * @param {{ job: string, severity?: string, message?: string, path?: string, [k: string]: any }} opts
 */
function emitEvent(eventCode, opts = {}) {
  try {
    const code = String(eventCode || "UNKNOWN");
    if (!EVENT_CODES.has(code) && !_unknownWarned.has(code)) {
      _unknownWarned.add(code);
      console.warn(`Warning: unknown event_code ${JSON.stringify(code)} (still writing)`);
    }
    const record = {
      ts: new Date().toISOString(),
      host: (() => { try { return os.hostname(); } catch { return "unknown"; } })(),
      job: opts.job || "node",
      severity: (opts.severity || "INFO").toUpperCase(),
      event_code: code,
      message: opts.message || "",
    };
    for (const [k, v] of Object.entries(opts)) {
      if (["job", "severity", "message", "path"].includes(k)) continue;
      if (v !== undefined && v !== null) record[k] = v;
    }
    const target = opts.path || EVENTS_PATH;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.warn(`Warning: Could not write event ${JSON.stringify(eventCode)}:`, err);
  }
}

module.exports = {
  WaldoTabsLogger,
  emitEvent,
  EVENT_CODES,
  EVENTS_PATH,
};
