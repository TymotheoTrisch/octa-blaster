import test from 'node:test';
import assert from 'node:assert/strict';
import { installStorage } from './helpers.mjs';
import { DEFAULT_TEMPLATES, STORAGE_KEY, HAS_INITIALIZED_KEY, DEFAULTS_STATE_KEY,
  loadStoredTemplates, saveStoredTemplates, resetToDefaultTemplates } from '../utils/templateStorage.ts';

const custom = { id: 'my-reply', title: 'Meu modelo', content: 'Meu conteúdo', updatedAt: 123 };

test('fresh installs initialize defaults and migration metadata once', async () => {
  const storage = installStorage();
  try {
    assert.deepEqual(await loadStoredTemplates(), DEFAULT_TEMPLATES);
    assert.equal(storage.data[HAS_INITIALIZED_KEY], true);
    assert.deepEqual(new Set(storage.data[DEFAULTS_STATE_KEY].seenIds), new Set(DEFAULT_TEMPLATES.map(t => t.id)));
    assert.deepEqual(await loadStoredTemplates(), DEFAULT_TEMPLATES);
  } finally { storage.restore(); }
});

test('legacy data retains edited replies and intentionally removed defaults', async () => {
  const edited = { ...DEFAULT_TEMPLATES[0], title: 'Título meu', content: 'Conteúdo meu' };
  const storage = installStorage({ [HAS_INITIALIZED_KEY]: true, [STORAGE_KEY]: [edited, custom] });
  try {
    assert.deepEqual(await loadStoredTemplates(), [edited, custom]);
    assert.deepEqual(await loadStoredTemplates(), [edited, custom]);
  } finally { storage.restore(); }
});

test('an intentionally empty legacy collection remains empty', async () => {
  const storage = installStorage({ [HAS_INITIALIZED_KEY]: true, [STORAGE_KEY]: [] });
  try { assert.deepEqual(await loadStoredTemplates(), []); }
  finally { storage.restore(); }
});

test('a newly shipped default is added once and stays deleted after removal', async () => {
  const newDefault = { id: 'future-default-test', title: 'Novo padrão', content: 'Novo conteúdo', updatedAt: 456 };
  const storage = installStorage({ [HAS_INITIALIZED_KEY]: true, [STORAGE_KEY]: [custom] });
  DEFAULT_TEMPLATES.push(newDefault);
  try {
    const migrated = await loadStoredTemplates();
    assert.deepEqual(migrated, [custom, newDefault]);
    assert.deepEqual(await loadStoredTemplates(), migrated);
    await saveStoredTemplates([custom]);
    assert.deepEqual(await loadStoredTemplates(), [custom]);
  } finally {
    DEFAULT_TEMPLATES.pop();
    storage.restore();
  }
});

test('reset restores defaults while preserving custom replies', async () => {
  const storage = installStorage({ [HAS_INITIALIZED_KEY]: true, [STORAGE_KEY]: [custom] });
  try {
    const restored = await resetToDefaultTemplates([custom]);
    assert.deepEqual(restored, [...DEFAULT_TEMPLATES, custom]);
    assert.deepEqual(await loadStoredTemplates(), restored);
  } finally { storage.restore(); }
});
