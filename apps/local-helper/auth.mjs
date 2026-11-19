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
  constructor(code, diagnostic = {}) { super(code); this.code = code; this.diagnostic = diagnostic; }
}

export async function verifyIdentity(token, clientId, nonce, keys = jwks) {
  const { payload } = await jwtVerify(token, keys, {
    issuer: ISSUER, audience: clientId, algorithms: ['RS256', 'ES256'],
    requiredClaims: ['sub', 'exp', 'iat', ...(nonce ? ['nonce'] : [])], clockTolerance: 5,
  });
  if (!payload.sub || (nonce && !equal(payload.nonce, nonce))) throw new PrototypeError('invalid_identity');
  if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId) throw new PrototypeError('invalid_identity');
  return { subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : '', name: typeof payload.name === 'string' ? payload.name : '' };
}

export class ChatGPTAuth {
  #pending;
  #records = new Map();
  #activeClientId = null;
  #refreshTask;
  constructor({ hostId, redirectUri, fetcher = fetch, verifier = verifyIdentity, now = Date.now, saved = {}, onSave = async () => {} }) {
    if (!/^urn:uuid:[0-9a-f-]{36}$/i.test(hostId)) throw new PrototypeError('invalid_host');
    const callback = new URL(redirectUri);
    if (callback.protocol !== 'http:' || callback.hostname !== '127.0.0.1' || callback.pathname !== '/auth/callback' || callback.search || callback.hash || callback.username || callback.password) throw new PrototypeError('invalid_callback');
    this.hostId = hostId;
    this.redirectUri = redirectUri;
    this.fetcher = fetcher;
    this.verifier = verifier;
    this.now = now;
    this.onSave = onSave;
    for (const record of saved.accounts || []) {
      if (!record.clientId || !record.identity?.subject || !Array.isArray(record.scopes)) throw new PrototypeError('vault_unavailable');
      this.#records.set(record.clientId, record);
    }
    this.#activeClientId = saved.activeClientId || null;
  }
  begin(clientId = this.#activeClientId) {
    // Uma nova tentativa não substitui a identidade ativa antes da validação.
    const state = opaque(), nonce = opaque(), verifier = opaque();
    const selected = clientId ? this.#records.get(clientId) : null;
    if (clientId && !selected) throw new PrototypeError('invalid_account');
    this.#pending = { state, nonce, verifier, clientId: selected?.clientId, subject: selected?.identity.subject, expiresAt: this.now() + 10 * 60_000 };
    const url = new URL(AUTHORIZE);
    url.search = new URLSearchParams({
      client_id: selected?.clientId || 'dynamic_agent_client', ...(!selected ? { agent_name_hint: 'OctaBlaster' } : {}), ext_agent_host_id: this.hostId,
      response_type: 'code', redirect_uri: this.redirectUri, scope: SCOPES, resource: RESOURCE,
      state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      ...(selected?.idToken ? { id_token_hint: selected.idToken } : {}),
      ...(selected?.identity.email ? { login_hint: selected.identity.email } : {}),
    }).toString();
    return url.href;
  }
  async complete(url) {
    const pending = this.#pending;
    for (const key of ['state', 'code', 'client_id', 'error']) if (url.searchParams.getAll(key).length > 1) throw new PrototypeError('invalid_callback');
    if (!pending || pending.expiresAt <= this.now() || !equal(url.searchParams.get('state'), pending.state)) throw new PrototypeError('invalid_state');
    this.#pending = undefined; // O callback válido só pode ser consumido uma vez.
    if (url.searchParams.has('error')) throw new PrototypeError('authorization_denied');
    const clientId = url.searchParams.get('client_id') || pending.clientId, code = url.searchParams.get('code');
    if (!clientId || !/^[a-zA-Z0-9_.-]{1,256}$/.test(clientId) || clientId === 'dynamic_agent_client' || !code) throw new PrototypeError('registration_incomplete');
    if (pending.clientId && clientId !== pending.clientId) throw new PrototypeError('invalid_identity');
    const response = await this.fetcher(TOKEN_ENDPOINT, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: pending.verifier, redirect_uri: this.redirectUri, resource: RESOURCE }),
    });
    if (!response.ok) throw new PrototypeError('token_exchange_failed');
    const tokens = await response.json();
    if (typeof tokens.id_token !== 'string' || typeof tokens.access_token !== 'string' || !tokens.access_token || tokens.token_type?.toLowerCase() !== 'bearer' || (tokens.refresh_token !== undefined && typeof tokens.refresh_token !== 'string') || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw new PrototypeError('invalid_token_response');
    const identity = await this.verifier(tokens.id_token, clientId, pending.nonce);
    if (pending.subject && identity.subject !== pending.subject) throw new PrototypeError('invalid_identity');
    // Nunca usa o scope do callback como prova de autorização.
    const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : [];
    const records = new Map(this.#records);
    records.set(clientId, { identity, clientId, accessToken: tokens.access_token, idToken: tokens.id_token, refreshToken: tokens.refresh_token || '', scopes, expiresAt: this.now() + tokens.expires_in * 1000 });
    await this.onSave({ accounts: [...records.values()], activeClientId: clientId });
    this.#records = records; this.#activeClientId = clientId;
    return this.status();
  }
  status() {
    const session = this.#records.get(this.#activeClientId);
    return session ? {
      connected: !!session.accessToken, identity: session.identity, clientId: session.clientId,
      planAuthorized: session.scopes.includes(DIRECT_SCOPE) && session.scopes.includes('resource.invoke'),
      expired: session.expiresAt <= this.now(), expiresAt: session.expiresAt,
    } : { connected: false, planAuthorized: false, expired: false };
  }
  access() {
    const status = this.status();
    if (!status.connected || status.expired) throw new PrototypeError('login_required');
    if (!status.planAuthorized) throw new PrototypeError('plan_permission_missing');
    return this.#records.get(this.#activeClientId).accessToken;
  }
  accounts() { return [...this.#records.values()].map(record => ({ clientId: record.clientId, identity: record.identity, active: record.clientId === this.#activeClientId, connected: !!record.accessToken })); }
  async select(clientId) {
    if (!this.#records.has(clientId)) throw new PrototypeError('invalid_account');
    await this.onSave({ accounts: [...this.#records.values()], activeClientId: clientId });
    this.#activeClientId = clientId;
  }
  async authorizedAccess() {
    const record = this.#records.get(this.#activeClientId);
    if (!record?.accessToken) throw new PrototypeError('login_required');
    if (record.expiresAt - this.now() > 60_000) return this.access();
    if (!record.refreshToken) return this.access();
    if (!this.#refreshTask) this.#refreshTask = this.#refresh(record).finally(() => { this.#refreshTask = undefined; });
    await this.#refreshTask;
    return this.access();
  }
  async #refresh(record) {
    const response = await this.fetcher(TOKEN_ENDPOINT, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: record.clientId, refresh_token: record.refreshToken, resource: RESOURCE }) });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        let body; try { body = await response.json(); } catch {}
        if (['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused'].includes(body?.error)) {
          this.#records.set(record.clientId, { ...record, accessToken: '', refreshToken: '', idToken: '' });
          await this.onSave({ accounts: [...this.#records.values()], activeClientId: this.#activeClientId });
          throw new PrototypeError('login_required');
        }
      }
      throw new PrototypeError('refresh_unavailable');
    }
    const tokens = await response.json();
    if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw new PrototypeError('invalid_token_response');
    if (tokens.id_token) {
      const identity = await this.verifier(tokens.id_token, record.clientId);
      if (identity.subject !== record.identity.subject) throw new PrototypeError('invalid_identity');
    }
    const updated = { ...record, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, idToken: tokens.id_token || record.idToken,
      scopes: typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : record.scopes, expiresAt: this.now() + tokens.expires_in * 1000 };
    this.#records.set(record.clientId, updated); // Não reutiliza o refresh token rotacionado se a gravação falhar.
    await this.onSave({ accounts: [...this.#records.values()], activeClientId: this.#activeClientId });
  }
  async disconnect() {
    const record = this.#records.get(this.#activeClientId);
    this.#pending = undefined;
    if (record) this.#records.set(record.clientId, { ...record, accessToken: '', refreshToken: '', idToken: '' });
    await this.onSave({ accounts: [...this.#records.values()], activeClientId: this.#activeClientId });
    let revocationConfirmed = !record?.refreshToken;
    if (record?.refreshToken) {
      try {
        const metadata = await (await this.fetcher(`${ISSUER}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000), redirect: 'error' })).json();
        const endpoint = new URL(metadata.revocation_endpoint);
        if (endpoint.origin !== ISSUER || endpoint.username || endpoint.password) throw new Error('invalid endpoint');
        const response = await this.fetcher(endpoint.href, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: record.refreshToken, token_type_hint: 'refresh_token', client_id: record.clientId }) });
        revocationConfirmed = response.ok;
      } catch {}
    }
    return { revocationConfirmed };
  }
}
