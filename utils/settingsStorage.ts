import { rawStorageGet, rawStorageSet } from './storage';
import { VARIABLES_KEY, SHORTCUT_KEY, MENTION_TARGETS_STORAGE_KEY, DEFAULT_MENTION_TARGETS, validateVariables, validateMentionTargets, validateSettingsPatch, type TemplateVariable, type SettingsSnapshot } from './settingsSchema';

export async function loadSettingsLocal(): Promise<SettingsSnapshot> {
  const data = await rawStorageGet([VARIABLES_KEY, SHORTCUT_KEY, MENTION_TARGETS_STORAGE_KEY]);
  return {
    variables: validateVariables(data[VARIABLES_KEY] ?? []),
    targets: validateMentionTargets(data[MENTION_TARGETS_STORAGE_KEY] ?? DEFAULT_MENTION_TARGETS),
    trigger: data[SHORTCUT_KEY] === '/' || data[SHORTCUT_KEY] === '' ? data[SHORTCUT_KEY] : '\\',
  };
}

function mergeCollection<T>(proposed: T[], base: T[], latest: T[], key: (item: T) => string, label: string): T[] {
  const original = new Map(base.map(item => [key(item), item]));
  const next = new Map(proposed.map(item => [key(item), item]));
  const current = new Map(latest.map(item => [key(item), item]));
  for (const id of new Set([...original.keys(), ...next.keys()])) {
    if (JSON.stringify(original.get(id)) === JSON.stringify(next.get(id))) continue;
    if (JSON.stringify(current.get(id)) !== JSON.stringify(original.get(id)) && JSON.stringify(current.get(id)) !== JSON.stringify(next.get(id))) {
      throw new Error(`${label} alterado em outro painel. Reabra a tela para carregar os dados atuais antes de salvar.`);
    }
    if (next.has(id)) current.set(id, next.get(id)!);
    else current.delete(id);
  }
  return [...current.values()];
}

// Prepara todos os campos antes de gravar, também para uma importação completa.
export async function prepareSettingsSaveLocal(raw: Partial<SettingsSnapshot>, rawBase?: Partial<SettingsSnapshot>): Promise<Record<string, unknown>> {
  const proposed = validateSettingsPatch(raw);
  const base = rawBase === undefined ? undefined : validateSettingsPatch(rawBase);
  const latest = await loadSettingsLocal();
  const items: Record<string, unknown> = {};
  if (proposed.variables) {
    items[VARIABLES_KEY] = validateVariables(base?.variables
      ? mergeCollection<TemplateVariable>(proposed.variables, base.variables, latest.variables, item => item.name.toLocaleLowerCase('pt-BR'), 'Cadastro de variáveis')
      : proposed.variables);
  }
  if (proposed.targets) {
    items[MENTION_TARGETS_STORAGE_KEY] = validateMentionTargets(base?.targets
      ? mergeCollection(proposed.targets, base.targets, latest.targets, item => item.id, 'Cadastro de técnicos')
      : proposed.targets);
  }
  if (proposed.trigger !== undefined) {
    if (base?.trigger !== undefined && proposed.trigger !== base.trigger && latest.trigger !== base.trigger && latest.trigger !== proposed.trigger) {
      throw new Error('O atalho foi alterado em outro painel. Reabra a tela antes de salvar.');
    }
    // Uma tela antiga sem mudança no atalho preserva a alteração mais recente.
    items[SHORTCUT_KEY] = base?.trigger === proposed.trigger ? latest.trigger : proposed.trigger;
  }
  return items;
}

export async function saveSettingsLocal(settings: Partial<SettingsSnapshot>, base?: Partial<SettingsSnapshot>): Promise<SettingsSnapshot> {
  const items = await prepareSettingsSaveLocal(settings, base);
  await rawStorageSet(items);
  return loadSettingsLocal();
}

export async function loadSettings(): Promise<SettingsSnapshot> {
  if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
    const response = await browser.runtime.sendMessage({ action: 'SETTINGS_STORAGE', operation: 'load' });
    if (!response?.success) throw new Error(response?.error || 'Falha ao carregar configurações.');
    return response.settings;
  }
  return loadSettingsLocal();
}

let localQueue: Promise<unknown> = Promise.resolve();
export async function saveSettings(settings: Partial<SettingsSnapshot>, base?: Partial<SettingsSnapshot>): Promise<SettingsSnapshot> {
  const clean = validateSettingsPatch(settings);
  const cleanBase = base === undefined ? undefined : validateSettingsPatch(base);
  if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
    const response = await browser.runtime.sendMessage({ action: 'SETTINGS_STORAGE', operation: 'save', settings: clean, base: cleanBase });
    if (!response?.success) throw new Error(response?.error || 'Falha ao salvar configurações.');
    return response.settings;
  }
  const task = localQueue.then(() => saveSettingsLocal(clean, cleanBase));
  localQueue = task.catch(() => {});
  return task;
}
