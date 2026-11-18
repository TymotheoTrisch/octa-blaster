import test from 'node:test';
import assert from 'node:assert/strict';
import { installStorage } from './helpers.mjs';
import { DEFAULT_TEMPLATES, STORAGE_KEY, HAS_INITIALIZED_KEY, loadStoredTemplates, saveStoredTemplates } from '../utils/templateStorage.ts';

test('background storage queue preserves a new default when an older client saves its snapshot', async () => {
  const custom = { id: 'mine', title: 'Meu título', content: 'Meu conteúdo', updatedAt: 123 };
  const future = { id: 'future-queue', title: 'Novo padrão', content: 'Novo conteúdo', updatedAt: 456 };
  const storage = installStorage({ [HAS_INITIALIZED_KEY]: true, [STORAGE_KEY]: [custom] });
  const previousDefine = globalThis.defineBackground;
  let listener;
  globalThis.defineBackground = setup => setup;
  globalThis.browser.tabs = { onRemoved: { addListener() {} } };
  globalThis.browser.runtime = {
    id: 'test-extension',
    onMessage: { addListener(fn) { listener = fn; } },
    sendMessage(message) {
      return new Promise(resolve => listener(message, { id: 'test-extension' }, resolve));
    },
  };
  try {
    const { default: setup } = await import('../entrypoints/background.ts');
    setup();
    const oldSnapshot = await loadStoredTemplates();
    DEFAULT_TEMPLATES.push(future);
    assert.deepEqual(await loadStoredTemplates(), [custom, future]);
    await saveStoredTemplates([{ ...oldSnapshot[0], content: 'Edited in another panel' }], oldSnapshot);
    assert.deepEqual((await loadStoredTemplates()).map(template => template.id), ['mine', 'future-queue']);
    assert.equal(storage.data[STORAGE_KEY][0].content, 'Edited in another panel');
    const sharedBase = await loadStoredTemplates();
    await saveStoredTemplates(sharedBase.map(template => template.id === custom.id
      ? { ...template, content: 'First editor wins' } : template), sharedBase);
    await assert.rejects(saveStoredTemplates(sharedBase.map(template => template.id === custom.id
      ? { ...template, content: 'Conflicting edit' } : template), sharedBase));
    assert.equal(storage.data[STORAGE_KEY][0].content, 'First editor wins');
    const deletionBase = await loadStoredTemplates();
    await saveStoredTemplates(deletionBase.filter(template => template.id !== future.id), deletionBase);
    assert.deepEqual((await loadStoredTemplates()).map(template => template.id), ['mine']);
  } finally {
    if (DEFAULT_TEMPLATES.at(-1)?.id === future.id) DEFAULT_TEMPLATES.pop();
    if (previousDefine === undefined) delete globalThis.defineBackground;
    else globalThis.defineBackground = previousDefine;
    storage.restore();
  }
});
