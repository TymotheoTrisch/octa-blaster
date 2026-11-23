import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers.mjs';
import { createChatMessages } from '../services/octadesk/aiChatMessages.ts';
import { summaryPanelBounds, anchorSummaryPanel } from '../services/octadesk/aiSummaryPosition.ts';
import { copyAiText } from '../services/ai/clipboard.ts';
const settle = () => new Promise(resolve => setImmediate(resolve));

test('floating geometry stays in the viewport and expands with the email without a layout wrapper', () => {
  const anchor = { top: 500, bottom: 522, left: 500, right: 560, width: 60, height: 22 };
  const body = { top: 530, bottom: 730, left: 40, right: 840, width: 800, height: 200 };
  let rect = summaryPanelBounds(anchor, body, { width: 1000, height: 900 });
  assert.equal(rect.height, 200); assert.ok(rect.top + rect.height < anchor.top); assert.equal(rect.width, 520);
  rect = summaryPanelBounds(anchor, { ...body, height: 400 }, { width: 1000, height: 900 }); assert.equal(rect.height, 400);
  rect = summaryPanelBounds({ ...anchor, top: 0, bottom: 22 }, { ...body, width: 270, right: 310 }, { width: 340, height: 320 });
  assert.ok(rect.left >= 16 && rect.top >= 16); assert.ok(rect.left + rect.width <= 324); assert.ok(rect.top + rect.height <= 304);
  assert.ok(rect.left >= body.left + 16); assert.ok(rect.left + rect.width <= 310 - 16);
});

test('resize observer repositions a floating panel on expansion and cleanup restores listeners without touching the email', () => {
  const dom = installDom('<article><button>Resumir</button><div class="comment">E-mail original</div></article>');
  const win = dom.window, body = dom.document.querySelector('.comment'), anchor = dom.document.querySelector('button'), panel = dom.document.createElement('aside');
  let resize, frame, height = 200, disconnected = false;
  win.requestAnimationFrame = callback => { frame = callback; return 1; }; win.cancelAnimationFrame = () => {};
  win.ResizeObserver = class { constructor(callback) { resize = callback; } observe() {} disconnect() { disconnected = true; } };
  anchor.getBoundingClientRect = () => ({ top: 500, bottom: 522, left: 500, right: 560, width: 60, height: 22 });
  body.getBoundingClientRect = () => ({ top: 530, bottom: 530 + height, left: 40, right: 840, width: 800, height });
  const original = body.outerHTML, parent = body.parentElement;
  try {
    const dispose = anchorSummaryPanel(panel, anchor, body);
    assert.equal(panel.style.height, '200px'); height = 400; resize(); frame(); assert.equal(panel.style.height, '400px');
    assert.equal(body.outerHTML, original); assert.equal(body.parentElement, parent); dispose(); assert.equal(panel.isConnected, false); assert.equal(disconnected, true);
  } finally { dom.restore(); }
});

test('copy uses the complete assistant text, excludes controls and never parses generated HTML', async () => {
  const dom = installDom('<div role="log"></div>'); const copied = [];
  try {
    const log = dom.document.querySelector('[role="log"]');
    createChatMessages(log, () => {}, async text => { copied.push(text); }).render([{ role: 'assistant', content: '<script>texto seguro</script>\nResposta inteira.' }]);
    assert.equal(log.querySelector('script'), null); log.querySelector('button').click(); await settle();
    assert.deepEqual(copied, ['<script>texto seguro</script>\nResposta inteira.']); assert.match(log.textContent, /Copiado/);
  } finally { dom.restore(); }
});

test('clipboard fallback selects only a temporary field and preserves the draft', async () => {
  const dom = installDom('<dialog class="octa-ticket-chat"><textarea id="draft">Preservar rascunho</textarea></dialog>'); let value;
  try {
    dom.document.execCommand = command => { assert.equal(command, 'copy'); value = dom.document.querySelector('textarea[readonly]').value; return true; };
    await copyAiText('Texto completo a copiar', dom.document);
    assert.equal(value, 'Texto completo a copiar'); assert.equal(dom.document.querySelector('#draft').value, 'Preservar rascunho'); assert.equal(dom.document.querySelectorAll('textarea').length, 1);
  } finally { dom.restore(); }
});
