import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { ChatGPTAuth, DIRECT_SCOPE, ISSUER, RESOURCE, TOKEN_ENDPOINT, verifyIdentity } from '../auth.mjs';

const hostId = 'urn:uuid:11111111-1111-4111-8111-111111111111';
const redirectUri = 'http://127.0.0.1:54321/auth/callback';
const tokenResponse = scope => new Response(JSON.stringify({ id_token: 'fictional-id-token', access_token: 'fictional-access-token', token_type: 'Bearer', expires_in: 3600, scope }), { headers: { 'Content-Type': 'application/json' } });
function callback(authorization, overrides = {}) {
  const url = new URL(redirectUri);
  url.search = new URLSearchParams({ state: authorization.searchParams.get('state'), code: 'fictional-code', client_id: 'oaiapp_fictional', ...overrides });
  return url;
}
function fixture(scope = `${DIRECT_SCOPE} resource.invoke`) {
  const calls = [];
  const auth = new ChatGPTAuth({ hostId, redirectUri,
    fetcher: async (url, options) => { calls.push({ url, options }); return tokenResponse(scope); },
    verifier: async () => ({ subject: 'fictional-subject', email: 'test@example.invalid', name: 'Conta fictícia' }),
  });
  return { auth, calls };
}

test('dynamic registration has fresh state, nonce and PKCE, with official loopback and resource', () => {
  const { auth } = fixture();
  const first = new URL(auth.begin()), second = new URL(auth.begin());
  assert.equal(second.origin, ISSUER);
  assert.equal(second.pathname, '/api/accounts/authorize');
  for (const [key, value] of Object.entries({ client_id: 'dynamic_agent_client', agent_name_hint: 'OctaBlaster', ext_agent_host_id: hostId, redirect_uri: redirectUri, code_challenge_method: 'S256', resource: RESOURCE })) assert.equal(second.searchParams.get(key), value);
  for (const key of ['state', 'nonce', 'code_challenge']) assert.notEqual(first.searchParams.get(key), second.searchParams.get(key));
  assert.ok(second.searchParams.get('scope').split(' ').includes(DIRECT_SCOPE));
});

test('invalid state never exchanges a code, issued client ID is used once and callback replay fails', async () => {
  const { auth, calls } = fixture();
  const start = new URL(auth.begin());
  await assert.rejects(auth.complete(callback(start, { state: 'forged' })), /invalid_state/);
  assert.equal(calls.length, 0);
  const status = await auth.complete(callback(start));
  assert.equal(status.planAuthorized, true);
  assert.equal(status.identity.subject, 'fictional-subject');
  assert.equal(calls[0].url, TOKEN_ENDPOINT);
  assert.equal(calls[0].options.body.get('client_id'), 'oaiapp_fictional');
  assert.equal(calls[0].options.body.get('redirect_uri'), redirectUri);
  assert.equal(calls[0].options.body.get('resource'), RESOURCE);
  assert.ok(calls[0].options.body.get('code_verifier'));
  await assert.rejects(auth.complete(callback(start)), /invalid_state/);
  assert.equal(calls.length, 1);
  assert.equal(auth.access(), 'fictional-access-token');
  assert.ok(!JSON.stringify(auth.status()).includes('token'));
  assert.ok(!JSON.stringify(auth).includes('fictional-access-token'));
});

test('callback scopes cannot authorize inference if token-response scopes do not grant it', async () => {
  const { auth } = fixture('openid profile email');
  const start = new URL(auth.begin());
  const status = await auth.complete(callback(start, { scope: `${DIRECT_SCOPE} resource.invoke` }));
  assert.equal(status.connected, true);
  assert.equal(status.planAuthorized, false);
  assert.throws(() => auth.access(), /plan_permission_missing/);
});

test('denial and incomplete registration do not call the token endpoint', async () => {
  for (const overrides of [{ error: 'access_denied' }, { client_id: '' }, { client_id: 'dynamic_agent_client' }]) {
    const { auth, calls } = fixture();
    const start = new URL(auth.begin());
    await assert.rejects(auth.complete(callback(start, overrides)));
    assert.equal(calls.length, 0);
    assert.equal(auth.status().connected, false);
  }
});

test('expired state or access prevents continuing; disconnect clears credentials', async () => {
  let clock = 1_000;
  const auth = new ChatGPTAuth({ hostId, redirectUri, now: () => clock, fetcher: async () => tokenResponse(`${DIRECT_SCOPE} resource.invoke`), verifier: async () => ({ subject: 'account' }) });
  let start = new URL(auth.begin());
  clock += 11 * 60_000;
  await assert.rejects(auth.complete(callback(start)), /invalid_state/);
  start = new URL(auth.begin());
  await auth.complete(callback(start));
  clock += 3601_000;
  assert.throws(() => auth.access(), /login_required/);
  auth.disconnect();
  assert.equal(auth.status().connected, false);
});

test('a failed new identity check preserves the previous verified account', async () => {
  const { auth } = fixture();
  await auth.complete(callback(new URL(auth.begin())));
  auth.verifier = async () => { throw new Error('invalid identity'); };
  await assert.rejects(auth.complete(callback(new URL(auth.begin()))));
  assert.equal(auth.status().identity.subject, 'fictional-subject');
});

test('ID token verification validates cryptographic signature, issuer, audience, expiry and nonce', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = async changes => new SignJWT({ sub: 'verified-account', email: 'test@example.invalid', nonce: 'expected-nonce', iss: ISSUER, aud: 'oaiapp_test', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 120, ...changes }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(privateKey);
  const token = await sign({});
  assert.equal((await verifyIdentity(token, 'oaiapp_test', 'expected-nonce', keys)).subject, 'verified-account');
  for (const changes of [{ iss: 'https://attacker.invalid' }, { aud: 'other-app' }, { nonce: 'wrong' }, { exp: 1 }]) await assert.rejects(verifyIdentity(await sign(changes), 'oaiapp_test', 'expected-nonce', keys));
  const segments = token.split('.');
  segments[1] = Buffer.from(JSON.stringify({ sub: 'forged', nonce: 'expected-nonce' })).toString('base64url');
  await assert.rejects(verifyIdentity(segments.join('.'), 'oaiapp_test', 'expected-nonce', keys));
});

test('localhost aliases and non-loopback callbacks are rejected', () => {
  for (const uri of ['http://localhost:1455/auth/callback', 'http://0.0.0.0:1455/auth/callback', 'https://example.invalid/auth/callback', 'http://127.0.0.1:1455/callback']) assert.throws(() => new ChatGPTAuth({ hostId, redirectUri: uri }), /invalid_callback/);
});
