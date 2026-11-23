import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ChatGPTAuth, PrototypeError } from './auth.mjs';
import { listModels, runSummary } from './inference.mjs';
import { aiSettings, publicSettings, updateSettings, addStyleExample } from './ai-settings.mjs';
import { createProviderEngine } from './provider-engine.mjs';
import { openVault, memoryVault } from './vault.mjs';
import { createBridge } from './bridge.mjs';

const messages = {
  invalid_state: 'O retorno do login não corresponde à tentativa ativa ou expirou. Inicie um novo login.',
  authorization_denied: 'A autorização foi cancelada. Nenhuma solicitação de IA foi feita.',
  registration_incomplete: 'O login não retornou o identificador de registro do aplicativo.',
  token_exchange_failed: 'A troca oficial do código de login falhou. Inicie uma nova tentativa.',
  invalid_identity: 'Não foi possível validar a identidade da conta.',
  plan_permission_missing: 'Login concluído, mas a autorização de uso da franquia não foi concedida.',
  login_required: 'A sessão precisa ser reconectada. Entre novamente na conta selecionada.',
  plan_unavailable: 'O uso do plano foi recusado pela OpenAI. Não haverá troca para uma API paga.',
  usage_unavailable: 'A franquia está indisponível ou atingiu um limite. Nenhuma alternativa paga será usada.',
  stream_interrupted: 'A conexão terminou antes da confirmação final. O texto parcial foi descartado.',
  inference_failed: 'A solicitação não terminou com sucesso. O texto parcial foi descartado.',
  confirmation_required: 'Confirme a conta e as configurações de créditos antes do teste.',
  busy: 'Já existe uma operação em andamento.',
  invalid_model: 'Selecione um modelo da lista atual da conta antes do teste.',
  provider_request_failed: 'A OpenAI recusou ou não conseguiu processar a solicitação. Confira o diagnóstico abaixo.',
  network_error: 'Não foi possível estabelecer a conexão com a OpenAI. Nenhuma nova tentativa foi feita.',
  request_timeout: 'A OpenAI não respondeu dentro do tempo de espera. Nenhuma nova tentativa foi feita.',
  invalid_stream: 'A resposta recebida não contém um stream válido nem um objeto Responses concluído. Confira o formato no diagnóstico.',
  empty_response: 'A OpenAI concluiu a solicitação sem retornar texto.',
  invalid_model_catalog: 'A lista de modelos veio em um formato diferente do esperado.',
  invalid_body: 'A solicitação local é inválida ou excedeu o tamanho permitido.',
  vault_unavailable: 'Não foi possível proteger ou carregar as credenciais. Nenhum arquivo em texto simples será utilizado.',
  refresh_unavailable: 'Não foi possível renovar a sessão agora. As credenciais foram preservadas; tente mais tarde.',
  invalid_account: 'Selecione uma conta cadastrada no auxiliar.',
  pairing_invalid: 'Código de pareamento inválido.',
  pairing_expired: 'O código expirou ou atingiu o limite de tentativas. Gere outro no auxiliar.',
  bridge_forbidden: 'A extensão não está pareada ou a chave foi revogada.',
  generation_disabled: 'Autorize a geração pela extensão no auxiliar local.',
};

async function loadHostId(dataDir) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const path = join(dataDir, 'host.json');
  try {
    const data = JSON.parse(await readFile(path, 'utf8'));
    if (!/^urn:uuid:[0-9a-f-]{36}$/i.test(data.hostId)) throw new Error('invalid host');
    return data.hostId;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new PrototypeError('invalid_host');
    const hostId = `urn:uuid:${randomUUID()}`;
    try { await writeFile(path, JSON.stringify({ hostId }), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code === 'EEXIST') return loadHostId(dataDir); throw error; }
    return hostId;
  }
}

export async function startPrototype({ port = 53894, hostId, vault: providedVault, dataDir = join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'OctaBlaster', 'ChatGPT-Local'), fetcher, verifier } = {}) {
  const stableHost = hostId || await loadHostId(dataDir);
  const vault = providedVault || (hostId ? memoryVault() : await openVault(dataDir));
  const session = randomBytes(32).toString('base64url'), csrf = randomBytes(32).toString('base64url');
  let auth, bridge, engine, origin, busy = false, lastError = '', lastDiagnostic = null, models = [], result = null, nativeLogin = false;
  async function enableNative() {
    models = await listModels(await auth.authorizedAccess(), fetcher);
    const preferred = vault.read().preferences.model;
    const model = models.find(item => item.slug === preferred)?.slug || models[0]?.slug;
    if (!model) throw new PrototypeError('invalid_model_catalog');
    await vault.update(state => ({ ...state, preferences: { enabled: true, model } }));
  }
  const server = createServer(async (req, res) => {
    const headers = {
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    };
    const send = (status, value) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    const reject = () => send(403, { error: 'Solicitação local não autorizada.' });
    if (!origin || req.headers.host !== new URL(origin).host || req.url.length > 8192) return reject();
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && url.pathname === '/health') return send(200, { app: 'OctaBlaster', apiVersion: 2 });
    if (req.method === 'GET' && url.pathname === '/connected') {
      res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><meta charset="utf-8"><title>OctaBlaster</title><h1>Login concluído</h1><p>Volte ao Octadesk. Você pode fechar esta aba; a autorização permanece salva no computador.</p>');
    }
    const readBody = async () => {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > (url.pathname.startsWith('/bridge/') ? 300_000 : url.pathname.startsWith('/ai/') ? 32_000 : 4096)) throw new PrototypeError('invalid_body'); chunks.push(chunk); }
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PrototypeError('invalid_body');
      return value;
    };
    if (url.pathname.startsWith('/bridge/')) {
      const readOnly = url.pathname === '/bridge/status';
      if (busy && !readOnly) return send(409, { error: messages.busy });
      if (!readOnly) busy = true;
      try { await bridge.handle(req, res, url, send, readBody); }
      catch (error) { if (!res.destroyed) send(400, { error: messages[error.code] || (error instanceof Error ? error.message.slice(0, 350) : 'A geração falhou.'), code: error instanceof PrototypeError ? error.code : 'local_error' }); }
      finally { if (!readOnly) busy = false; }
      return;
    }
    if (req.headers.origin && req.headers.origin !== origin) return reject();
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': `octablaster_prototype=${session}; HttpOnly; SameSite=Strict; Path=/` });
      return res.end(await readFile(new URL('./ui.html', import.meta.url), 'utf8'));
    }
    if (req.method === 'GET' && url.pathname === '/auth/callback') {
      if (busy) return send(409, { error: messages.busy });
      busy = true;
      try { await auth.complete(url); if (nativeLogin) await enableNative(); else await vault.update(state => ({ ...state, preferences: { ...state.preferences, enabled: false } })); lastError = ''; lastDiagnostic = null; result = null; }
      catch (error) { lastError = messages[error.code] || 'Não foi possível validar este login. Nenhuma chamada de IA foi feita.'; }
      finally { busy = false; }
      res.writeHead(303, { ...headers, Location: nativeLogin && !lastError ? '/connected' : '/' }); nativeLogin = false;
      return res.end();
    }
    if (!req.headers.cookie?.split(';').some(value => value.trim() === `octablaster_prototype=${session}`)) return reject();
    if (req.method === 'GET' && url.pathname === '/status') return send(200, { ...auth.status(), accounts: auth.accounts(), preferences: vault.read().preferences, pairedClients: vault.read().bridges.length, busy, lastError, lastDiagnostic, result, billingVerified: false });
    if (req.method === 'GET' && url.pathname === '/config') return send(200, { csrf });
    if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['x-octablaster-csrf'] !== csrf || req.headers['content-type'] !== 'application/json') return reject();
    if (url.pathname === '/ai/config') { try { await readBody(); return send(200, publicSettings(vault.read())); } catch { return send(400, { error: 'Solicitação inválida.' }); } }
    if (busy) return send(409, { error: messages.busy });
    busy = true;
    try {
      const input = await readBody();
      if (url.pathname === '/ai/config') return send(200, publicSettings(vault.read()));
      if (url.pathname === '/ai/config/save') { await vault.update(state => updateSettings(state, input)); await engine.cleanup(); return send(200, publicSettings(vault.read())); }
      if (url.pathname === '/ai/style') { await vault.update(state => addStyleExample(state, input.author, input.text)); return send(200, { saved: true }); }
      if (url.pathname === '/ai/forget') return send(200, await engine.forget(input.conversationKey));
      if (url.pathname === '/ai/cleanup') return send(200, await engine.cleanup());
      if (url.pathname === '/native/connect') {
        await vault.update(state => ({ ...state, ai: { ...aiSettings(state), provider: 'chatgpt' } }));
        if (!input.newAccount && auth.status().connected && auth.status().planAuthorized) {
          try { await enableNative(); return send(200, { connected: true }); }
          catch (error) { if (error.code !== 'login_required') throw error; }
        }
        nativeLogin = true; return send(200, { url: auth.begin(input.newAccount ? null : undefined) });
      }
      if (url.pathname === '/native/preferences') {
        models = await listModels(await auth.authorizedAccess(), fetcher);
        if (!models.some(item => item.slug === input.model)) throw new PrototypeError('invalid_model');
        await vault.update(state => ({ ...state, preferences: { ...state.preferences, model: input.model } }));
        return send(200, { saved: true });
      }
      if (url.pathname === '/auth/start') { lastError = ''; lastDiagnostic = null; return send(200, { url: auth.begin(input.newAccount ? null : undefined) }); }
      if (url.pathname === '/account/select') { await auth.select(input.clientId); await vault.update(state => ({ ...state, preferences: { ...state.preferences, enabled: false } })); models = []; return send(200, { selected: true }); }
      if (url.pathname === '/disconnect') { const revocation = await auth.disconnect(); await vault.update(state => ({ ...state, preferences: { ...state.preferences, enabled: false } })); result = null; models = []; lastError = revocation.revocationConfirmed ? '' : 'Sessão local encerrada. A revogação remota não foi confirmada; você pode desconectar o aplicativo nas configurações do ChatGPT.'; lastDiagnostic = null; return send(200, { disconnected: true, revocationConfirmed: revocation.revocationConfirmed }); }
      if (url.pathname === '/pairing/code') return send(200, bridge.issueCode());
      if (url.pathname === '/pairing/revoke') { await vault.update(state => ({ ...state, bridges: [] })); return send(200, { revoked: true }); }
      if (url.pathname === '/preferences') {
        if (typeof input.enabled !== 'boolean' || typeof input.model !== 'string' || input.model.length > 160) throw new PrototypeError('invalid_body');
        if (input.enabled && (!auth.status().connected || !auth.status().planAuthorized || !models.some(item => item.slug === input.model) || input.confirmCredits !== true || input.confirmIdentity !== true)) throw new PrototypeError('confirmation_required');
        await vault.update(state => ({ ...state, preferences: { enabled: input.enabled, model: input.model } }));
        return send(200, { saved: true });
      }
      if (url.pathname === '/models') { models = await listModels(await auth.authorizedAccess(), fetcher); lastError = ''; lastDiagnostic = null; return send(200, { models }); }
      return send(404, { error: 'Rota não encontrada.' });
    } catch (error) {
      lastError = messages[error.code] || (url.pathname.startsWith('/ai/') && error instanceof Error ? error.message.slice(0, 350) : 'A operação falhou. Nenhuma alternativa paga será utilizada.');
      lastDiagnostic = { code: error instanceof PrototypeError ? error.code : 'unexpected_local_error', ...(error instanceof PrototypeError ? error.diagnostic : {}) };
      return send(400, { error: lastError, diagnostic: lastDiagnostic });
    } finally { busy = false; }
  });
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
  catch (error) { await vault.close(); throw error; }
  origin = `http://127.0.0.1:${server.address().port}`;
  auth = new ChatGPTAuth({ hostId: stableHost, redirectUri: `${origin}/auth/callback`, saved: vault.read(), onSave: data => vault.update(state => ({ ...state, ...data })), ...(fetcher ? { fetcher } : {}), ...(verifier ? { verifier } : {}) });
  engine = createProviderEngine({ vault, fetcher, chatgpt: async (input, signal) => { const token = await auth.authorizedAccess(); const catalog = await listModels(token, fetcher); const model = vault.read().preferences.model; if (!catalog.some(item => item.slug === model)) throw new PrototypeError('invalid_model'); return runSummary(token, model, input, fetcher, signal); } });
  bridge = createBridge({ auth, vault, fetcher, engine });
  const housekeeping = setInterval(() => void engine.cleanup().catch(() => {}), 3600_000); housekeeping.unref();
  void engine.cleanup().catch(() => {});
  const close = async () => { clearInterval(housekeeping); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await engine.drain(); await vault.close(); };
  return { origin, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const app = await startPrototype();
    console.log(`OctaBlaster — auxiliar local: ${app.origin}`);
    console.log('Credenciais protegidas pelo Windows. A geração depende de autorização e ação explícita do atendente.');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
  } catch { console.error('Não foi possível iniciar o auxiliar local.'); process.exitCode = 1; }
}
