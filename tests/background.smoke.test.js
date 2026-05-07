// background.smoke.test.js — syntax and typo guard for background.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const BG_PATH = path.join(__dirname, "..", "background.js");
const src = fs.readFileSync(BG_PATH, "utf8");

test("background.js parses without syntax errors", () => {
  // vm.Script compiles the source; throws SyntaxError on malformed JS
  assert.doesNotThrow(() => new vm.Script(src, { filename: "background.js" }));
});

test("background.js does not contain typo 'chome'", () => {
  assert.ok(
    !src.includes("chome."),
    "Found 'chome.' — likely a typo for 'chrome.' or 'browser.'"
  );
});

test("background.js references browser or chrome API", () => {
  const hasBrowserApi = /\bbrowser\s*\./.test(src) || /\bchrome\s*\./.test(src);
  assert.ok(hasBrowserApi, "Expected browser. or chrome. API calls in background.js");
});

test("background.js does not use eval()", () => {
  // eval in an extension background script is a CSP violation
  assert.ok(!/\beval\s*\(/.test(src), "Found eval() in background.js — CSP violation");
});
