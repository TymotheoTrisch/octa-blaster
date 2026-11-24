import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { PrototypeError } from './auth.mjs';
import { listModels, runSummary } from './inference.mjs';
import { aiSettings } from './ai-settings.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const extensionOrigin = value => typeof value === 'string' && /^(?:moz-extension|chrome-extension):\/\/[a-zA-Z0-9-]+$/.test(value);
export function createBridge({ auth, vault, fetcher, engine, now = Date.now }) {
  let pairing = null;
  return {
    issueCode() { pairing = { code: String(randomInt(0, 1_000_000)).padStart(6, '0'), expiresAt: now() + 5 * 60_000, attempts: 0 }; return { code: pairing.code, expiresAt: pairing.expiresAt }; },
    async handle(req, res, url, send, readBody) {
      if (!url.pathname.startsWith('/bridge/')) return false;
      const clientOrigin = req.headers['x-octablaster-origin'];
      if (!extensionOrigin(clientOrigin) || (req.headers.origin && req.headers.origin !== clientOrigin)) throw new PrototypeError('bridge_forbidden');
      if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') throw new PrototypeError('bridge_forbidden');
      const input = await readBody();
      if (url.pathname === '/bridge/pair') {
        if (!pairing || pairing.expiresAt <= now() || pairing.attempts >= 5) throw new PrototypeError('pairing_expired');
        pairing.attempts++;
        if (typeof input.code !== 'string' || !/^\d{6}$/.test(input.code) || !timingSafeEqual(Buffer.from(input.code), Buffer.from(pairing.code))) throw new PrototypeError('pairing_invalid');
        pairing = null;
        const key = randomBytes(32).toString('base64url');
        await vault.update(state => ({ ...state, bridges: [...state.bridges.filter(item => item.origin !== clientOrigin), { origin: clientOrigin, hash: digest(key) }] }));
        send(200, { key }); return true;
      }
      const key = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
      const stored = vault.read().bridges.find(item => item.origin === clientOrigin);
      if (!key || !stored || !timingSafeEqual(Buffer.from(digest(key)), Buffer.from(stored.hash))) throw new PrototypeError('bridge_forbidden');
      const preferences = vault.read().preferences;
      const ai = aiSettings(vault.read()), config = ai.providers[ai.provider];
      if (url.pathname === '/bridge/status') { const status = auth.status(), api = ai.provider !== 'chatgpt'; send(200, { connected: api ? !!config?.apiKey : status.connected, planAuthorized: api ? !!config?.apiKey : status.planAuthorized, enabled: api ? !!config?.apiKey : !!preferences.enabled, account: api ? `API ${ai.provider}` : status.identity?.email || status.identity?.name || '', model: api ? config?.model || '' : preferences.model, provider: ai.provider, contextMode: ai.provider === 'gateway' ? 'gateway' : api && ['openai', 'gemini'].includes(ai.provider) && config?.remoteStore !== false ? 'remote' : 'compact' }); return true; }
      if (url.pathname === '/bridge/unpair') { await vault.update(state => ({ ...state, bridges: state.bridges.filter(item => item.origin !== clientOrigin) })); send(200, { disconnected: true }); return true; }
      if (ai.provider !== 'chatgpt') {
        if (!config?.apiKey) throw new Error('Configure a chave do provedor selecionado.');
        if (url.pathname === '/bridge/models') { send(200, { models: config.model ? [{ slug: config.model, name: config.model }] : [], preferredModel: config.model }); return true; }
      } else if (!preferences.enabled) throw new PrototypeError('generation_disabled');
      if (url.pathname === '/bridge/models') { send(200, { models: await listModels(await auth.authorizedAccess(), fetcher), preferredModel: preferences.model }); return true; }
      if (url.pathname === '/bridge/draft') {
        if (!['summary_latest', 'summary_full', 'chat', 'general'].includes(input.task)) throw new PrototypeError('invalid_body');
        if (engine) {
          const controller = new AbortController(), cancel = () => { if (!res.writableEnded) controller.abort(); };
          res.once('close', cancel);
          try { const value = await engine.generate(input, controller.signal); if (!res.destroyed) send(200, value); } finally { res.off('close', cancel); }
          return true;
        }
        const token = await auth.authorizedAccess();
        const catalog = await listModels(token, fetcher);
        const model = input.model || preferences.model;
        if (!catalog.some(item => item.slug === model)) throw new PrototypeError('invalid_model');
        if (res.destroyed) throw new PrototypeError('request_cancelled');
        const controller = new AbortController();
        const cancel = () => { if (!res.writableEnded) controller.abort(); };
        res.once('close', cancel);
        try { const result = await runSummary(token, model, input, fetcher, controller.signal); if (!res.destroyed) send(200, result); }
        finally { res.off('close', cancel); }
        return true;
      }
      throw new PrototypeError('invalid_body');
    },
  };
}
