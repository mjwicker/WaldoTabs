// extension-load.smoke.test.js — verify manifest and background.js can be loaded
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const MANIFEST_PATH = path.join(__dirname, "..", "manifest.json");
const BG_SCRIPT_RELATIVE_PATH = path.join(__dirname, "..");

test("manifest.json is valid JSON", () => {
  const content = fs.readFileSync(MANIFEST_PATH, "utf8");
  assert.doesNotThrow(() => JSON.parse(content));
});

test("manifest.json has required keys", () => {
  const content = fs.readFileSync(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(content);

  assert.ok(manifest.hasOwnProperty("manifest_version"), "Missing manifest_version");
  assert.ok(manifest.hasOwnProperty("name"), "Missing name");
  assert.ok(manifest.hasOwnProperty("version"), "Missing version");
  assert.ok(manifest.hasOwnProperty("background"), "Missing background");
});

test("manifest.background.scripts exists and is an array", () => {
  const content = fs.readFileSync(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(content);

  assert.ok(
    Array.isArray(manifest.background.scripts),
    "background.scripts must be an array"
  );
  assert.ok(
    manifest.background.scripts.length > 0,
    "background.scripts array must not be empty"
  );
});

test("background.js file exists and can be read", () => {
  const bgScriptPath = path.join(BG_SCRIPT_RELATIVE_PATH, "background.js");
  assert.ok(
    fs.existsSync(bgScriptPath),
    `background.js not found at ${bgScriptPath}`
  );
});

test("background.js parses without syntax errors", () => {
  const bgScriptPath = path.join(BG_SCRIPT_RELATIVE_PATH, "background.js");
  const src = fs.readFileSync(bgScriptPath, "utf8");

  // vm.Script compiles the source; throws SyntaxError on malformed JS
  assert.doesNotThrow(
    () => new vm.Script(src, { filename: "background.js" }),
    "background.js contains syntax errors"
  );
});

test("manifest.json strict_min_version is 112.0 for Firefox storage.session API support", () => {
  const content = fs.readFileSync(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(content);

  assert.ok(
    manifest.browser_specific_settings &&
      manifest.browser_specific_settings.gecko &&
      manifest.browser_specific_settings.gecko.strict_min_version,
    "Missing browser_specific_settings.gecko.strict_min_version"
  );

  const minVersion = manifest.browser_specific_settings.gecko.strict_min_version;
  assert.strictEqual(
    minVersion,
    "112.0",
    `Expected strict_min_version "112.0" (Firefox 112+ for storage.session API), got "${minVersion}"`
  );
});
