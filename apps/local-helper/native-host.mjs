import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodeNativeMessage, readNativeMessages } from './native-protocol.mjs';
import { localSession } from './native-session.mjs';

const ORIGIN = 'http://127.0.0.1:53894';

export async function ensureHelper(fetcher = fetch, launch = () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], { detached: true, windowsHide: true, stdio: 'ignore' });
  child.on('error', () => {}); child.unref();
}) {
  const ready = async () => {
    try { const response = await fetcher(`${ORIGIN}/health`, { signal: AbortSignal.timeout(800) }); if (response.ok && (await response.json()).apiVersion === 2) return true; await localSession(fetcher); return true; } catch { return false; }
  };
  if (await ready()) return;
  launch();
  for (let i = 0; i < 100; i++) { await new Promise(resolve => setTimeout(resolve, 100)); if (await ready()) return; }
  throw new Error('Não foi possível iniciar o auxiliar. Atualize a instalação com Instalar-IA-Firefox.exe.');
}

export function startNativeHost({ input = process.stdin, output = process.stdout, fetcher = fetch, ensure = ensureHelper } = {}) {
  const origin = `moz-extension://${randomUUID()}`;
  const pending = new Map();
  let sessionTask;
  async function session() {
    await ensure();
    if (sessionTask) {
      try { const cached = await sessionTask; await cached.local.alive(); return cached; }
      catch { sessionTask = null; }
    }
    if (!sessionTask) sessionTask = (async () => {
      const local = await localSession(fetcher);
      const code = await local.post('/pairing/code');
      const paired = await fetcher(`${ORIGIN}/bridge/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Octablaster-Origin': origin }, body: JSON.stringify({ code: code.code }) });
      const { key } = await paired.json();
      if (!paired.ok || !/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Error('Não foi possível conectar ao auxiliar.');
      const bridge = async (path, body = {}, signal = AbortSignal.timeout(30_000)) => {
        const response = await fetcher(`${ORIGIN}/bridge/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Octablaster-Origin': origin, Authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'A solicitação falhou.'); return result;
      };
      return { local, bridge };
    })().catch(error => { sessionTask = null; throw error; });
    return sessionTask;
  }
  const send = value => output.write(encodeNativeMessage(value));
  readNativeMessages(input, message => {
    if (typeof message?.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(message.id)) return;
    if (message.action === 'cancel') { pending.get(message.requestId)?.abort(); send({ id: message.id, success: true, data: {} }); return; }
    if (pending.has(message.id)) return;
    const controller = new AbortController(); pending.set(message.id, controller);
    void (async () => {
      const { local, bridge } = await session();
      if (controller.signal.aborted) throw new Error('Solicitação cancelada.');
      if (message.action === 'status') { await local.afterLogin(); return bridge('status'); }
      if (message.action === 'config') return local.post('/ai/config');
      if (message.action === 'configure') return local.post('/ai/config/save', message.config);
      if (message.action === 'style') return local.post('/ai/style', { author: message.author, text: message.text });
      if (message.action === 'forget') return local.post('/ai/forget', { conversationKey: message.conversationKey });
      if (message.action === 'cleanup') return local.post('/ai/cleanup');
      if (message.action === 'connect') return local.connect(message.newAccount === true);
      if (message.action === 'accounts') return { accounts: await local.accounts() };
      if (message.action === 'select') return local.select(message.clientId);
      if (message.action === 'disconnect') return local.post('/disconnect');
      if (message.action === 'models') return bridge('models');
      if (message.action === 'preferences') return local.preferences(message.model);
      if (message.action === 'generate') {
        if (!['summary_latest', 'summary_full', 'chat'].includes(message.input?.task)) throw new Error('Somente resumos e perguntas estão habilitados nesta versão.');
        const status = await bridge('status');
        return bridge('draft', { ...message.input, model: status.model }, AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]));
      }
      throw new Error('Ação não disponível.');
    })().then(data => send({ id: message.id, success: true, data }), error => send({ id: message.id, success: false, error: controller.signal.aborted ? 'Solicitação cancelada.' : error.message || 'O auxiliar local falhou.' })).finally(() => pending.delete(message.id));
  }, () => { for (const task of pending.values()) task.abort(); });
  input.on('end', () => {
    for (const task of pending.values()) task.abort();
    void sessionTask?.then(({ bridge }) => bridge('unpair')).catch(() => {});
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startNativeHost();
