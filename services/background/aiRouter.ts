import { cleanupWriting, rememberWritingLocally } from '@/services/ai/writingMemory';
import { createNativeAiClient } from '@/services/ai/nativeClient';
import { createTicketChatStore, AI_RETENTION_KEY } from '@/services/storage/aiChatStorage';

const actions = ['AI_WRITING_LEARN', 'AI_STATUS', 'AI_CONNECT', 'AI_ACCOUNTS', 'AI_SELECT_ACCOUNT', 'AI_DISCONNECT', 'AI_MODELS', 'AI_PREFERENCES', 'AI_GENERATE', 'AI_CANCEL', 'AI_CHAT_LOAD', 'AI_CHAT_SAVE', 'AI_CONFIG', 'AI_CONFIG_SAVE', 'AI_PROFILE', 'AI_STYLE_SAVE', 'AI_CLEANUP'];
export function createAiRouter(client = createNativeAiClient()) {
  const chats = createTicketChatStore();
  const pending = new Map<string, string>();
  const cancelled = new Set<string>();
  const ownerOf = (sender: any) => `${sender.tab?.id ?? 'ui'}:${sender.frameId ?? 0}`;
  return {
    cleanup: async () => { await cleanupWriting(); return chats.cleanup(); },
    canHandle: (action: string) => actions.includes(action),
    clearTab(tabId: number) { for (const [id, owner] of pending) if (owner.startsWith(`${tabId}:`)) { cancelled.add(id); void client.call('cancel', { requestId: id }).catch(() => {}); } },
    handleMessage(message: any, sender: any, respond: (value: unknown) => void) {
      const extensionPage = !sender.tab || sender.url?.startsWith(browser.runtime.getURL('/'));
      const ticketPage = (() => { try { const url = new URL(sender.tab?.url); return url.protocol === 'https:' && (url.hostname === 'app.octadesk.com' || url.hostname.endsWith('.octadesk.com')); } catch { return false; } })();
      if (!extensionPage && !ticketPage) { respond({ success: false, error: 'Origem não autorizada.' }); return true; }
      void (async () => {
        if (message.action === 'AI_WRITING_LEARN') {
          if (!ticketPage || typeof message.identity !== 'string' || !/^[a-f0-9]{64}$/.test(message.identity) || typeof message.text !== 'string' || message.text.length > 50000) throw new Error('Aprendizado de escrita inválido.');
          await rememberWritingLocally(message.identity, message.text); return { saved: true };
        }
        if (['AI_CONFIG', 'AI_CONFIG_SAVE', 'AI_CLEANUP'].includes(message.action) && !extensionPage) throw new Error('Abra as configurações de IA na extensão.');
        if (message.action === 'AI_CONFIG') { const result = await client.call('config'); await browser.storage.local.set({ octablaster_ai_history_namespace: result.historyNamespace || 'local' }); return result; }
        if (message.action === 'AI_CONFIG_SAVE') { const result = await client.call('configure', { config: message.config }); await browser.storage.local.set({ octablaster_ai_config_revision: crypto.randomUUID(), [AI_RETENTION_KEY]: result.retention, octablaster_ai_history_namespace: result.historyNamespace || 'local' }); await chats.cleanup(); return result; }
        if (message.action === 'AI_CLEANUP') return { ...await chats.cleanup(), ...await client.call('cleanup') };
        if (message.action === 'AI_PROFILE') { const config = await client.call('config'); const profile = config.profiles.find((item: any) => item.id === config.profileId); return { name: profile?.name || '', aliases: profile?.aliases || [], retention: config.retention }; }
        if (message.action === 'AI_STYLE_SAVE') { if (!ticketPage || typeof message.author !== 'string' || message.author.length > 120 || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 2000) throw new Error('Exemplo de estilo inválido.'); return client.call('style', { author: message.author, text: message.text }); }
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
        if (message.action === 'AI_PREFERENCES') { await browser.storage.local.set({ octablaster_ai_config_revision: crypto.randomUUID() }); if (typeof message.model !== 'string' || !message.model || message.model.length > 160) throw new Error('Modelo inválido.'); return client.call('preferences', { model: message.model }); }
        if (message.action === 'AI_CANCEL') { if (pending.get(message.requestId) === ownerOf(sender)) { cancelled.add(message.requestId); await client.call('cancel', { requestId: message.requestId }); } return { cancelled: true }; }
        if (message.action === 'AI_GENERATE') {
          const input = message.input;
          if (!ticketPage || typeof message.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(message.requestId) || pending.has(message.requestId)) throw new Error('Solicitação inválida.');
          if (!['summary_latest', 'summary_full', 'chat'].includes(input?.task) || typeof input.context !== 'string' || !input.context.trim() || input.context.length > 50_000 || typeof input.instruction !== 'string' || !input.instruction.trim() || input.instruction.length > 4000) throw new Error('Somente resumos e perguntas sobre o ticket estão habilitados.');
          const history = input.history ?? [];
          if (!Array.isArray(history) || history.length > 12 || history.length % 2 || history.some((turn: any, index: number) => turn?.role !== (index % 2 ? 'assistant' : 'user') || typeof turn.content !== 'string' || !turn.content.trim()) || history.reduce((sum: number, turn: any) => sum + turn.content.length, 0) > 24_000) throw new Error('Histórico de conversa inválido. Reabra o resumo do ticket.');
          pending.set(message.requestId, ownerOf(sender));
          try {
            if (input.conversationKey !== undefined && (typeof input.conversationKey !== 'string' || !/^[a-f0-9]{64}$/.test(input.conversationKey))) throw new Error('Ticket inválido.');
            if (input.memoryNamespace !== undefined && (typeof input.memoryNamespace !== 'string' || !/^[a-zA-Z0-9_-]{1,90}$/.test(input.memoryNamespace))) throw new Error('Identificação do histórico inválida.');
            const memoryNamespace = input.memoryNamespace || (await browser.storage.local.get(['octablaster_ai_history_namespace'])).octablaster_ai_history_namespace || 'local';
            if (cancelled.has(message.requestId)) throw new Error('Solicitação cancelada.');
            const result = await client.call('generate', { input: { task: input.task, context: input.context, instruction: input.instruction, history, examples: [], memoryNamespace, ...(input.conversationKey ? { conversationKey: input.conversationKey } : {}) } }, message.requestId);
            if (typeof result.text !== 'string' || !result.text || result.text.length > 100_000) throw new Error('A resposta da IA é inválida.');
            return { text: result.text, contextTruncated: result.contextTruncated === true, contextMode: ['remote', 'remote-created', 'compact', 'full'].includes(result.contextMode) ? result.contextMode : undefined };
          } finally { pending.delete(message.requestId); cancelled.delete(message.requestId); }
        }
      })().then(data => respond({ success: true, data }), error => respond({ success: false, error: error instanceof Error ? error.message : 'Falha na integração de IA.' }));
      return true;
    },
  };
}
