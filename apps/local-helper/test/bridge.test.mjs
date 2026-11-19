import test from 'node:test';
import assert from 'node:assert/strict';
import { startPrototype } from '../server.mjs';
import { memoryVault } from '../vault.mjs';
import { DIRECT_SCOPE } from '../auth.mjs';

test('extension pairing is one-use, origin-bound, revocable and sends only explicit draft data', async () => {
  const vault = memoryVault(); let generations = 0;
  await vault.update(state => ({ ...state, accounts: [{ clientId: 'oaiapp_fake', identity: { subject: 'fake-user' }, accessToken: 'OAUTH_MUST_NOT_LEAVE_HELPER', scopes: [DIRECT_SCOPE, 'resource.invoke'], expiresAt: Date.now() + 3600_000 }], activeClientId: 'oaiapp_fake', preferences: { enabled: true, model: 'fake-model' } }));
  const app = await startPrototype({ port: 0, hostId: 'urn:uuid:11111111-1111-4111-8111-111111111111', vault, fetcher: async (url, options) => {
    if (url.endsWith('/models')) return Response.json({ models: [{ visibility: 'list', slug: 'fake-model', display_name: 'Fictício' }] });
    generations++;
    const body = JSON.parse(options.body);
    assert.equal(body.store, false); assert.equal(body.stream, true);
    const input = JSON.parse(body.input[0].content);
    assert.equal(input.conversa_do_ticket, 'Contexto autorizado fictício');
    assert.deepEqual(input.exemplos_de_estilo, []);
    assert.ok(!options.body.includes('OAUTH_MUST_NOT_LEAVE_HELPER'));
    return Response.json({ id: 'resp_fake', object: 'response', status: 'completed', output: [{ content: [{ type: 'output_text', text: 'Resposta fictícia.' }] }] });
  } });
  try {
    const root = await fetch(app.origin), cookie = root.headers.get('set-cookie').split(';')[0];
    const csrf = (await (await fetch(`${app.origin}/config`, { headers: { cookie } })).json()).csrf;
    const local = path => fetch(`${app.origin}${path}`, { method: 'POST', headers: { cookie, Origin: app.origin, 'Content-Type': 'application/json', 'X-Octablaster-CSRF': csrf }, body: '{}' });
    const issued = await (await local('/pairing/code')).json();
    const client = 'moz-extension://11111111-1111-4111-8111-111111111111';
    const bridge = (path, body = {}, key, origin) => fetch(`${app.origin}/bridge/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Octablaster-Origin': client, ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
    const pairing = await (await bridge('pair', { code: issued.code })).json();
    assert.match(pairing.key, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual((await bridge('pair', { code: issued.code })).status, 200);
    assert.notEqual((await bridge('status', {}, pairing.key, 'https://attacker.invalid')).status, 200);
    assert.notEqual((await bridge('status')).status, 200);
    const status = await (await bridge('status', {}, pairing.key)).text();
    assert.ok(!status.includes('OAUTH_MUST_NOT_LEAVE_HELPER'));
    const response = await (await bridge('draft', { task: 'summary_full', model: 'fake-model', context: 'Contexto autorizado fictício', instruction: 'Resuma o atendimento.', examples: [] }, pairing.key)).json();
    assert.equal(response.text, 'Resposta fictícia.'); assert.equal(generations, 1);
    await local('/pairing/revoke');
    assert.notEqual((await bridge('status', {}, pairing.key)).status, 200);
    assert.equal(generations, 1);
  } finally { await app.close(); }
});
