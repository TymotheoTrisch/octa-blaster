import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiPanelRouter } from '../services/background/aiPanelRouter.ts';
import { createTicketChatStore } from '../services/storage/aiChatStorage.ts';
import { installStorage } from './helpers.mjs';
const source = { id: 'extension', tab: { id: 1, windowId: 9, active: true, url: 'https://app.octadesk.com/ticket/edit/1' }, frameId: 2, url: 'https://app.octadesk.com/embed/main/home/ticket/edit/1' };
const ui = { id: 'extension', url: 'moz-extension://extension/sidepanel.html' };
function setup(generate = async () => ({ text: 'Resposta fictícia' }), nativeSidebar = false) {
  const storage = installStorage(), store = createTicketChatStore(), calls = [], events = [];
  let value = { title: 'Ticket fictício', key: 'a'.repeat(64), digest: 'b'.repeat(64), namespace: 'local', context: 'Mensagem do cliente fictício.' };
  browser.runtime = { getURL: path => `moz-extension://extension${path}`, sendMessage: async event => { events.push(event); } };
  browser.tabs = { get: async () => source.tab, sendMessage: async (_tab, message, options) => { assert.equal(options.frameId, 2); if (message.action === 'AI_PANEL_SNAPSHOT') return { success: true, data: value }; calls.push(message); return { success: true }; } };
  const router = createAiPanelRouter(async (message) => { calls.push(message); if (['AI_CHAT_LOAD','AI_CHAT_SAVE'].includes(message.action)) return store.handle(message.action, message.key, message.revision, message.content); if (message.action === 'AI_CANCEL') return {}; return generate(message); }, nativeSidebar ? undefined : () => { events.push({ action: 'sidebar-open' }); return Promise.resolve(); });
  const call = (message, sender = ui) => new Promise(resolve => router.handleMessage(message, sender, result => resolve(structuredClone(result))));
  const get = async () => (await call({ action: 'AI_PANEL_GET', windowId: 9 })).data;
  const open = async (id = 'one', task = 'summary_full') => { assert.equal((await call({ action: 'AI_PANEL_OPEN', id, identity: 'ticket-A', task }, source)).success, true); return call({ action: 'AI_PANEL_CONTEXT', id, snapshot: value }, source); };
  const done = async () => { for (let i = 0; i < 100; i++) { const state = await get(); if (state?.ready && !state.busy) return state; await new Promise(resolve => setTimeout(resolve, 5)); } throw new Error('Panel did not finish'); };
  return { storage, calls, events, call, get, open, done, setSnapshot: next => { value = { ...value, ...next }; }, router };
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
