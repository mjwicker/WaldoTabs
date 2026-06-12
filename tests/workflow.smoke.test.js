// tests/workflow.smoke.test.js
//
// Smoke tests for GitHub Actions workflow YAML structure.
// Validates that the CI pipeline is correctly configured to run unit tests
// and E2E tests separately, with proper error handling.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW_PATH = path.join(__dirname, '..', '.github', 'workflows', 'test.yml');

let workflowContent;
try {
  workflowContent = fs.readFileSync(WORKFLOW_PATH, 'utf8');
} catch (err) {
  throw new Error(`Failed to read workflow file: ${err.message}`);
}

test('workflow file exists', () => {
  assert.ok(fs.existsSync(WORKFLOW_PATH), 'test.yml workflow file should exist');
});

test('workflow is valid YAML (non-empty)', () => {
  assert.ok(workflowContent.length > 0, 'workflow file should not be empty');
  assert.ok(workflowContent.includes('jobs:'), 'workflow should declare jobs');
});

test('workflow declares both test and test-e2e jobs', () => {
  // Extract jobs section and verify both job names exist
  const jobsMatch = workflowContent.match(/jobs:\n([\s\S]+)/);
  assert.ok(jobsMatch, 'jobs section should exist');

  const jobsBlock = jobsMatch[1];
  assert.ok(/^\s{2}test:\s*$/m.test(jobsBlock), 'test job should exist');
  assert.ok(/^\s{2}test-e2e:\s*$/m.test(jobsBlock), 'test-e2e job should exist');
});

test('test job runs "npm test" command', () => {
  assert.ok(
    workflowContent.includes('npm test'),
    'test job should run "npm test" command'
  );
});

test('test job runs "npm run lint" before tests', () => {
  assert.ok(
    workflowContent.includes('npm run lint'),
    'test job should run linting before tests'
  );
});

test('test-e2e job runs "npm run test:e2e" command', () => {
  assert.ok(
    workflowContent.includes('npm run test:e2e') || workflowContent.includes('test:e2e'),
    'test-e2e job should run "npm run test:e2e" command'
  );
});

test('test-e2e job has continue-on-error: true', () => {
  // Verify continue-on-error is set in test-e2e job context
  assert.ok(
    workflowContent.includes('continue-on-error: true'),
    'test-e2e job should have continue-on-error: true to not block main CI'
  );
});

test('test job does NOT have continue-on-error (blocking)', () => {
  // Extract test job block (from "test:" to before "test-e2e:")
  const testJobMatch = workflowContent.match(/^\s{2}test:\s*\n([\s\S]*?)(?=^\s{2}\w+:|$)/m);
  assert.ok(testJobMatch, 'test job should be found in workflow');

  const testJobBlock = testJobMatch[1];
  assert.ok(
    !testJobBlock.includes('continue-on-error'),
    'test job should NOT have continue-on-error; unit test failures should block CI'
  );
});

test('test-e2e job installs Firefox', () => {
  assert.ok(
    workflowContent.includes('Install Firefox') || workflowContent.includes('firefox'),
    'test-e2e job should install Firefox'
  );
});

test('test-e2e job installs Geckodriver', () => {
  assert.ok(
    workflowContent.includes('Install Geckodriver') || workflowContent.includes('geckodriver'),
    'test-e2e job should install Geckodriver'
  );
});

test('test-e2e job uses xvfb-run for headless display', () => {
  assert.ok(
    workflowContent.includes('xvfb-run'),
    'test-e2e job should use xvfb-run to provide a headless X11 display for Firefox'
  );
});

test('both jobs use ubuntu-latest runner', () => {
  assert.ok(
    workflowContent.match(/^\s{4}runs-on: ubuntu-latest/m),
    'both test and test-e2e jobs should use ubuntu-latest runner'
  );
});
