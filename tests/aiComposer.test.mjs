import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers.mjs';
import { readAiTicketContext, captureAiEditor, openAiComposer } from '../services/octadesk/aiComposer.ts';
import { collectAiTicketContext } from '../services/octadesk/aiTicketContext.ts';

function fixture(extra = '') {
  const dom = installDom(`<section ticket-id="A"><h1>Ticket fictício A</h1><div class="content-comment-interaction">Conversa A<br>Mensagem visível <span hidden>segredo oculto</span><blockquote>Histórico citado</blockquote></div><textarea>Antes SELECIONE depois</textarea>${extra}</section><section ticket-id="B"><h1>Outro ticket</h1><div class="content-comment-interaction">SEGREDO DO TICKET B</div></section>`);
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 400, height: 200 });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  dom.document.execCommand = () => false;
  return { dom, editor: dom.document.querySelector('textarea') };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('complete summary context includes more than twenty loaded messages and reports truncation', () => {
  const { dom, editor } = fixture(Array.from({ length: 25 }, (_, i) => `<div class="content-comment-interaction">Mensagem carregada ${i + 1}</div>`).join(''));
  try {
    let result = collectAiTicketContext(editor);
    assert.equal(result.messageCount, 26);
    assert.ok(result.context.includes('Conversa A'));
    assert.ok(result.latestContext.includes('Mensagem carregada 25'));
    assert.ok(!result.latestContext.includes('Conversa A'));
    assert.equal(result.truncated, false);
    dom.document.querySelector('.content-comment-interaction').append('x'.repeat(60_000));
    result = collectAiTicketContext(editor);
    assert.equal(result.truncated, true);
    assert.ok(result.context.length <= 50_000);
    assert.match(result.coverage, /limite de 50.000/);
    assert.ok(result.context.includes('Mensagem carregada 25'));
  } finally { dom.restore(); }
});

test('ticket chat isolates latest summary, full summary and follow-up history without changing the draft', async () => {
  const { dom, editor } = fixture('<div class="content-comment-interaction">Última resposta: aguardando confirmação.</div>');
  const calls = [];
  const send = async (action, data) => {
    if (action === 'AI_MODELS') return { models: [{ slug: 'fake', name: 'Fictício' }] };
    calls.push({ action, data }); return { text: `<script>texto seguro</script> Resposta ${calls.length}` };
  };
  try {
    await openAiComposer(editor, () => true, send, async () => []);
    const dialog = dom.document.querySelector('.octa-ai-dialog');
    dialog.querySelector('.ai-summary-latest').click(); await settle();
    assert.equal(calls[0].data.input.task, 'summary_latest');
    assert.ok(!calls[0].data.input.context.includes('Conversa A'));
    assert.ok(calls[0].data.input.context.includes('Última resposta'));
    assert.equal(dialog.querySelectorAll('script').length, 0);
    dialog.querySelector('.ai-summary-full').click(); await settle();
    assert.equal(calls[1].data.input.task, 'summary_full');
    assert.ok(calls[1].data.input.context.includes('Conversa A'));
    assert.deepEqual(calls[1].data.input.history, []);
    const question = dialog.querySelector('.ai-question'); question.value = 'O que falta?';
    dialog.querySelector('.ai-chat-ask').click(); await settle();
    assert.equal(calls[2].data.input.task, 'chat');
    assert.equal(calls[2].data.input.history.length, 4);
    assert.equal(calls[2].data.input.history[3].role, 'assistant');
    assert.equal(editor.value, 'Antes SELECIONE depois');
    assert.equal(dialog.querySelector('.ai-insert').disabled, true);
    dialog.querySelector('.ai-chat-turn[data-role="assistant"] button').click();
    assert.match(dialog.querySelector('.ai-preview').value, /Resposta 1/);
    assert.equal(editor.value, 'Antes SELECIONE depois');
    dialog.querySelector('.ai-chat-clear').click();
    question.value = 'Nova pergunta'; dialog.querySelector('.ai-chat-ask').click(); await settle();
    assert.deepEqual(calls[3].data.input.history, []);
  } finally { dom.restore(); }
});

test('chat cancellation and context changes discard late answers and never reuse another ticket', async () => {
  for (const change of ['context', 'ticket', 'cancel']) {
    const { dom, editor } = fixture(); let finish; const actions = [];
    const send = async action => {
      actions.push(action);
      if (action === 'AI_MODELS') return { models: [{ slug: 'fake', name: 'Fictício' }] };
      if (action === 'AI_GENERATE') return new Promise(resolve => { finish = resolve; });
      return {};
    };
    try {
      await openAiComposer(editor, () => true, send, async () => []);
      const dialog = dom.document.querySelector('.octa-ai-dialog');
      dialog.querySelector('.ai-summary-full').click();
      if (change === 'context') dialog.querySelector('.ai-context').dispatchEvent(new dom.window.Event('input'));
      if (change === 'ticket') editor.closest('section').setAttribute('ticket-id', 'C');
      if (change === 'cancel') dialog.querySelector('.ai-chat-stop').click();
      finish({ text: 'RESPOSTA OBSOLETA' }); await settle();
      assert.ok(!dialog.querySelector('.ai-chat-history').textContent.includes('RESPOSTA OBSOLETA'));
      assert.equal(editor.value, 'Antes SELECIONE depois');
      if (change === 'ticket') assert.match(dialog.querySelector('.ai-chat-status').textContent, /mudou/);
      else assert.ok(actions.includes('AI_CANCEL'));
    } finally { dom.restore(); }
  }
});

test('AI context stays inside one ticket and excludes hidden text and quoted emails', () => {
  const { dom, editor } = fixture();
  try {
    const context = readAiTicketContext(editor);
    assert.ok(context.includes('Conversa A'));
    for (const forbidden of ['SEGREDO DO TICKET B', 'segredo oculto', 'Histórico citado']) assert.ok(!context.includes(forbidden));
  } finally { dom.restore(); }
});

test('AI insertion replaces only the original selection and preserves native rich-text mentions', () => {
  const { dom, editor } = fixture('<div class="note-editable" contenteditable="true"><p><person personid="fake-id" class="mentioned">@Técnico Fictício</person> texto</p></div>');
  try {
    editor.setSelectionRange(6, 15);
    captureAiEditor(editor, () => true).insert('Resposta');
    assert.equal(editor.value, 'Antes Resposta depois');
    const rich = dom.document.querySelector('.note-editable');
    captureAiEditor(rich, () => true).insert(' nova resposta');
    assert.equal(rich.querySelector('person').getAttribute('personid'), 'fake-id');
    assert.ok(rich.textContent.includes('nova resposta'));
  } finally { dom.restore(); }
});

test('changed draft, changed ticket identity or lost context rejects insertion', () => {
  for (const change of ['draft', 'ticket', 'context']) {
    const { dom, editor } = fixture(); let current = true;
    try {
      const snapshot = captureAiEditor(editor, () => current);
      if (change === 'draft') editor.value = 'Novo rascunho';
      if (change === 'ticket') editor.closest('section').setAttribute('ticket-id', 'C');
      if (change === 'context') current = false;
      const before = editor.value;
      assert.throws(() => snapshot.insert('não inserir'), /mudou/);
      assert.equal(editor.value, before);
    } finally { dom.restore(); }
  }
});

test('composer generates only on click, previews first and inserts only after explicit review', async () => {
  const { dom, editor } = fixture(); const calls = [];
  editor.setSelectionRange(6, 15);
  const send = async (action, data) => { calls.push({ action, data }); return action === 'AI_MODELS' ? { models: [{ slug: 'fake', name: 'Fictício' }] } : { text: 'Resposta revisável' }; };
  try {
    await openAiComposer(editor, () => true, send, async () => [{ id: 'saved', title: '<script>Exemplo</script>', content: 'Somente estilo' }]);
    assert.equal(calls.filter(item => item.action === 'AI_GENERATE').length, 0);
    const dialog = dom.document.querySelector('.octa-ai-dialog');
    assert.equal(dialog.querySelectorAll('script').length, 0);
    dialog.querySelector('.ai-instruction').value = 'Confirme o recebimento.';
    dialog.querySelector('.ai-examples input').click();
    dialog.querySelector('.ai-generate').click(); await settle();
    assert.equal(editor.value, 'Antes SELECIONE depois');
    assert.deepEqual(calls.find(item => item.action === 'AI_GENERATE').data.input.examples, ['Somente estilo']);
    const preview = dialog.querySelector('.ai-preview'); preview.value = 'Resposta revisada pelo atendente';
    dialog.querySelector('.ai-insert').click();
    assert.equal(editor.value, 'Antes Resposta revisada pelo atendente depois');
    assert.equal(dom.document.querySelector('.octa-ai-dialog'), null);
  } finally { dom.restore(); }
});

test('changing the draft during generation discards the suggestion, and cancellation signals its owner', async () => {
  for (const cancel of [false, true]) {
    const { dom, editor } = fixture(); let finish; const actions = [];
    const send = async action => { actions.push(action); if (action === 'AI_MODELS') return { models: [{ slug: 'fake', name: 'Fictício' }] }; if (action === 'AI_GENERATE') return new Promise(resolve => { finish = resolve; }); return {}; };
    try {
      await openAiComposer(editor, () => true, send, async () => []);
      const dialog = dom.document.querySelector('.octa-ai-dialog'); dialog.querySelector('.ai-instruction').value = 'Responder'; dialog.querySelector('.ai-generate').click();
      if (cancel) dialog.querySelector('.ai-cancel').click(); else editor.value = 'Editado durante a espera';
      finish({ text: 'Não inserir' }); await settle();
      assert.ok(!editor.value.includes('Não inserir'));
      if (cancel) assert.ok(actions.includes('AI_CANCEL'));
      else { assert.equal(dialog.querySelector('.ai-insert').disabled, true); assert.match(dialog.querySelector('.ai-status').textContent, /mudou/); }
    } finally { dom.restore(); }
  }
});
