import test from 'node:test';
import assert from 'node:assert/strict';
import { installStorage } from './helpers.mjs';
import { DEFAULT_TEMPLATES, STORAGE_KEY, HAS_INITIALIZED_KEY, DEFAULTS_STATE_KEY, loadStoredTemplates, saveStoredTemplates, resetToDefaultTemplates } from '../services/storage/templateStorage.ts';

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

test('reordering persists the requested order and retains a concurrently added reply', async () => {
  const second = { ...custom, id: 'second-reply', title: 'Segundo modelo' };
  const concurrent = { ...custom, id: 'another-panel', title: 'Adicionado em outro painel' };
  const storage = installStorage({ [HAS_INITIALIZED_KEY]: true, [STORAGE_KEY]: [custom, second] });
  try {
    const base = await loadStoredTemplates();
    storage.data[STORAGE_KEY] = [...base, concurrent];
    const saved = await saveStoredTemplates([base[1], base[0]], base);
    assert.deepEqual(saved.map(template => template.id), [second.id, custom.id, concurrent.id]);
    assert.deepEqual((await loadStoredTemplates()).map(template => template.id), [second.id, custom.id, concurrent.id]);
    assert.deepEqual(saved.find(template => template.id === custom.id), custom);
  } finally { storage.restore(); }
});

test('saving content from an older panel preserves another panel’s newer order', async () => {
  const second = { ...custom, id: 'second-reply', title: 'Segundo modelo' };
  const third = { ...custom, id: 'third-reply', title: 'Terceiro modelo' };
  const storage = installStorage({ [HAS_INITIALIZED_KEY]: true, [STORAGE_KEY]: [custom, second, third] });
  try {
    const base = await loadStoredTemplates();
    await saveStoredTemplates([base[2], base[0], base[1]], base);
    await saveStoredTemplates(base.map(template => template.id === second.id
      ? { ...template, content: 'Texto revisado em outro painel' } : template), base);
    const saved = await loadStoredTemplates();
    assert.deepEqual(saved.map(template => template.id), [third.id, custom.id, second.id]);
    assert.equal(saved.find(template => template.id === second.id).content, 'Texto revisado em outro painel');
  } finally { storage.restore(); }
});
