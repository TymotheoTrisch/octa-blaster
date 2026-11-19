import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers.mjs';
import { automateLicenseMentions } from '../services/octadesk/mentionHelper.ts';

for (const navigation of [
  '',
  '<nav><a ng-click="commentTypeSelected = 3">Anotação interna</a></nav>',
]) {
  test(`license automation keeps the public draft intact when internal note cannot be confirmed (${navigation ? 'inactive link' : 'missing link'})`, async () => {
    const dom = installDom(
      `<section ticket-id="A">${navigation}<textarea>Rascunho público</textarea></section>`,
    );
    dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({
      width: 300,
      height: 100,
    });
    try {
      const editor = dom.document.querySelector('textarea');
      editor.focus();
      const result = await automateLicenseMentions(
        editor,
        dom.document,
        editor.closest('section'),
        [
          {
            id: 'person',
            name: 'Pessoa',
            query: 'pessoa',
            pattern: 'pessoa',
            enabled: true,
          },
        ],
      );
      assert.equal(result.success, false);
      assert.equal(editor.value, 'Rascunho público');
    } finally {
      dom.restore();
    }
  });
}
import { isInternalNoteTabActive, switchToInternalNote, waitForInternalNoteEditor } from '../services/octadesk/mentionHelper.ts';

function showElements(window) {
  window.HTMLElement.prototype.getBoundingClientRect = () => ({
    width: 300,
    height: 100,
  });
}

test('ARIA note tabs are recognized only within the requested ticket', () => {
  const dom = installDom(
    '<section ticket-id="A"><button role="tab" aria-selected="false">Anotação interna</button></section><section ticket-id="B"><button role="tab" aria-selected="true">Anotação interna</button></section>',
  );
  showElements(dom.window);
  try {
    assert.equal(
      isInternalNoteTabActive(dom.document.querySelector('[ticket-id="A"]')),
      false,
    );
    assert.equal(
      isInternalNoteTabActive(dom.document.querySelector('[ticket-id="B"]')),
      true,
    );
  } finally {
    dom.restore();
  }
});

test('note activation waits for asynchronous selection and editor rendering before writing', async () => {
  const dom = installDom(
    '<section ticket-id="A"><button role="tab" aria-selected="false">Anotação interna</button><textarea>Rascunho público</textarea></section>',
  );
  showElements(dom.window);
  const scope = dom.document.querySelector('section');
  const publicEditor = scope.querySelector('textarea');
  const button = scope.querySelector('button');
  let internalEditor;
  button.addEventListener('click', () =>
    setTimeout(() => {
      button.setAttribute('aria-selected', 'true');
      publicEditor.hidden = true;
      setTimeout(() => {
        internalEditor = dom.document.createElement('textarea');
        internalEditor.className = 'note-editable';
        scope.append(internalEditor);
        internalEditor.addEventListener('input', () => {
          if (scope.querySelector('.note-hint-item')) return;
          const person = dom.document.createElement('button');
          person.className = 'note-hint-item';
          person.textContent = 'Pessoa';
          person.addEventListener('click', () => {
            internalEditor.dataset.marked = 'true';
            internalEditor.value = '@Pessoa';
          });
          scope.append(person);
        });
      }, 90);
    }, 220),
  );
  try {
    publicEditor.focus();
    const result = await automateLicenseMentions(
      publicEditor,
      dom.document,
      scope,
      [
        {
          id: 'person',
          name: 'Pessoa',
          query: 'pessoa',
          pattern: 'pessoa',
          enabled: true,
        },
      ],
    );
    assert.equal(result.success, true, result.message);
    assert.equal(internalEditor.dataset.marked, 'true');
    assert.equal(publicEditor.value, 'Rascunho público');
  } finally {
    dom.restore();
  }
});

test('note controls and editor inside a same-origin frame remain scoped to the embedding ticket', async () => {
  const dom = installDom(
    '<section ticket-id="A"><iframe></iframe></section><section ticket-id="B"><button role="tab" aria-selected="true">Anotação interna</button></section>',
  );
  showElements(dom.window);
  const scope = dom.document.querySelector('[ticket-id="A"]');
  const frame = scope.querySelector('iframe');
  showElements(frame.contentWindow);
  frame.contentDocument.body.innerHTML =
    '<button role="tab" aria-selected="false">Anotação interna</button><textarea class="note-editable"></textarea>';
  const control = frame.contentDocument.querySelector('button');
  control.addEventListener('click', () =>
    control.setAttribute('aria-selected', 'true'),
  );
  try {
    assert.equal(isInternalNoteTabActive(scope), false);
    assert.equal(await switchToInternalNote(scope, () => true, 200), true);
    assert.equal(
      await waitForInternalNoteEditor(scope, 200),
      frame.contentDocument.querySelector('textarea'),
    );
  } finally {
    dom.restore();
  }
});

test('activation polling cancels when the original ticket is no longer current', async () => {
  const dom = installDom(
    '<section ticket-id="A"><button role="tab" aria-selected="false">Anotação interna</button><textarea class="note-editable">Rascunho público</textarea></section>',
  );
  showElements(dom.window);
  let current = true;
  const timer = setTimeout(() => {
    current = false;
  }, 30);
  try {
    const scope = dom.document.querySelector('section');
    assert.equal(await switchToInternalNote(scope, () => current, 400), false);
    assert.equal(
      await waitForInternalNoteEditor(scope, 400, () => current),
      null,
    );
    assert.equal(scope.querySelector('textarea').value, 'Rascunho público');
  } finally {
    clearTimeout(timer);
    dom.restore();
  }
});

test('a selected note tab chooses its linked panel while a public editor remains visible', async () => {
  const dom = installDom(
    '<section ticket-id="A"><button role="tab" aria-selected="true" aria-controls="internal">Anotação interna</button><textarea class="note-editable">Rascunho público</textarea><div id="internal"><textarea class="note-editable"></textarea></div></section>',
  );
  showElements(dom.window);
  try {
    const scope = dom.document.querySelector('section');
    assert.equal(
      await waitForInternalNoteEditor(scope, 200),
      scope.querySelector('#internal textarea'),
    );
    assert.equal(scope.querySelector('textarea').value, 'Rascunho público');
  } finally {
    dom.restore();
  }
});

test('an active note tab waits for its linked panel instead of using the visible public editor', async () => {
  const dom = installDom(
    '<section ticket-id="A"><button role="tab" aria-selected="true" aria-controls="internal">Anotação interna</button><textarea class="note-editable">Rascunho público</textarea><div id="internal" hidden><textarea class="note-editable"></textarea></div></section>',
  );
  showElements(dom.window);
  const timer = setTimeout(() => {
    dom.document.querySelector('#internal').hidden = false;
  }, 100);
  try {
    const scope = dom.document.querySelector('section');
    assert.equal(
      await waitForInternalNoteEditor(scope, 400),
      scope.querySelector('#internal textarea'),
    );
    assert.equal(scope.querySelector('textarea').value, 'Rascunho público');
  } finally {
    clearTimeout(timer);
    dom.restore();
  }
});

test('an active note tab waits for a linked panel that has not been mounted yet', async () => {
  const dom = installDom(
    '<section ticket-id="A"><button role="tab" aria-selected="true" aria-controls="internal">Anotação interna</button><textarea class="note-editable">Rascunho público</textarea></section>',
  );
  showElements(dom.window);
  const scope = dom.document.querySelector('section');
  const timer = setTimeout(() => {
    const panel = dom.document.createElement('div');
    panel.id = 'internal';
    panel.innerHTML = '<textarea class="note-editable"></textarea>';
    scope.append(panel);
  }, 250);
  try {
    const editor = await waitForInternalNoteEditor(scope, 600);
    assert.equal(editor, scope.querySelector('#internal textarea'));
    assert.ok(editor);
    assert.equal(scope.querySelector('textarea').value, 'Rascunho público');
  } finally {
    clearTimeout(timer);
    dom.restore();
  }
});

test('note activation survives the framework replacing the clicked tab element', async () => {
  const dom = installDom(
    '<section ticket-id="A"><button role="tab" aria-selected="false">Anotação interna</button></section>',
  );
  showElements(dom.window);
  const scope = dom.document.querySelector('section');
  const original = scope.querySelector('button');
  original.addEventListener('click', () => {
    const replacement = original.cloneNode(true);
    replacement.setAttribute('aria-selected', 'true');
    original.replaceWith(replacement);
  });
  try {
    assert.equal(await switchToInternalNote(scope, () => true, 200), true);
    assert.equal(original.isConnected, false);
  } finally {
    dom.restore();
  }
});
