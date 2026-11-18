import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';
import { installReplyShortcut, matchShortcut } from '../utils/replyShortcut.ts';
import { VARIABLES_KEY, SHORTCUT_KEY } from '../utils/templateVariables.ts';
import { STORAGE_KEY, HAS_INITIALIZED_KEY } from '../utils/templateStorage.ts';

const templates = [
  { id: 'return', title: 'Retorno', content: 'Resposta pronta', updatedAt: 1 },
  { id: 'hello', title: 'Saudação', content: 'Olá!', updatedAt: 1 },
];
const settle = () => new Promise(resolve => setImmediate(resolve));

test('shortcut preview follows keyboard and mouse selection without prompting for values', async () => {
  const dom = installDom('<section ticket-id="A"><textarea></textarea></section>');
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  const storage = installStorage({
    [STORAGE_KEY]: [
      { ...templates[0], content: 'Olá {{Assinatura}}\nProtocolo {{Protocolo}}' },
      templates[1],
    ],
    [HAS_INITIALIZED_KEY]: true,
    [VARIABLES_KEY]: [{ name: 'Assinatura', value: 'Ana', mode: 'saved' }],
  });
  const editor = dom.document.querySelector('textarea');
  installReplyShortcut(dom.document, target => target === editor, () => true);
  try {
    editor.value = '\\';
    editor.setSelectionRange(1, 1);
    editor.focus();
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true }));
    await settle();
    const preview = dom.document.querySelector('.octablaster-shortcut-preview');
    assert.equal(preview.textContent, 'Olá Ana\nProtocolo {{Protocolo}}');
    assert.equal(dom.document.querySelector('dialog'), null);
    editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    assert.equal(preview.textContent, 'Olá!');
    const first = dom.document.querySelector('[role="option"]');
    first.dispatchEvent(new dom.window.MouseEvent('mouseenter'));
    assert.equal(first.getAttribute('aria-selected'), 'true');
    assert.equal(preview.textContent, 'Olá Ana\nProtocolo {{Protocolo}}');
    assert.equal(editor.value, '\\');
  } finally { storage.restore(); dom.restore(); }
});

test('shortcut matches only a standalone trigger before the caret', () => {
  assert.deepEqual(matchShortcut('Olá \\ret', '\\'), { query: 'ret', start: 4, end: 8 });
  assert.equal(matchShortcut('https://example.com', '/'), null);
  assert.equal(matchShortcut('C:\\folder', '\\'), null);
  assert.equal(matchShortcut('/ret\nnext', '/'), null);
  assert.equal(matchShortcut('/ret', ''), null);
});

for (const tag of ['textarea', 'input', 'div']) {
  test(`menu inserts into ${tag} and preserves the surrounding draft`, async () => {
    const dom = installDom(`<section ticket-id="A"><${tag} ${tag === 'div' ? 'contenteditable="true"' : ''}></${tag}></section>`);
    const storage = installStorage({ [STORAGE_KEY]: templates, [HAS_INITIALIZED_KEY]: true });
    const editor = dom.document.querySelector(tag);
    dom.document.execCommand = () => false;
    dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 10, bottom: 20 });
    const text = 'Antes \\ret depois';
    editor.focus();
    if (tag === 'div') {
      editor.textContent = text;
      const range = dom.document.createRange(); range.setStart(editor.firstChild, 10); range.collapse(true);
      dom.document.getSelection().removeAllRanges();
      dom.document.getSelection().addRange(range);
    } else { editor.value = text; editor.setSelectionRange(10, 10); }
    installReplyShortcut(dom.document, target => target === editor, target => target === editor);
    try {
      editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true }));
      await settle();
      assert.equal(dom.document.querySelector('[role="option"]').textContent, 'Retorno');
      const enter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      editor.dispatchEvent(enter);
      assert.equal(enter.defaultPrevented, true);
      await settle();
      assert.equal(tag === 'div' ? editor.textContent : editor.value, 'Antes Resposta pronta depois');
      assert.equal(dom.document.querySelector('[role="listbox"]'), null);
    } finally { storage.restore(); dom.restore(); }
  });
}

test('slash preference, Escape, and IME composition preserve user input', async () => {
  const dom = installDom('<section ticket-id="A"><textarea></textarea></section>');
  const storage = installStorage({ [STORAGE_KEY]: templates, [HAS_INITIALIZED_KEY]: true, [SHORTCUT_KEY]: '/' });
  const editor = dom.document.querySelector('textarea');
  installReplyShortcut(dom.document, target => target === editor, () => true);
  try {
    editor.value = '/ret'; editor.setSelectionRange(4, 4);
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, isComposing: true }));
    await settle();
    assert.equal(dom.document.querySelector('[role="listbox"]'), null);
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true }));
    await settle();
    assert.ok(dom.document.querySelector('[role="listbox"]'));
    const imeEnter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
    editor.dispatchEvent(imeEnter);
    assert.equal(imeEnter.defaultPrevented, false);
    editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(dom.document.querySelector('[role="listbox"]'), null);
    assert.equal(editor.value, '/ret');
  } finally { storage.restore(); dom.restore(); }
});

test('arrow navigation selects the next response and mouse selection uses the same insertion flow', async () => {
  const dom = installDom('<section ticket-id="A"><textarea></textarea></section>');
  const storage = installStorage({ [STORAGE_KEY]: templates, [HAS_INITIALIZED_KEY]: true });
  const editor = dom.document.querySelector('textarea');
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  installReplyShortcut(dom.document, target => target === editor, () => true);
  try {
    editor.value = '\\'; editor.setSelectionRange(1, 1);
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true }));
    await settle();
    editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    assert.equal(dom.document.querySelector('[aria-selected="true"]').textContent, 'Saudação');
    editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    assert.equal(editor.value, 'Olá!');
    editor.value = '\\ret'; editor.setSelectionRange(4, 4);
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true }));
    await settle();
    dom.document.querySelector('[role="option"]').click();
    await settle();
    assert.equal(editor.value, 'Resposta pronta');
  } finally { storage.restore(); dom.restore(); }
});

for (const html of ['<p>Antes</p><p>\\ret</p>', 'Antes<br>\\ret']) {
  test(`rich editor recognizes the shortcut after a rendered line break in ${html}`, async () => {
    const dom = installDom('<section ticket-id="A"><div contenteditable="true"></div></section>');
    const storage = installStorage({ [STORAGE_KEY]: templates, [HAS_INITIALIZED_KEY]: true });
    const editor = dom.document.querySelector('div');
    editor.innerHTML = html; editor.focus();
    dom.document.execCommand = () => false;
    dom.window.Range.prototype.getBoundingClientRect = () => ({ left: 10, bottom: 20 });
    const range = dom.document.createRange(); range.selectNodeContents(editor); range.collapse(false);
    dom.document.getSelection().removeAllRanges(); dom.document.getSelection().addRange(range);
    installReplyShortcut(dom.document, target => target === editor, () => true);
    try {
      editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true }));
      await settle();
      assert.equal(dom.document.querySelector('[role="option"]')?.textContent, 'Retorno');
      editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await settle();
      assert.ok(editor.textContent.includes('Antes'));
      assert.ok(editor.textContent.includes('Resposta pronta'));
      assert.ok(!editor.textContent.includes('\\ret'));
    } finally { storage.restore(); dom.restore(); }
  });
}

test('switching tickets during variable entry aborts insertion and keeps the draft', async () => {
  const dom = installDom('<section ticket-id="A"><textarea></textarea></section>');
  const storage = installStorage({
    [STORAGE_KEY]: [{ ...templates[0], content: 'Protocolo {{Protocolo}}' }], [HAS_INITIALIZED_KEY]: true,
    [VARIABLES_KEY]: [{ name: 'Protocolo', value: '', mode: 'prompt' }],
  });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  const editor = dom.document.querySelector('textarea');
  let current = true;
  installReplyShortcut(dom.document, target => target === editor, () => current);
  try {
    editor.value = '\\ret'; editor.setSelectionRange(4, 4);
    editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true }));
    await settle();
    editor.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    const dialog = dom.document.querySelector('dialog');
    assert.ok(dialog);
    current = false;
    dialog.querySelector('input').value = '123';
    dialog.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await settle();
    assert.equal(editor.value, '\\ret');
  } finally { storage.restore(); dom.restore(); }
});

