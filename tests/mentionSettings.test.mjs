import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';
import { loadMentionTargets, saveMentionTargets, automateLicenseMentions } from '../utils/mentionHelper.ts';

const targets = [
  { id: 'ana', name: 'Ana Técnica', query: '@ana', pattern: 'ana\\s+t[eé]cnica', enabled: true },
  { id: 'disabled', name: 'Roberto Renck', query: '@roberto', pattern: 'roberto', enabled: false },
];

test('configured mention targets retain custom names, queries, and enabled flags', async () => {
  const storage = installStorage();
  try {
    await saveMentionTargets(targets);
    assert.deepEqual(await loadMentionTargets(), targets);
  } finally { storage.restore(); }
});

test('deleting every configured mention target persists an empty list', async () => {
  const storage = installStorage();
  try {
    await saveMentionTargets([]);
    assert.deepEqual(await loadMentionTargets(), []);
  } finally { storage.restore(); }
});

test('license automation uses the saved enabled targets and skips disabled targets', async () => {
  const dom = installDom(`<section ticket-id="A">
    <button role="tab" aria-selected="true" aria-controls="internal">Anotação interna</button>
    <div id="internal"><textarea class="note-editable"></textarea><div class="note-children-container"></div></div>
  </section>`);
  const storage = installStorage();
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 300, height: 100 });
  const selected = [];
  try {
    await saveMentionTargets(targets);
    const editor = dom.document.querySelector('textarea');
    const menu = dom.document.querySelector('.note-children-container');
    editor.addEventListener('input', () => {
      if (!editor.value.includes('@ana') || selected.length) return;
      menu.replaceChildren();
      const person = dom.document.createElement('button');
      person.className = 'person-item'; person.textContent = 'Ana Técnica';
      person.addEventListener('click', () => { selected.push(person.textContent); menu.replaceChildren(); });
      menu.append(person);
    });
    editor.focus();
    const result = await automateLicenseMentions(editor, dom.document, editor.closest('section'));
    assert.equal(result.success, true, result.message);
    assert.deepEqual(selected, ['Ana Técnica']);
    assert.ok(editor.value.includes('@ana'));
    assert.ok(!editor.value.includes('@roberto'));
  } finally { storage.restore(); dom.restore(); }
});
