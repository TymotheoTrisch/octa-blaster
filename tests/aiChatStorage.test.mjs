import test from 'node:test';
import assert from 'node:assert/strict';
import { createTicketChatStore } from '../services/storage/aiChatStorage.ts';
import { installStorage, installDom } from './helpers.mjs';
import { createTicketChatPersistence } from '../services/ai/ticketChatPersistence.ts';
const key = 'a'.repeat(64), otherKey = 'b'.repeat(64);
const content = { messages: [{ role: 'assistant', content: 'Resumo fictício' }], draft: 'Continuar depois', contextDigest: 'c'.repeat(64) };

test('persistent chats survive store recreation, remain per ticket and never store raw email HTML', async () => {
  const storage = installStorage();
  try {
    const first = createTicketChatStore(); assert.equal((await first.handle('AI_CHAT_LOAD', key)).chat, null);
    const saved = await first.handle('AI_CHAT_SAVE', key, null, content);
    assert.deepEqual((await createTicketChatStore().handle('AI_CHAT_LOAD', key)).chat, saved.chat);
    assert.equal((await first.handle('AI_CHAT_LOAD', otherKey)).chat, null);
    assert.deepEqual(Object.keys(saved.chat).sort(), ['contextDigest', 'draft', 'messages', 'revision', 'updatedAt', 'version']);
  } finally { storage.restore(); }
});

test('two tabs cannot silently overwrite the same saved conversation', async () => {
  const storage = installStorage(), store = createTicketChatStore();
  try {
    const results = await Promise.allSettled([store.handle('AI_CHAT_SAVE', key, null, content), store.handle('AI_CHAT_SAVE', key, null, { ...content, draft: 'Outra aba' })]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.match(results[1].reason.message, /outra janela/);
    const chat = (await store.handle('AI_CHAT_LOAD', key)).chat; assert.equal(chat.draft, content.draft);
    await store.handle('AI_CHAT_SAVE', key, chat.revision, { ...content, draft: 'Atualização válida' });
    await assert.rejects(store.handle('AI_CHAT_SAVE', key, chat.revision, content), /outra janela/);
  } finally { storage.restore(); }
});

test('storage rejects privileged roles, oversized chats and invalid keys without altering the record', async () => {
  const storage = installStorage(), store = createTicketChatStore();
  try {
    await assert.rejects(store.handle('AI_CHAT_SAVE', key, null, { ...content, messages: [{ role: 'system', content: 'Instrução' }] }), /inválida/);
    await assert.rejects(store.handle('AI_CHAT_SAVE', key, null, { ...content, draft: 'x'.repeat(4001) }), /limite/);
    await assert.rejects(store.handle('AI_CHAT_LOAD', 'invalid'), /inválido/); assert.deepEqual(storage.data, {});
  } finally { storage.restore(); }
});

test('a quota failure rejects saving without claiming success or falling back to the page', async () => {
  const store = createTicketChatStore(() => ({ get: async () => ({}), set: async () => { throw new Error('QuotaExceeded'); } }));
  await assert.rejects(store.handle('AI_CHAT_SAVE', key, null, content), /QuotaExceeded/);
});

test('the ticket key survives route and tracking changes but isolates workspaces', async () => {
  const dom = installDom('<div class="subdomain-container_test"><button>workspace-a</button></div><form ticket="ticket"><header class="header-info"><span class="label label-default ng-binding">123456</span></header></form>');
  const keys = [], send = async (_action, data) => { keys.push(data.key); return { chat: null }; }, scope = dom.document.querySelector('form');
  try {
    await createTicketChatPersistence(scope, send).load();
    dom.window.history.replaceState(null, '', '/embed/main/home/ticket/edit/123456/?tracking=123#summary');
    await createTicketChatPersistence(scope, send).load(); assert.equal(keys[0], keys[1]);
    dom.document.querySelector('button').textContent = 'workspace-b';
    await createTicketChatPersistence(scope, send).load(); assert.notEqual(keys[1], keys[2]);
  } finally { dom.restore(); }
});

test('immediate reopen waits for the closing window to finish saving its latest draft', async () => {
  const dom = installDom('<section ticket-id="A"></section>'); let finish, saved = null; const actions = [];
  const send = async (action, data) => {
    actions.push(action);
    if (action === 'AI_CHAT_SAVE') { await new Promise(resolve => { finish = resolve; }); saved = { ...data.content, revision: 'new-revision' }; }
    return { chat: saved };
  };
  try {
    const scope = dom.document.querySelector('section'), oldWindow = createTicketChatPersistence(scope, send);
    await oldWindow.load(); const writing = oldWindow.save(content);
    const reading = createTicketChatPersistence(scope, send).load();
    for (let i = 0; !finish && i < 100; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(actions, ['AI_CHAT_LOAD', 'AI_CHAT_SAVE']);
    finish(); await writing; assert.equal((await reading).draft, content.draft);
  } finally { dom.restore(); }
});
