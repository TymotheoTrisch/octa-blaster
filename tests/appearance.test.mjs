import test from 'node:test';
import assert from 'node:assert/strict';
import { installStorage, installDom } from './helpers.mjs';
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  DEFAULT_BRAND_COLOR,
  normalizeHexColor,
  validateAppearance,
  validateSettingsSnapshot,
} from '../services/storage/settingsSchema.ts';
import { loadSettings } from '../services/storage/settingsStorage.ts';
import {
  applyAppearanceToRoot,
  computeBrandPalette,
  contrastRatio,
  resolveThemeMode,
} from '../services/appearance/themeTokens.ts';
import { loadAppearance, saveAppearance } from '../services/appearance/appearanceStorage.ts';
import {
  exportTemplatesToJson,
  mergeImportedTemplates,
  parseTemplateBackup,
  STORAGE_KEY,
  HAS_INITIALIZED_KEY,
} from '../services/storage/templateStorage.ts';

async function withBackground(initial, run) {
  const storage = installStorage(initial);
  const previous = globalThis.defineBackground;
  let listener;
  globalThis.defineBackground = setup => setup;
  browser.tabs = { onRemoved: { addListener() {} } };
  browser.runtime = {
    id: 'test-extension',
    onMessage: { addListener(fn) { listener = fn; } },
    sendMessage(message) {
      return new Promise(resolve => listener(message, { id: 'test-extension' }, resolve));
    },
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

test('normalizeHexColor and validateAppearance sanitize valid colors and reject invalid values', () => {
  assert.equal(normalizeHexColor('#FC0'), '#ffcc00');
  assert.equal(normalizeHexColor('  1971C2 '), '#1971c2');
  assert.equal(normalizeHexColor('#12345'), null);
  assert.equal(normalizeHexColor('yellow'), null);

  assert.deepEqual(
    validateAppearance({ theme: 'dark', brandColor: '#AbC' }),
    { theme: 'dark', brandColor: '#aabbcc' },
  );
  assert.throws(() => validateAppearance({ theme: 'neon', brandColor: '#ffc600' }), /Tema/);
  assert.throws(() => validateAppearance({ theme: 'light', brandColor: 'not-a-color' }), /Cor/);
});

test('computeBrandPalette guarantees accessible foreground and soft-text contrast across light and dark modes', () => {
  const yellowLight = computeBrandPalette(DEFAULT_BRAND_COLOR, 'light');
  assert.equal(yellowLight.accent, '#ffc600');
  assert.equal(yellowLight.accentText, '#1c1b1c');
  assert.ok(contrastRatio(yellowLight.accentSoftText, '#ffffff') >= 4.5);

  const blueDark = computeBrandPalette('#1971c2', 'dark');
  assert.equal(blueDark.accentText, '#ffffff');
  assert.ok(contrastRatio(blueDark.accentSoftText, '#1e1e21') >= 4.5);

  const charcoalDark = computeBrandPalette('#1c1b1c', 'dark');
  assert.equal(charcoalDark.accentText, '#ffffff');
  assert.notEqual(charcoalDark.accentHover, '#1c1b1c');
  assert.ok(contrastRatio(charcoalDark.accentSoftText, '#1e1e21') >= 4.5);
});

test('resolveThemeMode and applyAppearanceToRoot apply data-theme and CSS custom properties', () => {
  assert.equal(resolveThemeMode('system', true), 'dark');
  assert.equal(resolveThemeMode('system', false), 'light');
  assert.equal(resolveThemeMode('light', true), 'light');
  assert.equal(resolveThemeMode('dark', false), 'dark');

  const dom = installDom('<html><body></body></html>');
  try {
    const resolved = applyAppearanceToRoot(
      dom.document.documentElement,
      { theme: 'system', brandColor: '#1971c2' },
      true,
    );
    assert.equal(resolved, 'dark');
    assert.equal(dom.document.documentElement.dataset.theme, 'dark');
    assert.equal(dom.document.documentElement.dataset.themePreference, 'system');
    assert.equal(dom.document.documentElement.dataset.brandColor, '#1971c2');
    assert.equal(dom.document.documentElement.style.getPropertyValue('--accent'), '#1971c2');
    assert.equal(dom.document.documentElement.style.getPropertyValue('--accent-text'), '#ffffff');
  } finally {
    dom.restore();
  }
});

test('appearanceStorage persists preferences via background queue and detects conflicts across panels', async () => {
  await withBackground({}, async storage => {
    assert.deepEqual(await loadAppearance(), DEFAULT_APPEARANCE);

    const saved = await saveAppearance(
      { theme: 'dark', brandColor: '#10b981' },
      DEFAULT_APPEARANCE,
    );
    assert.deepEqual(saved, { theme: 'dark', brandColor: '#10b981' });
    assert.deepEqual(storage.data[APPEARANCE_KEY], { theme: 'dark', brandColor: '#10b981' });

    await assert.rejects(
      saveAppearance({ theme: 'light', brandColor: '#ef4444' }, DEFAULT_APPEARANCE),
      /outro painel/,
    );
    assert.deepEqual(await loadAppearance(), { theme: 'dark', brandColor: '#10b981' });
  });
});

test('v2 backups preserve appearance when present and stay backward compatible when omitted', async () => {
  const legacyV2 = validateSettingsSnapshot({ variables: [], targets: [], trigger: '/' });
  assert.equal(legacyV2.appearance, undefined);

  const dom = installDom();
  try {
    await withBackground(
      {
        [STORAGE_KEY]: [],
        [HAS_INITIALIZED_KEY]: true,
        [APPEARANCE_KEY]: { theme: 'dark', brandColor: '#7c3aed' },
      },
      async storage => {
        let download;
        dom.window.HTMLAnchorElement.prototype.click = function () {
          download = this.href;
          this.remove();
        };
        await exportTemplatesToJson();
        const json = decodeURIComponent(download.slice(download.indexOf(',') + 1));
        const backup = parseTemplateBackup(json);
        assert.deepEqual(backup.settings.appearance, { theme: 'dark', brandColor: '#7c3aed' });

        storage.data[APPEARANCE_KEY] = { theme: 'light', brandColor: '#ffc600' };
        await mergeImportedTemplates([], backup.templates, [], backup.tags, backup.settings, await loadSettings());
        assert.deepEqual(await loadAppearance(), { theme: 'dark', brandColor: '#7c3aed' });
      },
    );
  } finally {
    dom.restore();
  }
});
