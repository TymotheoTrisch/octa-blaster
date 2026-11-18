import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, installStorage } from './helpers.mjs';
import { TAGS_KEY, getTemplateTagIds, getTemplateTagNames } from '../utils/templateTagSchema.ts';
import { loadTags, saveTags } from '../utils/templateTags.ts';
import { STORAGE_KEY, HAS_INITIALIZED_KEY, loadStoredTemplates, saveStoredTemplates, parseTemplateBackup, parseTemplatesFromJson, mergeImportedTemplates, exportTemplatesToJson } from '../utils/templateStorage.ts';

const reply = { id: 'reply', title: 'Resposta', content: 'Conteúdo', updatedAt: 1 };

test('legacy categories are exposed as tags without changing stored templates on load', async () => {
  const legacy = { ...reply, category: 'Suporte' };
  const storage = installStorage({ [STORAGE_KEY]: [legacy], [HAS_INITIALIZED_KEY]: true });
  try {
    const catalog = await loadTags();
    const tag = catalog.find(tag => tag.name === 'Suporte');
    assert.ok(tag);
    assert.deepEqual(getTemplateTagIds(legacy, catalog), [tag.id]);
    assert.deepEqual(getTemplateTagNames(legacy, catalog), ['Suporte']);
    assert.deepEqual(storage.data[STORAGE_KEY], [legacy]);
    assert.deepEqual(await loadTags(), catalog);
  } finally { storage.restore(); }
});

test('renaming and deleting tags update associated replies without deleting their content', async () => {
  const tagged = { ...reply, category: 'Suporte', tags: ['support', 'license'] };
  const storage = installStorage({ [STORAGE_KEY]: [tagged], [HAS_INITIALIZED_KEY]: true,
    [TAGS_KEY]: [{ id: 'support', name: 'Suporte' }, { id: 'license', name: 'Licenças' }] });
  try {
    await saveTags([{ id: 'support', name: 'Suporte' }, { id: 'license', name: 'Licenças' }]);
    await saveTags([{ id: 'support', name: 'Atendimento' }]);
    const catalog = await loadTags();
    const templates = await loadStoredTemplates();
    assert.deepEqual(getTemplateTagIds(templates[0], catalog), ['support']);
    assert.deepEqual(getTemplateTagNames(templates[0], catalog), ['Atendimento']);
    assert.equal(templates[0].category, 'Atendimento');
    assert.equal(templates[0].content, reply.content);
    assert.deepEqual(catalog, [{ id: 'support', name: 'Atendimento' }]);
  } finally { storage.restore(); }
});

test('tags survive response reordering and content changes', async () => {
  const tagged = { ...reply, category: 'Suporte', tags: ['support', 'license'] };
  const second = { ...reply, id: 'second', tags: ['license'], category: 'Licenças' };
  const storage = installStorage({ [STORAGE_KEY]: [tagged, second], [HAS_INITIALIZED_KEY]: true,
    [TAGS_KEY]: [{ id: 'support', name: 'Suporte' }, { id: 'license', name: 'Licenças' }] });
  try {
    await saveTags([{ id: 'support', name: 'Suporte' }, { id: 'license', name: 'Licenças' }]);
    const base = await loadStoredTemplates();
    await saveStoredTemplates([base[1], { ...base[0], content: 'Conteúdo editado' }], base);
    const saved = await loadStoredTemplates();
    assert.deepEqual(saved.map(template => template.id), ['second', 'reply']);
    assert.deepEqual(saved[1].tags, ['support', 'license']);
    assert.equal(saved[1].content, 'Conteúdo editado');
  } finally { storage.restore(); }
});

test('backup parsing accepts old arrays and maps imported tag ID collisions safely', async () => {
  const storage = installStorage({ [STORAGE_KEY]: [reply], [HAS_INITIALIZED_KEY]: true });
  try {
    assert.deepEqual(parseTemplatesFromJson(JSON.stringify([{ ...reply, category: 'Legado' }])), [{ ...reply, category: 'Legado' }]);
    await saveTags([{ id: 'shared', name: 'Local' }]);
    const backup = parseTemplateBackup(JSON.stringify({ format: 'octablaster', version: 1,
      templates: [{ ...reply, id: 'imported', tags: ['shared'], category: 'Importada' }], tags: [{ id: 'shared', name: 'Importada' }] }));
    const current = await loadStoredTemplates();
    await mergeImportedTemplates(current, backup.templates, current, backup.tags);
    const catalog = await loadTags();
    const imported = (await loadStoredTemplates()).find(template => template.id === 'imported');
    assert.ok(catalog.some(tag => tag.id === 'shared' && tag.name === 'Local'));
    assert.deepEqual(getTemplateTagNames(imported, catalog), ['Importada']);
    assert.notDeepEqual(imported.tags, ['shared']);
  } finally { storage.restore(); }
});

test('exported backups include both response associations and the tag catalog', async () => {
  const dom = installDom();
  const tagged = { ...reply, category: 'Suporte', tags: ['support'] };
  const storage = installStorage({ [STORAGE_KEY]: [tagged], [HAS_INITIALIZED_KEY]: true,
    [TAGS_KEY]: [{ id: 'support', name: 'Suporte' }] });
  let download;
  dom.window.HTMLAnchorElement.prototype.click = function () { download = this.href; this.remove(); };
  try {
    await saveTags([{ id: 'support', name: 'Suporte' }]);
    await exportTemplatesToJson();
    assert.ok(download?.startsWith('data:application/json'));
    const json = decodeURIComponent(download.slice(download.indexOf(',') + 1));
    const backup = parseTemplateBackup(json);
    assert.deepEqual(backup.tags, [{ id: 'support', name: 'Suporte' }]);
    assert.deepEqual(backup.templates[0].tags, ['support']);
  } finally { storage.restore(); dom.restore(); }
});

test('saving tags from another panel keeps concurrent additions and rejects conflicting renames', async () => {
  const storage = installStorage({ [STORAGE_KEY]: [], [HAS_INITIALIZED_KEY]: true,
    [TAGS_KEY]: [{ id: 'support', name: 'Suporte' }] });
  try {
    const base = await loadTags();
    await saveTags([...base, { id: 'license', name: 'Licenças' }], base);
    await saveTags([{ id: 'support', name: 'Atendimento' }], base);
    assert.deepEqual(await loadTags(), [{ id: 'support', name: 'Atendimento' }, { id: 'license', name: 'Licenças' }]);
    await assert.rejects(saveTags([{ id: 'support', name: 'Nome conflitante' }], base));
    assert.equal((await loadTags()).find(tag => tag.id === 'support').name, 'Atendimento');
  } finally { storage.restore(); }
});

test('exporting persisted responses after deleting a tag does not recreate the tag', async () => {
  const dom = installDom();
  const tagged = { ...reply, category: 'Suporte', tags: ['support'] };
  const storage = installStorage({ [STORAGE_KEY]: [tagged], [HAS_INITIALIZED_KEY]: true,
    [TAGS_KEY]: [{ id: 'support', name: 'Suporte' }] });
  let download;
  dom.window.HTMLAnchorElement.prototype.click = function () { download = this.href; this.remove(); };
  try {
    await saveTags([]);
    await exportTemplatesToJson();
    const json = decodeURIComponent(download.slice(download.indexOf(',') + 1));
    const backup = parseTemplateBackup(json);
    assert.deepEqual(backup.tags, []);
    assert.deepEqual(backup.templates[0].tags || [], []);
    assert.equal(backup.templates[0].category, undefined);
  } finally { storage.restore(); dom.restore(); }
});

test('a tag-only backup retains its catalog when it has no response templates', () => {
  const tags = [{ id: 'support', name: 'Suporte' }];
  assert.deepEqual(parseTemplateBackup(JSON.stringify({ format: 'octablaster', version: 1, templates: [], tags })), { templates: [], tags });
});
