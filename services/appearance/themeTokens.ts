import {
  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  DEFAULT_BRAND_COLOR,
  normalizeHexColor,
  validateAppearance,
  type AppearanceSettings,
  type ThemeMode,
} from '@/services/storage/settingsSchema';

export type ResolvedTheme = 'light' | 'dark';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface BrandPalette {
  accent: string;
  accentHover: string;
  accentBorder: string;
  accentText: string;
  accentRing: string;
  accentSoft: string;
  accentSoftHover: string;
  accentSoftBorder: string;
  accentSoftText: string;
  accentGlow: string;
}

const APPEARANCE_CACHE_KEY = 'octablaster_appearance_cache';

export function hexToRgb(hex: string): RgbColor {
  const normalized = normalizeHexColor(hex) ?? DEFAULT_BRAND_COLOR;
  const int = Number.parseInt(normalized.slice(1), 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map(channel => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

function mixRgb(source: RgbColor, target: RgbColor, ratio: number): RgbColor {
  const t = Math.max(0, Math.min(1, ratio));
  return {
    r: source.r + (target.r - source.r) * t,
    g: source.g + (target.g - source.g) * t,
    b: source.b + (target.b - source.b) * t,
  };
}

export function relativeLuminance(rgb: RgbColor): number {
  const linearize = (channel: number) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function pickContrastForeground(bgHex: string): '#1c1b1c' | '#ffffff' {
  return contrastRatio(bgHex, '#1c1b1c') >= contrastRatio(bgHex, '#ffffff')
    ? '#1c1b1c'
    : '#ffffff';
}

function ensureMinimumContrast(
  baseHex: string,
  surfaceHex: string,
  targetRgb: RgbColor,
  minContrast: number,
): string {
  if (contrastRatio(baseHex, surfaceHex) >= minContrast) return baseHex;
  const source = hexToRgb(baseHex);
  for (let step = 1; step <= 20; step += 1) {
    const candidate = rgbToHex(mixRgb(source, targetRgb, step / 20));
    if (contrastRatio(candidate, surfaceHex) >= minContrast) {
      return candidate;
    }
  }
  return rgbToHex(targetRgb);
}

export function computeBrandPalette(
  rawColor: string,
  resolvedTheme: ResolvedTheme,
  rawSecondaryColor?: string,
): BrandPalette {
  const accent = normalizeHexColor(rawColor) ?? DEFAULT_BRAND_COLOR;
  const rgb = hexToRgb(accent);
  const lum = relativeLuminance(rgb);
  const isVeryDark = lum < 0.08;

  const hoverRgb = isVeryDark
    ? mixRgb(rgb, { r: 255, g: 255, b: 255 }, 0.14)
    : mixRgb(rgb, { r: 0, g: 0, b: 0 }, 0.08);

  const borderRgb = isVeryDark
    ? mixRgb(rgb, { r: 255, g: 255, b: 255 }, 0.22)
    : mixRgb(rgb, { r: 0, g: 0, b: 0 }, 0.13);

  const softText = resolvedTheme === 'dark'
    ? ensureMinimumContrast(accent, '#1e1e21', { r: 244, g: 244, b: 245 }, 4.5)
    : ensureMinimumContrast(accent, '#ffffff', { r: 28, g: 27, b: 28 }, 4.5);

  const secondaryColor = normalizeHexColor(rawSecondaryColor)
    ?? (resolvedTheme === 'dark' ? '#18181b' : '#ffffff');

  const rgba = (alpha: number) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;

  return {
    accent,
    accentHover: rgbToHex(hoverRgb),
    accentBorder: rgbToHex(borderRgb),
    accentText: secondaryColor,
    accentRing: rgba(0.25),
    accentSoft: rgba(resolvedTheme === 'dark' ? 0.2 : 0.14),
    accentSoftHover: rgba(resolvedTheme === 'dark' ? 0.28 : 0.22),
    accentSoftBorder: rgba(resolvedTheme === 'dark' ? 0.48 : 0.42),
    accentSoftText: softText,
    accentGlow: rgba(0.35),
  };
}

export function computeTagBadgeVars(rawColor?: string): Record<string, string> | undefined {
  const hex = normalizeHexColor(rawColor);
  if (!hex) return undefined;
  const rgb = hexToRgb(hex);
  const lightText = ensureMinimumContrast(hex, '#ffffff', { r: 28, g: 27, b: 28 }, 4.5);
  const darkText = ensureMinimumContrast(hex, '#202024', { r: 244, g: 244, b: 245 }, 4.5);
  const rgba = (alpha: number) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;

  return {
    '--tag-bg-light': rgba(0.14),
    '--tag-border-light': rgba(0.36),
    '--tag-text-light': lightText,
    '--tag-bg-dark': rgba(0.22),
    '--tag-border-dark': rgba(0.45),
    '--tag-text-dark': darkText,
  };
}

export function resolveThemeMode(theme: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (theme === 'dark') return 'dark';
  if (theme === 'light') return 'light';
  return prefersDark ? 'dark' : 'light';
}

export function resolveLogoInnerColor(
  appearance: AppearanceSettings,
  prefersDark = getSystemPrefersDark(),
): string {
  const normalizedInner = normalizeHexColor(appearance.logoInnerColor);
  if (normalizedInner) return normalizedInner;
  return resolveThemeMode(appearance.theme, prefersDark) === 'dark' ? '#18181b' : '#ffffff';
}

export function getSystemPrefersDark(): boolean {
  try {
    return Boolean(globalThis.window?.matchMedia?.('(prefers-color-scheme: dark)')?.matches);
  } catch {
    return false;
  }
}

export function applyAppearanceToRoot(
  target: HTMLElement | null | undefined,
  appearance: AppearanceSettings,
  prefersDark = getSystemPrefersDark(),
): ResolvedTheme {
  const safe = (() => {
    try {
      return validateAppearance(appearance);
    } catch {
      return { ...DEFAULT_APPEARANCE };
    }
  })();
  const resolved = resolveThemeMode(safe.theme, prefersDark);
  if (!target) return resolved;

  const logoInner = resolveLogoInnerColor(safe, prefersDark);
  const palette = computeBrandPalette(safe.brandColor, resolved, logoInner);
  target.dataset.theme = resolved;
  target.dataset.themePreference = safe.theme;
  target.dataset.brandColor = palette.accent;
  target.dataset.logoInnerColor = safe.logoInnerColor ?? '';
  target.style.colorScheme = resolved;

  const vars: Record<string, string> = {
    '--accent': palette.accent,
    '--accent-hover': palette.accentHover,
    '--accent-border': palette.accentBorder,
    '--accent-text': palette.accentText,
    '--accent-ring': palette.accentRing,
    '--accent-soft': palette.accentSoft,
    '--accent-soft-hover': palette.accentSoftHover,
    '--accent-soft-border': palette.accentSoftBorder,
    '--accent-soft-text': palette.accentSoftText,
    '--accent-glow': palette.accentGlow,
    '--logo-inner': logoInner,
    '--q-accent': palette.accent,
    '--q-accent-hover': palette.accentHover,
    '--border-focus': palette.accent,
  };

  for (const [name, value] of Object.entries(vars)) {
    target.style.setProperty(name, value);
  }

  return resolved;
}

export function readCachedAppearance(): AppearanceSettings {
  try {
    const raw = globalThis.localStorage?.getItem(APPEARANCE_CACHE_KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    return validateAppearance(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function writeCachedAppearance(appearance: AppearanceSettings): void {
  try {
    const clean = validateAppearance(appearance);
    globalThis.localStorage?.setItem(APPEARANCE_CACHE_KEY, JSON.stringify(clean));
  } catch {}
}

export function watchAppearanceChanges(
  onUpdate: (appearance: AppearanceSettings | null, prefersDark: boolean) => void,
): () => void {
  const cleanups: Array<() => void> = [];

  try {
    const media = globalThis.window?.matchMedia?.('(prefers-color-scheme: dark)');
    if (media?.addEventListener) {
      const handleMedia = (event: MediaQueryListEvent) => {
        onUpdate(null, event.matches);
      };
      media.addEventListener('change', handleMedia);
      cleanups.push(() => media.removeEventListener('change', handleMedia));
    }
  } catch {}

  try {
    const storageEvents = (globalThis as any).browser?.storage?.onChanged;
    if (storageEvents?.addListener) {
      const handleStorage = (
        changes: Record<string, { newValue?: unknown }>,
        areaName: string,
      ) => {
        if (areaName !== 'local' || !Object.hasOwn(changes, APPEARANCE_KEY)) return;
        try {
          const next = changes[APPEARANCE_KEY]?.newValue
            ? validateAppearance(changes[APPEARANCE_KEY].newValue)
            : { ...DEFAULT_APPEARANCE };
          writeCachedAppearance(next);
          onUpdate(next, getSystemPrefersDark());
        } catch {
          onUpdate({ ...DEFAULT_APPEARANCE }, getSystemPrefersDark());
        }
      };
      storageEvents.addListener(handleStorage);
      cleanups.push(() => storageEvents.removeListener?.(handleStorage));
    }
  } catch {}

  return () => {
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {}
    }
  };
}
