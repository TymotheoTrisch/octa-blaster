import { AI_LOCAL_KEY, DEFAULT_AI_HELPER_URL, validateHelperUrl } from '@/services/ai/localClient';

const actions = ['AI_CONFIG', 'AI_PAIR', 'AI_UNPAIR', 'AI_STATUS', 'AI_MODELS', 'AI_GENERATE', 'AI_CANCEL'];

export function createAiRouter(fetcher: typeof fetch = fetch) {
  const pending = new Map<string, { owner: string; controller: AbortController }>();
  async function connection() { return (await browser.storage.local.get([AI_LOCAL_KEY]))[AI_LOCAL_KEY] as { url: string; key: string } | undefined; }
  const ownerOf = (sender: any) => `${sender.tab?.id ?? 'ui'}:${sender.frameId ?? 0}`;
  const runtimeUrl = () => { const url = new URL(browser.runtime.getURL('/')); return `${url.protocol}//${url.host}`; };
  async function call(endpoint: string, input: unknown = {}, signal?: AbortSignal, override?: { url: string; key?: string }) {
    const config = override || await connection();
    if (!config) throw new Error('Abra Inteligência artificial no menu e pareie o auxiliar local.');
    const url = validateHelperUrl(config.url);
    let response;
    try {
      response = await fetcher(`${url}/bridge/${endpoint}`, {
        method: 'POST', credentials: 'omit', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Octablaster-Origin': runtimeUrl(), ...(config.key ? { Authorization: `Bearer ${config.key}` } : {}) },
        body: JSON.stringify(input), signal: signal || AbortSignal.timeout(15_000),
      });
    } catch { throw new Error(signal?.aborted ? 'Geração cancelada ou tempo de espera esgotado.' : 'Auxiliar local indisponível. Inicie o programa no computador.'); }
    let body; try { body = await response.json(); } catch { throw new Error('O auxiliar retornou uma resposta inválida.'); }
    if (!response.ok) throw new Error(body.error || 'O auxiliar recusou a solicitação.');
    return body;
  }
  return {
    canHandle: (action: string) => actions.includes(action),
    handleMessage(message: any, sender: any, respond: (value: unknown) => void) {
      const extensionPage = !sender.tab || sender.url?.startsWith(browser.runtime.getURL('/'));
      const ticketPage = (() => { try { const url = new URL(sender.tab?.url); return url.protocol === 'https:' && (url.hostname === 'app.octadesk.com' || url.hostname.endsWith('.octadesk.com')); } catch { return false; } })();
      if (!extensionPage && !ticketPage) { respond({ success: false, error: 'Origem não autorizada.' }); return true; }
      void (async () => {
        if (['AI_PAIR', 'AI_UNPAIR', 'AI_CONFIG'].includes(message.action) && !extensionPage) throw new Error('Use o menu da extensão para configurar a conexão.');
        if (message.action === 'AI_CONFIG') { const config = await connection(); return { paired: !!config, url: config?.url || DEFAULT_AI_HELPER_URL }; }
        if (message.action === 'AI_PAIR') {
          const url = validateHelperUrl(message.url);
          if (typeof message.code !== 'string' || !/^\d{6}$/.test(message.code)) throw new Error('Informe o código de seis dígitos do auxiliar.');
          const paired = await call('pair', { code: message.code }, undefined, { url });
          if (typeof paired.key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(paired.key)) throw new Error('O pareamento retornou uma chave inválida.');
          await browser.storage.local.set({ [AI_LOCAL_KEY]: { url, key: paired.key } });
          return { paired: true, url };
        }
        if (message.action === 'AI_UNPAIR') { try { await call('unpair'); } catch {} await browser.storage.local.remove(AI_LOCAL_KEY); return { paired: false }; }
        if (message.action === 'AI_STATUS') { const config = await connection(); return config ? { ...await call('status'), paired: true, url: config.url } : { paired: false, url: DEFAULT_AI_HELPER_URL }; }
        if (message.action === 'AI_MODELS') return call('models');
        if (message.action === 'AI_CANCEL') { const task = pending.get(message.requestId); if (task?.owner === ownerOf(sender)) task.controller.abort(); return { cancelled: true }; }
        if (message.action === 'AI_GENERATE') {
          if (!ticketPage || typeof message.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(message.requestId) || pending.has(message.requestId)) throw new Error('Solicitação de geração inválida.');
          const input = message.input;
          if (typeof input?.context !== 'string' || !input.context.trim() || input.context.length > 50_000 || typeof input.instruction !== 'string' || !input.instruction.trim() || input.instruction.length > 4000 || typeof input.model !== 'string' || input.model.length > 160 || !Array.isArray(input.examples) || input.examples.length > 3 || input.examples.some((text: unknown) => typeof text !== 'string' || text.length > 4000)) throw new Error('Revise a orientação, o contexto e os exemplos antes de gerar.');
          if (input.task !== undefined && !['draft', 'summary_latest', 'summary_full', 'chat'].includes(input.task)) throw new Error('Tipo de consulta inválido.');
          if (input.history !== undefined && (!Array.isArray(input.history) || input.history.length > 12 || input.history.length % 2 !== 0 || input.history.some((turn: any, index: number) => turn?.role !== (index % 2 === 0 ? 'user' : 'assistant') || typeof turn.content !== 'string' || !turn.content.trim()) || input.history.reduce((sum: number, turn: any) => sum + turn.content.length, 0) > 24_000)) throw new Error('O histórico do chat ultrapassou o limite ou está inválido. Limpe a conversa e tente novamente.');
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 120_000);
          pending.set(message.requestId, { owner: ownerOf(sender), controller });
          try { const result = await call('draft', input, controller.signal); if (typeof result.text !== 'string' || !result.text || result.text.length > 100_000) throw new Error('A resposta gerada é inválida.'); return { text: result.text }; }
          finally { clearTimeout(timeout); pending.delete(message.requestId); }
        }
        throw new Error('Ação de IA inválida.');
      })().then(data => respond({ success: true, data }), error => respond({ success: false, error: error instanceof Error ? error.message : 'Falha na integração de IA.' }));
      return true;
    },
  };
}
