import { aiTicketStore } from '@/services/storage/aiTicketStore';
import { referencedTicketNumber } from '@/services/ai/ticketReference';
import { canonicalTicketUrl, detachTicketSession, rememberTicketSnapshot, savedTicketSnapshot } from './ai/ticketContext';
import type { AiPanelState, PanelSnapshot, PanelTask } from '@/types/aiPanel';
import {readAiPrompts,summaryPrompt} from '@/services/ai/promptSettings';
import { TICKET_SUMMARY_PROMPT, SUMMARY_FORMAT_VERSION, summaryContextDigest } from '@/services/ai/summaryFormat';
import { boundedChat } from '@/services/ai/summaryRequest';
import { textDigest } from '@/services/ai/ticketChatPersistence';
import { withoutGeneratedSignature } from '@/services/ai/replySignature';
import type { ChatDetails } from '@/services/storage/aiChatStorage';

const FULL = TICKET_SUMMARY_PROMPT;
type AiCall = (message: any, sender: any) => Promise<any>;
interface Session { ticketContextKey?: string; resetSource?: any; customTitle?: boolean; followTicket?: boolean; windowId?: number; state: AiPanelState; sender: any; identity: string; task: PanelTask; snapshot?: PanelSnapshot; revision: string | null; request?: string; save: Promise<unknown>; insertions: Map<number, string>; cancelled: boolean; warning?: string; persistent?: boolean; summaryDigest?: string; summaryQuestion?: string }
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
  const pageTickets=new Map<number,Map<number,{sender:any;id:string;identity:string;at:number}[]>>();
  const pendingReveal = new Map<number, number>();
  const cache = new Map<string, { text: string; at: number }>();
  const progress = (session: Session, override?: {busy:boolean; status:string; error?:string}) => {
    if (!session.sender.tab) return;
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
    if (!session.snapshot || !session.state.ready || session.persistent === false || !session.state.messages.length) return Promise.resolve();
    const details: ChatDetails = {...(session.ticketContextKey?{ticketKey:session.ticketContextKey}:{}),kind:session.state.kind || 'ticket',title:session.state.title,namespace:session.snapshot.namespace,context:session.snapshot.context,...(session.state.ticketUrl?{ticketUrl:session.state.ticketUrl}:{}),...(session.state.ticketNumber?{ticketNumber:session.state.ticketNumber}:{}),...(session.summaryQuestion?{summaryQuestion:session.summaryQuestion}:{}),...(session.customTitle?{customTitle:true}:{})};
    const content = structuredClone({ messages: session.state.messages, draft: session.state.draft, contextDigest: session.summaryDigest || '0'.repeat(64), details });
    session.save = session.save.catch(() => {}).then(async () => {
      if(session.resetSource){
        const prior=session.resetSource,archiveKey=await textDigest(`archive:${session.snapshot!.key}:${prior.revision}`);
        const archive=await callAi({action:'AI_CHAT_LOAD',key:archiveKey},session.sender);
        if(!archive.chat)await callAi({action:'AI_CHAT_SAVE',key:archiveKey,revision:null,content:{messages:prior.messages,draft:prior.draft,contextDigest:prior.contextDigest,details:prior.details}},session.sender);
      }
      const result = await callAi({ action: 'AI_CHAT_SAVE', key: session.snapshot!.key, revision: session.revision, content }, session.sender);
      session.resetSource=undefined;
      session.revision = result.chat.revision;
    });
    return session.save;
  };
  async function snapshot(session: Session): Promise<PanelSnapshot> {
    if (session.state.detached || !session.followTicket) return savedTicketSnapshot(session);
    let tab;
    try { tab = await browser.tabs.get(session.sender.tab.id); } catch { /* Aba fechada: usa a base local. */ }
    if (!tab?.active || tab.windowId !== session.sender.tab.windowId || tab.url !== session.sender.tab.url) {
      detachTicketSession(session);
      return savedTicketSnapshot(session);
    }
    const data = await browser.tabs.sendMessage(session.sender.tab.id, { action: 'AI_PANEL_SNAPSHOT', id: session.state.id, identity: session.identity }, { frameId: session.sender.frameId ?? 0 });
    if (!data?.success) throw new Error(data?.error || 'O ticket mudou. Abra o resumo novamente.');
    const value = validateSnapshot(data.data);
    if(value.key !== session.snapshot!.key || value.namespace !== session.snapshot!.namespace) throw new Error('O ticket mudou. Reabra a conversa.');
    await rememberTicketSnapshot(session, value);
    return value;
  }
  function bindPage(session: Session, page: PageTicket) {
    session.sender = page.sender; session.identity = page.identity; session.state.id = page.id;
    session.state.detached = false; session.state.contextSource = 'page'; session.ticketContextKey = page.snapshot.key;
    session.state.ticketUrl = canonicalTicketUrl(page.sender.tab.url, page.snapshot.ticketNumber);
    if (!session.customTitle) session.state.title = page.snapshot.title;
    session.state.ticketNumber = page.snapshot.ticketNumber;
    session.state.conversationKey = page.snapshot.key; session.snapshot = page.snapshot;
  }
  type PageTicket={sender:any;id:string;identity:string;snapshot:PanelSnapshot};
  async function activeTicket(windowId:number,expectedKey?:string):Promise<PageTicket|null>{
    const [tab]=await browser.tabs.query({active:true,windowId});
    if(!tab || typeof tab.id!=='number' || !allowed(tab.url || ''))return null;
    let candidates=Array.from(pageTickets.get(tab.id)?.values() || []).flat().filter(page=>Date.now()-page.at<12000);
    if(candidates.length>1)candidates=(await Promise.all(candidates.map(async page=>{try{const result=await browser.tabs.sendMessage(tab.id!,{action:'AI_PAGE_CHECK',id:page.id,identity:page.identity},{frameId:page.sender.frameId??0});return result?.success?page:null;}catch{return null;}}))).filter((page):page is NonNullable<typeof page>=>!!page);
    if(candidates.length!==1)return null;
    const page=candidates[0]!;
    const result=await browser.tabs.sendMessage(tab.id,{action:'AI_PANEL_SNAPSHOT',id:page.id,identity:page.identity,expectedKey},{frameId:page.sender.frameId??0});
    if(!result?.success)return null;
    const value=validateSnapshot(result.data);
    if(expectedKey && value.key!==expectedKey)return null;
    const confirmed=await browser.tabs.get(tab.id);
    if(!confirmed.active || confirmed.windowId!==windowId || confirmed.url!==tab.url)throw new Error('A aba mudou durante a leitura do ticket.');
    return {...page,sender:{...page.sender,tab:confirmed},snapshot:value};
  }
  function validateSnapshot(value: any): PanelSnapshot {
    if(value?.ticketNumber!==undefined && (typeof value.ticketNumber!=='string'||!/^\d{1,20}$/.test(value.ticketNumber)))throw new Error('Número do ticket inválido.');
    if (!value || typeof value.context !== 'string' || !value.context.trim() || value.context.length > 50000 || typeof value.title !== 'string' || value.title.length > 1000 || !/^[a-f0-9]{64}$/.test(value.key) || !/^[a-f0-9]{64}$/.test(value.digest) || !/^[\w-]{1,90}$/.test(value.namespace) || (value.selection !== undefined && (typeof value.selection !== 'string' || value.selection.length > 50000)) || (value.style !== undefined && (typeof value.style !== 'string' || value.style.length > 1800)) || (value.direction !== undefined && (typeof value.direction !== 'string' || value.direction.length > 1200)) || (value.draftToken !== undefined && !/^[a-zA-Z0-9-]{1,80}$/.test(value.draftToken))) throw new Error('Contexto do ticket inválido.');
    return value;
  }
  const navigation = new Map<number, Promise<unknown>>();
  function navigate<T>(windowId:number,work:()=>Promise<T>):Promise<T>{
    const task=(navigation.get(windowId)||Promise.resolve()).catch(()=>{}).then(work);
    navigation.set(windowId,task);void task.finally(()=>{if(navigation.get(windowId)===task)navigation.delete(windowId);}).catch(()=>{});return task;
  }
  async function loadConversation(windowId:number,sender:any,mode:'new'|'resume'|'ticket',key?:string,page?:PageTicket|null,automatic=false,reset=false){
    const old=sessions.get(windowId);
    if(old?.state.busy&&!automatic)throw new Error('Aguarde a consulta atual antes de trocar de conversa.');
    if(old)await old.save;
    const stored=(await browser.storage.local.get(['octablaster_ai_history_namespace'])).octablaster_ai_history_namespace;
    const namespace=typeof stored==='string'?stored:'local';
    key=page?.snapshot.key || (mode==='new'?await textDigest(`general:${namespace}:${crypto.randomUUID()}`):key);
    const saved=await callAi({action:'AI_CHAT_LOAD',key},sender);
    if(mode==='resume'&&!saved.chat)throw new Error('A conversa expirou ou não está mais salva.');
    const storedTicket = mode !== 'new' ? await aiTicketStore.load(saved.chat?.details?.ticketKey || key!, namespace) : null;
    const details=saved.chat?.details || (storedTicket ? {kind:'ticket' as const,title:storedTicket.title,namespace,context:storedTicket.context,ticketUrl:storedTicket.ticketUrl,ticketNumber:storedTicket.ticketNumber,ticketKey:storedTicket.key} : undefined);
    if(details&&details.namespace!==namespace)throw new Error('Esta conversa pertence a outra conexão.');
    const context=details?.context || (mode==='new'?'Conversa independente. Nenhum ticket vinculado.':'Conversa retomada pelo histórico salvo. O texto original do ticket não está disponível.');
    const restored:Session={ticketContextKey:details?.ticketKey || (details?.kind==='ticket'?key:undefined),resetSource:reset&&saved.chat?.messages.length?structuredClone(saved.chat):undefined,customTitle:!reset&&details?.customTitle===true,windowId,followTicket:automatic,state:{conversationKey:key!,id:crypto.randomUUID(),kind:details?.kind || (mode==='ticket'||saved.chat?'ticket':'general'),detached:true,ticketUrl:details?.ticketUrl,ticketNumber:details?.ticketNumber,title:(!reset&&details?.title) || (page?page.snapshot.title:reset?'Nova conversa':mode==='ticket'?'Conversa do ticket':saved.chat?'Ticket salvo':'Nova conversa'),messages:reset?[]:saved.chat?.messages || [],draft:reset?'':saved.chat?.draft || '',busy:false,ready:true,status:reset?'Nova conversa; escreva sua pergunta.':saved.chat?'Conversa recuperada.':'Conversa vazia; escreva sua pergunta.',error:''},sender,identity:key!,task:'summary_full',snapshot:{key:key!,context,digest:await textDigest(context),namespace,title:details?.title || 'Novo chat',ticketNumber:details?.ticketNumber},revision:saved.chat?.revision || null,save:Promise.resolve(),insertions:new Map(),cancelled:false,summaryDigest:reset?undefined:saved.chat?.contextDigest,summaryQuestion:details?.summaryQuestion};
    if (restored.state.kind === 'ticket' && !page) { restored.followTicket = false; restored.snapshot = await savedTicketSnapshot(restored); restored.state.status = 'Usando os dados salvos deste ticket.'; }
    if (restored.state.kind === 'general') { restored.followTicket = false; restored.state.contextSource = 'none'; }
    if(page){if(page.snapshot.namespace!==namespace)throw new Error('A conexão mudou. Reabra o ticket.');bindPage(restored,page);restored.state.kind='ticket';restored.followTicket=true;restored.state.status='Conversa vinculada ao ticket aberto.';await rememberTicketSnapshot(restored,page.snapshot);}
    if(old){cancel(old);if(old.state.busy)progress(old,{busy:false,status:'Consulta encerrada ao trocar de ticket.'});}
    sessions.set(windowId,restored);await persist(restored);changed(windowId);return restored;
  }
  async function followCurrentTicket(windowId:number,sender:any){
    const old=sessions.get(windowId);
    if(old&&!old.followTicket)return old;
    if(old?.state.kind==='ticket'&&!old.state.detached&&!old.cancelled){
      const [tab]=await browser.tabs.query({active:true,windowId});
      const pages=tab?.id===undefined?[]:Array.from(pageTickets.get(tab.id)?.values()||[]).flat().filter(page=>Date.now()-page.at<12000);
      if(tab&&tab.id===old.sender.tab?.id&&pages.length===1&&pages[0]!.identity===old.identity){
        try{const check=await browser.tabs.sendMessage(tab.id!,{action:'AI_PAGE_CHECK',id:old.state.id,identity:old.identity},{frameId:old.sender.frameId??0});if(check?.success){old.followTicket=true;return old;}}catch{}
      }
    }
    const page=await activeTicket(windowId).catch(()=>null);
    if(page){
      if(old?.state.kind==='ticket'&&(old.snapshot?.key===page.snapshot.key||(!old.state.ready&&old.identity===page.identity))){
        old.followTicket=true;
        if(!old.state.busy&&old.state.ready){bindPage(old,page);await rememberTicketSnapshot(old,page.snapshot);await persist(old);changed(windowId);}
        return old;
      }
      return loadConversation(windowId,sender,'ticket',page.snapshot.key,page,true);
    }
    if(!old||old.state.kind==='general'){
      const [tab]=await browser.tabs.query({active:true,windowId});
      if(allowed(tab?.url||'')&&/\/ticket\/(?:edit|view)\/\d+/.test(new URL(tab!.url!).pathname))throw new Error('Ainda não foi possível identificar o ticket. Aguarde o carregamento; se atualizou a extensão, recarregue a página do Octadesk.');
    }
    if(!old)return loadConversation(windowId,sender,'new',undefined,undefined,true);
    if(old.state.kind==='ticket' && old.snapshot){detachTicketSession(old);old.snapshot=await savedTicketSnapshot(old);changed(windowId);}
    return old;
  }
  function notifyPage(windowId:number){void browser.runtime.sendMessage({action:'AI_PAGE_CHANGED',windowId}).catch(()=>{});}
  async function run(windowId: number, session: Session, question: string, task: 'summary_full' | 'summary_latest' | 'chat', useCache: boolean, source?: string, editIndex?: number) {
    if (!active(windowId, session)) return;
    session.state.busy = true; session.state.error = session.warning || ''; session.state.status = 'Preparando o contexto…'; changed(windowId);
    const original = [...session.state.messages];
    const base = editIndex === undefined ? original : original.slice(0, editIndex);
    const allTurns = base[0]?.role === 'assistant' ? [{ role: 'user' as const, content: session.summaryQuestion || FULL }, ...base] : base;
    const completed=[];for(let i=0;i<allTurns.length;i++){if(allTurns[i]!.role!=='user')continue;completed.push(allTurns[i]!);if(allTurns[i+1]?.role==='assistant'){completed.push(allTurns[++i]!);}else completed.push({role:'assistant' as const,content:'[A consulta anterior não teve uma resposta concluída.]'});}
    const before = task === 'summary_full' || task === 'summary_latest' ? [] : boundedChat(completed);
    if(task==='chat'){
      session.state.messages=[...base,{role:'user',content:question}];session.state.draft='';
      if(session.state.kind==='general'&&!original.length&&!session.customTitle)session.state.title=question.replace(/\s+/g,' ').slice(0,80);
      changed(windowId);try{await persist(session);}catch{session.warning='A mensagem foi exibida, mas não pôde ser salva neste navegador.';session.state.error=session.warning;}
    }
    try {
      const fresh = await snapshot(session);
      if (!active(windowId, session)) return;
      if (fresh.key !== session.snapshot!.key || fresh.namespace !== session.snapshot!.namespace) throw new Error('A conexão ou o ticket mudou. Reabra pelo botão do ticket.');
      session.snapshot = fresh;
      if (source && source !== fresh.selection) throw new Error('O e-mail mudou. Resuma a versão atual novamente.');
      const storedNamespace=(await browser.storage.local.get(['octablaster_ai_history_namespace'])).octablaster_ai_history_namespace;
      const namespace=typeof storedNamespace==='string'?storedNamespace:'local';
      if(namespace!==fresh.namespace)throw new Error('A conexão mudou. Volte ao histórico e reabra a conversa.');
      const earlier=session.state.detached ? completed.slice(0,completed.length-before.length).map(turn=>`${turn.role}: ${turn.content}`).join('\n\n').slice(-30000) : '';
      const context = (source || fresh.context).slice(0,50000-(earlier ? earlier.length+40 : 0))+(earlier ? `\n\nHistórico anterior desta conversa:\n${earlier}` : '');
      const revision = (await browser.storage.local.get(['octablaster_ai_config_revision'])).octablaster_ai_config_revision || '';
      const cacheKey = await textDigest(JSON.stringify([revision, fresh.namespace, task, context, question]));
      const cached = useCache ? cache.get(cacheKey) : undefined;
      let text = cached && Date.now() - cached.at < 15 * 60000 ? cached.text : '';
      session.state.cached = !!text;
      if (!text) {
        session.state.status = 'Aguardando a IA…'; session.request = crypto.randomUUID(); changed(windowId);
        const start = Date.now();
        const result = await callAi({ action: 'AI_GENERATE', requestId: session.request, input: { task:session.state.kind==='general'?'general':task, context, instruction: question, history: before, conversationKey: task === 'summary_latest' ? undefined : fresh.key, memoryNamespace: fresh.namespace } }, session.sender);
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
      if(session.state.kind==='general' && !original.length && !session.customTitle)session.state.title=question.replace(/\s+/g,' ').slice(0,80);
      session.state.status = session.state.cached ? 'Resumo reaproveitado; nenhuma nova consulta à IA.' : 'Pronto para revisar.';
      try { await persist(session); } catch { session.warning = 'Resposta exibida, mas o histórico não pôde ser salvo neste computador.'; session.state.error = session.warning; }
    } catch (error) { if (active(windowId, session)) { session.state.error = error instanceof Error ? error.message : 'Não foi possível consultar a IA.'; session.state.messages = task==='chat'?[...base,{role:'user',content:question}]:original;if(task==='chat'){session.state.draft='';session.state.status='A consulta falhou. Edite a mensagem para tentar novamente.';} } }
    finally { session.request = undefined; if (active(windowId, session)) { session.state.busy = false; changed(windowId); } }
  }
  return {
    activeTabChanged: notifyPage,
    clearTab(tabId: number) {
      pageTickets.delete(tabId);
      for (const [windowId, session] of sessions) if (!session.state.detached && session.sender.tab?.id === tabId) {
        if(session.snapshot && session.state.ready) detachTicketSession(session);
        else { cancel(session); sessions.delete(windowId); }
        pendingReveal.delete(windowId); deferredSidebarWindows.delete(windowId); changed(windowId);
      }
    },
    handleMessage(message: any, sender: any, respond: (value: any) => void): boolean | undefined {
      if (!['AI_PANEL_GENERAL','AI_PANEL_RENAME','AI_PANEL_ENTER','AI_PANEL_SYNC','AI_PAGE_REGISTER','AI_PANEL_ATTACH','AI_PANEL_NEW', 'AI_PANEL_RESUME', 'AI_PANEL_ACCESS', 'AI_PANEL_ACTIVATE', 'AI_PANEL_SHOW', 'AI_PANEL_OPEN', 'AI_PANEL_CONTEXT', 'AI_PANEL_GET', 'AI_PANEL_REVEAL', 'AI_PANEL_SEND', 'AI_PANEL_DRAFT', 'AI_PANEL_INSERT', 'AI_PANEL_CANCEL'].includes(message.action)) return;
      const content = !!sender.tab && allowed(sender.tab.url) && allowed(sender.url || sender.tab.url);
      const extension = !sender.tab || sender.url?.startsWith(browser.runtime.getURL('/'));
      const respondError = (error: unknown) => respond({ success: false, error: error instanceof Error ? error.message : 'Falha no painel de IA.' });
      if(message.action==='AI_PAGE_REGISTER'){
        if(!content || !Number.isInteger(sender.frameId) || !Array.isArray(message.tickets) || message.tickets.length>4 || message.tickets.some((ticket:any)=>!ticket || !/^[\w-]{1,80}$/.test(ticket.id) || typeof ticket.identity!=='string' || ticket.identity.length>2000)){respondError(new Error('Origem do ticket inválida.'));return true;}
        let frames=pageTickets.get(sender.tab.id);if(!frames){frames=new Map();pageTickets.set(sender.tab.id,frames);}
        const before=JSON.stringify((frames.get(sender.frameId)||[]).map(page=>[page.id,page.identity]));
        if(message.tickets.length)frames.set(sender.frameId,message.tickets.map((ticket:any)=>({...ticket,sender,at:Date.now()})));else frames.delete(sender.frameId);
        if(before!==JSON.stringify(message.tickets.map((ticket:any)=>[ticket.id,ticket.identity])))notifyPage(sender.tab.windowId);
        respond({success:true,data:{registered:true}});return true;
      }
      if (message.action === 'AI_PANEL_SHOW') {
        const session=sessions.get(sender.tab?.windowId);
        if(!content || !session || session.identity!==message.identity || session.sender.tab?.id!==sender.tab.id || session.sender.frameId!==sender.frameId){respondError(new Error('Abra o resumo deste ticket novamente.'));return true;}
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
          const session: Session = { windowId:sender.tab.windowId, followTicket:true, state: { id: message.id, title: 'Conversa do ticket', kind:'ticket',ticketUrl:sender.tab.url, messages: [], draft: '', busy: false, ready: false, status: 'Carregando o ticket…', error: '' }, sender, identity: message.identity, task: message.task, revision: null, save: previousSave, insertions: new Map(), cancelled: false };
          sessions.set(sender.tab.windowId, session); pendingReveal.set(sender.tab.windowId, Date.now()); changed(sender.tab.windowId, true);
          Promise.resolve(opened).then(() => { changed(sender.tab.windowId); respond({ success: true }); }, respondError);
        } catch (error) { respondError(error); }
        return true;
      }
      void (async () => {
        const windowId = content ? sender.tab.windowId : message.windowId;
        if (!content && !extension) throw new Error('Origem não autorizada.');
        if(['AI_PANEL_ENTER','AI_PANEL_SYNC'].includes(message.action)){
          if(!extension||!Number.isInteger(windowId))throw new Error('Abra o chat na extensão.');
          await navigate(windowId,()=>followCurrentTicket(windowId,sender));return {};
        }
        if (['AI_PANEL_GENERAL','AI_PANEL_ATTACH','AI_PANEL_NEW','AI_PANEL_RESUME'].includes(message.action)) {
          if(!extension||!Number.isInteger(windowId))throw new Error('Abra as conversas na extensão.');
          await navigate(windowId,async()=>{
            const page=['AI_PANEL_ATTACH','AI_PANEL_NEW'].includes(message.action)?await activeTicket(windowId):null;
            if(message.action==='AI_PANEL_ATTACH'&&!page)throw new Error('Abra um único ticket do Octadesk na aba ativa e recarregue a página se necessário.');
            await loadConversation(windowId,sender,page?'ticket':['AI_PANEL_GENERAL','AI_PANEL_NEW'].includes(message.action)?'new':'resume',message.key,page,message.action==='AI_PANEL_NEW'&&!!page,message.action==='AI_PANEL_NEW');
          });return {};
        }
        let session = sessions.get(windowId);
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
          const value = validateSnapshot(message.snapshot); session.snapshot = value;session.state.conversationKey=value.key; session.state.title = value.title;session.state.ticketNumber=value.ticketNumber;
          await rememberTicketSnapshot(session, value);
          await session.save;
          let saved: any = {};
          try { saved = await callAi({ action: 'AI_CHAT_LOAD', key: value.key }, session.sender); } catch { session.persistent = false; session.warning = 'O histórico não pôde ser recuperado; esta conversa não será salva.'; session.state.error = session.warning; }
          if (!active(windowId, session)) return {};
          session.customTitle=saved.chat?.details?.customTitle===true;if(session.customTitle)session.state.title=saved.chat.details.title;
          session.summaryDigest = saved.chat?.contextDigest || '0'.repeat(64); session.revision = saved.chat?.revision || null; session.state.messages = saved.chat?.messages || []; session.state.draft = saved.chat?.draft || ''; session.state.ready = true;
          await persist(session);
          const marker=await textDigest(summaryContextDigest(value.digest,fullPrompt));
          const legacyDefault=prompts.ticket===TICKET_SUMMARY_PROMPT && saved.chat?.contextDigest===await textDigest(`${SUMMARY_FORMAT_VERSION}:${value.digest}`);
          if (session.task === 'summary_full' && session.state.messages.length && (saved.chat?.contextDigest===marker || legacyDefault)) { session.summaryDigest=marker; session.state.status = 'Conversa recuperada; nenhuma nova consulta à IA.'; changed(windowId); return {}; }
          const question = session.task === 'summary_full' ? fullPrompt : session.task === 'summary_latest' ? emailPrompt : `Prepare uma resposta ao cliente a partir desta orientação:\n${value.direction || ''}${value.style ? `\n\n${value.style}` : ''}`;
          void run(windowId, session, question, session.task === 'summary_full' ? 'summary_full' : session.task === 'summary_latest' ? 'summary_latest' : 'chat', session.task !== 'reply', session.task === 'summary_latest' ? value.selection : undefined);
          return {};
        }
        if (!extension) throw new Error('Use o chat no painel da extensão.');
        if (message.action === 'AI_PANEL_CANCEL') { if (session.request) await callAi({ action: 'AI_CANCEL', requestId: session.request }, session.sender); cancel(session); session.state.busy = false; session.state.ready = false; session.state.status = 'Consulta cancelada. Reabra pelo ticket para continuar.'; changed(windowId); return {}; }
        if(message.action==='AI_PANEL_RENAME'){
          if(session.state.busy||typeof message.title!=='string'||!message.title.trim()||message.title.length>120||/[\u0000-\u001f]/.test(message.title))throw new Error('Use um título de 1 a 120 caracteres.');
          session.state.title=message.title.trim();session.customTitle=true;await persist(session);changed(windowId);return {};
        }
        if (message.action === 'AI_PANEL_DRAFT') { if (typeof message.text !== 'string' || message.text.length > 4000) throw new Error('Pergunta acima do limite.'); session.state.draft = message.text; await persist(session); return {}; }
        if (message.action === 'AI_PANEL_SEND') {
          const number = typeof message.text === 'string' ? referencedTicketNumber(message.text) : undefined;
          if (number && number !== session.state.ticketNumber) {
            if(session.state.busy)throw new Error('Aguarde a consulta atual.');
            if(message.editIndex!==undefined)throw new Error('Para consultar outro ticket, envie uma nova pergunta em vez de editar uma mensagem desta conversa.');
            const namespace=session.snapshot?.namespace || 'local';
            const ticket=await aiTicketStore.findByNumber(number,namespace);
            if(!ticket)throw new Error(`O ticket #${number} não está salvo neste navegador. Abra-o e acesse a IA para guardar seus dados.`);
            session=await navigate(windowId,()=>loadConversation(windowId,sender,'ticket',ticket.key));
          }
          if(number && session.state.kind==='ticket') {
            session.followTicket=false;detachTicketSession(session);
            session.snapshot=await savedTicketSnapshot(session);changed(windowId);
          }
          if(session.followTicket){await navigate(windowId,()=>followCurrentTicket(windowId,sender));if(sessions.get(windowId)!==session)throw new Error('O ticket mudou. A conversa correta foi aberta; revise sua pergunta antes de enviar.');}
          if (session.state.busy || !session.state.ready || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 4000) throw new Error('Aguarde ou escreva uma pergunta.');
          if (message.editIndex !== undefined && (!Number.isInteger(message.editIndex) || session.state.messages[message.editIndex]?.role !== 'user')) throw new Error('Pergunta inválida para edição.');
          session.state.draft = message.text; void run(windowId, session, message.text.trim(), 'chat', false, undefined, message.editIndex); return {};
        }
        if (message.action === 'AI_PANEL_INSERT') {
          if(session.state.detached)throw new Error('Abra o resumo pelo ticket para inserir no editor correto.');
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
