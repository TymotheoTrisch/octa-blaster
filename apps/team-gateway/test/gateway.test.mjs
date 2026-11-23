import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startGateway } from '../server.mjs';
import { aesCodec } from '../encryption.mjs';
import { memoryVault } from '../../local-helper/vault.mjs';

const tokenA = 'a'.repeat(43), tokenB = 'b'.repeat(43), hash = value => createHash('sha256').update(value).digest('hex');
const users = [{ id: 'alice', tokenHash: hash(tokenA) }, { id: 'bob', tokenHash: hash(tokenB) }].map(user => ({ ...user, provider: 'openai', model: 'model-test', apiKeyEnv: 'OCTA_TEST_KEY', perMinute: 10, dailyRequests: 10 }));
const input = { task: 'summary_full', instruction: 'Resuma.', context: 'Ticket fictício A', history: [], conversationKey: 'c'.repeat(64) };
async function fixture(patch = {}) {
  const vaults = new Map(), calls = []; let count = 0;
  const app = await startGateway({ users, port: 0, secrets: { OCTA_TEST_KEY: 'fictional-company-secret' }, vaultFactory: async id => { if (!vaults.has(id)) vaults.set(id, memoryVault()); return vaults.get(id); }, fetcher: async (url, init) => { calls.push({ url, body: init.body && JSON.parse(init.body) }); if (init.method === 'DELETE') return new Response(null, { status: 204 }); return Response.json({ id: `r_${++count}`, status: 'completed', output: [{ content: [{ type: 'output_text', text: `Resposta ${count}` }] }] }); }, ...patch });
  const post = (path, data, token = tokenA, extra = {}) => fetch(`${app.origin}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extra }, body: JSON.stringify(data) });
  return { app, vaults, calls, post };
}

test('gateway requires individual credentials and never returns a provider key', async () => {
  const { app, post, calls } = await fixture();
  try {
    assert.equal((await post('/v1/generate', input, 'invalid')).status, 401);
    assert.equal((await post('/v1/generate', input, tokenA, { Origin: 'https://other.invalid' })).status, 403);
    const response = await post('/v1/status', {}); assert.equal(response.status, 200); assert.ok(!(await response.text()).includes('fictional-company-secret')); assert.equal(calls.length, 0);
  } finally { await app.close(); }
});

test('same ticket ID is isolated across gateway users and remote chains continue only for their owner', async () => {
  const { app, post, calls } = await fixture();
  try {
    const firstA = await (await post('/v1/generate', input)).json(); await post('/v1/generate', input, tokenB);
    await post('/v1/generate', { ...input, task: 'chat', instruction: 'O que falta?', history: [{ role: 'user', content: input.instruction }, { role: 'assistant', content: firstA.text }] });
    assert.equal(calls[2].body.previous_response_id, 'r_1');
    await post('/v1/forget', { conversationKey: input.conversationKey });
    const remaining = await (await post('/v1/status', {}, tokenB)).json(); assert.equal(remaining.pendingDeletes, 0);
    assert.ok(!calls.filter(call => call.url.endsWith('/r_2')).length);
  } finally { await app.close(); }
});

test('daily request quota persists in the vault and cannot be bypassed by restarting the gateway', async () => {
  const vault = memoryVault(), limited = [ { ...users[0], dailyRequests: 1 } ];
  const factory = async () => vault;
  let testApp = await fixture({ users: limited, vaultFactory: factory });
  await testApp.post('/v1/generate', input); await testApp.app.close();
  testApp = await fixture({ users: limited, vaultFactory: factory });
  try { const response = await testApp.post('/v1/generate', input); assert.equal(response.status, 429); assert.equal(testApp.calls.length, 0); }
  finally { await testApp.app.close(); }
});

test('gateway AES-GCM uses randomized authenticated encryption and rejects invalid master keys', async () => {
  const codec = aesCodec('a'.repeat(64)), first = await codec('fictional-private-content'), second = await codec('fictional-private-content');
  assert.notEqual(first, second); assert.ok(!first.includes('fictional-private-content')); assert.equal(await codec(first, true), 'fictional-private-content');
  await assert.rejects(aesCodec('b'.repeat(64))(first, true)); assert.throws(() => aesCodec('placeholder'));
});
