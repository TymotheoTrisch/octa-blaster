import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';
import { suggestTicketReply, startReplyAssistance } from '../services/octadesk/aiReply.ts';
import { AI_BEHAVIOR_KEY, AI_WRITING_KEY, writingIdentity, writingGuidance, rememberWriting, cleanupWriting } from '../services/ai/writingMemory.ts';
import { withoutGeneratedSignature } from '../services/ai/replySignature.ts';
import { collectAiTicketContext } from '../services/octadesk/aiTicketContext.ts';
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

test('received company footer is excluded from preview, copy and inserted draft independently of learning', async () => {
  const dom = fixture(), calls = []; let copied = '';
  try {
    dom.data[AI_BEHAVIOR_KEY] = { learnWriting: false };
    dom.document.querySelector('.content-comment-interaction').outerHTML = '<interaction-comment><header><span class="comment-title">Pessoa Cliente (Cliente) | Mensagem</span></header><div class="content-comment-interaction">Solicito a alteração.<br>Atenciosamente,<br>Equipe de Suporte Empresa Cliente</div></interaction-comment>';
    await suggestTicketReply(dom.editor, false, async (_action, data) => { calls.push(data); return { text: 'A alteração foi confirmada.\n\nFico à disposição.\n\nAtenciosamente,\nEquipe de Suporte Empresa Cliente' }; });
    assert.match(calls[0].input.context, /"autor":"Pessoa Cliente","papel":"cliente\/solicitante"/);
    assert.match(calls[0].input.instruction, /Não escreva assinatura/);
    const panel = dom.document.querySelector('.octa-reply-preview');
    assert.equal(panel.querySelector('.octa-summary-text').textContent, 'A alteração foi confirmada.\n\nFico à disposição.');
    assert.match(panel.querySelector('.octa-reply-signature-notice').textContent, /omitido/);
    dom.document.execCommand = command => { if (command === 'copy') { copied = dom.document.querySelector('textarea[readonly]').value; return true; } return false; };
    panel.querySelector('.octa-reply-copy').click(); await settle(); assert.ok(!copied.includes('Empresa Cliente')); assert.match(copied, /Fico à disposição/);
    panel.querySelector('.octa-reply-insert').click(); assert.ok(!dom.editor.textContent.includes('Empresa Cliente')); assert.match(dom.editor.textContent, /A alteração foi confirmada/);
  } finally { dom.document.querySelector('.octa-reply-preview header button')?.click(); dom.restore(); }
});

test('reply loads collapsed interactions before inference and preserves agent/client attribution', async () => {
  const dom = fixture(), scope = dom.document.querySelector('form'), calls = [];
  try {
    scope.querySelector('.content-comment-interaction').outerHTML = '<interaction-comment><header><span class="comment-title">Agente ficticio (Agente) | Mensagem</span></header><div class="content-comment-interaction">Realizado.</div></interaction-comment>';
    const toggle = dom.document.createElement('div'); toggle.className = 'toggle-middle-interactions'; toggle.innerHTML = '<a ng-click="toggleMiddleInteractions()"><i class="icon-angle-double-down"></i>Todas as interações</a>'; scope.prepend(toggle);
    toggle.querySelector('a').addEventListener('click', () => { const earlier = dom.document.createElement('div'); earlier.setAttribute('ng-if', 'showMiddleInteractions'); earlier.innerHTML = '<interaction-comment><header><span class="comment-title">Pessoa Cliente (Cliente) | Mensagem</span></header><div class="content-comment-interaction">Pedido anterior com informação relevante.</div></interaction-comment>'; scope.prepend(earlier); });
    await suggestTicketReply(dom.editor, false, async (_action, data) => { calls.push(data); return { text: 'Texto para revisão sem assinatura.' }; });
    assert.equal(calls.length, 1); assert.match(calls[0].input.context, /Pedido anterior/); assert.match(calls[0].input.context, /"papel":"agente de atendimento"/); assert.match(calls[0].input.context, /"papel":"cliente\/solicitante"/);
  } finally { dom.document.querySelector('.octa-reply-preview header button')?.click(); dom.restore(); }
});

test('truncating a long email retains its author metadata and never labels an unknown author as the agent', () => {
  const dom = fixture();
  try {
    dom.document.querySelector('.content-comment-interaction').outerHTML = `<interaction-comment><header><span class="comment-title">Pessoa Cliente (Cliente) | Mensagem</span></header><div class="content-comment-interaction">${'x'.repeat(60000)}</div></interaction-comment>`;
    const context = collectAiTicketContext(dom.editor); assert.ok(context.context.length <= 50000); assert.equal(context.truncated, true); assert.match(context.context, /"autor":"Pessoa Cliente","papel":"cliente\/solicitante"/);
    dom.document.querySelector('.comment-title').textContent = 'Pessoa sem classificação | Mensagem';
    assert.match(collectAiTicketContext(dom.editor).context, /não identificado; não inferir pela assinatura/);
  } finally { dom.restore(); }
});

test('signature filter handles standard and markdown closings without deleting a generic cordial sentence', () => {
  for (const closing of ['Atenciosamente,', '**Atenciosamente,**', 'Att.', 'Cordialmente,']) assert.deepEqual(withoutGeneratedSignature(`Resposta útil.\n\nFico à disposição!\n\n${closing}\nEquipe da Empresa Cliente`), { text: 'Resposta útil.\n\nFico à disposição!', removed: true });
  assert.deepEqual(withoutGeneratedSignature('Resposta útil.\n\nEquipe de Suporte Empresa Cliente'), { text: 'Resposta útil.', removed: true });
  assert.deepEqual(withoutGeneratedSignature('Resposta útil.\n\nFico à disposição!'), { text: 'Resposta útil.\n\nFico à disposição!', removed: false });
});
