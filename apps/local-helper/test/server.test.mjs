import test from 'node:test';
import assert from 'node:assert/strict';
import { startPrototype } from '../server.mjs';
import { DIRECT_SCOPE } from '../auth.mjs';

test('loopback UI authenticates local mutations, requires scope and confirmations, and never exposes tokens', async () => {
  const calls = [];
  let failNext = false;
  let jsonMode = false;
  const app = await startPrototype({ hostId: 'urn:uuid:11111111-1111-4111-8111-111111111111',
    verifier: async () => ({ subject: 'fictional-account', email: 'test@example.invalid' }),
    fetcher: async (url) => {
      calls.push(url);
      if (url.endsWith('/oauth/token')) return Response.json({ access_token: 'NEVER_EXPOSE_TOKEN', id_token: 'fake', token_type: 'Bearer', expires_in: 3600, scope: `${DIRECT_SCOPE} resource.invoke` });
      if (url.endsWith('/models')) return Response.json({ models: [{ slug: 'fictional-model', display_name: 'Fictício', visibility: 'list' }] });
      if (failNext) return Response.json({ error: { code: 'unsupported_parameter', param: 'temperature', message: 'Rejected: NEVER_EXPOSE_TOKEN' } }, { status: 400 });
      if (jsonMode) return Response.json({ id: 'resp_fake', object: 'response', status: 'completed', output: [{ content: [{ type: 'output_text', text: 'Resposta JSON fictícia.' }] }] });
      return new Response(`data: ${JSON.stringify({ type: 'response.completed', response: { output: [{ content: [{ type: 'output_text', text: 'Rascunho fictício.' }] }], usage: { total_tokens: 25 } } })}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    },
  });
  try {
    const home = await fetch(app.origin);
    assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const cookie = home.headers.get('set-cookie').split(';')[0];
    const config = await (await fetch(`${app.origin}/config`, { headers: { cookie } })).json();
    const headers = { cookie, origin: app.origin, 'Content-Type': 'application/json', 'X-Octablaster-CSRF': config.csrf };
    const post = (path, body = {}, extra = {}) => fetch(`${app.origin}${path}`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
    assert.equal((await post('/auth/start', {}, { origin: 'https://attacker.invalid' })).status, 403);
    assert.equal((await post('/auth/start', {}, { 'X-Octablaster-CSRF': 'forged' })).status, 403);
    assert.equal((await post('/test', { model: 'fictional-model', confirmIdentity: true, confirmCredits: true })).status, 400);
    assert.equal(calls.length, 0);
    const { url } = await (await post('/auth/start')).json();
    const callback = new URL('/auth/callback', app.origin);
    callback.search = new URLSearchParams({ code: 'fake-code', client_id: 'oaiapp_test', state: new URL(url).searchParams.get('state') });
    assert.equal((await fetch(callback, { redirect: 'manual' })).status, 303);
    const statusText = await (await fetch(`${app.origin}/status`, { headers: { cookie } })).text();
    assert.ok(!statusText.includes('NEVER_EXPOSE_TOKEN'));
    assert.equal(JSON.parse(statusText).planAuthorized, true);
    assert.equal((await post('/models')).status, 200);
    assert.equal((await post('/test', { model: 'fictional-model' })).status, 400);
    assert.equal(calls.length, 2);
    const result = await (await post('/test', { model: 'fictional-model', confirmIdentity: true, confirmCredits: true })).json();
    assert.equal(result.text, 'Rascunho fictício.');
    assert.equal(result.billingVerified, false);
    assert.equal(calls.length, 3);
    failNext = true;
    const failed = await (await post('/test', { model: 'fictional-model', confirmIdentity: true, confirmCredits: true })).json();
    assert.equal(failed.diagnostic.httpStatus, 400);
    assert.equal(failed.diagnostic.providerCode, 'unsupported_parameter');
    assert.ok(!JSON.stringify(failed).includes('NEVER_EXPOSE_TOKEN'));
    const persisted = await (await fetch(`${app.origin}/status`, { headers: { cookie } })).json();
    assert.equal(persisted.lastDiagnostic.param, 'temperature');
    assert.equal(persisted.result, null);
    assert.equal(calls.length, 4);
    failNext = false; jsonMode = true;
    const jsonResult = await (await post('/test', { model: 'fictional-model', confirmIdentity: true, confirmCredits: true })).json();
    assert.equal(jsonResult.text, 'Resposta JSON fictícia.');
    assert.equal(jsonResult.transport, 'json');
    assert.equal(jsonResult.billingVerified, false);
    assert.equal(calls.length, 5);
    await post('/disconnect');
    const disconnected = await (await fetch(`${app.origin}/status`, { headers: { cookie } })).json();
    assert.equal(disconnected.connected, false);
    assert.equal(disconnected.result, null);
  } finally { await app.close(); }
});
