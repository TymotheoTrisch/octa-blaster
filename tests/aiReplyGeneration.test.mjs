import test from 'node:test';
import assert from 'node:assert/strict';
import {installDom,installStorage} from './helpers.mjs';
import {generateTicketReply} from '../services/octadesk/aiReplyGeneration.ts';
const tick=()=>new Promise(r=>setTimeout(r,10));
function setup(){
 const storage=installStorage(),dom=installDom('<form ticket="ticket" id="ticketA"><header class="header-info"><h2>Ticket A</h2><span class="label label-default ng-binding">123456</span></header><div class="content-comment-interaction">Pedido fictício do cliente.</div><div class="comment-panel"><div ng-if="ticketViewModel.typeInteractionSelected == 2"><div class="note-editable" contenteditable="true">Solicite confirmação do cliente.</div></div></div></form>');
 dom.window.HTMLElement.prototype.getBoundingClientRect=()=>({width:800,height:200});dom.document.execCommand=()=>false;
 const calls=[],progress=[];let finish,reject;
 browser.runtime={getURL:p=>`moz-extension://test${p}`,sendMessage:async message=>{calls.push(message);if(message.action==='AI_GENERATE')return new Promise((resolve,no)=>{finish=text=>resolve({success:true,data:{text}});reject=no;});return {success:true,data:{}};}};
 const editor=dom.document.querySelector('.note-editable'),scope=dom.document.querySelector('form');
 return {...dom,editor,scope,calls,progress,run:()=>generateTicketReply(editor,p=>progress.push(p)),finish:text=>finish(text),fail:()=>reject(new Error('Falha de teste no provedor.')),async started(){for(let i=0;i<100&&!finish;i++)await tick();assert.ok(finish);},restore(){dom.restore();storage.restore();}};
}
test('reply clears instruction, generates directly in the same editor, and never opens or writes the sidebar chat',async()=>{
 const f=setup();try{
  const promise=f.run();assert.equal(f.editor.textContent,'');await f.started();assert.equal(f.editor.getAttribute('aria-busy'),'true');
  assert.match(f.calls.find(m=>m.action==='AI_GENERATE').input.instruction,/Solicite confirmação/);
  f.finish('Olá, confirme se funcionou.\n\nAtenciosamente,\nEquipe da Empresa Cliente');await promise;
  assert.equal(f.editor.textContent,'Olá, confirme se funcionou.');assert.equal(f.editor.hasAttribute('aria-busy'),false);
  assert.ok(!f.calls.some(m=>m.action.startsWith('AI_PANEL_')||m.action==='AI_CHAT_SAVE'));assert.equal(f.progress.at(-1).busy,false);
 }finally{f.restore();}
});
test('provider error restores original instruction only when the cleared editor is untouched',async()=>{
 const f=setup();try{const original=f.editor.innerHTML,promise=f.run();await f.started();f.fail();await assert.rejects(promise,/Falha de teste/);assert.equal(f.editor.innerHTML,original);assert.equal(f.editor.hasAttribute('aria-busy'),false);}finally{f.restore();}
});
test('typing cancels the pending draft and a late answer cannot overwrite the new text',async()=>{
 const f=setup();try{const promise=f.run();await f.started();f.editor.textContent='Novo rascunho manual.';f.editor.dispatchEvent(new f.window.Event('input',{bubbles:true}));f.finish('RESPOSTA TARDIA');await promise;assert.equal(f.editor.textContent,'Novo rascunho manual.');assert.ok(f.calls.some(m=>m.action==='AI_CANCEL'));assert.equal(f.editor.hasAttribute('aria-busy'),false);}finally{f.restore();}
});
test('switching ticket during generation discards the late result without restoring text into another ticket',async()=>{
 const f=setup();try{const promise=f.run();await f.started();f.scope.querySelector('.label').textContent='654321';f.finish('RESPOSTA DE OUTRO TICKET');await promise;assert.ok(!f.editor.textContent.includes('RESPOSTA'));assert.equal(f.progress.at(-1).busy,false);}finally{f.restore();}
});
