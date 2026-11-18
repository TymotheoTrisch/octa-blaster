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
  return marker;
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
      const marker = addMarker(editor, target);
      marker.hidden = true;
      timers.push(setTimeout(() => {
        marker.hidden = false;
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

test('a marker with custom classes selected on mousedown is confirmed without a duplicate click', async () => {
  const { dom, editor, menu } = installEditor();
  const target = { id: 'jorge', name: 'Jorge Tigre', query: '@Jorge', pattern: 'Jorge\\s+Tigre', enabled: true };
  let duplicateClicks = 0;
  let inputs = 0;
  function mark() {
    const marker = dom.document.createElement('span');
    marker.className = 'octadesk-person-token-v2';
    marker.style.cssText = 'background:#ffda40;border-radius:12px;padding:4px';
    marker.textContent = '@Jorge Tigre';
    editor.replaceChildren(marker, dom.document.createTextNode(' '));
  }
  editor.addEventListener('input', () => {
    inputs++;
    if (!editor.textContent.includes('@Jorge') || menu.childElementCount) return;
    const person = dom.document.createElement('button');
    person.className = 'person-item';
    person.textContent = target.name;
    person.addEventListener('mousedown', mark);
    person.addEventListener('click', () => { duplicateClicks++; mark(); });
    menu.append(person);
  });
  try {
    assert.equal(await insertMentionForTarget(editor, dom.document, target, true), true);
    assert.equal(duplicateClicks, 0);
    assert.equal(editor.querySelectorAll('.octadesk-person-token-v2').length, 1);
    const before = inputs;
    assert.equal(await insertMentionForTarget(editor, dom.document, target, true), true);
    assert.equal(inputs, before);
    assert.equal(duplicateClicks, 0);
  } finally { dom.restore(); }
});

test('a selected name rendered beside a nested editable is recognized in its own note editor', async () => {
  const { dom, editor, menu } = installEditor();
  const wrapper = dom.document.createElement('div');
  wrapper.className = 'note-editor';
  editor.before(wrapper);
  wrapper.append(editor);
  editor.addEventListener('input', () => {
    if (!editor.textContent.includes('@tymotheo') || menu.childElementCount) return;
    const person = dom.document.createElement('button');
    person.className = 'person-item';
    person.textContent = tymotheo.name;
    person.addEventListener('click', () => {
      const marker = dom.document.createElement('span');
      marker.textContent = '@Tymotheo Oliveira';
      wrapper.append(marker);
      editor.textContent = '';
      menu.replaceChildren();
    });
    menu.append(person);
  });
  try {
    assert.equal(await insertMentionForTarget(editor, dom.document, tymotheo, true), true);
    assert.equal(editor.textContent.trim(), '');
    assert.equal(wrapper.querySelector('span').textContent, '@Tymotheo Oliveira');
  } finally { dom.restore(); }
});

test('a plain full-name search is not a confirmed selection before the suggestion changes the editor', async () => {
  const { dom, editor, menu } = installEditor();
  let current = true;
  let clicked = false;
  let timer;
  editor.addEventListener('input', () => {
    if (!editor.textContent.includes('@Tymotheo Oliveira') || menu.childElementCount) return;
    const person = dom.document.createElement('button');
    person.className = 'person-item';
    person.textContent = tymotheo.name;
    person.addEventListener('click', () => {
      clicked = true;
      menu.replaceChildren();
      timer = setTimeout(() => { current = false; }, 150);
    });
    menu.append(person);
  });
  try {
    const result = await insertMentionForTarget(editor, dom.document, { ...tymotheo, query: '@Tymotheo Oliveira' }, true, () => current);
    assert.equal(clicked, true);
    assert.equal(result, false);
  } finally { clearTimeout(timer); dom.restore(); }
});

for (const pattern of ['Jorge\\s+Tigre', '^Jorge\\s+Tigre$']) {
  test(`the native personid markup is already confirmed without requiring a marker box (${pattern})`, async () => {
    const { dom, editor } = installEditor();
    editor.innerHTML = '<p><span><span>&nbsp;</span><person personid="11111111-1111-4111-8111-111111111111" class="mentioned">@Jorge Tigre</person><span>&nbsp;</span></span></p>';
    editor.querySelector('person').getBoundingClientRect = () => ({ width: 0, height: 0 });
    const before = editor.innerHTML;
    let current = true;
    let inputs = 0;
    editor.addEventListener('input', () => { inputs++; current = false; });
    try {
      const result = await insertMentionForTarget(editor, dom.document, { id: 'jorge', name: 'Jorge Tigre', query: '@Jorge', pattern, enabled: true }, true, () => current);
      assert.equal(result, true);
      assert.equal(inputs, 0);
      assert.equal(editor.innerHTML, before);
    } finally { dom.restore(); }
  });
}

test('native mentions wait for personid and insert the next technician in the same paragraph', async () => {
  const { dom, editor, menu } = installEditor();
  const timers = [];
  let firstIdAt = 0;
  let secondSearchAt = 0;
  let secondSearchSharesParagraph = false;
  const selected = [];
  editor.addEventListener('input', () => {
    const target = [tymotheo, ana].find(item => editor.textContent.includes(item.query) && !selected.includes(item.id));
    if (!target || menu.childElementCount) return;
    if (target.id === 'ana') {
      secondSearchAt = Date.now();
      const anchor = dom.document.getSelection().anchorNode;
      const element = anchor?.nodeType === 1 ? anchor : anchor?.parentElement;
      secondSearchSharesParagraph = !!element?.closest('p') && element.closest('p') === editor.querySelector('person')?.closest('p');
    }
    const option = dom.document.createElement('button');
    option.className = 'person-item';
    option.textContent = target.name;
    option.addEventListener('click', () => {
      selected.push(target.id);
      menu.replaceChildren();
      const person = dom.document.createElement('person');
      person.className = 'mentioned';
      person.setAttribute('personid', '');
      person.textContent = `@${target.name}`;
      const paragraph = dom.document.createElement('p');
      const wrapper = dom.document.createElement('span');
      wrapper.append(...editor.querySelectorAll('person'), person);
      paragraph.append(wrapper);
      editor.replaceChildren(paragraph);
      timers.push(setTimeout(() => {
        person.setAttribute('personid', `${target.id}-person-id`);
        if (target.id === 'tymotheo') firstIdAt = Date.now();
      }, 250));
    });
    menu.append(option);
  });
  try {
    const result = await automateLicenseMentions(editor, dom.document, editor.closest('section'), [tymotheo, ana]);
    assert.equal(result.success, true, result.message);
    assert.deepEqual(selected, ['tymotheo', 'ana']);
    assert.ok(firstIdAt > 0);
    assert.ok(secondSearchAt >= firstIdAt);
    assert.equal(secondSearchSharesParagraph, true, 'the next search must stay beside the first person inside its paragraph');
    assert.equal(editor.querySelectorAll('person[personid]:not([personid=""])').length, 2);
  } finally { timers.forEach(clearTimeout); dom.restore(); }
});

test('a person placeholder with no personid does not confirm a mention', async () => {
  const { dom, editor, menu } = installEditor();
  let current = true;
  let timer;
  editor.addEventListener('input', () => {
    if (!editor.textContent.includes(tymotheo.query) || menu.childElementCount) return;
    const option = dom.document.createElement('button');
    option.className = 'person-item';
    option.textContent = tymotheo.name;
    option.addEventListener('click', () => {
      editor.innerHTML = '<person personid="" class="mentioned">@Tymotheo Oliveira</person>';
      menu.replaceChildren();
      timer = setTimeout(() => { current = false; }, 150);
    });
    menu.append(option);
  });
  try {
    assert.equal(await insertMentionForTarget(editor, dom.document, tymotheo, true, () => current), false);
  } finally { clearTimeout(timer); dom.restore(); }
});
