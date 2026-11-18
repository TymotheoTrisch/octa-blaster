import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers.mjs';
import { automateLicenseMentions, insertMentionForTarget } from '../utils/mentionHelper.ts';

const tymotheo = { id: 'tymotheo', name: 'Tymotheo Oliveira', query: '@tymotheo', pattern: 'Tymotheo\\s+Oliveira', enabled: true };
const ana = { id: 'ana', name: 'Ana Souza', query: '@ana', pattern: 'Ana\\s+Souza', enabled: true };

function installEditor() {
  const dom = installDom('<section ticket-id="A"><button role="tab" aria-selected="true" aria-controls="internal">Anotação interna</button><div id="internal"><div class="note-editable" contenteditable="true" tabindex="0"></div><div class="note-children-container"></div></div></section>');
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 300, height: 100 });
  dom.document.execCommand = () => false;
  return { dom, editor: dom.document.querySelector('.note-editable'), menu: dom.document.querySelector('.note-children-container') };
}

function addMarker(editor, target) {
  const doc = editor.ownerDocument;
  const marker = doc.createElement('span');
  marker.contentEditable = 'false';
  marker.dataset.mentionId = target.id;
  marker.textContent = `@${target.name}`;
  editor.replaceChildren(...editor.querySelectorAll('[data-mention-id]'), marker, doc.createTextNode(' '));
  const range = doc.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  doc.getSelection().removeAllRanges();
  doc.getSelection().addRange(range);
}

test('slow suggestions and marker rendering are confirmed before starting the next technician', async () => {
  const { dom, editor, menu } = installEditor();
  const timers = [];
  let firstScheduled = false;
  let secondScheduled = false;
  let firstMarkedAt = 0;
  let secondSearchAt = 0;
  const selected = [];
  function suggestion(target, delay) {
    const item = dom.document.createElement('button');
    item.className = 'person-item';
    item.textContent = target.name;
    item.addEventListener('click', () => {
      selected.push(target.id);
      menu.replaceChildren();
      timers.push(setTimeout(() => {
        addMarker(editor, target);
        if (target.id === tymotheo.id) firstMarkedAt = Date.now();
      }, delay));
    });
    menu.append(item);
  }
  editor.addEventListener('input', () => {
    if (editor.textContent.includes('@tymotheo') && !firstScheduled) {
      firstScheduled = true;
      timers.push(setTimeout(() => suggestion(tymotheo, 500), 3100));
    }
    if (editor.textContent.includes('@ana') && !secondScheduled) {
      secondScheduled = true;
      secondSearchAt = Date.now();
      suggestion(ana, 50);
    }
  });
  try {
    const result = await automateLicenseMentions(editor, dom.document, editor.closest('section'), [tymotheo, ana]);
    assert.equal(result.success, true, result.message);
    assert.deepEqual(selected, ['tymotheo', 'ana']);
    assert.ok(firstMarkedAt > 0);
    assert.ok(secondSearchAt >= firstMarkedAt);
    assert.equal(editor.querySelectorAll('[data-mention-id]').length, 2);
  } finally { timers.forEach(clearTimeout); dom.restore(); }
});

test('clicking a suggestion alone does not confirm a mention and a context change cancels the wait', async () => {
  const { dom, editor, menu } = installEditor();
  let current = true;
  let clicked = false;
  let timer;
  editor.addEventListener('input', () => {
    if (!editor.textContent.includes('@tymotheo') || menu.childElementCount) return;
    const item = dom.document.createElement('button');
    item.className = 'person-item';
    item.textContent = tymotheo.name;
    item.addEventListener('click', () => {
      clicked = true;
      menu.replaceChildren();
      timer = setTimeout(() => { current = false; }, 150);
    });
    menu.append(item);
  });
  try {
    const result = await insertMentionForTarget(editor, dom.document, tymotheo, true, () => current);
    assert.equal(clicked, true);
    assert.equal(result, false);
    assert.equal(editor.querySelector('[data-mention-id]'), null);
    assert.equal(editor.textContent, '@tymotheo');
  } finally { clearTimeout(timer); dom.restore(); }
});

test('retrying an already confirmed technician preserves its marker without typing another query', async () => {
  const { dom, editor } = installEditor();
  let inputs = 0;
  addMarker(editor, tymotheo);
  const before = editor.innerHTML;
  editor.addEventListener('input', () => { inputs++; });
  try {
    assert.equal(await insertMentionForTarget(editor, dom.document, tymotheo, true), true);
    assert.equal(inputs, 0);
    assert.equal(editor.innerHTML, before);
  } finally { dom.restore(); }
});
