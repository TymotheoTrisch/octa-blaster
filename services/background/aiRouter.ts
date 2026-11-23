import { createNativeAiClient } from '@/services/ai/nativeClient';
import { createTicketChatStore } from '@/services/storage/aiChatStorage';

const actions = ['AI_STATUS', 'AI_CONNECT', 'AI_ACCOUNTS', 'AI_SELECT_ACCOUNT', 'AI_DISCONNECT', 'AI_MODELS', 'AI_PREFERENCES', 'AI_GENERATE', 'AI_CANCEL', 'AI_CHAT_LOAD', 'AI_CHAT_SAVE'];
export function createAiRouter(client = createNativeAiClient()) {
  const chats = createTicketChatStore();
  const pending = new Map<string, string>();
  const ownerOf = (sender: any) => `${sender.tab?.id ?? 'ui'}:${sender.frameId ?? 0}`;
  return {
    canHandle: (action: string) => actions.includes(action),
    clearTab(tabId: number) { for (const [id, owner] of pending) if (owner.startsWith(`${tabId}:`)) void client.call('cancel', { requestId: id }).catch(() => {}); },
    handleMessage(message: any, sender: any, respond: (value: unknown) => void) {
      const extensionPage = !sender.tab || sender.url?.startsWith(browser.runtime.getURL('/'));
      const ticketPage = (() => { try { const url = new URL(sender.tab?.url); return url.protocol === 'https:' && (url.hostname === 'app.octadesk.com' || url.hostname.endsWith('.octadesk.com')); } catch { return false; } })();
      if (!extensionPage && !ticketPage) { respond({ success: false, error: 'Origem não autorizada.' }); return true; }
      void (async () => {
        if (message.action === 'AI_CHAT_LOAD' || message.action === 'AI_CHAT_SAVE') {
          if (!ticketPage) throw new Error('Abra a conversa no ticket do Octadesk.');
          const frameUrl = new URL(sender.url || sender.tab.url);
          if (frameUrl.protocol !== 'https:' || !(frameUrl.hostname === 'app.octadesk.com' || frameUrl.hostname.endsWith('.octadesk.com'))) throw new Error('Frame não autorizado.');
          return chats.handle(message.action, message.key, message.revision, message.content);
        }
        if (['AI_CONNECT', 'AI_ACCOUNTS', 'AI_SELECT_ACCOUNT', 'AI_DISCONNECT', 'AI_PREFERENCES'].includes(message.action) && !extensionPage) throw new Error('Use Inteligência artificial no menu da extensão para alterar a conexão.');
        if (message.action === 'AI_STATUS') return client.call('status');
        if (message.action === 'AI_ACCOUNTS') return client.call('accounts');
        if (message.action === 'AI_CONNECT' || message.action === 'AI_SELECT_ACCOUNT') {
          if (message.action === 'AI_SELECT_ACCOUNT' && (typeof message.clientId !== 'string' || !/^[a-zA-Z0-9_.-]{1,256}$/.test(message.clientId))) throw new Error('Conta inválida.');
          const result = message.action === 'AI_CONNECT' ? await client.call('connect', { newAccount: message.newAccount === true }) : await client.call('select', { clientId: message.clientId });
          if (result.url) {
            const url = new URL(result.url);
            if (url.origin !== 'https://auth.openai.com' || url.pathname !== '/api/accounts/authorize') throw new Error('O endereço de login retornado é inválido.');
            await browser.tabs.create({ url: url.href });
          }
          return { connecting: !!result.url, connected: !!result.connected };
        }
        if (message.action === 'AI_DISCONNECT') return client.call('disconnect');
        if (message.action === 'AI_MODELS') return client.call('models');
        if (message.action === 'AI_PREFERENCES') { if (typeof message.model !== 'string' || !message.model || message.model.length > 160) throw new Error('Modelo inválido.'); return client.call('preferences', { model: message.model }); }
        if (message.action === 'AI_CANCEL') { if (pending.get(message.requestId) === ownerOf(sender)) await client.call('cancel', { requestId: message.requestId }); return { cancelled: true }; }
        if (message.action === 'AI_GENERATE') {
          const input = message.input;
          if (!ticketPage || typeof message.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(message.requestId) || pending.has(message.requestId)) throw new Error('Solicitação inválida.');
          if (!['summary_latest', 'summary_full', 'chat'].includes(input?.task) || typeof input.context !== 'string' || !input.context.trim() || input.context.length > 50_000 || typeof input.instruction !== 'string' || !input.instruction.trim() || input.instruction.length > 4000) throw new Error('Somente resumos e perguntas sobre o ticket estão habilitados.');
          const history = input.history ?? [];
          if (!Array.isArray(history) || history.length > 12 || history.length % 2 || history.some((turn: any, index: number) => turn?.role !== (index % 2 ? 'assistant' : 'user') || typeof turn.content !== 'string' || !turn.content.trim()) || history.reduce((sum: number, turn: any) => sum + turn.content.length, 0) > 24_000) throw new Error('Histórico de conversa inválido. Reabra o resumo do ticket.');
          pending.set(message.requestId, ownerOf(sender));
          try {
            const result = await client.call('generate', { input: { task: input.task, context: input.context, instruction: input.instruction, history, examples: [] } }, message.requestId);
            if (typeof result.text !== 'string' || !result.text || result.text.length > 100_000) throw new Error('A resposta da IA é inválida.');
            return { text: result.text };
          } finally { pending.delete(message.requestId); }
        }
      })().then(data => respond({ success: true, data }), error => respond({ success: false, error: error instanceof Error ? error.message : 'Falha na integração de IA.' }));
      return true;
    },
  };
}
