import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers.mjs';
import { automateLicenseMentions, insertMentionForTarget } from '../services/octadesk/mentionHelper.ts';

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

test('popover with avatar and similar names selects exclusively the exact compound name', async () => {
  const { dom, editor, menu } = installEditor();
  const luizPulz = { id: 'luiz', name: 'Luiz Pulz', query: '@Luiz', pattern: '', enabled: true };
  const clicked = [];
  editor.addEventListener('input', () => {
    if (!editor.textContent.includes('@Luiz') || menu.childElementCount) return;
    for (const [initial, fullName] of [
      ['s', 'Luiz Eduardo'],
      ['s', 'Luiz Pulz'],
      ['m', 'Maria Luiza Fernandes'],
    ]) {
      const item = dom.document.createElement('div');
      item.className = 'person-item';
      item.innerHTML = `<span class="avatar">${initial}</span><span class="ng-binding">${fullName}</span>`;
      item.addEventListener('click', () => {
        clicked.push(fullName);
        editor.innerHTML = `<p><person personid="id-${fullName}" class="mentioned">@${fullName}</person></p>`;
        menu.replaceChildren();
      });
      menu.append(item);
    }
  });
  try {
    const ok = await insertMentionForTarget(editor, dom.document, luizPulz, true);
    assert.equal(ok, true);
    assert.deepEqual(clicked, ['Luiz Pulz']);
  } finally { dom.restore(); }
});

test('default technicians reject extended lookalike names and accept only exact matches', async () => {
  const { dom, editor, menu } = installEditor();
  const jorge = { id: 'jorge_tigre', name: 'Jorge Tigre', query: '@Jorge', pattern: '^jorge\\s+tigre$', enabled: true };
  const clicked = [];
  editor.addEventListener('input', () => {
    if (!editor.textContent.includes('@Jorge') || menu.childElementCount) return;
    for (const fullName of ['Jorge Tigre Filho', 'João Jorge Tigre', 'Jorge Tigre']) {
      const item = dom.document.createElement('div');
      item.className = 'person-item';
      item.innerHTML = `<span class="avatar">j</span><span class="ng-binding">${fullName}</span>`;
      item.addEventListener('click', () => {
        clicked.push(fullName);
        editor.innerHTML = `<p><person personid="jorge-id" class="mentioned">@${fullName}</person></p>`;
        menu.replaceChildren();
      });
      menu.append(item);
    }
  });
  try {
    const ok = await insertMentionForTarget(editor, dom.document, jorge, true);
    assert.equal(ok, true);
    assert.deepEqual(clicked, ['Jorge Tigre']);
  } finally { dom.restore(); }
});

test('inline highlight tags inside ng-binding do not cause false positive for single-word target', async () => {
  const { dom, editor, menu } = installEditor();
  const luizOnly = { id: 'luiz1', name: 'Luiz', query: '@Luiz', pattern: 'luiz', enabled: true };
  const clicked = [];
  editor.addEventListener('input', () => {
    if (!editor.textContent.includes('@Luiz') || menu.childElementCount) return;
    for (const html of [
      '<span class="ng-binding"><b>Luiz</b> Eduardo</span>',
      '<span class="ng-binding"><b>Luiz</b></span>',
    ]) {
      const item = dom.document.createElement('div');
      item.className = 'person-item';
      item.innerHTML = html;
      item.addEventListener('click', () => {
        const label = item.textContent.trim();
        clicked.push(label);
        editor.innerHTML = `<p><person personid="id-${label}" class="mentioned">@${label}</person></p>`;
        menu.replaceChildren();
      });
      menu.append(item);
    }
  });
  try {
    const ok = await insertMentionForTarget(editor, dom.document, luizOnly, true);
    assert.equal(ok, true);
    assert.deepEqual(clicked, ['Luiz']);
  } finally { dom.restore(); }
});

test('pre-existing marker for Luiz Eduardo does not block or falsely confirm Luiz Pulz', async () => {
  const { dom, editor, menu } = installEditor();
  const luizPulz = { id: 'luiz', name: 'Luiz Pulz', query: '@Luiz', pattern: 'luiz\\s+pulz', enabled: true };
  editor.innerHTML = '<p><person personid="other" class="mentioned">@Luiz Eduardo</person>&nbsp;</p>';
  const range = dom.document.createRange();
  range.selectNodeContents(editor.querySelector('p'));
  range.collapse(false);
  dom.document.getSelection().removeAllRanges();
  dom.document.getSelection().addRange(range);
  const clicked = [];
  editor.addEventListener('input', () => {
    if (!editor.textContent.includes('@Luiz') || menu.childElementCount) return;
    const item = dom.document.createElement('div');
    item.className = 'person-item';
    item.innerHTML = '<span class="avatar">s</span><span class="ng-binding">Luiz Pulz</span>';
    item.addEventListener('click', () => {
      clicked.push('Luiz Pulz');
      const p = dom.document.createElement('person');
      p.setAttribute('personid', 'luiz-pulz-id');
      p.className = 'mentioned';
      p.textContent = '@Luiz Pulz';
      editor.querySelector('p').append(p);
      menu.replaceChildren();
    });
    menu.append(item);
  });
  try {
    const ok = await insertMentionForTarget(editor, dom.document, luizPulz, false);
    assert.equal(ok, true);
    assert.deepEqual(clicked, ['Luiz Pulz']);
  } finally { dom.restore(); }
});
