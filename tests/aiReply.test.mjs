import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';
import { suggestTicketReply, startReplyAssistance } from '../services/octadesk/aiReply.ts';
import { AI_BEHAVIOR_KEY, AI_WRITING_KEY, writingIdentity, writingGuidance, rememberWriting, cleanupWriting } from '../services/ai/writingMemory.ts';
const settle = () => new Promise(resolve => setTimeout(resolve, 60));
function fixture() {
  const storage = installStorage();
  const dom = installDom('<form ticket="ticket"><h2>Ticket A</h2><div class="content-comment-interaction">Pedido do cliente A</div><div class="comment-panel"><bexs-thumb user-logged><img alt="Agente ficticio"></bexs-thumb><div ng-if="ticketViewModel.typeInteractionSelected == 2"><div class="note-editable" contenteditable="true"><p><br></p></div></div></div><button type="button" class="btn-save">Enviar</button></form><section ticket-id="B"><div class="content-comment-interaction">SEGREDO B</div></section>');
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ top: 400, bottom: 600, left: 20, right: 820, width: 800, height: 200 });
  const editor = dom.document.querySelector('.note-editable');
  return { ...dom, data: storage.data, editor, restore() { dom.restore(); storage.restore(); } };
}
test('manual reply preview isolates the ticket, preserves draft and parses no generated HTML', async () => {
  const dom = fixture(), calls = [];
  try {
    dom.editor.innerHTML = '<p>Meu rascunho</p>';
    await suggestTicketReply(dom.editor, false, async (_action, data) => { calls.push(data); return { text: '<script>Texto para revisão</script>' }; });
    assert.equal(calls.length, 1); assert.ok(!JSON.stringify(calls).includes('SEGREDO B'));
    assert.equal(dom.editor.textContent, 'Meu rascunho');
    const panel = dom.document.querySelector('.octa-reply-preview'); assert.ok(panel); assert.equal(panel.querySelector('script'), null);
    assert.equal(panel.querySelector('.octa-reply-insert').disabled, true);
    panel.querySelector('header button').click();
  } finally { dom.restore(); }
});
test('automatic generation requires opting in, an empty public editor and runs once per context', async () => {
  const dom = fixture(); let calls = 0; const send = async () => { calls++; return { text: 'Sugestão' }; };
  try {
    await suggestTicketReply(dom.editor, true, send); assert.equal(calls, 0);
    dom.data[AI_BEHAVIOR_KEY] = { automaticReplies: true, learnWriting: true };
    dom.editor.textContent = 'Rascunho'; await suggestTicketReply(dom.editor, true, send); assert.equal(calls, 0);
    dom.editor.innerHTML = '<p><br></p>'; await suggestTicketReply(dom.editor, true, send); assert.equal(calls, 1);
    dom.document.querySelector('.octa-reply-preview header button').click();
    await suggestTicketReply(dom.editor, true, send); assert.equal(calls, 1);
    dom.editor.parentElement.setAttribute('ng-if', 'ticketViewModel.typeInteractionSelected == 3');
    await suggestTicketReply(dom.editor, false, send); assert.equal(calls, 1);
  } finally { dom.restore(); }
});
test('typing during inference cancels and never displays or inserts a late answer', async () => {
  const dom = fixture(); let resolve; const actions = [];
  try {
    const task = suggestTicketReply(dom.editor, false, async action => { actions.push(action); return action === 'AI_GENERATE' ? new Promise(done => { resolve = done; }) : {}; });
    await settle(); dom.editor.textContent = 'Novo rascunho'; dom.editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    resolve({ text: 'OBSOLETO' }); await task;
    assert.ok(actions.includes('AI_CANCEL')); assert.equal(dom.document.querySelector('.octa-reply-preview'), null); assert.equal(dom.editor.textContent, 'Novo rascunho');
  } finally { dom.restore(); }
});
test('learning waits for a newly published matching draft and stores only numeric writing patterns', async () => {
  const dom = fixture(), stop = startReplyAssistance(dom.document);
  try {
    const user = await writingIdentity(dom.editor);
    dom.editor.innerHTML = '<p>Bom dia, cliente@example.com.</p><p>Por favor, confira o numero do banco para continuarmos o atendimento.</p>';
    dom.document.querySelector('.btn-save').click(); await settle(); assert.equal(dom.data[AI_WRITING_KEY], undefined);
    const published = dom.document.createElement('div'); published.className = 'content-comment-interaction'; published.innerHTML = dom.editor.innerHTML; dom.document.querySelector('form').append(published); await settle();
    assert.equal(dom.data[AI_WRITING_KEY][user].count, 1);
    assert.ok(!JSON.stringify(dom.data[AI_WRITING_KEY]).includes('cliente@example.com'));
    assert.equal(await writingGuidance(user), '');
    await rememberWriting(user, 'Boa tarde!\nPor favor, confirme as informacoes solicitadas.');
    await rememberWriting(user, 'Ola!\nPodemos conferir os dados para continuar o atendimento.');
    assert.match(await writingGuidance(user), /Padrões de escrita/);
    dom.data[AI_BEHAVIOR_KEY] = { learnWriting: false }; assert.equal(await writingGuidance(user), '');
    await rememberWriting(user, 'Nao deve aprender com esta resposta enviada.'); assert.equal(dom.data[AI_WRITING_KEY][user].count, 3);
  } finally { stop(); dom.restore(); }
});

test('writing identities isolate workspace users and cleanup removes expired patterns', async () => {
  const dom = fixture();
  try {
    const first = await writingIdentity(dom.editor);
    dom.document.querySelector('bexs-thumb img').alt = 'Outro agente';
    const other = await writingIdentity(dom.editor); assert.notEqual(first, other);
    dom.data[AI_WRITING_KEY] = { [first]: { count: 3, words: 12, paragraphs: 2, greeting: 1, closing: 0, updated: Date.now() - 91 * 86400000 }, [other]: { count: 3, words: 20, paragraphs: 2, greeting: 1, closing: 0, updated: Date.now() } };
    assert.equal(await writingGuidance(first), ''); await cleanupWriting();
    assert.equal(dom.data[AI_WRITING_KEY][first], undefined); assert.ok(dom.data[AI_WRITING_KEY][other]);
    dom.document.querySelector('bexs-thumb img').remove(); assert.equal(await writingIdentity(dom.editor), null);
  } finally { dom.restore(); }
});
