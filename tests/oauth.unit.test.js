// oauth.unit.test.js — tests for Google OAuth flow in background.js

'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { installBrowserMock } = require('./helpers/browserMock');
const { loadBackground, sendMessage } = require('./helpers/loadBackground');

function makeTokenFetch(tokenResponse) {
  return async (url) => {
    if (url.includes('oauth2.googleapis.com/token')) {
      return {
        ok: true,
        json: async () => tokenResponse
      };
    }
    throw new Error(`Unmocked fetch: ${url}`);
  };
}

test('getOAuthStatus returns false when not connected', async () => {
  const { browser } = installBrowserMock();
  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, { action: 'getOAuthStatus' });
  assert.equal(resp.google, false);
});

test('getOAuthStatus returns true after successful OAuth', async () => {
  const { browser } = installBrowserMock({
    oauthCode: 'auth-code-123',
    session: {
      oauth_google_connected: true
    }
  });
  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, { action: 'getOAuthStatus' });
  assert.equal(resp.google, true);
});

test('initiateGoogleOAuth stores access token on success', async () => {
  const tokenData = {
    access_token: 'ya29.mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600
  };
  const { browser } = installBrowserMock({ oauthCode: 'valid-code' });
  const ctx = loadBackground({ browser, fetch: makeTokenFetch(tokenData) });
  await ctx._ready;

  const resp = await sendMessage(browser, { action: 'initiateGoogleOAuth' });
  assert.equal(resp.success, true);
  assert.equal(resp.provider, 'google');

  const stored = await browser.storage.session.get([
    'oauth_google_access_token',
    'oauth_google_connected'
  ]);
  assert.equal(stored.oauth_google_access_token, 'ya29.mock-access-token');
  assert.equal(stored.oauth_google_connected, true);
});

test('initiateGoogleOAuth returns failure when launchWebAuthFlow throws', async () => {
  const { browser } = installBrowserMock();
  // No oauthCode seeded — launchWebAuthFlow will throw
  const ctx = loadBackground({ browser });
  await ctx._ready;

  const resp = await sendMessage(browser, { action: 'initiateGoogleOAuth' });
  assert.equal(resp.success, false);
  assert.equal(resp.provider, 'google');
  assert.ok(resp.error, 'error message should be present');
});

test('disconnectGoogle clears all OAuth session data', async () => {
  const { browser } = installBrowserMock({
    session: {
      oauth_google_access_token: 'ya29.existing',
      oauth_google_refresh_token: 'refresh',
      oauth_google_expiry: Date.now() + 3600000,
      oauth_google_connected: true
    }
  });
  const ctx = loadBackground({ browser });
  await ctx._ready;

  // Confirm connected before disconnect
  const before = await sendMessage(browser, { action: 'getOAuthStatus' });
  assert.equal(before.google, true);

  const resp = await sendMessage(browser, { action: 'disconnectGoogle' });
  assert.equal(resp.success, true);

  const after = await sendMessage(browser, { action: 'getOAuthStatus' });
  assert.equal(after.google, false);

  const session = await browser.storage.session.get(null);
  assert.ok(!session.oauth_google_access_token, 'access token should be cleared');
  assert.ok(!session.oauth_google_connected, 'connected flag should be cleared');
});

test('OAuth tokens are stored in session storage (not local)', async () => {
  const tokenData = {
    access_token: 'ya29.session-only',
    refresh_token: 'r',
    expires_in: 3600
  };
  const { browser } = installBrowserMock({ oauthCode: 'code' });
  const ctx = loadBackground({ browser, fetch: makeTokenFetch(tokenData) });
  await ctx._ready;

  await sendMessage(browser, { action: 'initiateGoogleOAuth' });

  // Must be in session (cleared on browser close), NOT in local (persistent)
  const local = await browser.storage.local.get(null);
  assert.ok(!local.oauth_google_access_token, 'OAuth token must NOT be in local storage');

  const session = await browser.storage.session.get('oauth_google_access_token');
  assert.equal(session.oauth_google_access_token, 'ya29.session-only');
});
