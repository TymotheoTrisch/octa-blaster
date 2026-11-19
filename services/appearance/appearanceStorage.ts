import {
  DEFAULT_APPEARANCE,
  validateAppearance,
  type AppearanceSettings,
} from '@/services/storage/settingsSchema';
import { loadSettings, saveSettings } from '@/services/storage/settingsStorage';
import { writeCachedAppearance } from './themeTokens';

export async function loadAppearance(): Promise<AppearanceSettings> {
  const settings = await loadSettings();
  const appearance = settings.appearance ? validateAppearance(settings.appearance) : { ...DEFAULT_APPEARANCE };
  writeCachedAppearance(appearance);
  return appearance;
}

export async function saveAppearance(
  appearance: AppearanceSettings,
  base?: AppearanceSettings,
): Promise<AppearanceSettings> {
  const clean = validateAppearance(appearance);
  const cleanBase = base === undefined ? undefined : validateAppearance(base);
  const saved = await saveSettings(
    { appearance: clean },
    cleanBase ? { appearance: cleanBase } : undefined,
  );
  const next = saved.appearance ? validateAppearance(saved.appearance) : clean;
  writeCachedAppearance(next);
  return next;
}
