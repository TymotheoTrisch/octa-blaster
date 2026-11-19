import type { MentionTarget } from '@/types/template';

export const VARIABLES_KEY = 'octablaster_variables';
export const SHORTCUT_KEY = 'octablaster_shortcut';
export interface TemplateVariable {
  name: string;
  value: string;
  mode: 'saved' | 'prompt';
}
export interface ReplySettings {
  variables: TemplateVariable[];
  trigger: '\\' | '/' | '';
}
export const RESERVED_VARIABLE_NAME = /^(sauda[cç][aã]o|data|hora)$/i;
export function validateVariables(
  variables: TemplateVariable[],
): TemplateVariable[] {
  const names = new Set<string>();
  if (!Array.isArray(variables)) throw new Error('Lista de variáveis inválida.');
  return variables.map((variable) => {
    if (!variable || typeof variable.name !== 'string') throw new Error('Variável inválida.');
    const name = variable.name.trim();
    const normalized = name.toLocaleLowerCase('pt-BR');
    if (!/^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*$/.test(name) || RESERVED_VARIABLE_NAME.test(name))
      throw new Error(`Nome de variável inválido ou reservado: ${name}`);
    if (names.has(normalized)) throw new Error(`Variável repetida: ${name}`);
    if (!['saved', 'prompt'].includes(variable.mode))
      throw new Error('Modo de variável inválido.');
    names.add(normalized);
    return { name, value: String(variable.value || ''), mode: variable.mode };
  });
}
export const MENTION_TARGETS_STORAGE_KEY = 'octablaster_mention_targets';

export const DEFAULT_MENTION_TARGETS: MentionTarget[] = [
  {
    id: 'jorge_tigre',
    name: 'Jorge Tigre',
    query: '@Jorge',
    pattern: '^jorge\\s+tigre$',
    enabled: true,
  },
  {
    id: 'roberto_renck',
    name: 'Roberto Renck',
    query: '@roberto',
    pattern: '^roberto\\s+renck$',
    enabled: true,
  },
];

export function mentionNamePattern(name: string): string {
  return name.split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
}

export function mentionExactNamePattern(name: string): string {
  return `^${mentionNamePattern(name)}$`;
}

export function validateMentionTargets(raw: unknown): MentionTarget[] {
  if (!Array.isArray(raw)) throw new Error('A lista de técnicos é inválida.');
  const ids = new Set<string>();
  return raw.map(item => {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    const name: string = typeof item?.name === 'string' ? item.name.trim() : '';
    let query = typeof item?.query === 'string' ? item.query.trim() : '';
    if (!id || !name) throw new Error('Informe o nome do técnico.');
    if (ids.has(id)) throw new Error('Há técnicos com identificadores repetidos.');
    ids.add(id);
    if (!query) query = name;
    if (!query.startsWith('@')) query = `@${query}`;
    const derivedPattern = mentionExactNamePattern(name);
    const pattern = typeof item.pattern === 'string' && item.pattern.trim() ? item.pattern : derivedPattern;
    try {
      new RegExp(pattern, 'i');
    } catch {
      throw new Error(`Padrão de identificação inválido para ${name}.`);
    }
    return { id, name, query, pattern, enabled: item.enabled !== false };
  });
}

export interface SettingsSnapshot extends ReplySettings {
  targets: MentionTarget[];
}

export function validateSettingsPatch(raw: unknown): Partial<SettingsSnapshot> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Configurações inválidas.');
  const value = raw as Record<string, unknown>;
  const clean: Partial<SettingsSnapshot> = {};
  if (Object.hasOwn(value, 'variables')) {
    if (!Array.isArray(value.variables)) throw new Error('Lista de variáveis inválida.');
    clean.variables = validateVariables(value.variables);
  }
  if (Object.hasOwn(value, 'targets')) clean.targets = validateMentionTargets(value.targets);
  if (Object.hasOwn(value, 'trigger')) {
    if (value.trigger !== '\\' && value.trigger !== '/' && value.trigger !== '') throw new Error('Atalho inválido.');
    clean.trigger = value.trigger;
  }
  return clean;
}

export function validateSettingsSnapshot(raw: unknown): SettingsSnapshot {
  const clean = validateSettingsPatch(raw);
  if (!clean.variables || !clean.targets || clean.trigger === undefined) throw new Error('O backup está incompleto nas configurações.');
  return clean as SettingsSnapshot;
}

