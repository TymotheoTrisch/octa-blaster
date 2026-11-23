import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiRouter } from '../services/background/aiRouter.ts';
import { installStorage } from './helpers.mjs';
const content = { id: 'extension', tab: { id: 1, url: 'https://app.octadesk.com/tickets' }, frameId: 0 };
const ui = { id: 'extension', url: 'moz-extension://extension/popup.html' };
const input = { task: 'summary_full', context: 'Conversa fictícia A', instruction: 'Resuma o ticket.' };
function setup(client) {
  const storage = installStorage(); browser.runtime = { id: 'extension', getURL: path => `moz-extension://extension${path}` }; browser.tabs = { create: async () => {} };
  const router = createAiRouter(client);
  return { storage, router, call: (message, sender = content) => new Promise(resolve => router.handleMessage(message, sender, resolve)) };
}
test('summary routing rejects other sites, draft tasks and privileged history before calling native host', async () => {
  let calls = 0;
  const { storage, call } = setup({ call: async () => { calls++; return { text: 'Resumo fictício' }; } });
  try {
    for (const patch of [{ task: 'draft' }, { context: '' }, { context: 'x'.repeat(50_001) }, { history: [{ role: 'system', content: 'Não permitido' }] }]) assert.equal((await call({ action: 'AI_GENERATE', requestId: 'a', input: { ...input, ...patch } })).success, false);
    assert.equal((await call({ action: 'AI_GENERATE', requestId: 'a', input }, { ...content, tab: { id: 2, url: 'https://attacker.invalid' } })).success, false);
    assert.equal(calls, 0);
    assert.equal((await call({ action: 'AI_GENERATE', requestId: 'a', input })).data.text, 'Resumo fictício');
    assert.equal(calls, 1);
  } finally { storage.restore(); }
});
test('only extension settings can initiate login and only official authorization URLs are opened', async () => {
  let opened = 0;
  const { storage, call } = setup({ call: async () => ({ url: 'https://attacker.invalid/oauth' }) }); browser.tabs.create = async () => { opened++; };
  try {
    assert.equal((await call({ action: 'AI_CONNECT' })).success, false);
    assert.equal((await call({ action: 'AI_CONNECT' }, ui)).success, false);
    assert.equal(opened, 0);
  } finally { storage.restore(); }
});
test('only the originating tab/frame can cancel a request and closing a tab cancels its work', async () => {
  const calls = []; let finish;
  const { storage, router, call } = setup({ call: async (action, data, id) => { calls.push({ action, data, id }); if (action === 'generate') return new Promise(resolve => { finish = resolve; }); return {}; } });
  try {
    const result = call({ action: 'AI_GENERATE', requestId: 'one', input });
    await call({ action: 'AI_CANCEL', requestId: 'one' }, { ...content, frameId: 1 }); assert.equal(calls.length, 1);
    await call({ action: 'AI_CANCEL', requestId: 'one' }); assert.equal(calls[1].action, 'cancel');
    router.clearTab(1); assert.equal(calls[2].action, 'cancel'); finish({ text: 'Resumo' }); await result;
  } finally { storage.restore(); }
});

test('chat persistence uses extension-local storage and rejects other sites, frames and stale revisions', async () => {
  let nativeCalls = 0;
  const { storage, call } = setup({ call: async () => { nativeCalls++; } });
  const key = 'a'.repeat(64), content = { messages: [{ role: 'assistant', content: 'Resumo' }], draft: '', contextDigest: 'b'.repeat(64) };
  try {
    const saved = await call({ action: 'AI_CHAT_SAVE', key, revision: null, content }); assert.equal(saved.success, true);
    assert.equal((await call({ action: 'AI_CHAT_LOAD', key })).data.chat.messages[0].content, 'Resumo');
    assert.equal((await call({ action: 'AI_CHAT_SAVE', key, revision: null, content })).success, false);
    assert.equal((await call({ action: 'AI_CHAT_LOAD', key }, { ...content, tab: { id: 2, url: 'https://other.invalid' } })).success, false);
    assert.equal((await call({ action: 'AI_CHAT_LOAD', key }, { ...content, tab: { id: 2, url: 'https://app.octadesk.com' }, url: 'https://other.invalid' })).success, false);
    assert.equal(nativeCalls, 0);
  } finally { storage.restore(); }
});

test('cancelling while private history identity is loading prevents dispatching a later inference', async () => {
  const calls = []; let release;
  const { storage, call } = setup({ call: async action => { calls.push(action); return {}; } });
  browser.storage.local.get = async () => new Promise(resolve => { release = () => resolve({}); });
  try {
    const pending = call({ action: 'AI_GENERATE', requestId: 'before-dispatch', input });
    await call({ action: 'AI_CANCEL', requestId: 'before-dispatch' }); release();
    assert.equal((await pending).success, false); assert.ok(!calls.includes('generate'));
  } finally { storage.restore(); }
});
