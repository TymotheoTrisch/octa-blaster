import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';
import { loadMentionTargets, saveMentionTargets, resetMentionTargets, automateLicenseMentions } from '../services/octadesk/mentionHelper.ts';

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

test('a newly configured technician matches suggestions with accent differences', async () => {
  const dom = installDom('<section ticket-id="A"><button role="tab" aria-selected="true" aria-controls="internal">Anotação interna</button><div id="internal"><textarea class="note-editable"></textarea><div class="note-children-container"></div></div></section>');
  const storage = installStorage();
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 300, height: 100 });
  let selected = false;
  try {
    await saveMentionTargets([{ id: 'new', name: 'Tymotheo Trisch', query: '@tymotheo', pattern: '', enabled: true }]);
    const editor = dom.document.querySelector('textarea');
    const menu = dom.document.querySelector('.note-children-container');
    editor.addEventListener('input', () => {
      if (!editor.value.includes('@tymotheo') || selected || menu.childElementCount) return;
      const person = dom.document.createElement('button');
      person.className = 'person-item';
      person.textContent = 'Tymótheo Trisch';
      person.addEventListener('click', () => { selected = true; editor.value = '@' + person.textContent; menu.replaceChildren(); });
      menu.append(person);
    });
    const result = await automateLicenseMentions(editor, dom.document, editor.closest('section'));
    assert.equal(result.success, true, result.message);
    assert.equal(selected, true);
  } finally { storage.restore(); dom.restore(); }
});

test('a failed technician suggestion reports its configured name and query', async () => {
  const dom = installDom('<section ticket-id="A"><button role="tab" aria-selected="true" aria-controls="internal">Anotação interna</button><div id="internal"><textarea class="note-editable"></textarea></div></section>');
  const storage = installStorage();
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 300, height: 100 });
  try {
    await saveMentionTargets([{ id: 'missing', name: 'Tymotheo Trisch', query: '@tymotheo', pattern: '', enabled: true }]);
    const editor = dom.document.querySelector('textarea');
    const result = await automateLicenseMentions(editor, dom.document, editor.closest('section'));
    assert.equal(result.success, false);
    assert.ok(result.message.includes('Tymotheo Trisch'));
    assert.ok(result.message.includes('@tymotheo'));
    assert.equal(editor.value, '@tymotheo');
  } finally { storage.restore(); dom.restore(); }
});

test('a new technician opens the mention picker with @ before updating its search', async () => {
  const dom = installDom('<section ticket-id="A"><button role="tab" aria-selected="true" aria-controls="internal">Anotação interna</button><div id="internal"><textarea class="note-editable"></textarea><div class="note-children-container"></div></div></section>');
  const storage = installStorage();
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 300, height: 100 });
  let pickerStarted = false;
  let selected = false;
  try {
    await saveMentionTargets([{ id: 'tymotheo', name: 'Tymotheo Oliveira', query: '@tymotheo', pattern: '', enabled: true }]);
    const editor = dom.document.querySelector('textarea');
    const menu = dom.document.querySelector('.note-children-container');
    editor.addEventListener('keydown', event => {
      if (event.key === '@' && editor.value === '') pickerStarted = true;
    });
    editor.addEventListener('input', () => {
      if (!pickerStarted || editor.value !== '@tymotheo' || menu.childElementCount) return;
      const person = dom.document.createElement('button');
      person.className = 'person-item';
      person.textContent = 'Tymotheo Oliveira';
      person.addEventListener('click', () => { selected = true; editor.value = '@' + person.textContent; menu.replaceChildren(); });
      menu.append(person);
    });
    const result = await automateLicenseMentions(editor, dom.document, editor.closest('section'));
    assert.equal(result.success, true, result.message);
    assert.equal(selected, true);
    assert.equal(editor.value.trim(), '@Tymotheo Oliveira');
  } finally { storage.restore(); dom.restore(); }
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
      person.addEventListener('click', () => { selected.push(person.textContent); editor.value = '@' + person.textContent; menu.replaceChildren(); });
      menu.append(person);
    });
    editor.focus();
    const result = await automateLicenseMentions(editor, dom.document, editor.closest('section'));
    assert.equal(result.success, true, result.message);
    assert.deepEqual(selected, ['Ana Técnica']);
    assert.ok(editor.value.includes('@Ana Técnica'));
    assert.ok(!editor.value.includes('@roberto'));
  } finally { storage.restore(); dom.restore(); }
});

test('resetMentionTargets restores default technicians cleanly', async () => {
  const storage = installStorage();
  try {
    await saveMentionTargets([]);
    assert.deepEqual(await loadMentionTargets(), []);
    const restored = await resetMentionTargets([]);
    assert.equal(restored.length, 2);
    assert.equal(restored[0].id, 'jorge_tigre');
    assert.equal(restored[1].id, 'roberto_renck');
  } finally { storage.restore(); }
});

test('reordering mention targets with base persists the new order', async () => {
  const storage = installStorage();
  try {
    const initial = await loadMentionTargets();
    const reordered = [initial[1], initial[0]];
    const saved = await saveMentionTargets(reordered, initial);
    assert.deepEqual(saved.map(t => t.id), ['roberto_renck', 'jorge_tigre']);
    assert.deepEqual((await loadMentionTargets()).map(t => t.id), ['roberto_renck', 'jorge_tigre']);
  } finally { storage.restore(); }
});
