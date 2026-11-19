import { rawStorageGet } from '@/services/storage/rawStorage';
import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  validateAppearance,
  type AppearanceSettings,
} from '@/services/storage/settingsSchema';
import {
  applyAppearanceToRoot,
  getSystemPrefersDark,
  watchAppearanceChanges,
} from './themeTokens';

const INPAGE_THEME_STYLE_ID = 'octablaster-inpage-theme-tokens';

export function ensureInpageThemeTokens(doc: Document): void {
  if (doc.getElementById(INPAGE_THEME_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = INPAGE_THEME_STYLE_ID;
  style.textContent = `
    [data-octa-scope="true"] {
      --octa-bg: #ffffff;
      --octa-bg-secondary: #f7f8f9;
      --octa-bg-hover: #f1f2f4;
      --octa-bg-hover-strong: #eceef0;
      --octa-bg-input: #ffffff;
      --octa-text: #1c1b1c;
      --octa-text-secondary: #3c3f43;
      --octa-text-muted: #5b5f63;
      --octa-border: #dee0e4;
      --octa-border-strong: #3c3f43;
      --octa-border-divider: #eeeeee;
      --octa-badge-bg: #f1f2f4;
      --octa-badge-text: #5b5f63;
      --octa-scroll-track: #f7f8f9;
      --octa-scroll-thumb: #cbd5e1;
      --octa-scroll-thumb-hover: #94a3b8;
      --octa-danger: #ba1a1a;
      --octa-shadow-popover: 0 4px 20px rgba(0, 0, 0, 0.14), 0 1px 3px rgba(0, 0, 0, 0.06);
      --octa-shadow-modal: 0 12px 32px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.08);
      --octa-backdrop: rgba(15, 15, 15, 0.45);
      --accent: #ffc600;
      --accent-hover: #f0ba00;
      --accent-border: #e0af00;
      --accent-text: #1c1b1c;
      --accent-ring: rgba(255, 198, 0, 0.28);
      --accent-soft: rgba(255, 198, 0, 0.22);
      --accent-soft-hover: rgba(255, 198, 0, 0.3);
      --accent-soft-text: #6f5600;
      --accent-glow: rgba(255, 198, 0, 0.35);
    }
    [data-octa-scope="true"][data-theme="dark"] {
      --octa-bg: #202024;
      --octa-bg-secondary: #1a1a1e;
      --octa-bg-hover: #2c2c32;
      --octa-bg-hover-strong: #323239;
      --octa-bg-input: #141417;
      --octa-text: #f4f4f5;
      --octa-text-secondary: #d4d4d8;
      --octa-text-muted: #a1a1aa;
      --octa-border: #2e2e34;
      --octa-border-strong: #42424a;
      --octa-border-divider: #27272d;
      --octa-badge-bg: rgba(255, 255, 255, 0.08);
      --octa-badge-text: #d4d4d8;
      --octa-scroll-track: #1a1a1e;
      --octa-scroll-thumb: #3f3f46;
      --octa-scroll-thumb-hover: #52525b;
      --octa-danger: #f87171;
      --octa-shadow-popover: 0 8px 24px rgba(0, 0, 0, 0.45), 0 1px 4px rgba(0, 0, 0, 0.25);
      --octa-shadow-modal: 0 14px 36px rgba(0, 0, 0, 0.55);
      --octa-backdrop: rgba(0, 0, 0, 0.65);
    }
  `;
  (doc.head || doc.documentElement).append(style);
}

async function readStoredAppearanceSafe(): Promise<AppearanceSettings> {
  try {
    const data = await rawStorageGet([APPEARANCE_KEY]);
    return data[APPEARANCE_KEY]
      ? validateAppearance(data[APPEARANCE_KEY])
      : { ...DEFAULT_APPEARANCE };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function bindInpageAppearance(target: HTMLElement): () => void {
  const doc = target.ownerDocument || document;
  ensureInpageThemeTokens(doc);
  target.dataset.octaScope = 'true';

  let current: AppearanceSettings = { ...DEFAULT_APPEARANCE };
  let disposed = false;

  applyAppearanceToRoot(target, current, getSystemPrefersDark());

  void readStoredAppearanceSafe().then((loaded) => {
    if (disposed) return;
    current = loaded;
    applyAppearanceToRoot(target, current, getSystemPrefersDark());
  });

  const stopWatching = watchAppearanceChanges((nextAppearance, prefersDark) => {
    if (disposed || !target.isConnected) {
      cleanup();
      return;
    }
    if (nextAppearance) current = nextAppearance;
    applyAppearanceToRoot(target, current, prefersDark);
  });

  function cleanup() {
    if (disposed) return;
    disposed = true;
    stopWatching();
  }

  return cleanup;
}
