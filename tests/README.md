# WaldoTabs Tests

## Running tests

```bash
npm test          # run all tests once
npm run test:watch  # re-run on file changes
```

## Test types

| Pattern | Purpose | When to add |
|---------|---------|-------------|
| `*.smoke.test.js` | Syntax checks, manifest schema | When a new source file is added |
| `*.unit.test.js` | Behavioral tests — actual logic | With every new roadmap feature |

**Rule**: every task that ships new behavior must include at least one `*.unit.test.js` test. CI blocks merge if tests fail.

## Structure

```
tests/
  helpers/
    browserMock.js    — in-memory browser.* API mock
    loadBackground.js — loads background.js into a vm context for testing
  *.smoke.test.js     — syntax/manifest checks (fast, no mocks needed)
  *.unit.test.js      — behavioral tests (use helpers/)
```

## Adding a test for a new feature

1. Import the helpers:
   ```js
   const { installBrowserMock } = require('./helpers/browserMock');
   const { loadBackground, sendMessage } = require('./helpers/loadBackground');
   ```

2. Create a fresh mock per test (never share state between tests):
   ```js
   test('my feature does X', async () => {
     const { browser } = installBrowserMock({
       local: { settings: { apiEndpoint: '...', apiKey: '...' } },
       tabs: [{ id: 1, url: 'https://example.com', title: 'Test', windowId: 1 }]
     });
     const ctx = loadBackground({ browser });
     await ctx._ready;  // wait for initial loadTabCache() to complete

     // Act
     const resp = await sendMessage(browser, { action: 'yourAction', ... });

     // Assert
     assert.equal(resp.success, true);
   });
   ```

3. Seed options for `installBrowserMock`:
   ```js
   installBrowserMock({
     local:         { tabCache: {...}, settings: {...} },  // browser.storage.local initial data
     session:       { oauth_google_connected: true },       // browser.storage.session initial data
     tabs:          [{ id: 1, url: '...', title: '...', windowId: 1, discarded: false }],
     screenshot:    'data:image/png;base64,...',            // returned by captureVisibleTab
     extractedText: 'page text for summarization',          // returned by scripting.executeScript
     oauthCode:     'auth-code-123',                        // returned by identity.launchWebAuthFlow
   })
   ```

4. Fire browser events in tests:
   ```js
   await browser._fire('tabs.onUpdated', tabId, { status: 'complete' }, tabObj);
   await browser._fire('tabs.onRemoved', tabId);
   await browser._fire('tabs.onActivated', { tabId });
   await browser._fire('runtime.onInstalled', { reason: 'install' });
   await browser._fire('runtime.onStartup');
   ```

5. Mock `fetch` for API call tests:
   ```js
   const ctx = loadBackground({ browser, fetch: async (url) => ({
     ok: true,
     json: async () => ({ choices: [{ message: { content: 'AI response' } }] })
   })});
   ```

## vm realm note

Objects returned from `sendMessage` are created inside the vm context and have a different prototype chain than main-realm objects. Use `JSON.parse(JSON.stringify(val))` (aliased as `plain()` in cache tests) when comparing arrays or objects with `assert.deepStrictEqual`. For simple checks, prefer `assert.equal(arr.length, n)` over comparing against a literal `[]`.

## popup.js tests

`popup.unit.test.js` uses `jsdom` for DOM-dependent tests. The pure helper functions (`domainFromUrl`, `timeAgo`) are extracted directly from source and tested without a DOM.

If you need to test new popup behavior that depends on specific HTML elements, add the element to the `makePopupDOM()` fixture in `popup.unit.test.js`.
