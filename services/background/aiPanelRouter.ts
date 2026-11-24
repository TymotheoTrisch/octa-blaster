import type { AiPanelState, PanelSnapshot, PanelTask } from '@/types/aiPanel';
import {readAiPrompts,summaryPrompt} from '@/services/ai/promptSettings';
import { TICKET_SUMMARY_PROMPT, SUMMARY_FORMAT_VERSION, summaryContextDigest } from '@/services/ai/summaryFormat';
import { boundedChat } from '@/services/ai/summaryRequest';
import { textDigest } from '@/services/ai/ticketChatPersistence';
import { withoutGeneratedSignature } from '@/services/ai/replySignature';

const FULL = TICKET_SUMMARY_PROMPT;
type AiCall = (message: any, sender: any) => Promise<any>;
interface Session { state: AiPanelState; sender: any; identity: string; task: PanelTask; snapshot?: PanelSnapshot; revision: string | null; request?: string; save: Promise<unknown>; insertions: Map<number, string>; cancelled: boolean; warning?: string; persistent?: boolean; summaryDigest?: string; summaryQuestion?: string }
const allowed = (url: string) => { try { const value = new URL(url); return value.protocol === 'https:' && (value.hostname === 'app.octadesk.com' || value.hostname.endsWith('.octadesk.com')); } catch { return false; } };
const deferredSidebarWindows = new Set<number>();
export function createAiPanelRouter(callAi: AiCall, openSidebar = (windowId: number, _alreadyOpened = false) => {
  const api = browser as any;
  if (api.sidebarAction?.isOpen) {
    return api.sidebarAction.isOpen({windowId}).then(async (opened:boolean) => {
      if(opened){deferredSidebarWindows.delete(windowId);return;}
      // Firefox não transfere o gesto de um botão do site para o background.
      deferredSidebarWindows.add(windowId);
      try { await api.browserAction.openPopup({windowId}); } catch { /* O aviso e o ícone da extensão mantêm o acesso ao resumo. */ }
    });
  }
  const chromium = (globalThis as any).chrome;
  if (api.sidePanel?.open) return api.sidePanel.open({ windowId });
  if (chromium?.sidePanel?.open) return chromium.sidePanel.open({ windowId });
  throw new Error('O navegador não disponibilizou o painel lateral.');
}) {
  const sessions = new Map<number, Session>();
  const pendingReveal = new Map<number, number>();
  const cache = new Map<string, { text: string; at: number }>();
  const progress = (session: Session, override?: {busy:boolean; status:string; error?:string}) => {
    const state = session.state;
    void browser.tabs.sendMessage(session.sender.tab.id, {action:'AI_PANEL_PROGRESS',id:state.id,identity:session.identity,progress: override || {busy:state.busy || (!state.ready && !state.error && !session.cancelled),status:(state.status+(deferredSidebarWindows.has(session.sender.tab.windowId) ? ' Abra o ícone da extensão e escolha Abrir resumo na lateral.' : '')).slice(0,500),error:state.busy ? '' : state.error.slice(0,2000)}}, {frameId:session.sender.frameId ?? 0}).catch(() => {});
  };
  const changed = (windowId: number, reveal = false) => {
    void browser.runtime.sendMessage({ action: 'AI_PANEL_CHANGED', windowId, reveal }).catch(() => {});
    const session = sessions.get(windowId); if (session) progress(session);
  };
  const active = (windowId: number, session: Session) => sessions.get(windowId) === session && !session.cancelled;
  const cancel = (session: Session) => { session.cancelled = true; if (session.request) void callAi({ action: 'AI_CANCEL', requestId: session.request }, session.sender).catch(() => {}); };
  const persist = (session: Session) => {
    if (!session.snapshot || !session.state.ready || session.persistent === false) return Promise.resolve();
    const content = structuredClone({ messages: session.state.messages, draft: session.state.draft, contextDigest: session.summaryDigest || '0'.repeat(64) });
    session.save = session.save.catch(() => {}).then(async () => {
      const result = await callAi({ action: 'AI_CHAT_SAVE', key: session.snapshot!.key, revision: session.revision, content }, session.sender);
      session.revision = result.chat.revision;
    });
    return session.save;
  };
  async function snapshot(session: Session): Promise<PanelSnapshot> {
    const tab = await browser.tabs.get(session.sender.tab.id);
    if (!tab.active || tab.windowId !== session.sender.tab.windowId) throw new Error('Volte à aba deste ticket para continuar.');
    const data = await browser.tabs.sendMessage(session.sender.tab.id, { action: 'AI_PANEL_SNAPSHOT', id: session.state.id, identity: session.identity }, { frameId: session.sender.frameId ?? 0 });
    if (!data?.success) throw new Error(data?.error || 'O ticket mudou. Abra o resumo novamente.');
    return validateSnapshot(data.data);
  }
  function validateSnapshot(value: any): PanelSnapshot {
    if (!value || typeof value.context !== 'string' || !value.context.trim() || value.context.length > 50000 || typeof value.title !== 'string' || value.title.length > 1000 || !/^[a-f0-9]{64}$/.test(value.key) || !/^[a-f0-9]{64}$/.test(value.digest) || !/^[\w-]{1,90}$/.test(value.namespace) || (value.selection !== undefined && (typeof value.selection !== 'string' || value.selection.length > 50000)) || (value.style !== undefined && (typeof value.style !== 'string' || value.style.length > 1800)) || (value.direction !== undefined && (typeof value.direction !== 'string' || value.direction.length > 1200)) || (value.draftToken !== undefined && !/^[a-zA-Z0-9-]{1,80}$/.test(value.draftToken))) throw new Error('Contexto do ticket inválido.');
    return value;
  }
  async function run(windowId: number, session: Session, question: string, task: 'summary_full' | 'summary_latest' | 'chat', useCache: boolean, source?: string, editIndex?: number) {
    if (!active(windowId, session)) return;
    session.state.busy = true; session.state.error = session.warning || ''; session.state.status = 'Preparando o contexto…'; changed(windowId);
    const original = [...session.state.messages];
    const base = editIndex === undefined ? original : original.slice(0, editIndex);
    const before = task === 'summary_full' || task === 'summary_latest' ? [] : boundedChat(base[0]?.role === 'assistant' ? [{ role: 'user' as const, content: session.summaryQuestion || FULL }, ...base] : base);
    try {
      const fresh = await snapshot(session);
      if (!active(windowId, session)) return;
      if (fresh.key !== session.snapshot!.key || fresh.namespace !== session.snapshot!.namespace) throw new Error('A conexão ou o ticket mudou. Reabra pelo botão do ticket.');
      session.snapshot = fresh;
      if (source && source !== fresh.selection) throw new Error('O e-mail mudou. Resuma a versão atual novamente.');
      const context = source || fresh.context;
      const revision = (await browser.storage.local.get(['octablaster_ai_config_revision'])).octablaster_ai_config_revision || '';
      const cacheKey = await textDigest(JSON.stringify([revision, fresh.namespace, task, context, question]));
      const cached = useCache ? cache.get(cacheKey) : undefined;
      let text = cached && Date.now() - cached.at < 15 * 60000 ? cached.text : '';
      session.state.cached = !!text;
      if (!text) {
        session.state.status = 'Aguardando a IA…'; session.request = crypto.randomUUID(); changed(windowId);
        const start = Date.now();
        const result = await callAi({ action: 'AI_GENERATE', requestId: session.request, input: { task, context, instruction: question, history: before, conversationKey: task === 'summary_latest' ? undefined : fresh.key, memoryNamespace: fresh.namespace } }, session.sender);
        session.state.queryMs = Date.now() - start; text = result.text;
        if (!active(windowId, session)) return;
        if (useCache) { cache.set(cacheKey, { text, at: Date.now() }); while (cache.size > 20) cache.delete(cache.keys().next().value!); }
      } else session.state.queryMs = 0;
      if (!active(windowId, session)) return;
      const confirmed = await snapshot(session);
      if (!active(windowId, session)) return;
      if (confirmed.digest !== fresh.digest) throw new Error('As mensagens mudaram durante a consulta. Gere novamente.');
      if (session.task === 'reply' && fresh.draftToken) {
        text = withoutGeneratedSignature(text).text;
        if (!text.trim()) throw new Error('A IA não retornou uma resposta utilizável.');
      }
      const latest = session.state.messages.at(-1);
      if (!(latest?.role === 'assistant' && latest.content === text && original.at(-2)?.content === question)) {
        session.state.messages = task === 'summary_full' && !original.length ? [{ role: 'assistant', content: text }] : [...base, { role: 'user', content: question }, { role: 'assistant', content: text }];
      }
      if (session.task === 'reply' && fresh.draftToken) session.insertions.set(session.state.messages.length - 1, fresh.draftToken);
      if(task === 'summary_full') session.summaryDigest=await textDigest(summaryContextDigest(fresh.digest,question));
      if(task === 'chat') session.state.draft = '';
      session.state.status = session.state.cached ? 'Resumo reaproveitado; nenhuma nova consulta à IA.' : 'Pronto para revisar.';
      try { await persist(session); } catch { session.warning = 'Resposta exibida, mas o histórico não pôde ser salvo neste computador.'; session.state.error = session.warning; }
    } catch (error) { if (active(windowId, session)) { session.state.error = error instanceof Error ? error.message : 'Não foi possível consultar a IA.'; session.state.messages = original; if (task === 'chat') session.state.draft = question; } }
    finally { session.request = undefined; if (active(windowId, session)) { session.state.busy = false; changed(windowId); } }
  }
  return {
    clearTab(tabId: number) { for (const [windowId, session] of sessions) if (session.sender.tab.id === tabId) { cancel(session); sessions.delete(windowId); pendingReveal.delete(windowId); deferredSidebarWindows.delete(windowId); changed(windowId); } },
    handleMessage(message: any, sender: any, respond: (value: any) => void): boolean | undefined {
      if (!['AI_PANEL_ACCESS', 'AI_PANEL_ACTIVATE', 'AI_PANEL_SHOW', 'AI_PANEL_OPEN', 'AI_PANEL_CONTEXT', 'AI_PANEL_GET', 'AI_PANEL_REVEAL', 'AI_PANEL_SEND', 'AI_PANEL_DRAFT', 'AI_PANEL_INSERT', 'AI_PANEL_CANCEL'].includes(message.action)) return;
      const content = !!sender.tab && allowed(sender.tab.url) && allowed(sender.url || sender.tab.url);
      const extension = !sender.tab || sender.url?.startsWith(browser.runtime.getURL('/'));
      const respondError = (error: unknown) => respond({ success: false, error: error instanceof Error ? error.message : 'Falha no painel de IA.' });
      if (message.action === 'AI_PANEL_SHOW') {
        const session=sessions.get(sender.tab?.windowId);
        if(!content || !session || session.identity!==message.identity || session.sender.tab.id!==sender.tab.id || session.sender.frameId!==sender.frameId){respondError(new Error('Abra o resumo deste ticket novamente.'));return true;}
        try {
          const opened=openSidebar(sender.tab.windowId,message.alreadyOpened===true);
          pendingReveal.set(sender.tab.windowId,Date.now());changed(sender.tab.windowId,true);
          Promise.resolve(opened).then(()=>respond({success:true}),respondError);
        }catch(error){respondError(error);}
        return true;
      }
      if (message.action === 'AI_PANEL_OPEN') {
        if (!content || !Number.isInteger(sender.tab.windowId) || typeof message.identity !== 'string' || message.identity.length > 2000 || !/^[a-zA-Z0-9-]{1,80}$/.test(message.id) || !['summary_full', 'summary_latest', 'reply'].includes(message.task)) { respondError(new Error('Origem do ticket inválida.')); return true; }
        try {
          // Chama a API na pilha do clique; não aguarda storage, DOM ou rede antes de abrir.
          const opened = openSidebar(sender.tab.windowId, message.alreadyOpened === true);
          const old = sessions.get(sender.tab.windowId); const previousSave = old ? persist(old).catch(() => {}) : Promise.resolve(); if (old) { cancel(old); progress(old, {busy:false,status:'Consulta anterior encerrada.'}); }
          const session: Session = { state: { id: message.id, title: 'Conversa do ticket', messages: [], draft: '', busy: false, ready: false, status: 'Carregando o ticket…', error: '' }, sender, identity: message.identity, task: message.task, revision: null, save: previousSave, insertions: new Map(), cancelled: false };
          sessions.set(sender.tab.windowId, session); pendingReveal.set(sender.tab.windowId, Date.now()); changed(sender.tab.windowId, true);
          Promise.resolve(opened).then(() => { changed(sender.tab.windowId); respond({ success: true }); }, respondError);
        } catch (error) { respondError(error); }
        return true;
      }
      void (async () => {
        const windowId = content ? sender.tab.windowId : message.windowId;
        if (!content && !extension) throw new Error('Origem não autorizada.');
        const session = sessions.get(windowId);
        if (message.action === 'AI_PANEL_ACCESS') {
          if(!extension)throw new Error('Abra a extensão para continuar.');
          return !!session && deferredSidebarWindows.has(windowId);
        }
        if (message.action === 'AI_PANEL_ACTIVATE') {
          if(!extension || !session)throw new Error('Selecione o resumo no ticket.');
          deferredSidebarWindows.delete(windowId);pendingReveal.set(windowId,Date.now());changed(windowId,true);return {};
        }
        if (message.action === 'AI_PANEL_REVEAL') {
          if (!extension) throw new Error('Abra o painel da extensão.');
          const requestedAt = pendingReveal.get(windowId); pendingReveal.delete(windowId);
          return !!session && requestedAt !== undefined && Date.now() - requestedAt < 15000;
        }
        if (message.action === 'AI_PANEL_GET') { if (!extension) throw new Error('Abra o painel da extensão.'); return session?.state || null; }
        if (!session || session.state.id !== message.id) throw new Error('A conversa mudou. Abra pelo ticket novamente.');
        if (message.action === 'AI_PANEL_CONTEXT') {
          if (!content || sender.tab.id !== session.sender.tab.id || sender.frameId !== session.sender.frameId) throw new Error('Frame do ticket inválido.');
          if (message.error) { cancel(session); session.state.busy = false; session.state.ready = false; session.state.error = String(message.error).slice(0, 500); session.state.status = ''; changed(windowId); return {}; }
          const prompts=(await readAiPrompts()).prompts;
          const fullPrompt=summaryPrompt('ticket',prompts.ticket),emailPrompt=summaryPrompt('email',prompts.email);
          session.summaryQuestion=fullPrompt;
          const value = validateSnapshot(message.snapshot); session.snapshot = value; session.state.title = value.title;
          await session.save;
          let saved: any = {};
          try { saved = await callAi({ action: 'AI_CHAT_LOAD', key: value.key }, session.sender); } catch { session.persistent = false; session.warning = 'O histórico não pôde ser recuperado; esta conversa não será salva.'; session.state.error = session.warning; }
          if (!active(windowId, session)) return {};
          session.summaryDigest = saved.chat?.contextDigest || '0'.repeat(64); session.revision = saved.chat?.revision || null; session.state.messages = saved.chat?.messages || []; session.state.draft = saved.chat?.draft || ''; session.state.ready = true;
          const marker=await textDigest(summaryContextDigest(value.digest,fullPrompt));
          const legacyDefault=prompts.ticket===TICKET_SUMMARY_PROMPT && saved.chat?.contextDigest===await textDigest(`${SUMMARY_FORMAT_VERSION}:${value.digest}`);
          if (session.task === 'summary_full' && session.state.messages.length && (saved.chat?.contextDigest===marker || legacyDefault)) { session.summaryDigest=marker; session.state.status = 'Conversa recuperada; nenhuma nova consulta à IA.'; changed(windowId); return {}; }
          const question = session.task === 'summary_full' ? fullPrompt : session.task === 'summary_latest' ? emailPrompt : `Prepare uma resposta ao cliente a partir desta orientação:\n${value.direction || ''}${value.style ? `\n\n${value.style}` : ''}`;
          void run(windowId, session, question, session.task === 'summary_full' ? 'summary_full' : session.task === 'summary_latest' ? 'summary_latest' : 'chat', session.task !== 'reply', session.task === 'summary_latest' ? value.selection : undefined);
          return {};
        }
        if (!extension) throw new Error('Use o chat no painel da extensão.');
        if (message.action === 'AI_PANEL_CANCEL') { if (session.request) await callAi({ action: 'AI_CANCEL', requestId: session.request }, session.sender); cancel(session); session.state.busy = false; session.state.ready = false; session.state.status = 'Consulta cancelada. Reabra pelo ticket para continuar.'; changed(windowId); return {}; }
        if (message.action === 'AI_PANEL_DRAFT') { if (typeof message.text !== 'string' || message.text.length > 4000) throw new Error('Pergunta acima do limite.'); session.state.draft = message.text; await persist(session); return {}; }
        if (message.action === 'AI_PANEL_SEND') {
          if (session.state.busy || !session.state.ready || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 4000) throw new Error('Aguarde ou escreva uma pergunta.');
          if (message.editIndex !== undefined && (!Number.isInteger(message.editIndex) || session.state.messages[message.editIndex]?.role !== 'user')) throw new Error('Pergunta inválida para edição.');
          session.state.draft = message.text; void run(windowId, session, message.text.trim(), 'chat', false, undefined, message.editIndex); return {};
        }
        if (message.action === 'AI_PANEL_INSERT') {
          const turn = session.state.messages[message.index];
          if (!Number.isInteger(message.index) || turn?.role !== 'assistant') throw new Error('Resposta não encontrada.');
          const tab = await browser.tabs.get(session.sender.tab.id); if (!tab.active || tab.windowId !== windowId) throw new Error('Volte à aba deste ticket antes de inserir.');
          const result = await browser.tabs.sendMessage(tab.id!, { action: 'AI_PANEL_INSERT', id: session.state.id, identity: session.identity, text: turn.content, draftToken: session.insertions.get(message.index) }, { frameId: session.sender.frameId ?? 0 });
          if (!result?.success) throw new Error(result?.error || 'Não foi possível inserir.'); return {};
        }
      })().then(data => respond({ success: true, data }), respondError);
      return true;
    },
  };
}
