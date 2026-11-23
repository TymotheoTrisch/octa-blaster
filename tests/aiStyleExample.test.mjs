import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';
import { attachStyleExample, redactStyleExample } from '../services/octadesk/aiStyleExample.ts';
const settle = () => new Promise(resolve => setImmediate(resolve));

test('style extraction redacts common identifiers, requires exact configured authorship and saves only reviewed text', async () => {
  const storage = installStorage(), dom = installDom('<section ticket-id="A"><header><span class="comment-title">Pessoa T. (Agente) | Resposta</span></header><div class="content-comment-interaction">Olá! Envie para cliente@example.invalid. CNPJ 12.345.678/0001-90. <blockquote>Não guardar esta citação</blockquote></div></section>'); const calls = [];
  browser.runtime = { sendMessage: async message => { calls.push(message); return { success: true, data: message.action === 'AI_PROFILE' ? { name: 'Pessoa Teste', aliases: ['Pessoa T.'] } : { saved: true } }; } };
  const dispose = attachStyleExample(dom.document.querySelector('.content-comment-interaction'), dom.document.querySelector('header'));
  try {
    dom.document.querySelector('.octa-style-button').click(); await settle();
    const field = dom.document.querySelector('.octa-style-editor textarea'); assert.ok(!field.value.includes('@')); assert.ok(!field.value.includes('12.345')); assert.ok(!field.value.includes('citação'));
    field.value = 'Olá, agradeço o retorno. Vamos conferir os dados.';
    dom.document.querySelector('.octa-style-editor .octa-chat-save-edit').click(); await settle();
    assert.equal(calls[1].action, 'AI_STYLE_SAVE'); assert.equal(calls[1].text, field.value); assert.equal(calls[1].author, 'Pessoa T.'); assert.ok(!calls.some(call => call.action === 'AI_GENERATE'));
    assert.equal(localStorage.length, 0);
  } finally { dispose(); dom.restore(); storage.restore(); }
});

test('another agent cannot be saved as the active persona through the HTML control', async () => {
  const storage = installStorage(), dom = installDom('<header><span class="comment-title">Outro Agente (Agente)</span></header><div class="content-comment-interaction">Resposta alheia</div>');
  browser.runtime = { sendMessage: async () => ({ success: true, data: { name: 'Pessoa Teste', aliases: [] } }) };
  const dispose = attachStyleExample(dom.document.querySelector('.content-comment-interaction'), dom.document.querySelector('header'));
  try { dom.document.querySelector('button').click(); await settle(); assert.equal(dom.document.querySelector('.octa-chat-save-edit').disabled, true); assert.ok(redactStyleExample('https://example.invalid').includes('[link]')); }
  finally { dispose(); dom.restore(); storage.restore(); }
});
