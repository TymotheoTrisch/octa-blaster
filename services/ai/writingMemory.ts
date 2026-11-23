import { textDigest } from './ticketChatPersistence';

export const AI_BEHAVIOR_KEY = 'octablaster_ai_behavior';
export const AI_WRITING_KEY = 'octablaster_ai_writing';
export interface AiBehavior { automaticReplies: boolean; learnWriting: boolean }
interface Pattern { count: number; words: number; paragraphs: number; greeting: number; closing: number; updated: number }
export async function readAiBehavior(): Promise<AiBehavior> {
  const data = await browser.storage.local.get([AI_BEHAVIOR_KEY]);
  const saved = data[AI_BEHAVIOR_KEY] as Partial<AiBehavior> | undefined;
  return { automaticReplies: saved?.automaticReplies === true, learnWriting: saved?.learnWriting !== false };
}
export function writingPattern(text: string) {
  return { words: Math.min(1000, text.split(/\s+/).filter(Boolean).length), paragraphs: Math.min(20, text.split(/\n+/).filter(value => value.trim()).length), greeting: /^(olá|oi|bom dia|boa tarde|boa noite|prezad)/i.test(text.trim()) ? 1 : 0, closing: /(atenciosamente|fico (à|a) disposição|aguardo|obrigad|até mais|no aguardo)[!.,\s]*$/i.test(text.trim()) ? 1 : 0 };
}
export async function writingIdentity(editor: HTMLElement) {
  const doc = editor.ownerDocument;
  const user = editor.closest('.comment-panel')?.querySelector('bexs-thumb[user-logged] img')?.getAttribute('alt')?.trim();
  if (!user) return null; // Sem autoria confirmada, não mistura estilos de agentes.
  let workspace = '';
  try { workspace = doc.defaultView?.top?.document.querySelector('[class*="subdomain-container_"] button')?.textContent?.trim() || ''; } catch {}
  const data = await browser.storage.local.get(['octablaster_ai_history_namespace']);
  return textDigest(`${new URL(doc.URL).origin}|${workspace}|${user}|${data.octablaster_ai_history_namespace || 'local'}`);
}
let queue = Promise.resolve();
export function rememberWriting(identity: string, text: string) {
  if (browser.runtime?.sendMessage) return browser.runtime.sendMessage({ action: 'AI_WRITING_LEARN', identity, text }).then(result => { if (!result?.success) throw new Error('Não foi possível atualizar o aprendizado.'); });
  return rememberWritingLocally(identity, text);
}
export function rememberWritingLocally(identity: string, text: string) {
  const task = queue.then(async () => {
    if (!(await readAiBehavior()).learnWriting || text.trim().length < 20) return;
    const data = await browser.storage.local.get([AI_WRITING_KEY]);
    const now = Date.now(), records = (data[AI_WRITING_KEY] || {}) as Record<string, Pattern>;
    for (const [key, value] of Object.entries(records)) if (now - value.updated > 90 * 86400000) delete records[key];
    const old = records[identity], fresh = writingPattern(text), count = Math.min(old?.count || 0, 19);
    records[identity] = { count: count + 1, updated: now, ...Object.fromEntries(Object.entries(fresh).map(([key, value]) => [key, ((old?.[key as keyof Pattern] || 0) * count + value) / (count + 1)])) } as Pattern;
    const recent = Object.fromEntries(Object.entries(records).sort((a, b) => b[1].updated - a[1].updated).slice(0, 20));
    await browser.storage.local.set({ [AI_WRITING_KEY]: recent });
  });
  queue = task.catch(() => {}); return task;
}
export function cleanupWriting() {
  const task = queue.then(async () => {
    const data = await browser.storage.local.get([AI_WRITING_KEY]);
    if (!data[AI_WRITING_KEY]) return;
    const records = data[AI_WRITING_KEY] as Record<string, Pattern>;
    const fresh = Object.fromEntries(Object.entries(records).filter(([, value]) => value && Number.isFinite(value.updated) && Date.now() - value.updated <= 90 * 86400000));
    if (Object.keys(fresh).length !== Object.keys(records).length) await browser.storage.local.set({ [AI_WRITING_KEY]: fresh });
  });
  queue = task.catch(() => {}); return task;
}
export async function writingGuidance(identity: string | null) {
  if (!identity || !(await readAiBehavior()).learnWriting) return '';
  const data = await browser.storage.local.get([AI_WRITING_KEY]);
  const pattern = (data[AI_WRITING_KEY] as Record<string, Pattern> | undefined)?.[identity];
  if (!pattern || !Object.values(pattern).every(Number.isFinite) || pattern.count < 3 || Date.now() - pattern.updated > 90 * 86400000) return '';
  return `Padrões de escrita observados em respostas enviadas por este atendente: aproximadamente ${Math.round(pattern.words)} palavras e ${Math.max(1, Math.round(pattern.paragraphs))} parágrafos; ${pattern.greeting >= .6 ? 'costuma iniciar com saudação' : 'prefere iniciar diretamente'}; ${pattern.closing >= .6 ? 'costuma usar um encerramento cordial' : 'prefere encerramento breve'}. Adapte a extensão à necessidade deste ticket. Esses padrões não fornecem fatos do cliente.`;
}
