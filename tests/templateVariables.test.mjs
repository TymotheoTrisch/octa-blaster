import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';
import { VARIABLES_KEY, validateVariables } from '../utils/settingsSchema.ts';
import { findVariableNames, prepareTemplate, loadReplySettings, saveReplySettings, saveVariables, saveShortcutTrigger } from '../utils/templateVariables.ts';

test('variable names reject reserved names and case-insensitive duplicates', () => {
  for (const name of ['Data', 'hora', 'Saudacao', 'Saudação', 'bad name', '1numero']) {
    assert.throws(() => validateVariables([{ name, value: 'x', mode: 'saved' }]));
  }
  assert.throws(() => validateVariables([
    { name: 'Assinatura', value: 'A', mode: 'saved' }, { name: 'assinatura', value: 'B', mode: 'saved' },
  ]));
  assert.deepEqual(findVariableNames('{{Assinatura}} {assinatura} {{Data}} {{Protocolo}}'), ['assinatura', 'Protocolo']);
});

test('settings persist variables and slash preference', async () => {
  const storage = installStorage();
  try {
    assert.deepEqual(await loadReplySettings(), { variables: [], trigger: '\\' });
    const settings = { variables: [{ name: 'Assinatura', value: 'Ana', mode: 'saved' }], trigger: '/' };
    await saveReplySettings(settings);
    assert.deepEqual(await loadReplySettings(), settings);
  } finally { storage.restore(); }
});

test('saving variables and shortcut preferences independently preserves both screens’ changes', async () => {
  const storage = installStorage();
  const variables = [{ name: 'Assinatura', value: 'Ana', mode: 'saved' }];
  try {
    await Promise.all([saveVariables(variables), saveShortcutTrigger('/')]);
    assert.deepEqual(await loadReplySettings(), { variables, trigger: '/' });
    await saveShortcutTrigger('');
    assert.deepEqual(await loadReplySettings(), { variables, trigger: '' });
  } finally { storage.restore(); }
});

test('saved values resolve across single/double braces and preserve literal value text', async () => {
  const dom = installDom();
  const storage = installStorage({ [VARIABLES_KEY]: [{ name: 'Assinatura', value: 'Ana {{Protocolo}}', mode: 'saved' }] });
  try {
    assert.equal(await prepareTemplate('{assinatura} / {{ASSINATURA}}'), 'Ana {{Protocolo}} / Ana {{Protocolo}}');
  } finally { storage.restore(); dom.restore(); }
});

test('prompted and unknown variables share one dialog and substitute every occurrence', async () => {
  const dom = installDom();
  const storage = installStorage({ [VARIABLES_KEY]: [{ name: 'Protocolo', value: 'old', mode: 'prompt' }] });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  try {
    const pending = prepareTemplate('{{Protocolo}} / {protocolo} / {{Cliente}}', dom.document);
    await new Promise(resolve => setImmediate(resolve));
    const dialog = dom.document.querySelector('dialog');
    assert.ok(dialog);
    assert.equal(dialog.querySelectorAll('input').length, 2);
    assert.equal(dialog.querySelector('input').value, '');
    dialog.querySelector('input[name="protocolo"]').value = '123';
    dialog.querySelector('input[name="Cliente"]').value = 'Maria';
    dialog.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    assert.equal(await pending, '123 / 123 / Maria');
    assert.equal(dom.document.querySelector('dialog'), null);
    assert.equal(storage.data[VARIABLES_KEY][0].value, 'old');
  } finally { storage.restore(); dom.restore(); }
});

test('canceling variable entry returns null and removes the dialog', async () => {
  const dom = installDom();
  const storage = installStorage();
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  try {
    const pending = prepareTemplate('{{Missing}}', dom.document);
    await new Promise(resolve => setImmediate(resolve));
    dom.document.querySelector('button[type="button"]').click();
    assert.equal(await pending, null);
    assert.equal(dom.document.querySelector('dialog'), null);
  } finally { storage.restore(); dom.restore(); }
});
