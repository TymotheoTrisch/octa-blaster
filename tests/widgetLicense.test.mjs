import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';

test('the license widget recognizes a heading outside its toolbar and exposes the internal-note failure', async () => {
  const dom = installDom(`<section class="ticket-view">
    <header><h1>Contratação LICENÇA FACIAL (135744)</h1></header>
    <div class="tab-pane"><div class="space-x-md" ticket="vm.ticket"></div><textarea>Rascunho público</textarea></div>
  </section>`);
  const storage = installStorage();
  const previousDefine = globalThis.defineContentScript;
  const previousTimeout = globalThis.setTimeout;
  const timers = [];
  const observers = [];
  globalThis.setTimeout = (callback, delay, ...args) => {
    const timer = previousTimeout(callback, delay, ...args);
    timers.push(timer);
    return timer;
  };
  const TrackingObserver = class extends dom.window.MutationObserver {
    constructor(callback) { super(callback); observers.push(this); }
  };
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: TrackingObserver });
  globalThis.defineContentScript = definition => definition;
  globalThis.browser.runtime = {
    id: 'test-extension', onMessage: { addListener() {} }, async sendMessage() {},
  };
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 500, height: 100 });
  Object.defineProperty(dom.document, 'readyState', { value: 'complete' });
  let confirmations = 0;
  dom.window.confirm = () => { confirmations++; return true; };
  try {
    const { default: content } = await import('../entrypoints/content.ts');
    content.main();
    await new Promise(resolve => setTimeout(resolve, 1300));
    const button = dom.document.querySelector('.octa-btn-license');
    assert.ok(button, 'the normal content entrypoint must mount its license button');
    button.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(confirmations, 0, 'the license title must prevent the non-license confirmation');
    assert.equal(dom.document.querySelector('textarea').value, 'Rascunho público');
    const feedback = dom.document.querySelector('.octa-license-feedback');
    assert.ok(feedback);
    assert.equal(feedback.hidden, false);
    assert.match(feedback.textContent, /Não foi possível abrir a Anotação Interna deste ticket/i);
  } finally {
    observers.forEach(observer => observer.disconnect());
    timers.forEach(timer => clearTimeout(timer));
    globalThis.setTimeout = previousTimeout;
    if (previousDefine === undefined) delete globalThis.defineContentScript;
    else globalThis.defineContentScript = previousDefine;
    storage.restore();
    dom.restore();
  }
});
