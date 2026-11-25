import type { PanelSnapshot } from '@/types/aiPanel';
import { AI_RETENTION_KEY, expiredLocalRecord, retentionFromData } from './aiRetention';

const PREFIX = 'octablaster_ticket_context_v1_';
export interface StoredAiTicket {
  key: string; namespace: string; context: string; digest: string; title: string;
  ticketNumber?: string; ticketUrl?: string;
  createdAt: number; updatedAt: number; usedAt: number;
}
function validate(record: StoredAiTicket) {
  if (!record || !/^[a-f0-9]{64}$/.test(record.key) || !/^[\w-]{1,90}$/.test(record.namespace)
    || typeof record.context !== 'string' || !record.context.trim() || record.context.length > 50000
    || !/^[a-f0-9]{64}$/.test(record.digest) || typeof record.title !== 'string' || record.title.length > 1000
    || (record.ticketNumber !== undefined && !/^\d{1,20}$/.test(record.ticketNumber))) throw new Error('Dados locais do ticket inválidos.');
  if (record.ticketUrl) {
    const url = new URL(record.ticketUrl);
    if (url.protocol !== 'https:' || !(url.hostname === 'app.octadesk.com' || url.hostname.endsWith('.octadesk.com')) || url.username || url.password) throw new Error('Endereço do ticket inválido.');
  }
}

/** Base local separada dos chats: nunca lê a página para recuperar um ticket salvo. */
export function createAiTicketStore(storage = () => browser.storage.local, now = Date.now) {
  let queue: Promise<unknown> = Promise.resolve();
  function serialized<T>(work: () => Promise<T>) {
    const task = queue.then(work); queue = task.catch(() => {}); return task;
  }
  async function records() {
    const area = storage(), data = await area.get(null), policy = retentionFromData(data);
    const valid: StoredAiTicket[] = [], expired: string[] = [];
    for (const [name, record] of Object.entries(data)) {
      if (!name.startsWith(PREFIX)) continue;
      const value = record as StoredAiTicket;
      try { validate(value); } catch { continue; }
      if (expiredLocalRecord(value, policy, now())) expired.push(name); else valid.push(value);
    }
    if (expired.length) await area.remove(expired);
    return { valid, expired: expired.length };
  }
  return {
    save(snapshot: PanelSnapshot, ticketUrl?: string) {
      return serialized(async () => {
        const area = storage(), name = PREFIX + snapshot.key;
        const data = await area.get([name, AI_RETENTION_KEY]);
        const previous = data[name] as StoredAiTicket | undefined;
        const createdAt = previous && !expiredLocalRecord(previous, retentionFromData(data), now()) ? previous.createdAt : now();
        const record: StoredAiTicket = {
          key: snapshot.key, namespace: snapshot.namespace, context: snapshot.context, digest: snapshot.digest,
          title: snapshot.title, ...(snapshot.ticketNumber ? { ticketNumber: snapshot.ticketNumber } : {}),
          ...(ticketUrl ? { ticketUrl } : {}), createdAt, updatedAt: now(), usedAt: now(),
        };
        validate(record); await area.set({ [name]: record }); return record;
      });
    },
    load(key: string, namespace: string) {
      return serialized(async () => {
        if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Identificador do ticket inválido.');
        const area = storage(), name = PREFIX + key;
        const data = await area.get([name, AI_RETENTION_KEY]), record = data[name] as StoredAiTicket | undefined;
        if (!record) return null;
        validate(record);
        if (expiredLocalRecord(record, retentionFromData(data), now())) { await area.remove(name); return null; }
        if (record.namespace !== namespace) return null;
        const used = { ...record, usedAt: now() };
        await area.set({ [name]: used }); return used;
      });
    },
    findByNumber(number: string, namespace: string) {
      return serialized(async () => {
        const found = (await records()).valid.filter(item => item.ticketNumber === number && item.namespace === namespace);
        if (found.length > 1) throw new Error('Há tickets com esse número em mais de um workspace. Escolha a conversa no histórico.');
        return found[0] || null;
      });
    },
    cleanup: () => serialized(async () => ({ deletedTickets: (await records()).expired })),
  };
}
export const aiTicketStore = createAiTicketStore();
