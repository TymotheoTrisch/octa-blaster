import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatGPTAuth, DIRECT_SCOPE, RESOURCE } from '../auth.mjs';
const record = { clientId: 'oaiapp_saved', identity: { subject: 'fake-user', email: 'test@example.invalid' }, accessToken: 'old-access', refreshToken: 'old-refresh', idToken: 'old-id', scopes: [DIRECT_SCOPE, 'resource.invoke'], expiresAt: 100_001 };
const base = { hostId: 'urn:uuid:11111111-1111-4111-8111-111111111111', redirectUri: 'http://127.0.0.1:12345/auth/callback', now: () => 100_000, saved: { accounts: [record], activeClientId: record.clientId } };

test('refresh is serialized, uses the issued registration and persists the rotating token', async () => {
  let calls = 0, saved;
  const auth = new ChatGPTAuth({ ...base, onSave: async state => { saved = state; }, fetcher: async (_url, options) => {
    calls++;
    assert.equal(options.body.get('grant_type'), 'refresh_token');
    assert.equal(options.body.get('client_id'), record.clientId);
    assert.equal(options.body.get('refresh_token'), record.refreshToken);
    assert.equal(options.body.get('resource'), RESOURCE);
    assert.equal(options.body.has('scope'), false);
    await new Promise(resolve => setTimeout(resolve, 10));
    return Response.json({ access_token: 'new-access', refresh_token: 'rotated-refresh', expires_in: 3600 });
  } });
  assert.deepEqual(await Promise.all([auth.authorizedAccess(), auth.authorizedAccess()]), ['new-access', 'new-access']);
  assert.equal(calls, 1);
  assert.equal(saved.accounts[0].refreshToken, 'rotated-refresh');
  assert.ok(!JSON.stringify(auth.status()).includes('refresh'));
});

test('temporary renewal failure preserves credentials; terminal grant failure clears only that session', async () => {
  const auth = new ChatGPTAuth({ ...base, fetcher: async () => new Response('', { status: 503 }) });
  await assert.rejects(auth.authorizedAccess(), /refresh_unavailable/);
  assert.equal(auth.status().connected, true);
  let saved;
  auth.onSave = async state => { saved = state; };
  auth.fetcher = async () => Response.json({ error: 'invalid_grant' }, { status: 400 });
  await assert.rejects(auth.authorizedAccess(), /login_required/);
  assert.equal(auth.status().connected, false);
  assert.equal(saved.accounts[0].clientId, record.clientId);
  assert.equal(saved.accounts[0].refreshToken, '');
});

test('reauthorization reuses its client ID and rejects callback identity swaps', async () => {
  const auth = new ChatGPTAuth({ ...base, fetcher: async () => Response.json({ access_token: 'access', id_token: 'id', token_type: 'Bearer', expires_in: 3600, scope: `${DIRECT_SCOPE} resource.invoke` }), verifier: async () => ({ subject: 'different-user' }) });
  const start = new URL(auth.begin());
  assert.equal(start.searchParams.get('client_id'), record.clientId);
  assert.equal(start.searchParams.has('agent_name_hint'), false);
  const callback = new URL(base.redirectUri); callback.search = new URLSearchParams({ code: 'fake-code', state: start.searchParams.get('state') });
  await assert.rejects(auth.complete(callback), /invalid_identity/);
  assert.equal(auth.status().identity.subject, record.identity.subject);
  assert.equal(new URL(auth.begin(null)).searchParams.get('client_id'), 'dynamic_agent_client');
});
