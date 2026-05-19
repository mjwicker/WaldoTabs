// manifest.test.js — node:test smoke tests for manifest.json
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_PATH = path.join(__dirname, "..", "manifest.json");

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
} catch (err) {
  throw new Error(`Failed to parse manifest.json: ${err.message}`);
}

test("manifest_version is 3", () => {
  assert.strictEqual(manifest.manifest_version, 3);
});

test("name is present and non-empty", () => {
  assert.ok(typeof manifest.name === "string" && manifest.name.length > 0);
});

test("version is present and semver-like", () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test("background scripts array is declared (Firefox MV3 format)", () => {
  // Firefox MV3 uses "scripts" array, not "service_worker" (which is Chrome-only MV3).
  // web-ext lint raises MANIFEST_FIELD_UNSUPPORTED on service_worker — this is the correct format.
  assert.ok(
    Array.isArray(manifest.background?.scripts) && manifest.background.scripts.length > 0,
    "background.scripts must be a non-empty array (Firefox MV3 background format)"
  );
});

test("action popup is declared", () => {
  assert.ok(manifest.action?.default_popup, "action.default_popup missing");
});

test("browser_specific_settings gecko id is present", () => {
  assert.ok(
    manifest.browser_specific_settings?.gecko?.id,
    "browser_specific_settings.gecko.id missing"
  );
});

test("permissions is a non-empty array", () => {
  assert.ok(Array.isArray(manifest.permissions) && manifest.permissions.length > 0);
});
