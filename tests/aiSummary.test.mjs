import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';
import { createSummaryLifecycle } from '../services/octadesk/aiSummaryLifecycle.ts';
import { collectAiTicketContext } from '../services/octadesk/aiTicketContext.ts';
import { createTicketChatStore } from '../services/storage/aiChatStorage.ts';
async function settle() {
  await new Promise(resolve => setTimeout(resolve, 20));
  for (let attempt = 0; attempt < 100; attempt++) {
    const dialog = globalThis.document?.querySelector('.octa-ticket-chat');
    if (!dialog?.querySelector('footer textarea')?.disabled || !/Carregando|Analisando/.test(dialog.querySelector('.octa-ticket-chat-status').textContent)) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
function installChatTransport() {
  const chats = createTicketChatStore();
  browser.runtime = { sendMessage: async message => { try { return { success: true, data: await chats.handle(message.action, message.key, message.revision, message.content) }; } catch (error) { return { success: false, error: error.message }; } } };
}
function fixture() {
  const storage = installStorage();
  installChatTransport();
  const dom = installDom(`<section ticket-id="A"><header class="ticket-header"><h1>Ticket fictício</h1></header><article class="interaction"><header class="interaction-header">Remetente fictício</header><div class="content-comment-interaction"><p>Mensagem original A</p><blockquote>Citação removida</blockquote></div></article><textarea>Rascunho preservado</textarea></section><section ticket-id="B"><h1>Outro ticket</h1><div class="content-comment-interaction"><p>SEGREDO B</p></div></section>`);
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 900, height: 250 });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  return { ...dom, data: storage.data, restore() { dom.restore(); storage.restore(); } };
}
test('summary controls appear on all tickets independently of license status and never duplicate', () => {
  const dom = fixture(), lifecycle = createSummaryLifecycle(dom.document);
  try {
    lifecycle.scan(); lifecycle.scan();
    assert.equal(dom.document.querySelectorAll('.octa-ticket-summary-button').length, 2);
    assert.equal(dom.document.querySelectorAll('.octa-summary-button').length, 4);
    assert.ok(dom.document.querySelector('.interaction-header .octa-summary-button'));
    assert.equal(dom.document.querySelectorAll('.octa-ai-dialog').length, 0);
  } finally { lifecycle.dispose(); dom.restore(); }
});
test('message summary floats outside the email and preserves its original DOM and editor', async () => {
  const dom = fixture(), calls = [];
  const lifecycle = createSummaryLifecycle(dom.document, async (action, data) => { calls.push({ action, data }); return { text: '<script>Resumo seguro</script>' }; });
  try {
    lifecycle.scan(); dom.document.querySelector('.interaction-header button').click(); await settle();
    assert.equal(calls[0].data.input.context, 'Mensagem original A');
    assert.equal(calls[0].data.input.task, 'summary_latest');
    const panel = dom.document.querySelector('.octa-message-summary');
    assert.ok(panel); assert.equal(panel.querySelectorAll('script').length, 0);
    assert.match(panel.textContent, /Resumo seguro/);
    assert.equal(panel.parentElement, dom.document.body);
    assert.equal(dom.document.querySelector('.content-comment-interaction').parentElement.className, 'interaction');
    assert.equal(dom.document.querySelector('.octa-summary-layout'), null);
    assert.equal(dom.document.querySelector('textarea').value, 'Rascunho preservado');
    assert.equal(dom.document.querySelectorAll('dialog').length, 0);
    panel.querySelector('button').click();
    assert.equal(dom.document.querySelector('.octa-summary-layout'), null);
    assert.equal(dom.document.querySelector('.content-comment-interaction').parentElement.className, 'interaction');
  } finally { lifecycle.dispose(); dom.restore(); }
});
test('ticket modal contains only conversation, generates an initial summary and continues with Enter', async () => {
  const dom = fixture(), calls = [];
  const lifecycle = createSummaryLifecycle(dom.document, async (action, data) => { calls.push({ action, data }); return { text: `Resposta ${calls.length}` }; });
  try {
    lifecycle.scan(); dom.document.querySelector('.octa-ticket-summary-button').click(); await settle();
    const dialog = dom.document.querySelector('.octa-ticket-chat');
    assert.equal(dialog.querySelectorAll('button').length, 2); // Fechar e copiar a resposta; nenhum menu de rascunho.
    assert.equal(calls[0].data.input.task, 'summary_full');
    assert.ok(!calls[0].data.input.context.includes('SEGREDO B'));
    const input = dialog.querySelector('textarea'); input.value = 'O que falta?';
    input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle();
    assert.equal(calls[1].data.input.task, 'chat'); assert.equal(calls[1].data.input.history.length, 2);
    assert.match(dialog.querySelector('[role="log"]').textContent, /O que falta/);
    assert.equal(dom.document.querySelector('section textarea').value, 'Rascunho preservado');
  } finally { lifecycle.dispose(); dom.restore(); }
});
test('closing a pending message summary cancels and discards its late result', async () => {
  const dom = fixture(); let finish; const actions = [];
  const lifecycle = createSummaryLifecycle(dom.document, async action => { actions.push(action); if (action === 'AI_GENERATE') return new Promise(resolve => { finish = resolve; }); return {}; });
  try {
    lifecycle.scan(); dom.document.querySelector('.interaction-header button').click();
    dom.document.querySelector('.octa-message-summary button').click(); finish({ text: 'OBSOLETO' }); await settle();
    assert.ok(actions.includes('AI_CANCEL')); assert.ok(!dom.document.body.textContent.includes('OBSOLETO'));
  } finally { lifecycle.dispose(); dom.restore(); }
});
test('changed ticket identity removes summaries, cancels chat and rejects stale content', async () => {
  const dom = fixture(); let finish; const actions = [];
  const lifecycle = createSummaryLifecycle(dom.document, async action => { actions.push(action); if (action === 'AI_GENERATE') return new Promise(resolve => { finish = resolve; }); return {}; });
  try {
    lifecycle.scan(); dom.document.querySelector('.octa-ticket-summary-button').click(); await settle();
    dom.document.querySelector('section').setAttribute('ticket-id', 'C'); lifecycle.scan();
    finish({ text: 'NÃO EXIBIR' }); await settle();
    assert.ok(actions.includes('AI_CANCEL')); assert.equal(dom.document.querySelector('.octa-ticket-chat'), null);
    assert.ok(!dom.document.body.textContent.includes('NÃO EXIBIR'));
  } finally { lifecycle.dispose(); dom.restore(); }
});
test('full context covers more than twenty messages and reports the 50000-character truncation', () => {
  const dom = fixture();
  try {
    const scope = dom.document.querySelector('section');
    for (let i = 0; i < 25; i++) { const body = dom.document.createElement('div'); body.className = 'content-comment-interaction'; body.textContent = `Mensagem ${i}`; scope.append(body); }
    let result = collectAiTicketContext(scope); assert.equal(result.messageCount, 26); assert.ok(result.context.includes('Mensagem original A')); assert.equal(result.truncated, false);
    scope.querySelector('.content-comment-interaction').append('x'.repeat(55_000)); result = collectAiTicketContext(scope);
    assert.equal(result.truncated, true); assert.ok(result.context.length <= 50_000); assert.match(result.coverage, /limite/);
  } finally { dom.restore(); }
});

test('supplied Angular form anchors ticket summary after the number and message summary before native actions without entering collapse', async () => {
  const storage = installStorage();
  installChatTransport();
  const dom = installDom(`<form class="edit-ticket" ticket="ticket"><header class="header header-info header-lg"><div class="col-sm-8 space-less"><div class="clearfix"><span class="label">Em andamento</span><span class="label label-md label-default ng-binding">123456<pop-over-copy></pop-over-copy></span><a class="native-link">Vinculados</a></div><div class="ticket-title clearfix"><h2>Solicitação fictícia</h2></div></div></header><div class="od-Ticket-history"><octa-ticket-interaction ticket-number="123456"><interaction-comment class="interaction-comment-item"><header><interaction-comment-header><div class="interaction-comment-header"><interaction-comment-header-information class="layout-flex-1"><span class="comment-title">Pessoa fictícia</span></interaction-comment-header-information><ul class="comment-actions"><li><a>Abrir</a></li></ul></div></interaction-comment-header></header><div class="comment collapse" style="height:200px;overflow:hidden"><div class="text"><interaction-comment-text><interaction-comment-text-common><div class="content-comment-interaction"><div class="ng-binding">Mensagem fictícia de suporte.</div></div></interaction-comment-text-common></interaction-comment-text></div><button type="button" class="btn-toggle-collapse">Expandir</button></div></interaction-comment></octa-ticket-interaction></div><textarea>Preservar</textarea></form>`);
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 1000, height: 200 });
  const lifecycle = createSummaryLifecycle(dom.document, async () => ({ text: 'Resumo fictício' })); let submits = 0;
  dom.document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); submits++; });
  try {
    lifecycle.scan();
    const number = dom.document.querySelector('.label-default');
    assert.equal(number.nextElementSibling.textContent, 'Resumir ticket');
    const header = dom.document.querySelector('.interaction-comment-header'), button = header.querySelector('.octa-summary-button');
    assert.equal(button.nextElementSibling.className, 'comment-actions');
    button.click(); await settle();
    const original = dom.document.querySelector('.comment');
    assert.equal(original.style.height, '200px');
    assert.equal(original.parentElement.tagName.toLowerCase(), 'interaction-comment');
    assert.equal(dom.document.querySelector('.octa-message-summary').style.height, '200px');
    assert.equal(dom.document.querySelector('.comment .octa-message-summary'), null);
    assert.equal(submits, 0);
    number.firstChild.textContent = '654321'; lifecycle.scan();
    assert.equal(dom.document.querySelector('.octa-message-summary'), null);
    assert.equal(dom.document.querySelector('textarea').value, 'Preservar');
  } finally { lifecycle.dispose(); dom.restore(); storage.restore(); }
});

test('ticket summary loads the Angular middle interactions before analysis', async () => {
  const dom = fixture(); const scope = dom.document.querySelector('section');
  const toggle = dom.document.createElement('div'); toggle.className = 'toggle-middle-interactions'; toggle.innerHTML = '<a ng-click="toggleMiddleInteractions()"><i class="icon-angle-double-down"></i>Todas as interações (1)</a>'; scope.append(toggle);
  toggle.querySelector('a').addEventListener('click', () => { const message = dom.document.createElement('div'); message.setAttribute('ng-if', 'showMiddleInteractions'); message.innerHTML = '<div class="content-comment-interaction">Mensagem intermediária fictícia</div>'; scope.append(message); });
  const calls = [], lifecycle = createSummaryLifecycle(dom.document, async (_action, data) => { calls.push(data); return { text: 'Resumo' }; });
  try {
    lifecycle.scan(); scope.querySelector('.octa-ticket-summary-button').click();
    await new Promise(resolve => setTimeout(resolve, 260));
    assert.equal(calls.length, 1); assert.match(calls[0].input.context, /Mensagem intermediária fictícia/);
  } finally { lifecycle.dispose(); dom.restore(); }
});

test('editing an earlier question regenerates from that point and excludes discarded answers from model history', async () => {
  const dom = fixture(), calls = [];
  const lifecycle = createSummaryLifecycle(dom.document, async (_action, data) => { calls.push(data); return { text: `Resposta ${calls.length}` }; });
  try {
    lifecycle.scan(); dom.document.querySelector('.octa-ticket-summary-button').click(); await settle();
    const dialog = dom.document.querySelector('.octa-ticket-chat'), input = dialog.querySelector('footer textarea');
    for (const question of ['Pergunta original', 'Pergunta seguinte']) { input.value = question; input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle(); }
    dialog.querySelector('[data-role="user"] .octa-chat-message-action').click();
    dialog.querySelector('.octa-chat-edit-input').value = 'Pergunta corrigida'; dialog.querySelector('.octa-chat-save-edit').click(); await settle();
    assert.equal(calls[3].input.instruction, 'Pergunta corrigida');
    assert.equal(calls[3].input.history.length, 2);
    assert.ok(!JSON.stringify(calls[3].input.history).includes('Pergunta original'));
    assert.ok(!dialog.querySelector('[role="log"]').textContent.includes('Pergunta seguinte'));
    assert.ok(dialog.querySelector('[role="log"]').textContent.includes('Pergunta corrigida'));
    assert.ok(dialog.querySelector('[role="log"]').textContent.includes('Resposta 4'));
    assert.equal(dom.document.querySelector('section textarea').value, 'Rascunho preservado');
  } finally { lifecycle.dispose(); dom.restore(); }
});

test('failed edit restores the previous conversation and keeps the corrected question for retry', async () => {
  const dom = fixture(); let fail = false;
  const lifecycle = createSummaryLifecycle(dom.document, async () => { if (fail) throw new Error('Falha fictícia'); return { text: 'Resposta anterior' }; });
  try {
    lifecycle.scan(); dom.document.querySelector('.octa-ticket-summary-button').click(); await settle();
    const dialog = dom.document.querySelector('.octa-ticket-chat'), input = dialog.querySelector('footer textarea');
    input.value = 'Pergunta anterior'; input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle();
    dialog.querySelector('[data-role="user"] button').click();
    dialog.querySelector('.octa-chat-edit-input').value = 'Correção a preservar'; fail = true;
    dialog.querySelector('.octa-chat-save-edit').click(); await settle();
    assert.equal(dialog.querySelector('.octa-chat-edit-input').value, 'Correção a preservar');
    assert.match(dialog.querySelector('[role="log"]').textContent, /Resposta anterior/);
    assert.match(dialog.querySelector('.octa-ticket-chat-status').textContent, /Falha fictícia/);
  } finally { lifecycle.dispose(); dom.restore(); }
});

test('a question after initial summary failure starts with empty history and preserves the draft', async () => {
  const dom = fixture(), calls = [];
  const lifecycle = createSummaryLifecycle(dom.document, async (_action, data) => { calls.push(data); if (calls.length === 1) throw new Error('Falha inicial'); return { text: 'Resposta da nova pergunta' }; });
  try {
    lifecycle.scan(); dom.document.querySelector('.octa-ticket-summary-button').click(); await settle();
    const dialog = dom.document.querySelector('.octa-ticket-chat'), input = dialog.querySelector('footer textarea');
    input.value = 'Qual é a pendência?'; input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle();
    assert.deepEqual(calls[1].input.history, []); assert.match(dialog.querySelector('[role="log"]').textContent, /Resposta da nova pergunta/);
    assert.equal(dom.document.querySelector('section textarea').value, 'Rascunho preservado');
  } finally { lifecycle.dispose(); dom.restore(); }
});

test('closing and reopening restores chat and unsent text without another summary or inference', async () => {
  const dom = fixture(), calls = [];
  const lifecycle = createSummaryLifecycle(dom.document, async (_action, data) => { calls.push(data); return { text: 'Resumo salvo' }; });
  try {
    lifecycle.scan(); const open = () => dom.document.querySelector('.octa-ticket-summary-button').click();
    open(); await settle();
    dom.document.querySelector('.octa-ticket-chat footer textarea').value = 'Pergunta ainda não enviada';
    dom.document.querySelector('.octa-ticket-chat header button').click(); open(); await settle();
    assert.equal(calls.length, 1); assert.match(dom.document.querySelector('[role="log"]').textContent, /Resumo salvo/);
    const input = dom.document.querySelector('.octa-ticket-chat footer textarea'); assert.equal(input.value, 'Pergunta ainda não enviada');
    input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle();
    assert.equal(calls.length, 2); assert.equal(calls[1].input.history.length, 2);
    assert.equal(Object.values(dom.data).filter(value => value?.version === 1 && value.messages).length, 1);
    assert.equal(localStorage.length, 0);
  } finally { lifecycle.dispose(); await settle(); dom.restore(); }
});

test('a recreated ticket DOM resumes storage but another ticket has its own chat', async () => {
  const dom = fixture(); let calls = 0, lifecycle = createSummaryLifecycle(dom.document, async () => ({ text: `Resumo ${++calls}` }));
  try {
    lifecycle.scan(); dom.document.querySelector('.octa-ticket-summary-button').click(); await settle();
    lifecycle.dispose(); await settle(); const scope = dom.document.querySelector('section'); scope.replaceWith(scope.cloneNode(true));
    installChatTransport(); // Simula recriação da fila/background mantendo o storage persistente.
    lifecycle = createSummaryLifecycle(dom.document, async () => ({ text: `Resumo ${++calls}` })); lifecycle.scan();
    dom.document.querySelector('.octa-ticket-summary-button').click(); await settle(); assert.equal(calls, 1);
    dom.document.querySelector('.octa-ticket-chat header button').click();
    dom.document.querySelector('[ticket-id="B"] .octa-ticket-summary-button').click(); await settle();
    assert.equal(calls, 2); assert.ok(!dom.document.querySelector('[role="log"]').textContent.includes('Resumo 1'));
  } finally { lifecycle.dispose(); await settle(); dom.restore(); }
});

test('new email content preserves saved chat and uses fresh context on the next question', async () => {
  const dom = fixture(), calls = [], lifecycle = createSummaryLifecycle(dom.document, async (_action, data) => { calls.push(data); return { text: 'Conversa original' }; });
  try {
    lifecycle.scan(); const open = () => dom.document.querySelector('.octa-ticket-summary-button').click(); open(); await settle();
    dom.document.querySelector('.octa-ticket-chat header button').click(); await settle();
    dom.document.querySelector('.content-comment-interaction').append(' Nova informação do cliente.'); open(); await settle();
    assert.equal(calls.length, 1); assert.match(dom.document.querySelector('.octa-ticket-chat-status').textContent, /mudaram/);
    const input = dom.document.querySelector('.octa-ticket-chat footer textarea'); input.value = 'E agora?'; input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle();
    assert.match(calls[1].input.context, /Nova informação do cliente/); assert.equal(calls[1].input.history.length, 2);
  } finally { lifecycle.dispose(); await settle(); dom.restore(); }
});

test('closing an in-flight question saves its text but never appends the cancelled late answer', async () => {
  const dom = fixture(); let finish; const calls = [];
  const lifecycle = createSummaryLifecycle(dom.document, async (action, data) => { if (action === 'AI_CANCEL') return {}; calls.push(data); if (calls.length === 2) return new Promise(resolve => { finish = resolve; }); return { text: 'Resumo válido' }; });
  try {
    lifecycle.scan(); const open = () => dom.document.querySelector('.octa-ticket-summary-button').click(); open(); await settle();
    const input = dom.document.querySelector('.octa-ticket-chat footer textarea'); input.value = 'Pergunta em andamento'; input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle();
    dom.document.querySelector('.octa-ticket-chat header button').click(); finish({ text: 'Resposta cancelada' }); open(); await settle();
    assert.equal(calls.length, 2); assert.equal(dom.document.querySelector('.octa-ticket-chat footer textarea').value, 'Pergunta em andamento');
    assert.ok(!dom.document.querySelector('[role="log"]').textContent.includes('Resposta cancelada'));
  } finally { lifecycle.dispose(); await settle(); dom.restore(); }
});
