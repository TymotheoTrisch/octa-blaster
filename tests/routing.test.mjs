import test from 'node:test';
import assert from 'node:assert/strict';

test('background routes commands only to the registered frame and rejects page senders', async () => {
  const previousBrowser = globalThis.browser;
  const previousDefine = globalThis.defineBackground;
  const data = {};
  const messages = [];
  let listener;
  let onRemoved;
  globalThis.defineBackground = (setup) => setup;
  globalThis.browser = {
    runtime: { id: 'test-extension', onMessage: { addListener(fn) { listener = fn; } } },
    storage: { local: {
      async set(items) { Object.assign(data, items); },
      async get(key) { return { [key]: data[key] }; },
      async remove(key) { delete data[key]; },
    } },
    tabs: {
      async sendMessage(tabId, message, options) {
        messages.push({ tabId, message, options });
        return { success: true };
      },
      onRemoved: { addListener(fn) { onRemoved = fn; } },
    },
  };
  try {
    const { default: setup } = await import('../entrypoints/background.ts');
    setup();
    const extensionPage = { id: 'test-extension' };
    const route = (request, sender = extensionPage) => new Promise((resolve) => {
      const pending = listener({ action: 'ROUTE_TICKET_ACTION', tabId: 12, request }, sender, resolve);
      if (pending !== true) resolve(undefined);
    });
    assert.equal((await route({ action: 'INSERT_REPLY', content: 'Hello' })).success, false);
    listener({ action: 'REGISTER_EDITOR', editorToken: 'editor-A' },
      { id: 'test-extension', tab: { id: 12 }, frameId: 4 }, () => {});
    assert.deepEqual(await route({ action: 'INSERT_REPLY', content: 'Hello' }), { success: true });
    assert.deepEqual(messages, [{ tabId: 12,
      message: { action: 'INSERT_REPLY', content: 'Hello', editorToken: 'editor-A' }, options: { frameId: 4 } }]);
    assert.equal(await route({ action: 'INSERT_REPLY' }, { id: 'foreign-extension' }), undefined);
    assert.equal(await route({ action: 'INSERT_REPLY' }, { id: 'test-extension', tab: { id: 12 } }), undefined);
    assert.equal((await route({ action: 'UNKNOWN' })).success, false);
    assert.equal(messages.length, 1);
    const captured = await new Promise(resolve => listener({ action: 'CAPTURE_EDITOR', tabId: 12 }, extensionPage, resolve));
    assert.equal(captured.editorToken, 'editor-A');
    listener({ action: 'REGISTER_EDITOR', editorToken: 'editor-B' },
      { id: 'test-extension', tab: { id: 12 }, frameId: 7 }, () => {});
    const stale = await new Promise(resolve => listener({ action: 'ROUTE_TICKET_ACTION', tabId: 12,
      expectedToken: captured.editorToken, request: { action: 'INSERT_REPLY', content: 'stale' } }, extensionPage, resolve));
    assert.equal(stale.success, false);
    assert.equal(messages.length, 1);
    onRemoved(12);
    assert.equal((await route({ action: 'INSERT_REPLY' })).success, false);
  } finally {
    if (previousBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = previousBrowser;
    if (previousDefine === undefined) delete globalThis.defineBackground;
    else globalThis.defineBackground = previousDefine;
  }
});
