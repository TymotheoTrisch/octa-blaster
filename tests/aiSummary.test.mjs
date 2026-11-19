import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';
import { createSummaryLifecycle } from '../services/octadesk/aiSummaryLifecycle.ts';
import { collectAiTicketContext } from '../services/octadesk/aiTicketContext.ts';
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const storage = installStorage();
  const dom = installDom(`<section ticket-id="A"><header class="ticket-header"><h1>Ticket fictício</h1></header><article class="interaction"><header class="interaction-header">Remetente fictício</header><div class="content-comment-interaction"><p>Mensagem original A</p><blockquote>Citação removida</blockquote></div></article><textarea>Rascunho preservado</textarea></section><section ticket-id="B"><h1>Outro ticket</h1><div class="content-comment-interaction"><p>SEGREDO B</p></div></section>`);
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 900, height: 250 });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  return { ...dom, restore() { dom.restore(); storage.restore(); } };
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
test('message summary uses only that email, renders text safely in a reserved scrollable column and preserves the editor', async () => {
  const dom = fixture(), calls = [];
  const lifecycle = createSummaryLifecycle(dom.document, async (action, data) => { calls.push({ action, data }); return { text: '<script>Resumo seguro</script>' }; });
  try {
    lifecycle.scan(); dom.document.querySelector('.interaction-header button').click(); await settle();
    assert.equal(calls[0].data.input.context, 'Mensagem original A');
    assert.equal(calls[0].data.input.task, 'summary_latest');
    const panel = dom.document.querySelector('.octa-message-summary');
    assert.ok(panel); assert.equal(panel.querySelectorAll('script').length, 0);
    assert.match(panel.textContent, /Resumo seguro/);
    assert.equal(panel.parentElement.className, 'octa-summary-layout');
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
    assert.equal(dialog.querySelectorAll('button').length, 1); // Somente fechar; nenhum menu ou ação de rascunho.
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
    const layout = dom.document.querySelector('.octa-summary-layout');
    assert.equal(layout.querySelector(':scope > .comment').style.height, '200px');
    assert.equal(layout.querySelector(':scope > .octa-message-summary').style.height, '200px');
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
