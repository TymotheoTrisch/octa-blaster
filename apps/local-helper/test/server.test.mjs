import test from 'node:test';
import assert from 'node:assert/strict';
import { startPrototype } from '../server.mjs';
import { DIRECT_SCOPE } from '../auth.mjs';
import { memoryVault } from '../vault.mjs';

test('native setup authenticates local mutations, activates a saved renewable login and never requires a test or manual code', async () => {
  const calls = [], vault = memoryVault();
  const app = await startPrototype({ port: 0, hostId: 'urn:uuid:11111111-1111-4111-8111-111111111111', vault,
    verifier: async () => ({ subject: 'fictional-account', email: 'test@example.invalid' }),
    fetcher: async url => {
      calls.push(url);
      if (url.endsWith('/oauth/token')) return Response.json({ access_token: 'NEVER_EXPOSE_TOKEN', refresh_token: 'NEVER_EXPOSE_REFRESH', id_token: 'fake', token_type: 'Bearer', expires_in: 3600, scope: `${DIRECT_SCOPE} resource.invoke` });
      if (url.endsWith('/models')) return Response.json({ models: [{ slug: 'fictional-model', display_name: 'Fictício', visibility: 'list' }] });
      throw new Error('No inference expected during connection');
    },
  });
  try {
    assert.equal((await (await fetch(`${app.origin}/health`)).json()).apiVersion, 2);
    const home = await fetch(app.origin); assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    const cookie = home.headers.get('set-cookie').split(';')[0], { csrf } = await (await fetch(`${app.origin}/config`, { headers: { cookie } })).json();
    const headers = { cookie, Origin: app.origin, 'Content-Type': 'application/json', 'X-Octablaster-CSRF': csrf };
    const post = (path, body = {}, override = {}) => fetch(`${app.origin}${path}`, { method: 'POST', headers: { ...headers, ...override }, body: JSON.stringify(body) });
    assert.equal((await post('/native/connect', {}, { Origin: 'https://attacker.invalid' })).status, 403);
    assert.equal((await post('/native/connect', {}, { 'X-Octablaster-CSRF': 'forged' })).status, 403);
    const { url } = await (await post('/native/connect')).json();
    const callback = new URL('/auth/callback', app.origin); callback.search = new URLSearchParams({ code: 'fake-code', client_id: 'oaiapp_fake', state: new URL(url).searchParams.get('state') });
    const response = await fetch(callback, { redirect: 'manual' }); assert.equal(response.headers.get('location'), '/connected');
    const status = await (await fetch(`${app.origin}/status`, { headers: { cookie } })).json();
    assert.equal(status.connected, true); assert.equal(status.preferences.enabled, true); assert.equal(status.preferences.model, 'fictional-model');
    assert.ok(!JSON.stringify(status).includes('NEVER_EXPOSE')); assert.ok(!calls.some(url => url.endsWith('/responses')));
    assert.equal((await (await post('/native/connect')).json()).connected, true);
    assert.ok(vault.read().accounts[0].refreshToken); // Credencial persistida, sem repareamento de cinco minutos.
    const logout = await (await post('/disconnect')).json(); assert.equal(logout.disconnected, true);
    assert.equal(vault.read().preferences.enabled, false);
  } finally { await app.close(); }
});

test('reconnect starts official reauthorization of the same registration when an expired session cannot renew', async () => {
  const vault = memoryVault();
  await vault.update(state => ({ ...state, accounts: [{ clientId: 'oaiapp_saved', identity: { subject: 'fake-user' }, scopes: [DIRECT_SCOPE, 'resource.invoke'], accessToken: 'expired-fictional', refreshToken: '', expiresAt: 0 }], activeClientId: 'oaiapp_saved' }));
  const app = await startPrototype({ port: 0, hostId: 'urn:uuid:11111111-1111-4111-8111-111111111111', vault, fetcher: async () => { throw new Error('No inference or token exchange expected'); } });
  try {
    const home = await fetch(app.origin), cookie = home.headers.get('set-cookie').split(';')[0];
    const { csrf } = await (await fetch(`${app.origin}/config`, { headers: { cookie } })).json();
    const response = await fetch(`${app.origin}/native/connect`, { method: 'POST', headers: { cookie, Origin: app.origin, 'Content-Type': 'application/json', 'X-Octablaster-CSRF': csrf }, body: '{}' });
    assert.equal(response.status, 200);
    const login = new URL((await response.json()).url);
    assert.equal(login.origin, 'https://auth.openai.com'); assert.equal(login.searchParams.get('client_id'), 'oaiapp_saved');
    assert.ok(login.searchParams.get('code_challenge')); assert.equal(vault.read().accounts.length, 1);
  } finally { await app.close(); }
});
