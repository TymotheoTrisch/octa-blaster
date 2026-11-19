import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { encodeNativeMessage, readNativeMessages } from '../native-protocol.mjs';
import { startNativeHost, ensureHelper } from '../native-host.mjs';
const settle = () => new Promise(resolve => setImmediate(resolve));
test('native protocol decodes fragmented/coalesced UTF-8 frames and rejects oversized input', async () => {
  const input = new PassThrough(), values = []; let errors = 0;
  readNativeMessages(input, value => values.push(value), () => errors++);
  const first = encodeNativeMessage({ text: 'Resumo fictício' }), second = encodeNativeMessage({ done: true });
  input.write(first.subarray(0, 2)); input.write(Buffer.concat([first.subarray(2), second]));
  assert.deepEqual(values, [{ text: 'Resumo fictício' }, { done: true }]);
  const invalid = Buffer.alloc(4); invalid.writeUInt32LE(300_001); input.write(invalid); assert.equal(errors, 1); input.end();
});
test('native channel performs setup internally, restricts tasks, cancels and exposes no pairing secret', async () => {
  const input = new PassThrough(), output = new PassThrough(), replies = [], requests = []; let ensureCalls = 0;
  readNativeMessages(output, value => replies.push(value), () => assert.fail('invalid framing'));
  startNativeHost({ input, output, ensure: async () => { ensureCalls++; }, fetcher: async (url, options) => {
    requests.push({ url, options });
    if (url === 'http://127.0.0.1:53894') return new Response('ready', { headers: { 'set-cookie': 'local=session; HttpOnly' } });
    if (url.endsWith('/config')) return Response.json({ csrf: 'csrf-fictional' });
    if (url.endsWith('/status')) return Response.json({ connected: true, accounts: [], preferences: {} });
    if (url.endsWith('/pairing/code')) return Response.json({ code: '123456' });
    if (url.endsWith('/bridge/pair')) return Response.json({ key: 'x'.repeat(43) });
    if (url.endsWith('/bridge/status')) return Response.json({ connected: true, account: 'Fictício' });
    if (url.endsWith('/bridge/unpair')) return Response.json({ disconnected: true });
    if (url.endsWith('/bridge/draft')) return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    throw new Error('Unexpected fixture path');
  } });
  input.write(encodeNativeMessage({ id: 'status-one', action: 'status' }));
  await settle(); await settle();
  assert.equal(replies[0].data.connected, true); assert.equal(ensureCalls, 1);
  assert.ok(!JSON.stringify(replies).includes('x'.repeat(43))); assert.ok(!JSON.stringify(replies).includes('csrf-fictional'));
  input.write(encodeNativeMessage({ id: 'disabled', action: 'generate', input: { task: 'draft' } })); await settle();
  assert.equal(replies.find(item => item.id === 'disabled').success, false);
  input.write(encodeNativeMessage({ id: 'summary', action: 'generate', input: { task: 'summary_latest', context: 'Fictício' } })); await settle();
  input.write(encodeNativeMessage({ id: 'cancel', action: 'cancel', requestId: 'summary' })); await settle(); await settle();
  assert.equal(replies.find(item => item.id === 'summary').success, false); assert.match(replies.find(item => item.id === 'summary').error, /cancelada/);
  input.end(); await settle(); assert.ok(requests.some(item => item.url.endsWith('/bridge/unpair')));
});
test('ready helper is reused without launching another process', async () => {
  let launched = 0;
  await ensureHelper(async () => Response.json({ apiVersion: 2 }), () => launched++);
  assert.equal(launched, 0);
});

import { localSession } from '../native-session.mjs';
test('updating from the running 0.10 helper keeps the granted account without manual pairing or an inference test', async () => {
  const paths = [];
  const session = await localSession(async (url, options) => {
    const path = new URL(url).pathname; paths.push(path);
    if (path === '/') return new Response('ready', { headers: { 'set-cookie': 'local=fixture' } });
    if (path === '/config') return Response.json({ csrf: 'fixture' });
    if (path === '/status') return Response.json({ connected: true, planAuthorized: true, accounts: [], preferences: { model: 'fake' } });
    if (path === '/native/connect') return Response.json({ error: 'missing' }, { status: 404 });
    if (path === '/models') return Response.json({ models: [{ slug: 'fake' }] });
    if (path === '/preferences') { assert.equal(JSON.parse(options.body).enabled, true); return Response.json({ saved: true }); }
    throw new Error('Unexpected fixture path');
  });
  assert.equal((await session.connect(false)).connected, true);
  assert.ok(!paths.includes('/auth/start')); assert.ok(!paths.includes('/test')); assert.ok(!paths.includes('/responses'));
});
test('helper bootstrap starts only when absent, then waits for readiness', async () => {
  let launched = 0;
  await ensureHelper(async () => { if (!launched) throw new Error('not running'); return Response.json({ apiVersion: 2 }); }, () => launched++);
  assert.equal(launched, 1);
});
