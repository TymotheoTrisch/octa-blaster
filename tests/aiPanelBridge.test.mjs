import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';
import { startReplyAssistance } from '../services/octadesk/aiReply.ts';
import { openAiSidebar, startAiPanelBridge } from '../services/octadesk/aiPanelBridge.ts';
import { createSummaryLifecycle } from '../services/octadesk/aiSummaryLifecycle.ts';
const settle=()=>new Promise(r=>setTimeout(r,35));
function setup(){
 const storage=installStorage(),dom=installDom('<form id="ticketA" ticket="ticket"><header class="ticket-header"><h2>Ticket A</h2></header><article class="interaction"><header class="interaction-header">Cliente</header><div class="content-comment-interaction">Pedido do cliente.</div></article><div class="comment-panel"><div ng-if="ticketViewModel.typeInteractionSelected == 2"><div class="note-editable" contenteditable="true"><p><br></p></div></div></div></form>');
 dom.window.HTMLElement.prototype.getBoundingClientRect=()=>({width:800,height:200});
 const calls=[],listeners=[];browser.runtime={id:'extension',getURL:path=>`moz-extension://extension${path}`,getManifest:()=>({manifest_version:3}),sendMessage:async message=>{calls.push(message);return {success:true};},onMessage:{addListener:fn=>listeners.push(fn),removeListener:()=>{}}};
 const editor=dom.document.querySelector('.note-editable'),scope=dom.document.querySelector('form');
 const bridge=startAiPanelBridge(dom.document,{findEditorForWidget:()=>editor,isUsableEditor:()=>true,activateEditor:()=>{},isCurrentContext:()=>true});
 const respond=message=>new Promise(resolve=>{for(const fn of listeners)if(fn(message,{id:'extension'},resolve))break;});
 return {...dom,editor,scope,calls,respond,restore(){bridge();dom.restore();storage.restore();}};
}
test('typing only shows the editor AI icon; clicking opens the sidebar with no extra field or modal',async()=>{
 const f=setup(),stop=startReplyAssistance(f.document);try{
  const button=f.document.querySelector('.octa-editor-ai-button');assert.equal(button.hidden,true);
  f.editor.textContent='Peça confirmação de funcionamento.';f.editor.dispatchEvent(new f.window.Event('input',{bubbles:true}));await settle();assert.equal(button.hidden,false);assert.equal(f.calls.length,0);
  button.click();await settle();assert.equal(f.calls.length,0); // Clique sintético da página não autoriza IA.
  await openAiSidebar(f.scope,'reply',undefined,f.editor);await settle();assert.equal(f.calls[0].action,'AI_PANEL_OPEN');assert.equal(f.calls[0].task,'reply');
  const context=f.calls.find(x=>x.action==='AI_PANEL_CONTEXT'&&x.snapshot);assert.equal(context.snapshot.direction,'Peça confirmação de funcionamento.');assert.equal(f.document.querySelector('dialog, .octa-reply-guidance, .octa-message-summary'),null);
 }finally{stop();f.restore();}
});
test('summaries open sidebar and pass the chosen message without changing source HTML',async()=>{
 const f=setup(),lifecycle=createSummaryLifecycle(f.document);try{
  const original=f.document.querySelector('.content-comment-interaction').innerHTML;lifecycle.scan();await openAiSidebar(f.scope,'summary_latest',f.document.querySelector('.content-comment-interaction'));await settle();
  assert.equal(f.calls[0].task,'summary_latest');assert.match(f.calls.find(x=>x.snapshot).snapshot.selection,/Pedido do cliente/);assert.equal(f.document.querySelector('.content-comment-interaction').innerHTML,original);assert.equal(f.document.querySelector('dialog, aside'),null);
 }finally{lifecycle.dispose();f.restore();}
});
test('generated answer replaces only the exact instruction snapshot and stale edits are preserved',async()=>{
 const f=setup();try{
  f.document.execCommand=()=>false;f.editor.textContent='Solicite confirmação.';await openAiSidebar(f.scope,'reply',undefined,f.editor);await settle();
  let open=f.calls.find(x=>x.action==='AI_PANEL_OPEN'),data=f.calls.find(x=>x.snapshot).snapshot;
  let result=await f.respond({action:'AI_PANEL_INSERT',id:open.id,identity:open.identity,draftToken:data.draftToken,text:'Resposta pronta para revisão.'});assert.equal(result.success,true);assert.equal(f.editor.textContent,'Resposta pronta para revisão.');
  f.calls.length=0;f.editor.textContent='Outra orientação.';await openAiSidebar(f.scope,'reply',undefined,f.editor);await settle();open=f.calls.find(x=>x.action==='AI_PANEL_OPEN');data=f.calls.find(x=>x.snapshot).snapshot;
  f.editor.textContent='Rascunho editado durante a geração.';result=await f.respond({action:'AI_PANEL_INSERT',id:open.id,identity:open.identity,draftToken:data.draftToken,text:'NÃO INSERIR'});assert.equal(result.success,false);assert.equal(f.editor.textContent,'Rascunho editado durante a geração.');
 }finally{f.restore();}
});
