import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const ISSUER = 'https://auth.openai.com';
export const AUTHORIZE = `${ISSUER}/api/accounts/authorize`;
export const TOKEN_ENDPOINT = `${ISSUER}/api/accounts/oauth/token`;
export const RESOURCE = 'https://api.openai.com/v1';
export const DIRECT_SCOPE = 'chatgpt.tokens.use.direct';
const SCOPES = `openid profile email offline_access resource.invoke ${DIRECT_SCOPE}`;
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`), { timeoutDuration: 15_000 });
const opaque = () => randomBytes(32).toString('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export class PrototypeError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export async function verifyIdentity(token, clientId, nonce, keys = jwks) {
  const { payload } = await jwtVerify(token, keys, {
    issuer: ISSUER, audience: clientId, algorithms: ['RS256', 'ES256'],
    requiredClaims: ['sub', 'exp', 'iat', 'nonce'], clockTolerance: 5,
  });
  if (!payload.sub || !equal(payload.nonce, nonce)) throw new PrototypeError('invalid_identity');
  if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId) throw new PrototypeError('invalid_identity');
  return { subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : '', name: typeof payload.name === 'string' ? payload.name : '' };
}

export class ChatGPTAuth {
  #pending;
  #session;
  constructor({ hostId, redirectUri, fetcher = fetch, verifier = verifyIdentity, now = Date.now }) {
    if (!/^urn:uuid:[0-9a-f-]{36}$/i.test(hostId)) throw new PrototypeError('invalid_host');
    const callback = new URL(redirectUri);
    if (callback.protocol !== 'http:' || callback.hostname !== '127.0.0.1' || callback.pathname !== '/auth/callback' || callback.search || callback.hash || callback.username || callback.password) throw new PrototypeError('invalid_callback');
    this.hostId = hostId;
    this.redirectUri = redirectUri;
    this.fetcher = fetcher;
    this.verifier = verifier;
    this.now = now;
  }
  begin() {
    // Uma nova tentativa não substitui a identidade ativa antes da validação.
    const state = opaque(), nonce = opaque(), verifier = opaque();
    this.#pending = { state, nonce, verifier, expiresAt: this.now() + 10 * 60_000 };
    const url = new URL(AUTHORIZE);
    url.search = new URLSearchParams({
      client_id: 'dynamic_agent_client', agent_name_hint: 'OctaBlaster', ext_agent_host_id: this.hostId,
      response_type: 'code', redirect_uri: this.redirectUri, scope: SCOPES, resource: RESOURCE,
      state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    }).toString();
    return url.href;
  }
  async complete(url) {
    const pending = this.#pending;
    for (const key of ['state', 'code', 'client_id', 'error']) if (url.searchParams.getAll(key).length > 1) throw new PrototypeError('invalid_callback');
    if (!pending || pending.expiresAt <= this.now() || !equal(url.searchParams.get('state'), pending.state)) throw new PrototypeError('invalid_state');
    this.#pending = undefined; // O callback válido só pode ser consumido uma vez.
    if (url.searchParams.has('error')) throw new PrototypeError('authorization_denied');
    const clientId = url.searchParams.get('client_id'), code = url.searchParams.get('code');
    if (!clientId || !/^[a-zA-Z0-9_.-]{1,256}$/.test(clientId) || clientId === 'dynamic_agent_client' || !code) throw new PrototypeError('registration_incomplete');
    const response = await this.fetcher(TOKEN_ENDPOINT, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: pending.verifier, redirect_uri: this.redirectUri, resource: RESOURCE }),
    });
    if (!response.ok) throw new PrototypeError('token_exchange_failed');
    const tokens = await response.json();
    if (typeof tokens.id_token !== 'string' || typeof tokens.access_token !== 'string' || !tokens.access_token || tokens.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw new PrototypeError('invalid_token_response');
    const identity = await this.verifier(tokens.id_token, clientId, pending.nonce);
    // Nunca usa o scope do callback como prova de autorização.
    const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : [];
    this.#session = { identity, clientId, accessToken: tokens.access_token, scopes, expiresAt: this.now() + tokens.expires_in * 1000 };
    return this.status();
  }
  status() {
    const session = this.#session;
    return session ? {
      connected: true, identity: session.identity, clientId: session.clientId,
      planAuthorized: session.scopes.includes(DIRECT_SCOPE) && session.scopes.includes('resource.invoke'),
      expired: session.expiresAt <= this.now(), expiresAt: session.expiresAt,
    } : { connected: false, planAuthorized: false, expired: false };
  }
  access() {
    const status = this.status();
    if (!status.connected || status.expired) throw new PrototypeError('login_required');
    if (!status.planAuthorized) throw new PrototypeError('plan_permission_missing');
    return this.#session.accessToken;
  }
  disconnect() { this.#session = undefined; this.#pending = undefined; }
}
