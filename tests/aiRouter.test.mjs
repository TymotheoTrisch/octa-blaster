import test from 'node:test';
import assert from 'node:assert/strict';
import { installStorage } from './helpers.mjs';
import { createAiRouter } from '../services/background/aiRouter.ts';
import { AI_LOCAL_KEY, validateHelperUrl } from '../services/ai/localClient.ts';
const ui = { id: 'extension', url: 'chrome-extension://testextension/popup.html' };
const content = { id: 'extension', tab: { id: 1, url: 'https://app.octadesk.com/tickets' }, frameId: 0 };
const input = { context: 'Contexto fictício A', instruction: 'Responder', model: 'fake', examples: [] };
function setup(fetcher) {
  const storage = installStorage({ [AI_LOCAL_KEY]: { url: 'http://127.0.0.1:53894', key: 'x'.repeat(43) } });
  browser.runtime = { id: 'extension', getURL: path => `chrome-extension://testextension${path}` };
  browser.storage.local.remove = async key => { delete storage.data[key]; };
  const router = createAiRouter(fetcher);
  return { storage, call: (message, sender = ui) => new Promise(resolve => router.handleMessage(message, sender, resolve)) };
}

test('pairing configuration is loopback-only and its secret never reaches public configuration', async () => {
  for (const url of ['https://example.invalid', 'http://localhost:53894', 'http://127.0.0.1:53894/other', 'http://127.0.0.1:53894?token=secret']) assert.throws(() => validateHelperUrl(url));
  const { storage, call } = setup(async (_url, options) => {
    assert.equal(options.headers['X-Octablaster-Origin'], 'chrome-extension://testextension');
    return Response.json({ key: 'y'.repeat(43) });
  });
  try {
    assert.equal((await call({ action: 'AI_PAIR', url: 'http://127.0.0.1:53894', code: '123456' }, content)).success, false);
    assert.equal((await call({ action: 'AI_PAIR', url: 'http://127.0.0.1:53894', code: '123456' })).success, true);
    const config = await call({ action: 'AI_CONFIG' });
    assert.equal(config.data.paired, true); assert.ok(!JSON.stringify(config).includes('y'.repeat(43)));
    assert.equal(storage.data[AI_LOCAL_KEY].key, 'y'.repeat(43));
  } finally { storage.restore(); }
});

test('generation rejects other sites and validates the reviewed data before calling the helper', async () => {
  let calls = 0;
  const { storage, call } = setup(async (_url, options) => { calls++; assert.deepEqual(JSON.parse(options.body), input); return Response.json({ text: 'Resposta fictícia' }); });
  try {
    assert.equal((await call({ action: 'AI_GENERATE', requestId: 'abc', input }, { ...content, tab: { id: 1, url: 'https://attacker.invalid' } })).success, false);
    assert.equal((await call({ action: 'AI_GENERATE', requestId: 'abc', input: { ...input, context: '' } }, content)).success, false);
    assert.equal(calls, 0);
    const result = await call({ action: 'AI_GENERATE', requestId: 'abc', input }, content);
    assert.equal(result.data.text, 'Resposta fictícia'); assert.equal(calls, 1);
  } finally { storage.restore(); }
});

test('only the originating tab and frame can cancel its pending generation', async () => {
  let signal;
  const { storage, call } = setup(async (_url, options) => { signal = options.signal; return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))); });
  try {
    const generating = call({ action: 'AI_GENERATE', requestId: 'request-one', input }, content);
    await new Promise(resolve => setImmediate(resolve));
    await call({ action: 'AI_CANCEL', requestId: 'request-one' }, { ...content, frameId: 2 });
    assert.equal(signal.aborted, false);
    await call({ action: 'AI_CANCEL', requestId: 'request-one' }, content);
    assert.equal(signal.aborted, true);
    assert.equal((await generating).success, false);
  } finally { storage.restore(); }
});

test('chat accepts bounded user-assistant pairs and rejects invalid tasks, roles and excess history', async () => {
  let requests = 0;
  const { storage, call } = setup(async () => { requests++; return Response.json({ text: 'Resumo fictício' }); });
  try {
    const history = [{ role: 'user', content: 'Pergunta anterior' }, { role: 'assistant', content: 'Resposta anterior' }];
    for (const patch of [{ task: 'unknown' }, { history: [{ role: 'system', content: 'Não permitido' }] }, { history: history.slice(0, 1) }, { history: [{ role: 'user', content: 'x'.repeat(24_000) }, history[1]] }, { history: Array(7).fill(history).flat() }]) {
      assert.equal((await call({ action: 'AI_GENERATE', requestId: 'chat', input: { ...input, ...patch } }, content)).success, false);
    }
    assert.equal(requests, 0);
    assert.equal((await call({ action: 'AI_GENERATE', requestId: 'chat', input: { ...input, task: 'chat', history } }, content)).success, true);
    assert.equal(requests, 1);
  } finally { storage.restore(); }
});
