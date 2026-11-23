import { aiLocalMessage } from '@/services/ai/localClient';
import type { AiChatTurn, AiTask } from '@/types/ai';

export type SummarySend = typeof aiLocalMessage;
export function createSummaryRequest(send: SummarySend = aiLocalMessage) {
  let active: string | null = null, revision = 0, notice = '';
  return {
    contextNotice: () => notice,
    async run(task: AiTask, context: string, instruction: string, history: AiChatTurn[] = [], conversationKey?: string, memoryNamespace?: string) {
      if (active) throw new Error('Aguarde a resposta atual.');
      const requestId = crypto.randomUUID(), version = ++revision; active = requestId;
      try {
        const result = await send('AI_GENERATE', { requestId, input: { task, context, instruction, history, ...(conversationKey ? { conversationKey } : {}), ...(memoryNamespace ? { memoryNamespace } : {}) } });
        if (version === revision) notice = result.contextTruncated ? 'Nesta pergunta foram enviados trechos selecionados do ticket; alguns detalhes ficaram fora do recorte.' : result.contextMode === 'remote' ? 'Continuação com contexto salvo no provedor.' : '';
        return version === revision ? result.text as string : null;
      } finally { if (version === revision) active = null; }
    },
    cancel() { revision++; if (active) void send('AI_CANCEL', { requestId: active }).catch(() => {}); active = null; },
  };
}

export function boundedChat(history: AiChatTurn[]): AiChatTurn[] {
  const recent = [...history];
  while (recent.length > 12 || recent.reduce((size, turn) => size + turn.content.length, 0) > 24_000) recent.splice(0, 2);
  return recent;
}
