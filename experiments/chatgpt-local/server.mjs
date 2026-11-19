import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ChatGPTAuth, PrototypeError } from './auth.mjs';
import { listModels, runFictionalTest } from './inference.mjs';

const messages = {
  invalid_state: 'O retorno do login não corresponde à tentativa ativa ou expirou. Inicie um novo login.',
  authorization_denied: 'A autorização foi cancelada. Nenhuma solicitação de IA foi feita.',
  registration_incomplete: 'O login não retornou o identificador de registro do aplicativo.',
  token_exchange_failed: 'A troca oficial do código de login falhou. Inicie uma nova tentativa.',
  invalid_identity: 'Não foi possível validar a identidade da conta.',
  plan_permission_missing: 'Login concluído, mas a autorização de uso da franquia não foi concedida.',
  login_required: 'Faça login novamente. Este protótipo mantém credenciais apenas na memória e não renova tokens.',
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
  invalid_stream: 'A resposta da OpenAI não veio no formato de streaming esperado.',
  empty_response: 'A OpenAI concluiu a solicitação sem retornar texto.',
  invalid_model_catalog: 'A lista de modelos veio em um formato diferente do esperado.',
  invalid_body: 'A solicitação local é inválida ou excedeu o tamanho permitido.',
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

export async function startPrototype({ port = 0, hostId, dataDir = join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'OctaBlaster', 'ChatGPT-Prototype'), fetcher, verifier } = {}) {
  const stableHost = hostId || await loadHostId(dataDir);
  const session = randomBytes(32).toString('base64url'), csrf = randomBytes(32).toString('base64url');
  let auth, origin, busy = false, lastError = '', lastDiagnostic = null, models = [], result = null;
  const server = createServer(async (req, res) => {
    const headers = {
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    };
    const send = (status, value) => { res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    const reject = () => send(403, { error: 'Solicitação local não autorizada.' });
    if (!origin || req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin) || req.url.length > 8192) return reject();
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': `octablaster_prototype=${session}; HttpOnly; SameSite=Strict; Path=/` });
      return res.end(await readFile(new URL('./ui.html', import.meta.url), 'utf8'));
    }
    if (req.method === 'GET' && ['/ui.js', '/ui.css'].includes(url.pathname)) {
      res.writeHead(200, { ...headers, 'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' });
      return res.end(await readFile(new URL(`.${url.pathname}`, import.meta.url), 'utf8'));
    }
    if (req.method === 'GET' && url.pathname === '/auth/callback') {
      if (busy) return send(409, { error: messages.busy });
      busy = true;
      try { await auth.complete(url); lastError = ''; lastDiagnostic = null; result = null; models = []; }
      catch (error) { lastError = messages[error.code] || 'Não foi possível validar este login. Nenhuma chamada de IA foi feita.'; }
      finally { busy = false; }
      res.writeHead(303, { ...headers, Location: '/' });
      return res.end();
    }
    if (!req.headers.cookie?.split(';').some(value => value.trim() === `octablaster_prototype=${session}`)) return reject();
    if (req.method === 'GET' && url.pathname === '/status') return send(200, { ...auth.status(), busy, lastError, lastDiagnostic, result, billingVerified: false });
    if (req.method === 'GET' && url.pathname === '/config') return send(200, { csrf });
    if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['x-octablaster-csrf'] !== csrf || req.headers['content-type'] !== 'application/json') return reject();
    if (busy) return send(409, { error: messages.busy });
    busy = true;
    try {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 2048) throw new PrototypeError('invalid_body'); }
      const input = JSON.parse(raw || '{}');
      if (url.pathname === '/auth/start') { lastError = ''; lastDiagnostic = null; return send(200, { url: auth.begin() }); }
      if (url.pathname === '/disconnect') { auth.disconnect(); result = null; models = []; lastError = ''; lastDiagnostic = null; return send(200, { disconnected: true }); }
      if (url.pathname === '/models') { models = await listModels(auth.access(), fetcher); lastError = ''; lastDiagnostic = null; return send(200, { models }); }
      if (url.pathname === '/test') {
        result = null;
        if (input.confirmIdentity !== true || input.confirmCredits !== true) throw new PrototypeError('confirmation_required');
        if (!models.some(model => model.slug === input.model)) throw new PrototypeError('invalid_model');
        const accessToken = auth.access();
        const generated = await runFictionalTest(accessToken, input.model, fetcher);
        result = { ...generated, model: input.model, completedAt: new Date().toISOString(), billingVerified: false };
        lastError = ''; lastDiagnostic = null;
        return send(200, result);
      }
      return send(404, { error: 'Rota não encontrada.' });
    } catch (error) {
      lastError = messages[error.code] || 'A operação falhou. Nenhuma alternativa paga será utilizada.';
      lastDiagnostic = { code: error instanceof PrototypeError ? error.code : 'unexpected_local_error', ...(error instanceof PrototypeError ? error.diagnostic : {}) };
      return send(400, { error: lastError, diagnostic: lastDiagnostic });
    } finally { busy = false; }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  auth = new ChatGPTAuth({ hostId: stableHost, redirectUri: `${origin}/auth/callback`, ...(fetcher ? { fetcher } : {}), ...(verifier ? { verifier } : {}) });
  const close = () => { auth.disconnect(); server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); };
  return { origin, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const app = await startPrototype();
    console.log(`OctaBlaster — protótipo local: ${app.origin}`);
    console.log('Tokens apenas na memória. Nenhum teste de IA é feito antes do login, da autorização e do clique em Testar.');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
  } catch { console.error('Não foi possível iniciar o protótipo local.'); process.exitCode = 1; }
}
