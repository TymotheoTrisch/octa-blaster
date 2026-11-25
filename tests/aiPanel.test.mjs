import test from 'node:test';
import assert from 'node:assert/strict';
import {SUMMARY_FORMAT_VERSION} from '../services/ai/summaryFormat.ts';
import {textDigest} from '../services/ai/ticketChatPersistence.ts';
import {saveAiPrompts,readAiPrompts} from '../services/ai/promptSettings.ts';
import { createAiPanelRouter } from '../services/background/aiPanelRouter.ts';
import { createTicketChatStore } from '../services/storage/aiChatStorage.ts';
import { installStorage } from './helpers.mjs';
const source = { id: 'extension', tab: { id: 1, windowId: 9, active: true, url: 'https://app.octadesk.com/ticket/edit/1' }, frameId: 2, url: 'https://app.octadesk.com/embed/main/home/ticket/edit/1' };

test('typed chat questions keep processing in the sidebar without updating summary trigger notices', async () => {
 let count=0,finish;
 const f=setup(()=>++count===1?Promise.resolve({text:'Resumo pronto'}):new Promise(resolve=>{finish=resolve;}));
 try {
  await f.open();await f.done();
  const before=f.calls.filter(message=>message.action==='AI_PANEL_PROGRESS').length;
  assert.ok(before>0);
  assert.equal(f.calls.filter(message=>message.action==='AI_PANEL_PROGRESS').at(-1).progress.busy,false);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:'one',text:'Explique o próximo passo.'});
  for(let i=0;!finish&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(finish);assert.equal((await f.get()).busy,true);
  assert.equal(f.calls.filter(message=>message.action==='AI_PANEL_PROGRESS').length,before);
  finish({text:'Próximo passo explicado'});await f.done();
  assert.equal(f.calls.filter(message=>message.action==='AI_PANEL_PROGRESS').length,before);
 }finally{f.storage.restore();}
});

test('entering and typing in a ticket chat never creates feedback on an unclicked summary button',async()=>{
 const f=setup();try{
  await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'page-A',identity:'ticket-A'}]},source);
  await f.call({action:'AI_PANEL_ENTER',windowId:9});const state=await f.get();
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Qual é o pedido?'});await f.done();
  assert.equal(f.calls.filter(message=>message.action==='AI_PANEL_PROGRESS').length,0);
 }finally{f.storage.restore();}
});

test('a free chat works while a ticket is open and never queries its page', async () => {
 const f=setup();try{
  browser.tabs.query=async()=>{assert.fail('Free chat must not read the current tab');};
  browser.tabs.sendMessage=async()=>{assert.fail('Free chat must not ask the page for context');};
  assert.equal((await f.call({action:'AI_PANEL_GENERAL',windowId:9})).success,true);
  let state=await f.get();assert.equal(state.kind,'general');assert.equal(state.contextSource,'none');
  await f.call({action:'AI_PANEL_ENTER',windowId:9});
  assert.equal((await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Explique uma receita.'})).success,true);
  state=await f.done();assert.equal(state.error,'');
  const request=f.calls.find(message=>message.action==='AI_GENERATE');
  assert.equal(request.input.task,'general');assert.ok(!request.input.context.includes('cliente fictício'));
 }finally{f.storage.restore();}
});

test('a history ticket stays pinned while another ticket is open, including after entering again', async () => {
 const f=setup();try{
  f.setSnapshot({ticketNumber:'272402'});await f.open();await f.done();
  f.setSnapshot({key:'b'.repeat(64),ticketNumber:'272403',context:'DADOS_DO_TICKET_B'});
  await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'page-B',identity:'ticket-B'}]},source);
  browser.tabs.query=async()=>{assert.fail('History must not query the active tab');};
  browser.tabs.sendMessage=async()=>{assert.fail('History must not read the current ticket');};
  assert.equal((await f.call({action:'AI_PANEL_RESUME',windowId:9,key:'a'.repeat(64)})).success,true);
  const state=await f.get();assert.equal(state.contextSource,'saved');assert.equal(state.ticketNumber,'272402');
  await f.call({action:'AI_PANEL_ENTER',windowId:9});
  await f.call({action:'AI_PANEL_SYNC',windowId:9});
  assert.equal((await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'O que falta?'})).success,true);
  const done=await f.done();assert.equal(done.error,'');
  const request=f.calls.filter(message=>message.action==='AI_GENERATE').at(-1);
  assert.match(request.input.context,/cliente fictício/);assert.ok(!request.input.context.includes('DADOS_DO_TICKET_B'));
 }finally{f.storage.restore();}
});

test('ticket data is saved before a chat exists and an explicit number opens it from a free chat without page access', async () => {
 const f=setup();try{
  f.setSnapshot({ticketNumber:'272402'});
  await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'page-A',identity:'ticket-A'}]},source);
  await f.call({action:'AI_PANEL_ENTER',windowId:9});assert.equal((await f.store.list('local')).length,0);
  await f.call({action:'AI_PANEL_GENERAL',windowId:9});let state=await f.get();
  browser.tabs.query=async()=>{assert.fail('Explicit saved ticket must not read an active page');};
  browser.tabs.sendMessage=async()=>{assert.fail('Explicit saved ticket must not message a page');};
  assert.equal((await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'O que falta no ticket 272402?'})).success,true);
  state=await f.done();assert.equal(state.kind,'ticket');assert.equal(state.ticketNumber,'272402');assert.equal(state.contextSource,'saved');
  assert.equal(state.messages[0].content,'O que falta no ticket 272402?');
  const request=f.calls.find(message=>message.action==='AI_GENERATE');assert.equal(request.input.task,'chat');assert.equal(request.input.context,'Mensagem do cliente fictício.');
  const failed=await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Consulte #999999'});
  assert.equal(failed.success,false);assert.match(failed.error,/não está salvo/);
  const edited=await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Consulte #999999',editIndex:0});
  assert.equal(edited.success,false);assert.match(edited.error,/nova pergunta em vez de editar/);
  assert.equal(f.calls.filter(message=>message.action==='AI_GENERATE').length,1);
 }finally{f.storage.restore();}
});

test('closing the ticket tab keeps its saved conversation available for another question', async () => {
 const f=setup();try{
  await f.open();let state=await f.done();f.router.clearTab(1);
  browser.tabs.query=async()=>[];
  browser.tabs.get=async()=>{throw new Error('Tab closed');};
  browser.tabs.sendMessage=async()=>{assert.fail('A closed ticket must not receive a context request');};
  state=await f.get();assert.equal(state.detached,true);
  assert.equal((await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Continue com o atendimento salvo.'})).success,true);
  state=await f.done();assert.equal(state.error,'');assert.equal(state.contextSource,'saved');
  assert.equal(f.calls.filter(message=>message.action==='AI_GENERATE').at(-1).input.context,'Mensagem do cliente fictício.');
 }finally{f.storage.restore();}
});

test('new chats use the configured model without ticket context and restore their independent history and draft', async () => {
 const f=setup();try{
  await f.open();await f.done();
  const initialCalls=f.calls.filter(m=>m.action==='AI_GENERATE').length;
  assert.equal((await f.call({action:'AI_PANEL_NEW',windowId:9})).success,true);
  let state=await f.get();assert.equal(state.kind,'general');assert.deepEqual(state.messages,[]);
  assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,initialCalls);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Explique a fotografia.'});await f.done();
  const generated=f.calls.filter(m=>m.action==='AI_GENERATE').at(-1);
  assert.equal(generated.input.task,'general');assert.ok(!generated.input.context.includes('cliente fictício'));assert.deepEqual(generated.input.history,[]);
  const list=await f.store.list('local'),chat=list.find(item=>item.kind==='general');assert.equal(chat.title,'Explique a fotografia.');
  await f.call({action:'AI_PANEL_DRAFT',windowId:9,id:state.id,text:'Continuar a fotografia depois'});
  await f.call({action:'AI_PANEL_NEW',windowId:9});state=await f.get();
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Outra conversa isolada.'});await f.done();
  await f.call({action:'AI_PANEL_RESUME',windowId:9,key:chat.key});state=await f.get();
  assert.equal(state.messages[0].content,'Explique a fotografia.');assert.equal(state.draft,'Continuar a fotografia depois');
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Continue a explicação.'});await f.done();
  const followup=f.calls.filter(m=>m.action==='AI_GENERATE').at(-1);
  assert.equal(followup.input.history[0].content,'Explique a fotografia.');assert.ok(!JSON.stringify(followup).includes('Outra conversa isolada.'));
  f.router.clearTab(1);assert.equal((await f.get()).kind,'general');
 }finally{f.storage.restore();}
});

test('the history resumes a ticket using saved plaintext and returning through its button keeps one conversation',async()=>{
 const f=setup();try{
  await f.open();await f.done();
  await f.call({action:'AI_PANEL_NEW',windowId:9});
  const before=f.calls.filter(m=>m.action==='AI_GENERATE').length;
  await f.call({action:'AI_PANEL_RESUME',windowId:9,key:'a'.repeat(64)});let state=await f.get();
  assert.equal(state.kind,'ticket');assert.equal(state.detached,true);assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,before);
  assert.equal((await f.call({action:'AI_PANEL_INSERT',windowId:9,id:state.id,index:0})).success,false);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'O que falta neste ticket?'});state=await f.done();
  assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').at(-1).input.context,'Mensagem do cliente fictício.');
  await f.open('returning');state=await f.done();assert.equal(state.detached,undefined);assert.equal(state.messages.length,3);
  assert.equal((await f.store.list('local')).filter(item=>item.kind==='ticket').length,1);
 }finally{f.storage.restore();}
});

test('history entry points reject content scripts, unknown keys and another connection namespace',async()=>{
 const f=setup();try{
  assert.equal((await f.call({action:'AI_PANEL_NEW',windowId:9},source)).success,false);
  assert.equal((await f.call({action:'AI_PANEL_RESUME',windowId:9,key:'f'.repeat(64)})).success,false);
  await f.call({action:'AI_PANEL_NEW',windowId:9});const created=await f.get();await f.call({action:'AI_PANEL_SEND',windowId:9,id:created.id,text:'Conversa salva'});await f.done();const [entry]=await f.store.list('local');
  await browser.storage.local.set({octablaster_ai_history_namespace:'namespace_other'});
  assert.equal((await f.store.list('namespace_other')).length,0);
  assert.equal((await f.call({action:'AI_PANEL_RESUME',windowId:9,key:entry.key})).success,false);
 }finally{f.storage.restore();}
});
const ui = { id: 'extension', url: 'moz-extension://extension/sidepanel.html' };

test('opening, drafting and renaming an unused ticket chat creates no stored conversation; send appears before the model returns',async()=>{
 let finish;const f=setup(()=>new Promise(resolve=>{finish=resolve;}));try{
  await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'page-A',identity:'ticket-A'}]},source);
  await f.call({action:'AI_PANEL_ENTER',windowId:9});let state=await f.get();
  await f.call({action:'AI_PANEL_DRAFT',windowId:9,id:state.id,text:'Primeira pergunta'});
  await f.call({action:'AI_PANEL_RENAME',windowId:9,id:state.id,title:'Meu atendimento'});
  assert.equal((await f.store.list('local')).length,0);assert.equal(Object.keys(f.storage.data).filter(key=>key.startsWith('octablaster_ticket_chat_v1_')).length,0);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Primeira pergunta'});
  for(let i=0;!finish&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(finish);
  state=await f.get();assert.equal(state.busy,true);assert.deepEqual(state.messages,[{role:'user',content:'Primeira pergunta'}]);assert.equal(state.draft,'');
  assert.ok((await f.store.list('local'))[0].title.endsWith('Meu atendimento'));
  finish({text:'Resposta fictícia'});await f.done();
  await f.call({action:'AI_PANEL_RESUME',windowId:9,key:'a'.repeat(64)});assert.equal((await f.get()).title,'Meu atendimento');
 }finally{f.storage.restore();}
});

test('new conversation clears the visible ticket chat but archives the previous conversation only at the next send',async()=>{
 const f=setup();try{
  await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'page-A',identity:'ticket-A'}]},source);
  await f.call({action:'AI_PANEL_ENTER',windowId:9});let state=await f.get();
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Conversa anterior'});await f.done();
  await f.call({action:'AI_PANEL_RENAME',windowId:9,id:state.id,title:'Título anterior'});
  await f.call({action:'AI_PANEL_NEW',windowId:9});state=await f.get();assert.deepEqual(state.messages,[]);assert.equal(state.draft,'');
  assert.equal((await f.store.list('local')).length,1);assert.equal((await f.store.handle('AI_CHAT_LOAD','a'.repeat(64))).chat.messages[0].content,'Conversa anterior');
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Nova conversa'});await f.done();
  const list=await f.store.list('local');assert.equal(list.length,2);const old=list.find(chat=>chat.key!=='a'.repeat(64));assert.ok(old.title.endsWith('Título anterior'));
  assert.equal((await f.store.handle('AI_CHAT_LOAD',old.key)).chat.messages[0].content,'Conversa anterior');
  assert.equal((await f.store.handle('AI_CHAT_LOAD','a'.repeat(64))).chat.messages[0].content,'Nova conversa');
 }finally{f.storage.restore();}
});

test('a failed generation keeps the submitted user bubble and rename validation never changes ticket identity',async()=>{
 const f=setup(async()=>{throw new Error('Falha fictícia');});try{
  await f.call({action:'AI_PANEL_NEW',windowId:9});let state=await f.get();const key=state.conversationKey;
  assert.equal((await f.call({action:'AI_PANEL_RENAME',windowId:9,id:state.id,title:'  '})).success,false);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Mensagem enviada'});state=await f.done();
  assert.equal(state.messages[0].content,'Mensagem enviada');assert.match(state.error,/Falha fictícia/);assert.equal(state.draft,'');
  await f.call({action:'AI_PANEL_RENAME',windowId:9,id:state.id,title:'Nome editado'});assert.equal((await f.get()).conversationKey,key);
 }finally{f.storage.restore();}
});

test('a subsequent question retains the prior unanswered user turn as history without inventing an answer',async()=>{
 let count=0;const f=setup(async()=>{if(!count++)throw new Error('Falha temporária');return {text:'Retorno fictício'};});try{
  await f.call({action:'AI_PANEL_NEW',windowId:9});const state=await f.get();
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Pergunta ainda sem resposta'});await f.done();
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Pode responder à pergunta anterior?'});await f.done();
  const history=f.calls.filter(message=>message.action==='AI_GENERATE').at(-1).input.history;
  assert.equal(history[0].content,'Pergunta ainda sem resposta');assert.match(history[1].content,/não teve uma resposta concluída/);
 }finally{f.storage.restore();}
});

test('entering chat follows the HTML ticket number, restores its history and creates a blank conversation for another ticket',async()=>{
 const f=setup();try{
  f.setSnapshot({ticketNumber:'272402'});
  await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'page-A',identity:'ticket-A'}]},source);
  await f.call({action:'AI_PANEL_ENTER',windowId:9});let state=await f.get();
  assert.equal(state.ticketNumber,'272402');assert.equal(state.kind,'ticket');assert.deepEqual(state.messages,[]);assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,0);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Pergunta do ticket A'});await f.done();
  await f.call({action:'AI_PANEL_DRAFT',windowId:9,id:state.id,text:'Rascunho exclusivo A'});
  f.setSnapshot({key:'b'.repeat(64),digest:'c'.repeat(64),ticketNumber:'272403',context:'Conteúdo exclusivo B'});
  await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'page-B',identity:'ticket-B'}]},source);
  await f.call({action:'AI_PANEL_SYNC',windowId:9});state=await f.get();
  assert.equal(state.ticketNumber,'272403');assert.deepEqual(state.messages,[]);assert.equal(state.draft,'');
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Pergunta do ticket B'});await f.done();
  const request=f.calls.filter(m=>m.action==='AI_GENERATE').at(-1);assert.deepEqual(request.input.history,[]);assert.equal(request.input.context,'Conteúdo exclusivo B');
  f.setSnapshot({key:'a'.repeat(64),digest:'b'.repeat(64),ticketNumber:'272402',context:'Mensagem do cliente fictício.'});
  await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'page-A-again',identity:'ticket-A'}]},source);
  await f.call({action:'AI_PANEL_SYNC',windowId:9});state=await f.get();
  assert.equal(state.ticketNumber,'272402');assert.equal(state.messages[0].content,'Pergunta do ticket A');assert.equal(state.draft,'Rascunho exclusivo A');
  assert.equal((await f.store.list('local')).filter(item=>item.kind==='ticket').length,2);
  await f.call({action:'AI_PANEL_ENTER',windowId:9});assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,2);
 }finally{f.storage.restore();}
});

test('a ticket change before send opens its blank chat and rejects the stale submission',async()=>{
 const f=setup();try{
  await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'page-A',identity:'ticket-A'}]},source);
  await f.call({action:'AI_PANEL_ENTER',windowId:9});const state=await f.get();
  f.setSnapshot({key:'b'.repeat(64),ticketNumber:'272403',context:'Outro atendimento'});
  await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'page-B',identity:'ticket-B'}]},source);
  const result=await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Não misturar esta pergunta'});
  assert.equal(result.success,false);assert.match(result.error,/ticket mudou/);assert.deepEqual((await f.get()).messages,[]);assert.equal((await f.get()).ticketNumber,'272403');assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,0);
 }finally{f.storage.restore();}
});

test('an Octadesk ticket with no ready content frame cannot silently become an unrelated general chat',async()=>{
 const f=setup();try{
  const result=await f.call({action:'AI_PANEL_ENTER',windowId:9});assert.equal(result.success,false);assert.match(result.error,/identificar o ticket/);
  assert.equal(await f.get(),null);assert.equal((await f.store.list('local')).length,0);assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,0);
 }finally{f.storage.restore();}
});

test('a late model result after automatic ticket switching cannot populate either ticket incorrectly',async()=>{
 let finish;const f=setup(()=>new Promise(resolve=>{finish=resolve;}));try{
  await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'page-A',identity:'ticket-A'}]},source);
  await f.call({action:'AI_PANEL_ENTER',windowId:9});let state=await f.get();
  await f.call({action:'AI_PANEL_DRAFT',windowId:9,id:state.id,text:'Pergunta antiga'});
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Pergunta antiga'});
  for(let i=0;!finish&&i<100;i++)await new Promise(resolve=>setTimeout(resolve,5));assert.ok(finish);
  f.setSnapshot({key:'b'.repeat(64),ticketNumber:'272403',context:'Ticket B'});
  await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'page-B',identity:'ticket-B'}]},source);
  await f.call({action:'AI_PANEL_SYNC',windowId:9});finish({text:'Retorno tardio do ticket A'});await new Promise(resolve=>setTimeout(resolve,20));
  state=await f.get();assert.equal(state.ticketNumber,'272403');assert.deepEqual(state.messages,[]);assert.ok(f.calls.some(m=>m.action==='AI_CANCEL'));
  assert.deepEqual((await f.store.handle('AI_CHAT_LOAD','a'.repeat(64))).chat.messages,[{role:'user',content:'Pergunta antiga'}]);
 }finally{f.storage.restore();}
});

test('chat can bind the active ticket without a summary, reads fresh page data and keeps one canonical ticket history',async()=>{
 const f=setup();try{
  browser.tabs.query=async()=>[source.tab];
  assert.equal((await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'page-one',identity:'ticket-A'}]},source)).success,true);
  await f.call({action:'AI_PANEL_NEW',windowId:9});
  assert.equal((await f.call({action:'AI_PANEL_ATTACH',windowId:9})).success,true);
  let state=await f.get();assert.equal(state.kind,'ticket');assert.equal(state.detached,false);assert.deepEqual(state.messages,[]);
  assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,0);
  f.setSnapshot({context:'HTML do ticket: <form><span>id_case: Atual</span></form>',digest:'c'.repeat(64)});
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Qual é o case atual?'});await f.done();
  assert.match(f.calls.filter(m=>m.action==='AI_GENERATE').at(-1).input.context,/id_case: Atual/);
  assert.equal((await f.store.list('local')).filter(item=>item.kind==='ticket').length,1);
  await f.call({action:'AI_PANEL_NEW',windowId:9});
  await f.call({action:'AI_PANEL_RESUME',windowId:9,key:'a'.repeat(64)});state=await f.get();
  assert.equal(state.detached,true);assert.equal(state.messages.length,2);
  browser.tabs.get=async()=>({...source.tab,active:false});
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Continue com os dados salvos'});await f.done();
  assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,2);
  assert.match(f.calls.filter(m=>m.action==='AI_GENERATE').at(-1).input.context,/id_case: Atual/);
 }finally{f.storage.restore();}
});

test('active-page access rejects foreign sites, ambiguous frames and reconnecting a saved chat to a different ticket',async()=>{
 const f=setup();try{
  browser.tabs.query=async()=>[source.tab];
  assert.equal((await f.call({action:'AI_PANEL_ATTACH',windowId:9},source)).success,false);
  assert.equal((await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'foreign',identity:'foreign'}]},{...source,tab:{...source.tab,url:'https://example.invalid'},url:'https://example.invalid'})).success,false);
  await f.open();await f.done();await f.call({action:'AI_PANEL_NEW',windowId:9});
  f.setSnapshot({key:'b'.repeat(64),context:'OUTRO_TICKET'});
  await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'page-other',identity:'other'}]},source);
  await f.call({action:'AI_PANEL_RESUME',windowId:9,key:'a'.repeat(64)});let state=await f.get();assert.equal(state.detached,true);
  await f.call({action:'AI_PANEL_SEND',windowId:9,id:state.id,text:'Continue o ticket original'});await f.done();
  assert.ok(!f.calls.filter(m=>m.action==='AI_GENERATE').at(-1).input.context.includes('OUTRO_TICKET'));
  const originalSend=browser.tabs.sendMessage;browser.tabs.sendMessage=async(tab,message,options)=>message.action==='AI_PAGE_CHECK'?{success:true}:originalSend(tab,message,options);
  await f.call({action:'AI_PAGE_REGISTER',tickets:[{id:'second-page',identity:'other2'}]},{...source,frameId:3});
  assert.equal((await f.call({action:'AI_PANEL_ATTACH',windowId:9})).success,false);
 }finally{f.storage.restore();}
});
function setup(generate = async () => ({ text: 'Resposta fictícia' }), nativeSidebar = false) {
  const storage = installStorage(), store = createTicketChatStore(), calls = [], events = [];
  let value = { title: 'Ticket fictício', key: 'a'.repeat(64), digest: 'b'.repeat(64), namespace: 'local', context: 'Mensagem do cliente fictício.' };
  browser.runtime = { getURL: path => `moz-extension://extension${path}`, sendMessage: async event => { events.push(event); } };
  browser.tabs = { query:async()=>[source.tab], get: async () => source.tab, sendMessage: async (_tab, message, options) => { assert.equal(options.frameId, 2); if (message.action === 'AI_PANEL_SNAPSHOT') return { success: true, data: value }; calls.push(message); return { success: true }; } };
  const router = createAiPanelRouter(async (message) => { calls.push(message); if (['AI_CHAT_LOAD','AI_CHAT_SAVE'].includes(message.action)) return store.handle(message.action, message.key, message.revision, message.content); if (message.action === 'AI_CANCEL') return {}; return generate(message); }, nativeSidebar ? undefined : () => { events.push({ action: 'sidebar-open' }); return Promise.resolve(); });
  const call = (message, sender = ui) => new Promise(resolve => router.handleMessage(message, sender, result => resolve(structuredClone(result))));
  const get = async () => (await call({ action: 'AI_PANEL_GET', windowId: 9 })).data;
  const open = async (id = 'one', task = 'summary_full') => { assert.equal((await call({ action: 'AI_PANEL_OPEN', id, identity: 'ticket-A', task }, source)).success, true); return call({ action: 'AI_PANEL_CONTEXT', id, snapshot: value }, source); };
  const done = async () => { for (let i = 0; i < 100; i++) { const state = await get(); if (state?.ready && !state.busy) return state; await new Promise(resolve => setTimeout(resolve, 5)); } throw new Error('Panel did not finish'); };
  return { storage, store, calls, events, call, get, open, done, setSnapshot: next => { value = { ...value, ...next }; }, router };
}
test('summary button opens native sidebar before any storage/model work and restores chat without another inference', async () => {
  const f = setup(); try {
    await f.open(); let state = await f.done(); assert.equal(f.events[0].action, 'sidebar-open'); assert.equal(state.messages[0].content, 'Resposta fictícia');
    assert.equal(f.calls.filter(x => x.action === 'AI_GENERATE').length, 1);
    await f.call({ action: 'AI_PANEL_DRAFT', windowId: 9, id: 'one', text: 'Continuar depois' });
    await f.open('two'); state = await f.done(); assert.equal(state.draft, 'Continuar depois'); assert.match(state.status, /recuperada/);
    assert.equal(f.calls.filter(x => x.action === 'AI_GENERATE').length, 1);
  } finally { f.storage.restore(); }
});
test('email summaries are cached by exact content and configuration; changed input invalidates cache', async () => {
  const f = setup(); try {
    f.setSnapshot({ selection: 'E-mail fictício A' }); await f.open('one','summary_latest'); await f.done();
    await f.open('two','summary_latest'); assert.equal((await f.done()).cached, true); assert.equal(f.calls.filter(x => x.action === 'AI_GENERATE').length, 1);
    f.setSnapshot({ selection: 'E-mail fictício B' }); await f.open('three','summary_latest'); await f.done(); assert.equal(f.calls.filter(x => x.action === 'AI_GENERATE').length, 2);
    await browser.storage.local.set({ octablaster_ai_config_revision: 'changed' }); await f.open('four','summary_latest'); await f.done(); assert.equal(f.calls.filter(x => x.action === 'AI_GENERATE').length, 3);
  } finally { f.storage.restore(); }
});
test('draft generation uses editor instruction and every assistant turn can target its original frame', async () => {
  const f = setup(async () => ({ text: 'Texto para revisão.\n\nAtenciosamente,\nEquipe do cliente' })); try {
    f.setSnapshot({ direction: 'Peça a confirmação do cliente.', draftToken: 'draft-one' }); await f.open('one','reply'); const state = await f.done();
    assert.match(f.calls.find(x => x.action === 'AI_GENERATE').input.instruction, /Peça a confirmação/);
    assert.equal(state.messages.at(-1).content, 'Texto para revisão.');
    assert.equal((await f.call({ action:'AI_PANEL_INSERT', id:'one', windowId:9, index:1 })).success,true);
    const insertion = f.calls.find(x => x.action === 'AI_PANEL_INSERT'); assert.equal(insertion.draftToken,'draft-one'); assert.equal(insertion.text,'Texto para revisão.');
    browser.tabs.get = async () => ({ ...source.tab, active:false });
    assert.equal((await f.call({ action:'AI_PANEL_INSERT', id:'one', windowId:9, index:1 })).success,false);
  } finally { f.storage.restore(); }
});
test('questions persist, edit from the chosen point and keep unrelated ticket history out', async () => {
  const f=setup(); try {
    await f.open(); await f.done(); await f.call({action:'AI_PANEL_SEND',id:'one',windowId:9,text:'Pergunta inicial'});await f.done();
    await f.call({action:'AI_PANEL_SEND',id:'one',windowId:9,text:'Pergunta revisada',editIndex:1});const state=await f.done();
    assert.equal(state.messages.length,3);assert.equal(state.messages[1].content,'Pergunta revisada');
    const last=f.calls.filter(x=>x.action==='AI_GENERATE').at(-1);assert.ok(!JSON.stringify(last.input.history).includes('Pergunta inicial'));
    f.setSnapshot({key:'c'.repeat(64),context:'Outro ticket',digest:'d'.repeat(64)});await f.open('other');const other=await f.done();assert.ok(!JSON.stringify(other.messages).includes('Pergunta revisada'));
  }finally{f.storage.restore();}
});
test('foreign frames, websites and stale sessions cannot replace context or insert text',async()=>{
  const f=setup();try{
    assert.equal((await f.call({action:'AI_PANEL_OPEN',id:'bad',identity:'bad',task:'reply'},{...source,tab:{...source.tab,url:'https://attacker.invalid'}})).success,false);
    await f.open();await f.done();
    assert.equal((await f.call({action:'AI_PANEL_CONTEXT',id:'one',snapshot:{}},{...source,frameId:3})).success,false);
    assert.equal((await f.call({action:'AI_PANEL_SEND',id:'stale',windowId:9,text:'Pergunta'})).success,false);
    assert.equal((await f.call({action:'AI_PANEL_INSERT',id:'one',windowId:9,index:0},source)).success,false);
  }finally{f.storage.restore();}
});
test('cancelled or invalidated queries never append their late result',async()=>{
  let finish;const f=setup(()=>new Promise(resolve=>{finish=resolve;}));try{
    await f.open();for(let i=0;i<100&&!finish;i++)await new Promise(resolve=>setTimeout(resolve,5));
    await f.call({action:'AI_PANEL_CANCEL',id:'one',windowId:9});finish({text:'RESPOSTA TARDIA'});await new Promise(resolve=>setTimeout(resolve,20));
    const state=await f.get();assert.equal(state.busy,false);assert.equal(state.ready,false);assert.ok(!JSON.stringify(state.messages).includes('RESPOSTA TARDIA'));assert.ok(f.calls.some(x=>x.action==='AI_CANCEL'));
  }finally{f.storage.restore();}
});

test('sidebar reveals chat only once per explicit ticket action, never just because a conversation exists', async () => {
  const f = setup(); try {
    const reveal = () => f.call({action:'AI_PANEL_REVEAL',windowId:9});
    assert.equal((await reveal()).data,false);
    await f.open(); await f.done();
    assert.equal((await f.call({action:'AI_PANEL_REVEAL',windowId:9},source)).success,false);
    assert.equal((await reveal()).data,true);
    assert.equal((await reveal()).data,false);
    assert.ok((await f.get()).messages.length);
    await f.open('again'); await f.done();
    assert.equal((await reveal()).data,true);
    assert.equal((await reveal()).data,false);
  } finally { f.storage.restore(); }
});

test('originating button receives busy state and provider errors without losing retry capability', async () => {
  let fail;
  const f=setup(()=>new Promise((_,reject)=>{fail=reject;}));
  try {
    await f.open('working','reply');
    for(let i=0;i<100&&!fail;i++)await new Promise(resolve=>setTimeout(resolve,5));
    assert.ok(f.calls.some(x=>x.action==='AI_PANEL_PROGRESS'&&x.id==='working'&&x.progress.busy));
    fail(new Error('Provedor indisponível. Tente novamente.'));
    const state=await f.done();assert.match(state.error,/Provedor indisponível/);
    const last=f.calls.filter(x=>x.action==='AI_PANEL_PROGRESS').at(-1);
    assert.equal(last.progress.busy,false);assert.match(last.progress.error,/Provedor indisponível/);
  }finally{f.storage.restore();}
});

test('summary can reopen the sidebar while busy without another model request',async()=>{
 let finish;const f=setup(()=>new Promise(resolve=>{finish=resolve;}));try{
  await f.open();for(let i=0;i<100&&!finish;i++)await new Promise(resolve=>setTimeout(resolve,5));
  const before=f.calls.filter(m=>m.action==='AI_GENERATE').length;
  assert.equal((await f.call({action:'AI_PANEL_SHOW',identity:'ticket-A'},source)).success,true);
  assert.equal(f.events.filter(m=>m.action==='sidebar-open').length,2);
  assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,before);
  assert.equal((await f.call({action:'AI_PANEL_SHOW',identity:'ticket-A'},{...source,frameId:7})).success,false);
  finish({text:'Resumo pronto'});await f.done();
 }finally{f.storage.restore();}
});

test('Firefox queues the summary and offers a native popup action instead of claiming a forbidden sidebar gesture',async()=>{
 const f=setup(undefined,true);let popups=0;browser.sidebarAction={isOpen:async()=>false};browser.browserAction={openPopup:async()=>{popups++;}};
 try{
  await f.open();await f.done();assert.equal(popups,1);
  assert.equal((await f.call({action:'AI_PANEL_ACCESS',windowId:9})).data,true);
  assert.equal((await f.call({action:'AI_PANEL_ACTIVATE',windowId:9},source)).success,false);
  assert.equal((await f.call({action:'AI_PANEL_ACTIVATE',windowId:9})).success,true);
  assert.equal((await f.call({action:'AI_PANEL_ACCESS',windowId:9})).data,false);
  assert.equal((await f.call({action:'AI_PANEL_REVEAL',windowId:9})).data,true);
  browser.browserAction.openPopup=async()=>{throw new Error('User gesture required');};
  await f.open('blocked');await f.done();assert.equal((await f.call({action:'AI_PANEL_ACCESS',windowId:9})).data,true);
  assert.match(f.calls.filter(m=>m.action==='AI_PANEL_PROGRESS').at(-1).progress.status,/ícone da extensão/);
  f.router.clearTab(1);
 }finally{delete browser.sidebarAction;delete browser.browserAction;f.storage.restore();}
});

test('ticket and selected-email requests use different structured instructions and keep email source isolated',async()=>{
 const f=setup();try{
  f.setSnapshot({context:'HISTORICO COMPLETO EXCLUSIVO DO TICKET',selection:'EMAIL SELECIONADO APENAS'});
  await f.open('email','summary_latest');await f.done();
  const email=f.calls.filter(m=>m.action==='AI_GENERATE').at(-1).input;
  assert.equal(email.context,'EMAIL SELECIONADO APENAS');assert.ok(!email.instruction.includes('EMAIL SELECIONADO APENAS'));assert.equal(email.history.length,0);
  assert.match(email.instruction,/Remetente e data:/);assert.match(email.instruction,/Ação esperada:/);assert.match(email.instruction,/Não conclua o status geral/);
  await f.open('ticket','summary_full');await f.done();
  const ticket=f.calls.filter(m=>m.action==='AI_GENERATE').at(-1).input;
  assert.match(ticket.context,/HISTORICO COMPLETO/);assert.match(ticket.instruction,/Título do ticket:/);assert.match(ticket.instruction,/Status atual:/);assert.match(ticket.instruction,/Pendências e próximos passos:/);assert.match(ticket.instruction,/\[FALTA INFORMAR\]/);
 }finally{f.storage.restore();}
});
test('old-format summaries refresh once while retaining prior conversation and the new format is then reused',async()=>{
 const f=setup();try{
  f.storage.data['octablaster_ticket_chat_v1_'+'a'.repeat(64)]={version:1,revision:'legacy',contextDigest:'b'.repeat(64),messages:[{role:'assistant',content:'Resumo anterior sem campos.'}],draft:'Rascunho preservado',createdAt:Date.now(),updatedAt:Date.now(),usedAt:Date.now()};
  await f.open('upgrade');let state=await f.done();assert.ok(state.messages.some(m=>m.content==='Resumo anterior sem campos.'));assert.equal(state.draft,'Rascunho preservado');assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,1);
  await f.open('reused');state=await f.done();assert.match(state.status,/recuperada/);assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,1);
 }finally{f.storage.restore();}
});

test('custom summary prompts invalidate the relevant summaries while preserving conversation and subsequent cache reuse',async()=>{
 const f=setup();try{
  await f.open();await f.done();
  const initial=await readAiPrompts();await saveAiPrompts({...initial.prompts,ticket:'CUSTOM TICKET: objetivo, estado e pendências.',email:'CUSTOM EMAIL: detalhe só esta mensagem.'},initial.revision);
  await f.open('custom-ticket');let state=await f.done();assert.ok(state.messages.length>1);
  assert.match(f.calls.filter(m=>m.action==='AI_GENERATE').at(-1).input.instruction,/CUSTOM TICKET/);
  const count=f.calls.filter(m=>m.action==='AI_GENERATE').length;await f.open('repeat-ticket');await f.done();assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,count);
  f.setSnapshot({selection:'Email isolado'});await f.open('custom-email','summary_latest');await f.done();
  const email=f.calls.filter(m=>m.action==='AI_GENERATE').at(-1).input;assert.match(email.instruction,/CUSTOM EMAIL/);assert.equal(email.context,'Email isolado');
 }finally{f.storage.restore();}
});

test('introducing editable prompts keeps a valid earlier default-format summary without another inference',async()=>{
 const f=setup();try{
  f.storage.data['octablaster_ticket_chat_v1_'+'a'.repeat(64)]={version:1,revision:'prior-format',contextDigest:await textDigest(`${SUMMARY_FORMAT_VERSION}:${'b'.repeat(64)}`),messages:[{role:'assistant',content:'Objetivo:\nResumo estruturado já salvo.'}],draft:'Pergunta preservada',createdAt:Date.now(),updatedAt:Date.now(),usedAt:Date.now()};
  await f.open();const state=await f.done();assert.match(state.status,/recuperada/);assert.equal(state.draft,'Pergunta preservada');assert.equal(f.calls.filter(m=>m.action==='AI_GENERATE').length,0);
 }finally{f.storage.restore();}
});
