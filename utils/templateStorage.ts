import { rawStorageGet, rawStorageSet } from './storage';
import type { QuickReplyTemplate } from '@/types/template';
import { applyTemplateTags, getTemplateTagIds, includeLegacyTags, TAGS_KEY, validateTags, type TemplateTag } from './templateTagSchema';
import { loadSettingsLocal, prepareSettingsSaveLocal } from './settingsStorage';
import { validateSettingsSnapshot, type SettingsSnapshot } from './settingsSchema';

export const STORAGE_KEY = 'octablaster_quick_replies_v2';
export const HAS_INITIALIZED_KEY = 'octablaster_initialized_v2';
export const DEFAULTS_STATE_KEY = 'octablaster_defaults_state';
const DEFAULTS_VERSION = 1;
const LEGACY_DEFAULT_IDS = ['inatividade-2-4', 'inatividade-6', 'saudacao-geral', 'solicitacao-prints'];

const LEGACY_INACTIVITY_CONTENTS: Record<string, string> = {
  'inatividade-2-4':
    '{{Saudacao}}\n\nAlgum retorno sobre este ticket? Caso contrário o mesmo será encerrado.',
  'inatividade-6':
    '{{Saudacao}}\n\nNão recebemos retorno do último e-mail enviado e não havendo mais interações neste canal de atendimento, estaremos marcando este ticket como resolvido. Caso tenha alguma novidade sobre o assunto, basta responder este e-mail que reabriremos o caso.',
};

export const DEFAULT_TEMPLATES: QuickReplyTemplate[] = [
  {
    id: 'inatividade-2-4',
    title: 'Cobrança de Retorno (2º e 4º dia)',
    content:
      '{{Saudacao}}\n\nGostaria de verificar se há algum retorno ou atualização sobre este ticket. Fico no aguardo da sua resposta.',
    category: 'Inatividade',
    updatedAt: 1700000000001,
  },
  {
    id: 'inatividade-6',
    title: 'Encerramento por Falta de Retorno (6º dia)',
    content:
      '{{Saudacao}}\n\nComo não tivemos retorno ao nosso último e-mail, vamos marcar este ticket como resolvido por enquanto.\n\nMas não se preocupe! Se tiver alguma novidade ou precisar continuar tratando desse assunto, basta responder a este e-mail que reabriremos o atendimento para dar continuidade.',
    category: 'Inatividade',
    updatedAt: 1700000000001,
  },
  {
    id: 'saudacao-geral',
    title: 'Saudação e Em Análise',
    content: '{{Saudacao}} Tudo bem?\n\nRecebemos sua solicitação e já estamos analisando o caso.\nEm breve entraremos em contato com mais detalhes.',
    category: 'Geral',
    updatedAt: 1700000000000,
  },
  {
    id: 'solicitacao-prints',
    title: 'Solicitação de Prints / Evidências',
    content: '{{Saudacao}}\n\nPara que possamos prosseguir com o diagnóstico, poderia nos enviar:\n1. Print ou gravação da tela com a mensagem de erro;\n2. O passo a passo exato para reproduzir o problema;\n3. O horário aproximado em que ocorreu.\n\nFicamos no aguardo!',
    category: 'Suporte',
    updatedAt: 1700000000000,
  },
];

/**
 * Sanitiza um único modelo, garantindo campos obrigatórios e eliminando `undefined`
 * para compatibilidade absoluta com a serialização do storage do navegador.
 */
export function sanitizeTemplate(raw: any): QuickReplyTemplate | null {
  if (!raw || typeof raw !== 'object') return null;

  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const content = typeof raw.content === 'string' ? raw.content.trim() : '';
  if (!title || !content) return null;

  const id = typeof raw.id === 'string' && raw.id.trim()
    ? raw.id.trim()
    : (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);

  const category = typeof raw.category === 'string' ? raw.category.trim() : '';
  const updatedAt = typeof raw.updatedAt === 'number' && !isNaN(raw.updatedAt)
    ? raw.updatedAt
    : Date.now();

  const clean: QuickReplyTemplate = {
    id,
    title,
    content,
    updatedAt,
  };

  // Define categoria somente se preenchida para nunca enviar undefined ao storage
  if (category) {
    clean.category = category;
  }
  if (Array.isArray(raw.tags)) {
    clean.tags = [...new Set<string>(raw.tags.filter((id: unknown): id is string => typeof id === 'string' && !!id.trim()).map((id: string) => id.trim()))];
  }

  return clean;
}

/**
 * Sanitiza uma lista completa de modelos, desfazendo Proxies do Vue 3 e eliminando
 * valores inválidos ou propriedades com undefined.
 */
export function sanitizeTemplatesList(rawList: any[]): QuickReplyTemplate[] {
  if (!Array.isArray(rawList)) return [];
  const result: QuickReplyTemplate[] = [];

  for (const item of rawList) {
    const clean = sanitizeTemplate(item);
    if (clean) {
      result.push(clean);
    }
  }

  // Desfaz referências circulares e proxies do Vue (POJO puro)
  return JSON.parse(JSON.stringify(result));
}

/**
 * Carrega todos os modelos armazenados. Inicializa com os padrões na primeira execução.
 */
export async function loadStoredTemplatesLocal(throwOnError = false): Promise<QuickReplyTemplate[]> {
  try {
    const data = await rawStorageGet([STORAGE_KEY, HAS_INITIALIZED_KEY, DEFAULTS_STATE_KEY]);
    const stored = data[STORAGE_KEY] as any[] | undefined;
    const initialized = Boolean(data[HAS_INITIALIZED_KEY]);

    if (!initialized && (!stored || stored.length === 0)) {
      const initial = sanitizeTemplatesList(DEFAULT_TEMPLATES);
      await rawStorageSet({
        [STORAGE_KEY]: initial,
        [DEFAULTS_STATE_KEY]: { version: DEFAULTS_VERSION, seenIds: DEFAULT_TEMPLATES.map(t => t.id) },
        [HAS_INITIALIZED_KEY]: true,
      });
      return initial;
    }

    if (Array.isArray(stored)) {
      const sanitized = sanitizeTemplatesList(stored);
      let migrated = false;
      const defaultMap = new Map(DEFAULT_TEMPLATES.map((t) => [t.id, t]));

      const updated = sanitized.map((item) => {
        const legacyContent = LEGACY_INACTIVITY_CONTENTS[item.id];
        const nextDefault = defaultMap.get(item.id);
        if (legacyContent && nextDefault && item.content === legacyContent) {
          migrated = true;
          return {
            ...item,
            content: nextDefault.content,
            updatedAt: nextDefault.updatedAt,
          };
        }
        return item;
      });

      const state = data[DEFAULTS_STATE_KEY];
      const seenIds = new Set<string>(Array.isArray(state?.seenIds) ? state.seenIds : LEGACY_DEFAULT_IDS);
      for (const template of DEFAULT_TEMPLATES) {
        if (!seenIds.has(template.id) && !updated.some(item => item.id === template.id)) {
          updated.push({ ...template });
          migrated = true;
        }
        seenIds.add(template.id);
      }
      if (migrated || !state || state.version !== DEFAULTS_VERSION || seenIds.size !== state.seenIds?.length) {
        await rawStorageSet({
          [STORAGE_KEY]: updated,
          [DEFAULTS_STATE_KEY]: { version: DEFAULTS_VERSION, seenIds: [...seenIds] },
        });
      }
      return updated;
    }

    return [];
  } catch (err) {
    console.error('[OctaBlaster] Falha crítica ao carregar modelos:', err);
    if (throwOnError) throw err;
    return sanitizeTemplatesList(DEFAULT_TEMPLATES);
  }
}

/**
 * Persiste a lista completa de modelos com sanitização rigorosa.
 */
export async function saveStoredTemplatesLocal(
  templates: QuickReplyTemplate[],
  base?: QuickReplyTemplate[],
  importedCatalog?: TemplateTag[],
  additionalItems: Record<string, unknown> = {},
): Promise<QuickReplyTemplate[]> {
  let cleanList = sanitizeTemplatesList(templates);
  if (base) {
    const current = await loadStoredTemplatesLocal(true);
    const baseMap = new Map(sanitizeTemplatesList(base).map(template => [template.id, template]));
    const proposedMap = new Map(cleanList.map(template => [template.id, template]));
    const currentMap = new Map(current.map(template => [template.id, template]));
    const changedIds = new Set([...baseMap.keys(), ...proposedMap.keys()]);

    for (const id of changedIds) {
      const original = baseMap.get(id);
      const proposed = proposedMap.get(id);
      if (JSON.stringify(original) === JSON.stringify(proposed)) continue;

      const latest = currentMap.get(id);
      if (JSON.stringify(latest) !== JSON.stringify(original) && JSON.stringify(latest) !== JSON.stringify(proposed)) {
        throw new Error('Este modelo foi alterado em outro painel. Reabra o popup para carregar a versão atual antes de salvar.');
      }
      if (proposed) currentMap.set(id, proposed);
      else currentMap.delete(id);
    }
    const baseOrder = [...baseMap.keys()].filter(id => proposedMap.has(id));
    const proposedOrder = [...proposedMap.keys()].filter(id => baseMap.has(id));
    const wasReordered = baseOrder.some((id, index) => id !== proposedOrder[index]);
    let orderedIds: string[];
    if (wasReordered) {
      orderedIds = [...new Set([...proposedMap.keys(), ...currentMap.keys()])];
    } else {
      // Uma edição de texto com uma lista antiga preserva a ordem mais recente.
      orderedIds = current.map(template => template.id).filter(id => currentMap.has(id));
      cleanList.forEach((template, index) => {
        if (currentMap.has(template.id) && !orderedIds.includes(template.id)) {
          orderedIds.splice(Math.min(index, orderedIds.length), 0, template.id);
        }
      });
    }
    cleanList = [];
    for (const id of orderedIds) {
      const template = currentMap.get(id);
      if (template) cleanList.push(template);
    }
  }
  const data = await rawStorageGet([DEFAULTS_STATE_KEY, TAGS_KEY]);
  const state = data[DEFAULTS_STATE_KEY];
  const seenIds = new Set<string>(Array.isArray(state?.seenIds) ? state.seenIds : LEGACY_DEFAULT_IDS);
  for (const template of DEFAULT_TEMPLATES) {
    if (!seenIds.has(template.id) && !cleanList.some(item => item.id === template.id)) cleanList.push({ ...template });
    seenIds.add(template.id);
  }
  const catalog = includeLegacyTags(cleanList, importedCatalog ?? validateTags(data[TAGS_KEY] ?? []));
  cleanList = cleanList.map(template => {
    if (!Array.isArray(template.tags)) return template;
    if (template.tags.some(id => !catalog.some(tag => tag.id === id))) {
      throw new Error('Uma tag da mensagem foi removida. Abra a edição novamente para escolher as tags atuais.');
    }
    return applyTemplateTags(template, catalog, template.tags);
  });
  await rawStorageSet({
    ...additionalItems,
    [TAGS_KEY]: catalog,
    [DEFAULTS_STATE_KEY]: { version: DEFAULTS_VERSION, seenIds: [...seenIds] },
    [STORAGE_KEY]: cleanList,
    [HAS_INITIALIZED_KEY]: true,
  });
  return cleanList;
}

// O background serializa migrações e gravações entre popup, sidebar e frames.
export async function loadStoredTemplates(): Promise<QuickReplyTemplate[]> {
  if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
    const response = await browser.runtime.sendMessage({ action: 'TEMPLATE_STORAGE', operation: 'load' });
    if (!response?.success) throw new Error(response?.error || 'Falha ao carregar modelos.');
    return response.templates;
  }
  return loadStoredTemplatesLocal();
}

export async function saveStoredTemplates(
  templates: QuickReplyTemplate[],
  base?: QuickReplyTemplate[],
): Promise<QuickReplyTemplate[]> {
  if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
    const response = await browser.runtime.sendMessage({
      action: 'TEMPLATE_STORAGE',
      operation: 'save',
      templates: sanitizeTemplatesList(templates),
      base: base ? sanitizeTemplatesList(base) : undefined,
    });
    if (!response?.success) throw new Error(response?.error || 'Falha ao salvar modelos.');
    return response.templates;
  }
  return saveStoredTemplatesLocal(templates, base);
}

/**
 * Restaura os modelos de fábrica mantendo modelos personalizados criados pelo usuário.
 */
export async function resetToDefaultTemplates(
  currentTemplates: QuickReplyTemplate[],
  base: QuickReplyTemplate[] = currentTemplates,
): Promise<QuickReplyTemplate[]> {
  const defaultIds = new Set(DEFAULT_TEMPLATES.map((t) => t.id));
  const userTemplates = currentTemplates.filter((t) => !defaultIds.has(t.id));
  const combined = [...DEFAULT_TEMPLATES, ...userTemplates];
  return await saveStoredTemplates(combined, base);
}

/**
 * Carrega o catálogo e expõe categorias legadas como tags.
 */
export async function loadTagsLocal(): Promise<TemplateTag[]> {
  const data = await rawStorageGet([TAGS_KEY]);
  const stored = validateTags(data[TAGS_KEY] ?? []);
  const tags = includeLegacyTags(await loadStoredTemplatesLocal(true), stored);
  if (JSON.stringify(tags) !== JSON.stringify(stored)) await rawStorageSet({ [TAGS_KEY]: tags });
  return tags;
}

/** Obtém o backup dos dados persistidos dentro da fila do background. */
export async function createTemplateBackupLocal() {
  const templates = await loadStoredTemplatesLocal(true);
  const tags = await loadTagsLocal();
  const cleanList = sanitizeTemplatesList(templates).map(template => applyTemplateTags(template, tags, getTemplateTagIds(template, tags)));
  const settings = await loadSettingsLocal();
  return { format: 'octablaster', version: 2, templates: cleanList, tags, settings };
}

export async function exportTemplatesToJson(): Promise<void> {
  let backup;
  if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
    const response = await browser.runtime.sendMessage({ action: 'TEMPLATE_STORAGE', operation: 'export' });
    if (!response?.success) throw new Error(response?.error || 'Falha ao exportar backup.');
    backup = response.backup;
  } else backup = await createTemplateBackupLocal();
  const dataStr = JSON.stringify(backup, null, 2);
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `octablaster-templates-${dateStr}.json`;

  const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
  const a = document.createElement('a');
  a.href = dataUri;
  a.download = filename;
  a.style.display = 'none';

  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    try {
      if (a.parentNode) {
        document.body.removeChild(a);
      }
    } catch {}
  }, 1000);
}

/**
 * Processa e valida texto JSON importado pelo usuário.
 */
export function parseTemplatesFromJson(jsonText: string): QuickReplyTemplate[] {
  return parseTemplateBackup(jsonText).templates;
}

export function parseTemplateBackup(jsonText: string): { templates: QuickReplyTemplate[]; tags: TemplateTag[]; settings?: SettingsSnapshot } {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Arquivo JSON inválido ou corrompido.');
  }

  const legacy = Array.isArray(parsed);
  if (!legacy && (parsed?.format !== 'octablaster' || ![1, 2].includes(parsed.version) || !Array.isArray(parsed.templates))) {
    throw new Error('O arquivo deve conter um backup do OctaBlaster ou uma lista de modelos.');
  }
  const tags = legacy ? [] : validateTags(parsed.tags ?? []);
  const validItems = sanitizeTemplatesList(legacy ? parsed : parsed.templates);
  if (validItems.length === 0 && (legacy || parsed.templates.length > 0)) {
    throw new Error('Nenhum modelo válido encontrado no arquivo JSON.');
  }

  if (!legacy && validItems.some(template => template.tags?.some(id => !tags.some(tag => tag.id === id)))) {
    throw new Error('O backup contém referências a tags ausentes no catálogo.');
  }
  const settings = !legacy && parsed.version === 2 ? validateSettingsSnapshot(parsed.settings) : undefined;
  return settings ? { templates: validItems, tags, settings } : { templates: validItems, tags };
}

/**
 * Mescla modelos importados com os existentes, substituindo duplicidades de ID
 * e adicionando novos itens no topo.
 */
export async function mergeImportedTemplates(
  current: QuickReplyTemplate[],
  incoming: QuickReplyTemplate[],
  base: QuickReplyTemplate[] = current,
  incomingTags: TemplateTag[] = [],
  settings?: SettingsSnapshot,
  settingsBase?: SettingsSnapshot,
): Promise<{ count: number; merged: QuickReplyTemplate[] }> {
  if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
    const response = await browser.runtime.sendMessage({
      action: 'TEMPLATE_STORAGE', operation: 'import',
      current: sanitizeTemplatesList(current), incoming: sanitizeTemplatesList(incoming),
      base: sanitizeTemplatesList(base), tags: validateTags(incomingTags), settings, settingsBase,
    });
    if (!response?.success) throw new Error(response?.error || 'Falha ao importar modelos.');
    return { count: response.count, merged: response.merged };
  }
  return mergeImportedTemplatesLocal(current, incoming, base, incomingTags, settings, settingsBase);
}

export async function mergeImportedTemplatesLocal(
  current: QuickReplyTemplate[],
  incoming: QuickReplyTemplate[],
  base: QuickReplyTemplate[],
  incomingTags: TemplateTag[],
  settings?: SettingsSnapshot,
  settingsBase?: SettingsSnapshot,
): Promise<{ count: number; merged: QuickReplyTemplate[] }> {
  const settingsItems = settings === undefined ? {} : await prepareSettingsSaveLocal(validateSettingsSnapshot(settings), settingsBase);
  const catalog = await loadTagsLocal();
  const importedIds = new Map<string, string>();
  for (const tag of validateTags(incomingTags)) {
    const existing = catalog.find(item => item.name.toLocaleLowerCase('pt-BR') === tag.name.toLocaleLowerCase('pt-BR'));
    if (existing) {
      importedIds.set(tag.id, existing.id);
      continue;
    }
    const id = catalog.some(item => item.id === tag.id) ? crypto.randomUUID() : tag.id;
    catalog.push({ id, name: tag.name });
    importedIds.set(tag.id, id);
  }
  const map = new Map<string, QuickReplyTemplate>();

  // Adiciona itens existentes
  for (const t of current) {
    map.set(t.id, t);
  }

  // Mescla os novos (preservando ordem e atualizando)
  let count = 0;
  for (const item of incoming) {
    const template = Array.isArray(item.tags)
      ? { ...item, tags: item.tags.map(id => importedIds.get(id) || id) }
      : item;
    map.set(item.id, template);
    count++;
  }

  const merged = Array.from(map.values());
  const saved = await saveStoredTemplatesLocal(merged, base, catalog, settingsItems);
  return { count, merged: saved };
}
