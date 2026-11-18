import type { QuickReplyTemplate } from '@/types/template';
import { loadStoredTemplatesLocal, rawStorageGet, rawStorageSet, STORAGE_KEY } from './templateStorage';

export interface TemplateTag {
  id: string;
  name: string;
}

export const TAGS_KEY = 'octablaster_tags';

export function validateTags(raw: unknown): TemplateTag[] {
  if (!Array.isArray(raw)) throw new Error('A lista de tags é inválida.');
  const ids = new Set<string>();
  const names = new Set<string>();
  return raw.map(item => {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    const normalized = name.toLocaleLowerCase('pt-BR');
    if (!id || !name) throw new Error('Informe o nome da tag.');
    if (ids.has(id) || names.has(normalized)) throw new Error(`Tag repetida: ${name}`);
    ids.add(id);
    names.add(normalized);
    return { id, name };
  });
}

export function includeLegacyTags(templates: QuickReplyTemplate[], tags: TemplateTag[]): TemplateTag[] {
  const result = tags.map(tag => ({ ...tag }));
  for (const template of templates) {
    if (Array.isArray(template.tags) || !template.category?.trim()) continue;
    const name = template.category.trim();
    const normalized = name.toLocaleLowerCase('pt-BR');
    if (result.some(tag => tag.name.toLocaleLowerCase('pt-BR') === normalized)) continue;
    let id = `legacy-${encodeURIComponent(normalized)}`;
    if (result.some(tag => tag.id === id)) id = crypto.randomUUID();
    result.push({ id, name });
  }
  return result;
}

export function getTemplateTagIds(template: QuickReplyTemplate, tags: TemplateTag[]): string[] {
  if (Array.isArray(template.tags)) return template.tags.filter(id => tags.some(tag => tag.id === id));
  const category = template.category?.trim().toLocaleLowerCase('pt-BR');
  const tag = tags.find(item => item.name.toLocaleLowerCase('pt-BR') === category);
  return tag ? [tag.id] : [];
}

export function getTemplateTagNames(template: QuickReplyTemplate, tags: TemplateTag[]): string[] {
  return getTemplateTagIds(template, tags).map(id => tags.find(tag => tag.id === id)!.name);
}

export function applyTemplateTags(template: QuickReplyTemplate, tags: TemplateTag[], ids: string[]): QuickReplyTemplate {
  const result = { ...template, tags: [...new Set(ids)] };
  const first = tags.find(tag => tag.id === result.tags[0]);
  if (first) result.category = first.name;
  else delete result.category;
  return result;
}

export async function loadTagsLocal(): Promise<TemplateTag[]> {
  const data = await rawStorageGet([TAGS_KEY]);
  const stored = validateTags(data[TAGS_KEY] ?? []);
  const tags = includeLegacyTags(await loadStoredTemplatesLocal(true), stored);
  if (JSON.stringify(tags) !== JSON.stringify(stored)) await rawStorageSet({ [TAGS_KEY]: tags });
  return tags;
}

export async function saveTagsLocal(raw: TemplateTag[], base?: TemplateTag[]): Promise<TemplateTag[]> {
  let tags = validateTags(raw);
  const previous = await loadTagsLocal();
  if (base) {
    const original = new Map(validateTags(base).map(tag => [tag.id, tag]));
    const proposed = new Map(tags.map(tag => [tag.id, tag]));
    const current = new Map(previous.map(tag => [tag.id, tag]));
    for (const id of new Set([...original.keys(), ...proposed.keys()])) {
      if (JSON.stringify(original.get(id)) === JSON.stringify(proposed.get(id))) continue;
      if (JSON.stringify(current.get(id)) !== JSON.stringify(original.get(id)) &&
        JSON.stringify(current.get(id)) !== JSON.stringify(proposed.get(id))) {
        throw new Error('Esta tag foi alterada em outro painel. Volte e abra a central de tags novamente.');
      }
      const tag = proposed.get(id);
      if (tag) current.set(id, tag);
      else current.delete(id);
    }
    tags = validateTags([...current.values()]);
  }
  const templates = await loadStoredTemplatesLocal(true);
  const updated = templates.map(template => {
    const ids = getTemplateTagIds(template, previous).filter(id => tags.some(tag => tag.id === id));
    return applyTemplateTags(template, tags, ids);
  });
  await rawStorageSet({ [TAGS_KEY]: tags, [STORAGE_KEY]: updated });
  return tags;
}

export async function loadTags(): Promise<TemplateTag[]> {
  if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
    const response = await browser.runtime.sendMessage({ action: 'TAG_CATALOG', operation: 'load' });
    if (!response?.success) throw new Error(response?.error || 'Falha ao carregar tags.');
    return response.tags;
  }
  return loadTagsLocal();
}

export async function saveTags(tags: TemplateTag[], base?: TemplateTag[]): Promise<TemplateTag[]> {
  const clean = validateTags(tags);
  if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
    const response = await browser.runtime.sendMessage({ action: 'TAG_CATALOG', operation: 'save', tags: clean, base });
    if (!response?.success) throw new Error(response?.error || 'Falha ao salvar tags.');
    return response.tags;
  }
  return saveTagsLocal(clean, base);
}
