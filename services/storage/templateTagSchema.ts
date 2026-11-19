import type { QuickReplyTemplate } from '@/types/template';
import { normalizeHexColor } from './settingsSchema';

export interface TemplateTag {
  id: string;
  name: string;
  color?: string;
}

export const TAGS_KEY = 'octablaster_tags';

export const TAG_COLOR_PRESETS: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Azul', color: '#1971c2' },
  { name: 'Esmeralda', color: '#2b8a3e' },
  { name: 'Âmbar', color: '#e67700' },
  { name: 'Laranja', color: '#d9480f' },
  { name: 'Rosa', color: '#c2255c' },
  { name: 'Vermelho', color: '#c92a2a' },
  { name: 'Violeta', color: '#7c3aed' },
  { name: 'Ardósia', color: '#495057' },
];

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
    const tag: TemplateTag = { id, name };
    if (item?.color !== undefined && item?.color !== null && String(item.color).trim() !== '') {
      const color = normalizeHexColor(item.color);
      if (!color) throw new Error(`Cor inválida para a tag ${name}.`);
      tag.color = color;
    }
    return tag;
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

export function getTemplateTags(template: QuickReplyTemplate, tags: TemplateTag[]): TemplateTag[] {
  return getTemplateTagIds(template, tags)
    .map(id => tags.find(tag => tag.id === id))
    .filter((tag): tag is TemplateTag => tag !== undefined);
}

export function getTemplateTagNames(template: QuickReplyTemplate, tags: TemplateTag[]): string[] {
  return getTemplateTags(template, tags).map(tag => tag.name);
}

export function applyTemplateTags(template: QuickReplyTemplate, tags: TemplateTag[], ids: string[]): QuickReplyTemplate {
  const result = { ...template, tags: [...new Set(ids)] };
  const first = tags.find(tag => tag.id === result.tags[0]);
  if (first) result.category = first.name;
  else delete result.category;
  return result;
}

