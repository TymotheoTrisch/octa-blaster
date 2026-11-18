import { RESERVED_VARIABLE_NAME as reserved, type TemplateVariable, type ReplySettings } from '../storage/settingsSchema';
import { loadSettings, saveSettings } from '../storage/settingsStorage';
import { resolveVariables } from './templateResolver';
import { promptForVariableValues } from './variablePromptModal';

export async function loadVariables(): Promise<TemplateVariable[]> {
  return (await loadSettings()).variables;
}

export async function saveVariables(variables: TemplateVariable[], base?: TemplateVariable[]): Promise<TemplateVariable[]> {
  return (await saveSettings({ variables }, base ? { variables: base } : undefined)).variables;
}

export async function loadShortcutTrigger(): Promise<ReplySettings['trigger']> {
  return (await loadSettings()).trigger;
}

export async function saveShortcutTrigger(trigger: ReplySettings['trigger'], base?: ReplySettings['trigger']): Promise<void> {
  await saveSettings({ trigger }, base === undefined ? undefined : { trigger: base });
}
export async function loadReplySettings(): Promise<ReplySettings> {
  const { variables, trigger } = await loadSettings();
  return { variables, trigger };
}
export async function saveReplySettings(
  settings: ReplySettings,
  base?: ReplySettings,
): Promise<void> {
  await saveSettings(settings, base);
}
export function findVariableNames(text: string): string[] {
  const names = new Map<string, string>();
  for (const match of text.matchAll(
    /\{\{\s*([^{}]+?)\s*\}\}|\{\s*([^{}]+?)\s*\}/g,
  )) {
    const name = (match[1] || match[2] || '').trim();
    if (!reserved.test(name)) names.set(name.toLocaleLowerCase('pt-BR'), name);
  }
  return [...names.values()];
}
export function applyCustomVariables(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(
    /\{\{\s*([^{}]+?)\s*\}\}|\{\s*([^{}]+?)\s*\}/g,
    (tag, doubleName, singleName) => {
      const name = (doubleName || singleName).trim().toLocaleLowerCase('pt-BR');
      return Object.hasOwn(values, name) ? values[name]! : tag;
    },
  );
}

export async function prepareTemplate(
  text: string,
  doc: Document = document,
): Promise<string | null> {
  const { variables } = await loadReplySettings();
  const values: Record<string, string> = Object.create(null);
  const pending: string[] = [];
  for (const name of findVariableNames(text)) {
    const normalized = name.toLocaleLowerCase('pt-BR');
    const variable = variables.find(
      (item) => item.name.toLocaleLowerCase('pt-BR') === normalized,
    );
    if (variable?.mode === 'saved' && variable.value.trim())
      values[normalized] = variable.value;
    else pending.push(name);
  }
  if (pending.length) {
    const entered = await promptForVariableValues(doc, pending);
    if (!entered) return null;
    Object.assign(values, entered);
  }
  return applyCustomVariables(resolveVariables(text), values);
}
