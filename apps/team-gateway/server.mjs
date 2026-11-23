import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openVault } from '../local-helper/vault.mjs';
import { publicSettings, updateSettings } from '../local-helper/ai-settings.mjs';
import { createProviderEngine } from '../local-helper/provider-engine.mjs';
import { aesCodec } from './encryption.mjs';

export function validateUsers(users) {
  if (!Array.isArray(users) || !users.length || users.length > 500 || new Set(users.map(user => user.id)).size !== users.length || new Set(users.map(user => user.tokenHash)).size !== users.length) throw new Error('Cadastre usuários distintos.');
  for (const user of users) if (!/^[a-zA-Z0-9_-]{1,64}$/.test(user.id) || !/^[a-f0-9]{64}$/.test(user.tokenHash) || !['openai', 'gemini', 'claude', 'nvidia'].includes(user.provider) || typeof user.model !== 'string' || !user.model || !/^[A-Z][A-Z0-9_]{1,80}$/.test(user.apiKeyEnv) || !Number.isInteger(user.perMinute) || user.perMinute < 1 || user.perMinute > 60 || !Number.isInteger(user.dailyRequests) || user.dailyRequests < 1 || user.dailyRequests > 10000) throw new Error('Configuração de usuário inválida.');
  return users;
}

export async function startGateway({ users, dataDir = './data', masterKey, secrets = process.env, fetcher = fetch, port = 8787, host = '127.0.0.1', vaultFactory, now = Date.now } = {}) {
  validateUsers(users); const codec = vaultFactory ? null : aesCodec(masterKey), contexts = new Map(), rates = new Map();
  if (!vaultFactory) await mkdir(dataDir, { recursive: true, mode: 0o700 });
  try {
    for (const user of users) {
      const vault = vaultFactory ? await vaultFactory(user.id) : await openVault(join(dataDir, user.id), codec);
      contexts.set(user.id, { vault });
      await vault.update(state => updateSettings(state, { ...publicSettings(state), provider: user.provider, retention: user.retention || { idleDays: 30, maxDays: 90 }, providers: { [user.provider]: { model: user.model, apiKey: secrets[user.apiKeyEnv], remoteStore: user.remoteStore !== false, approvedData: user.approvedData === true } } }));
      if (!secrets[user.apiKeyEnv]) throw new Error('Falta uma credencial de provedor no servidor.');
      contexts.get(user.id).engine = createProviderEngine({ vault, fetcher, now, allowClientPersona: true });
    }
  } catch (error) { await Promise.all([...contexts.values()].map(context => context.vault.close())); throw error; }
  const server = createServer(async (req, res) => {
    const send = (status, value) => { if (res.destroyed) return; res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
    if (req.url === '/health' && req.method === 'GET') return send(200, { app: 'OctaBlaster Team Gateway' });
    if (req.headers.origin || req.url.length > 256) return send(403, { error: 'Origem recusada.' });
    const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
    if (!token) return send(401, { error: 'Credencial necessária.' });
    const digest = createHash('sha256').update(token).digest();
    const user = users.find(item => timingSafeEqual(digest, Buffer.from(item.tokenHash, 'hex')));
    if (!user) return send(401, { error: 'Credencial inválida.' });
    const context = contexts.get(user.id);
    if (req.method !== 'POST' || !['/v1/generate', '/v1/forget', '/v1/status'].includes(req.url) || req.headers['content-type'] !== 'application/json') return send(404, { error: 'Rota indisponível.' });
    const minute = Math.floor(now() / 60_000), rate = rates.get(user.id);
    if (rate?.minute === minute && rate.count >= user.perMinute) return send(429, { error: 'Limite por minuto atingido.' });
    rates.set(user.id, { minute, count: rate?.minute === minute ? rate.count + 1 : 1 });
    const controller = new AbortController(), cancel = () => { if (!res.writableEnded) controller.abort(); }; res.once('close', cancel);
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 300_000) throw new Error('Solicitação acima do limite.'); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('Solicitação inválida.');
      if (req.url === '/v1/status') return send(200, { provider: user.provider, model: user.model, retention: user.retention || { idleDays: 30, maxDays: 90 }, pendingDeletes: publicSettings(context.vault.read()).pendingDeletes });
      if (req.url === '/v1/forget') return send(200, await context.engine.forget(input.conversationKey));
      const day = new Date(now()).toISOString().slice(0, 10);
      await context.vault.update(state => { const count = state.gatewayUsage?.day === day ? state.gatewayUsage.count : 0; if (count >= user.dailyRequests) throw new Error('Limite diário atingido.'); return { ...state, gatewayUsage: { day, count: count + 1 } }; });
      return send(200, await context.engine.generate(input, controller.signal));
    } catch (error) { return send(/Limite/.test(error.message) ? 429 : 400, { error: error.name === 'SyntaxError' ? 'JSON inválido.' : error.message.slice(0, 350) }); }
    finally { res.off('close', cancel); }
  });
  server.requestTimeout = 120_000; server.headersTimeout = 10_000;
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); } catch (error) { await Promise.all([...contexts.values()].map(context => context.vault.close())); throw error; }
  const housekeeping = setInterval(() => { for (const context of contexts.values()) void context.engine.cleanup().catch(() => {}); }, 3600_000); housekeeping.unref();
  for (const context of contexts.values()) void context.engine.cleanup().catch(() => {});
  return { origin: `http://${host}:${server.address().port}`, async close() { clearInterval(housekeeping); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); for (const context of contexts.values()) { await context.engine.drain(); await context.vault.close(); } } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const users = JSON.parse(await readFile(process.env.OCTA_USERS_FILE || './users.json', 'utf8'));
    const app = await startGateway({ users, masterKey: process.env.OCTA_MASTER_KEY, dataDir: process.env.OCTA_DATA_DIR || './data', host: process.env.OCTA_BIND || '127.0.0.1', port: Number(process.env.PORT || 8787) });
    console.log('OctaBlaster Team Gateway iniciado.');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void app.close().then(() => process.exit(0)));
  } catch { console.error('Falha ao iniciar. Confira usuários, segredos e diretório de dados.'); process.exitCode = 1; }
}
