import { rawStorageSet } from './rawStorage';
import { loadStoredTemplatesLocal, loadTagsLocal, STORAGE_KEY } from './templateStorage';
import { TAGS_KEY, validateTags, getTemplateTagIds, applyTemplateTags, type TemplateTag } from './templateTagSchema';

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
