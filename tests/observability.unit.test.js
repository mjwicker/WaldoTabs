// observability.unit.test.js — Node emitEvent + browser observability module smoke
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { emitEvent, EVENT_CODES, WaldoTabsLogger } = require('../logging_utils.js');

test('emitEvent writes a valid JSON line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waldotabs-events-'));
  const eventsPath = path.join(dir, 'events.jsonl');
  emitEvent('TAB_DISCARD_FAIL', {
    job: 'hibernate',
    severity: 'ERROR',
    message: 'boom',
    path: eventsPath,
  });
  const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const row = JSON.parse(lines[0]);
  assert.equal(row.event_code, 'TAB_DISCARD_FAIL');
  assert.equal(row.job, 'hibernate');
  assert.equal(row.severity, 'ERROR');
  assert.equal(row.message, 'boom');
  assert.ok(row.ts);
  assert.ok(row.host);
});

test('emitEvent never throws on bad path', () => {
  const badParent = path.join(os.tmpdir(), `not-a-dir-${Date.now()}`);
  fs.writeFileSync(badParent, 'x');
  assert.doesNotThrow(() => {
    emitEvent('JOB_START', {
      job: 'test',
      message: 'x',
      path: path.join(badParent, 'events.jsonl'),
    });
  });
  fs.unlinkSync(badParent);
});

test('EVENT_CODES includes core catalog', () => {
  for (const code of ['TAB_DISCARD_OK', 'SUMMARY_FAIL', 'OAUTH_FAIL', 'JOB_START']) {
    assert.ok(EVENT_CODES.has(code), code);
  }
});

test('browser observability.js loads and exposes globals', () => {
  // Load as a classic script body into a fake global
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'observability.js'), 'utf8');
  const sandbox = { console, browser: undefined, chrome: undefined };
  // eslint-disable-next-line no-new-func
  const fn = new Function('globalThis', src + '\n//# sourceURL=observability.js');
  // observability uses (typeof globalThis !== 'undefined' ? globalThis : this)
  // Pass sandbox as both this and globalThis via Function
  const g = {};
  const run = new Function('globalThis', src);
  run(g);
  assert.equal(typeof g.WaldoTabsLogger, 'function');
  assert.equal(typeof g.waldoTabsEmitEvent, 'function');
  const log = new g.WaldoTabsLogger('test');
  assert.ok(log._prefix.includes('WaldoTabs:test'));
  assert.doesNotThrow(() => g.waldoTabsEmitEvent('API_FAIL', { job: 't', message: 'm' }));
  assert.ok(Array.isArray(g.__waldoTabsEventsMem));
  assert.equal(g.__waldoTabsEventsMem[0].event_code, 'API_FAIL');
});

test('WaldoTabsLogger Node file write', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waldotabs-log-'));
  const logPath = path.join(dir, 'session.log');
  const logger = new WaldoTabsLogger('session');
  logger.setFile(logPath);
  logger.info('hello');
  logger.close();
  const body = fs.readFileSync(logPath, 'utf8');
  assert.match(body, /hello/);
  assert.match(body, /waldotabs\.session/);
});
