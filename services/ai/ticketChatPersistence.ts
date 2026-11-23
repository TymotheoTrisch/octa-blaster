import { aiLocalMessage } from './localClient';
import type { SavedTicketChat, TicketChatContent } from '@/services/storage/aiChatStorage';
import { getAiTicketIdentity } from '@/services/octadesk/aiTicketContext';

const pendingWrites = new Map<string, Promise<unknown>>();
function enqueue<T>(identity: string, work: () => Promise<T>): Promise<T> {
  const task = (pendingWrites.get(identity) || Promise.resolve()).then(work);
  const settled = task.catch(() => {}); pendingWrites.set(identity, settled);
  void settled.then(() => { if (pendingWrites.get(identity) === settled) pendingWrites.delete(identity); });
  return task;
}

export async function textDigest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createTicketChatPersistence(scope: HTMLElement, send = aiLocalMessage) {
  const doc = scope.ownerDocument;
  const url = new URL(doc.URL); url.search = ''; url.hash = '';
  // No app compartilhado, acrescenta o subdomínio do workspace quando visível no shell.
  let workspace = '';
  try { workspace = doc.defaultView?.top?.document.querySelector('[class*="subdomain-container_"] button')?.textContent?.trim() || ''; } catch {}
  const number = getAiTicketIdentity(scope).split('|').at(-1) || url.pathname.match(/\/ticket\/(?:edit|view)\/(\d+)/)?.[1];
  const identity = number || scope.getAttribute('ticket-id') || scope.getAttribute('data-ticket-id') || scope.id;
  const queueKey = `${url.origin}|${workspace}|${identity}`;
  let digest: Promise<string> | undefined;
  const key = () => {
    if (!identity) throw new Error('Não foi possível identificar este ticket para salvar a conversa.');
    return digest ||= textDigest(queueKey);
  };
  let revision: string | null = null;
  return {
    load(): Promise<SavedTicketChat | null> {
      return enqueue(queueKey, async () => {
        const result = await send('AI_CHAT_LOAD', { key: await key() });
        revision = result.chat?.revision ?? null;
        return result.chat;
      });
    },
    save(content: TicketChatContent): Promise<void> {
      const snapshot = structuredClone(content);
      return enqueue(queueKey, async () => {
        const result = await send('AI_CHAT_SAVE', { key: await key(), revision, content: snapshot });
        revision = result.chat.revision;
      });
    },
  };
}
