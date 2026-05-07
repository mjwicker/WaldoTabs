// logging_utils.js — stdlib-only session logging for WaldoTabs (node:fs, node:path)
//
// Usage:
//   const { WaldoTabsLogger } = require("./logging_utils.js");
//   const logger = new WaldoTabsLogger("session");
//   logger.setFile("/path/to/session.log");
//   logger.info("Extension connected");

const fs = require("node:fs");
const path = require("node:path");

const LOG_LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };

class WaldoTabsLogger {
  constructor(name, level = "INFO") {
    this._name = `waldotabs.${name}`;
    this._level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
    this._filePath = null;
    this._stream = null;
  }

  setFile(filePath) {
    if (this._stream) {
      this._stream.end();
      this._stream = null;
    }
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      this._filePath = filePath;
      this._stream = fs.createWriteStream(filePath, { flags: "a", encoding: "utf8" });
    } catch {
      this._filePath = null;
      this._stream = null;
    }
  }

  setLevel(level) {
    this._level = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
  }

  _write(levelName, msg) {
    if ((LOG_LEVELS[levelName] ?? 0) < this._level) return;
    const ts = new Date().toISOString().replace("T", "T").slice(0, 19);
    const line = `${ts} [${levelName}] ${this._name}: ${msg}\n`;
    if (this._stream) this._stream.write(line);
  }

  debug(msg) { this._write("DEBUG", msg); }
  info(msg)  { this._write("INFO",  msg); }
  warn(msg)  { this._write("WARN",  msg); }
  error(msg) { this._write("ERROR", msg); }

  close() {
    if (this._stream) {
      this._stream.end();
      this._stream = null;
    }
  }
}

module.exports = { WaldoTabsLogger };
