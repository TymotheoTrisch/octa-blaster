import test from 'node:test';
import assert from 'node:assert/strict';
import { installStorage, installDom } from './helpers.mjs';
import { loadSettings } from '../services/storage/settingsStorage.ts';
import { saveVariables, loadVariables, saveShortcutTrigger, saveReplySettings } from '../services/templates/templateVariables.ts';
import { VARIABLES_KEY, SHORTCUT_KEY } from '../services/storage/settingsSchema.ts';
import { saveMentionTargets, loadMentionTargets } from '../services/octadesk/mentionHelper.ts';
import { MENTION_TARGETS_STORAGE_KEY } from '../services/storage/settingsSchema.ts';
import { exportTemplatesToJson, parseTemplateBackup, mergeImportedTemplates, loadStoredTemplates, STORAGE_KEY, HAS_INITIALIZED_KEY } from '../services/storage/templateStorage.ts';
import { TAGS_KEY } from '../services/storage/templateTagSchema.ts';

const variable = (name, value = name) => ({ name, value, mode: 'saved' });
const target = id => ({ id, name: `Técnico ${id}`, query: `@${id}`, pattern: '', enabled: true });
const reply = { id: 'custom', title: 'Resposta', content: '{{Assinatura}}', updatedAt: 1, tags: ['support'] };

async function withBackground(initial, run) {
  const storage = installStorage(initial);
  const previous = globalThis.defineBackground;
  let listener;
  globalThis.defineBackground = setup => setup;
  browser.tabs = { onRemoved: { addListener() {} } };
  browser.runtime = {
    id: 'test-extension', onMessage: { addListener(fn) { listener = fn; } },
    sendMessage(message) { return new Promise(resolve => listener(message, { id: 'test-extension' }, resolve)); },
  };
  try {
    const { default: setup } = await import('../entrypoints/background.ts');
    setup();
    await run(storage);
  } finally {
    if (previous === undefined) delete globalThis.defineBackground;
    else globalThis.defineBackground = previous;
    storage.restore();
  }
}

test('two panels preserve independent variable edits and additions through the background queue', async () => {
  await withBackground({ [VARIABLES_KEY]: [variable('A'), variable('B')] }, async () => {
    const base = await loadVariables();
    await Promise.all([
      saveVariables([variable('A', 'first'), base[1]], base),
      saveVariables([base[0], variable('B', 'second'), variable('C')], base),
    ]);
    assert.deepEqual(await loadVariables(), [variable('A', 'first'), variable('B', 'second'), variable('C')]);
  });
});

test('variable conflicts and stale deletions reject without overwriting the newer values', async () => {
  await withBackground({ [VARIABLES_KEY]: [variable('A')] }, async () => {
    const base = await loadVariables();
    await saveVariables([variable('A', 'winner')], base);
    await assert.rejects(saveVariables([variable('A', 'loser')], base), /outro painel/);
    await assert.rejects(saveVariables([], base), /outro painel/);
    assert.deepEqual(await loadVariables(), [variable('A', 'winner')]);
    await saveVariables([variable('Renamed', 'winner')], await loadVariables());
    await assert.rejects(saveVariables([variable('A', 'stale')], base), /outro painel/);
    assert.deepEqual(await loadVariables(), [variable('Renamed', 'winner')]);
  });
});

test('variable additions with equivalent names cannot overwrite each other', async () => {
  await withBackground({}, async () => {
    const base = await loadVariables();
    await saveVariables([variable('Assinatura', 'Ana')], base);
    await assert.rejects(saveVariables([variable('ASSINATURA', 'Bia')], base), /outro painel/);
    assert.deepEqual(await loadVariables(), [variable('Assinatura', 'Ana')]);
  });
});

test('technician edits preserve concurrent additions and detect edits against a deleted target', async () => {
  await withBackground({ [MENTION_TARGETS_STORAGE_KEY]: [target('a')] }, async () => {
    const base = await loadMentionTargets();
    await Promise.all([
      saveMentionTargets([{ ...base[0], enabled: false }], base),
      saveMentionTargets([...base, target('b')], base),
    ]);
    const latest = await loadMentionTargets();
    assert.equal(latest.length, 2);
    assert.equal(latest[0].enabled, false);
    await assert.rejects(saveMentionTargets([{ ...base[0], query: '@changed' }], base), /outro painel/);
    await assert.rejects(saveMentionTargets([], base), /outro painel/);
    await saveMentionTargets(latest.filter(item => item.id !== 'a'), latest);
    await assert.rejects(saveMentionTargets([{ ...latest[0], name: 'Outra pessoa' }, latest[1]], latest), /outro painel/);
    assert.deepEqual((await loadMentionTargets()).map(item => item.id), ['b']);
    await saveMentionTargets([], await loadMentionTargets());
    assert.deepEqual(await loadMentionTargets(), []);
  });
});

test('shortcut conflicts reject and an unchanged stale field preserves the latest preference', async () => {
  await withBackground({}, async () => {
    const base = await loadSettings();
    await saveShortcutTrigger('/', base.trigger);
    await assert.rejects(saveShortcutTrigger('', base.trigger), /outro painel/);
    await saveReplySettings({ variables: [variable('A')], trigger: base.trigger }, { variables: base.variables, trigger: base.trigger });
    assert.equal((await loadSettings()).trigger, '/');
    assert.deepEqual(await loadVariables(), [variable('A')]);
  });
});

test('a failed settings write rejects to the caller and the background queue recovers', async t => {
  t.mock.method(console, 'warn', () => {});
  await withBackground({}, async storage => {
    const original = browser.storage.local.set;
    browser.storage.local.set = async () => { throw new Error('quota exceeded'); };
    await assert.rejects(saveVariables([variable('A')], []), /Não foi possível salvar/);
    assert.equal(storage.data[VARIABLES_KEY], undefined);
    browser.storage.local.set = original;
    await saveVariables([variable('B')], []);
    assert.deepEqual(await loadVariables(), [variable('B')]);
  });
});

test('v2 backup roundtrip restores messages, tags, variables, technicians and disabled shortcut', async () => {
  const dom = installDom();
  const settings = { variables: [variable('Assinatura', 'Ana')], targets: [target('ana')], trigger: '' };
  try {
    await withBackground({ [STORAGE_KEY]: [reply], [HAS_INITIALIZED_KEY]: true,
      [TAGS_KEY]: [{ id: 'support', name: 'Suporte' }], [VARIABLES_KEY]: settings.variables,
      [MENTION_TARGETS_STORAGE_KEY]: settings.targets, [SHORTCUT_KEY]: '' }, async storage => {
      const expectedSettings = await loadSettings();
      let download;
      dom.window.HTMLAnchorElement.prototype.click = function () { download = this.href; this.remove(); };
      await exportTemplatesToJson();
      const json = decodeURIComponent(download.slice(download.indexOf(',') + 1));
      assert.equal(JSON.parse(json).version, 2);
      const backup = parseTemplateBackup(json);
      assert.deepEqual(backup.settings, expectedSettings);
      storage.data[STORAGE_KEY] = [];
      storage.data[TAGS_KEY] = [];
      storage.data[VARIABLES_KEY] = [];
      storage.data[MENTION_TARGETS_STORAGE_KEY] = [];
      storage.data[SHORTCUT_KEY] = '/';
      await mergeImportedTemplates([], backup.templates, [], backup.tags, backup.settings, await loadSettings());
      assert.deepEqual(await loadSettings(), expectedSettings);
      assert.deepEqual(storage.data[STORAGE_KEY], [replyWithCategory(reply)]);
      assert.deepEqual(storage.data[TAGS_KEY], backup.tags);
    });
  } finally { dom.restore(); }
});

function replyWithCategory(item) { return { ...item, category: 'Suporte' }; }

test('legacy backups leave settings intact and v2 retains intentionally empty lists', async () => {
  await withBackground({ [STORAGE_KEY]: [], [HAS_INITIALIZED_KEY]: true, [VARIABLES_KEY]: [variable('A')] }, async () => {
    const original = await loadSettings();
    for (const json of [JSON.stringify([{ ...reply, tags: [] }]), JSON.stringify({ format: 'octablaster', version: 1, templates: [], tags: [] })]) {
      const backup = parseTemplateBackup(json);
      await mergeImportedTemplates([], backup.templates, [], backup.tags, backup.settings);
      assert.deepEqual(await loadSettings(), original);
    }
    const backup = parseTemplateBackup(JSON.stringify({ format: 'octablaster', version: 2, templates: [], tags: [], settings: { variables: [], targets: [], trigger: '/' } }));
    await mergeImportedTemplates([], [], [], [], backup.settings, await loadSettings());
    assert.deepEqual(await loadSettings(), { variables: [], targets: [], trigger: '/' });
  });
});

test('export waits for a queued import and captures the persisted messages and settings together', async () => {
  await withBackground({ [STORAGE_KEY]: [], [HAS_INITIALIZED_KEY]: true }, async () => {
    const settings = { variables: [variable('Assinatura', 'Persisted')], targets: [], trigger: '/' };
    const importing = mergeImportedTemplates([], [reply], [], [{ id: 'support', name: 'Suporte' }], settings, await loadSettings());
    const exporting = browser.runtime.sendMessage({ action: 'TEMPLATE_STORAGE', operation: 'export' });
    await importing;
    const response = await exporting;
    assert.equal(response.success, true);
    assert.deepEqual(response.backup.settings, settings);
    assert.equal(response.backup.templates[0].content, reply.content);
    assert.deepEqual(response.backup.tags, [{ id: 'support', name: 'Suporte' }]);
  });
});

test('malformed and future backup settings are rejected before any write', () => {
  const backup = { format: 'octablaster', version: 2, templates: [], tags: [], settings: { variables: [], targets: [], trigger: '/' } };
  for (const settings of [undefined, {}, { ...backup.settings, trigger: '?' }, { ...backup.settings, variables: [null] }, { ...backup.settings, targets: 'invalid' }]) {
    assert.throws(() => parseTemplateBackup(JSON.stringify({ ...backup, settings })));
  }
  assert.throws(() => parseTemplateBackup(JSON.stringify({ ...backup, version: 999 })));
});

test('backup conflicts leave messages, tags and every setting unchanged', async () => {
  await withBackground({ [STORAGE_KEY]: [], [HAS_INITIALIZED_KEY]: true, [VARIABLES_KEY]: [variable('A')] }, async storage => {
    await loadStoredTemplates();
    const base = await loadSettings();
    await saveVariables([variable('A', 'latest')], base.variables);
    const before = structuredClone(storage.data);
    await assert.rejects(mergeImportedTemplates([], [reply], [], [{ id: 'support', name: 'Suporte' }],
      { ...base, variables: [variable('A', 'imported')], trigger: '/' }, base), /outro painel/);
    assert.deepEqual(storage.data, before);
    // A template conflict must not apply the settings part either.
    storage.data[STORAGE_KEY] = [{ ...reply, content: 'latest content', tags: [] }];
    const after = structuredClone(storage.data);
    await assert.rejects(mergeImportedTemplates([reply], [{ ...reply, content: 'imported' }], [reply], [{ id: 'support', name: 'Suporte' }],
      { ...await loadSettings(), trigger: '/' }, await loadSettings()), /outro painel/);
    assert.deepEqual(storage.data, after);
  });
});
