import type { AiChatTurn } from '@/types/ai';

export interface SavedTicketChat {
  version: 1;
  revision: string;
  messages: AiChatTurn[];
  draft: string;
  contextDigest: string;
  updatedAt: number;
  createdAt?: number;
  usedAt?: number;
}
export type TicketChatContent = Pick<SavedTicketChat, 'messages' | 'draft' | 'contextDigest'>;
const PREFIX = 'octablaster_ticket_chat_v1_';
export const AI_RETENTION_KEY = 'octablaster_ai_retention';
const DAY = 86400_000;
const expired = (chat: SavedTicketChat, policy: { idleDays: number; maxDays: number }, now: number) => now - (chat.usedAt || chat.updatedAt) > policy.idleDays * DAY || now - (chat.createdAt || chat.updatedAt) > policy.maxDays * DAY;
function retention(data: any) { const value = data[AI_RETENTION_KEY]; return value && Number.isInteger(value.idleDays) && value.idleDays >= 1 && Number.isInteger(value.maxDays) && value.maxDays >= value.idleDays && value.maxDays <= 365 ? value : { idleDays: 30, maxDays: 90 }; }
function validate(value: any): TicketChatContent {
  if (!value || !Array.isArray(value.messages) || value.messages.length > 1000 || value.messages.some((turn: any) => !['user', 'assistant'].includes(turn?.role) || typeof turn.content !== 'string' || !turn.content.trim() || turn.content.length > 100_000) || typeof value.draft !== 'string' || value.draft.length > 4000 || typeof value.contextDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.contextDigest) || JSON.stringify(value).length > 1_000_000) throw new Error('Conversa inválida ou acima do limite local.');
  return { messages: value.messages.map((turn: AiChatTurn) => ({ role: turn.role, content: turn.content })), draft: value.draft, contextDigest: value.contextDigest };
}

/** Fila no background e revisão otimista evitam sobrescrever o chat de outra aba. */
export function createTicketChatStore(storage = () => browser.storage.local, now = Date.now) {
  let queue = Promise.resolve<unknown>(undefined);
  return {
    cleanup() {
      const task = queue.then(async () => { const area = storage(), data = await area.get(null), policy = retention(data); const keys = Object.entries(data).filter(([key, value]) => key.startsWith(PREFIX) && value && expired(value as SavedTicketChat, policy, now())).map(([key]) => key); if (keys.length) await area.remove(keys); return { deleted: keys.length }; });
      queue = task.catch(() => {}); return task;
    },
    handle(operation: string, key: unknown, revision?: unknown, content?: unknown) {
      const task = queue.then(async () => {
        if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) throw new Error('Identificador de conversa inválido.');
        const name = PREFIX + key, area = storage();
        const data = await area.get([name, AI_RETENTION_KEY]);
        let current = data[name] as SavedTicketChat | undefined;
        if (current && expired(current, retention(data), now())) { await area.remove(name); current = undefined; }
        if (current && (current.version !== 1 || typeof current.revision !== 'string')) throw new Error('Não foi possível ler a conversa salva.');
        if (current) validate(current);
        if (operation === 'AI_CHAT_LOAD') { if (current) { current = { ...current, usedAt: now() }; await area.set({ [name]: current }); } return { chat: current || null }; }
        if (revision !== (current?.revision ?? null)) throw new Error('A conversa foi atualizada em outra janela. Feche e reabra para continuar sem sobrescrever o histórico.');
        const chat: SavedTicketChat = { ...validate(content), version: 1, revision: crypto.randomUUID(), updatedAt: now(), createdAt: current?.createdAt || current?.updatedAt || now(), usedAt: now() };
        await area.set({ [name]: chat }); // Nunca copia dados do ticket para localStorage da página.
        return { chat };
      });
      queue = task.catch(() => {});
      return task;
    },
  };
}
