import type { QuickReplyTemplate } from '@/types/template';
import { loadStoredTemplates } from '../storage/templateStorage';
import { getTemplateTags, type TemplateTag } from '../storage/templateTagSchema';
import { loadTags } from '../storage/templateTags';
import { computeTagBadgeVars } from '@/services/appearance/themeTokens';

export async function loadReplyList(): Promise<{ templates: QuickReplyTemplate[]; tags: TemplateTag[] }> {
  const [templates, tags] = await Promise.all([loadStoredTemplates(), loadTags()]);
  return { templates, tags };
}

function ensureReplyListStyles(doc: Document): void {
  if (doc.getElementById('octablaster-reply-list-styles')) return;
  const style = doc.createElement('style');
  style.id = 'octablaster-reply-list-styles';
  style.textContent = `
    .octa-dropdown-item {
      display: block !important;
      box-sizing: border-box !important;
      width: 100% !important;
      text-align: left !important;
      background: var(--octa-bg, #fff) !important;
      border: none !important;
      border-bottom: 1px solid var(--octa-border-divider, #eee) !important;
      padding: 10px 12px !important;
      cursor: pointer !important;
      font: inherit !important;
    }
    .octa-dropdown-item:last-child { border-bottom: none !important; }
    .octa-dropdown-item:hover { background: var(--octa-bg-hover, #f1f2f4) !important; }
    .octa-dropdown-item[aria-selected="true"] { background: var(--accent-soft, #fff0b3) !important; }
    .octa-item-header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 6px !important;
    }
    .octa-item-title {
      min-width: 0 !important;
      font-weight: 600 !important;
      color: var(--octa-text, #1c1b1c) !important;
      display: block !important;
      font-size: 12px !important;
    }
    .octa-item-category {
      font-size: 10px !important;
      background: var(--octa-badge-bg, #f1f2f4) !important;
      color: var(--octa-badge-text, #5b5f63) !important;
      padding: 1px 6px !important;
      border-radius: 4px !important;
      font-weight: 500 !important;
      white-space: nowrap !important;
      flex-shrink: 0 !important;
    }
    .octa-item-category.octa-item-category-colored {
      background: var(--tag-bg-light) !important;
      border: 1px solid var(--tag-border-light) !important;
      color: var(--tag-text-light) !important;
      font-weight: 600 !important;
    }
    [data-octa-scope="true"][data-theme="dark"] .octa-item-category.octa-item-category-colored {
      background: var(--tag-bg-dark) !important;
      border-color: var(--tag-border-dark) !important;
      color: var(--tag-text-dark) !important;
    }
    .octa-item-preview {
      display: block !important;
      font-size: 11px !important;
      color: var(--octa-text-muted, #5b5f63) !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      margin-top: 2px !important;
    }
  `;
  (doc.head || doc.documentElement).append(style);
}

export function createReplyListItem(doc: Document, template: QuickReplyTemplate, tags: TemplateTag[]): HTMLButtonElement {
  ensureReplyListStyles(doc);
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'octa-dropdown-item';
  const header = doc.createElement('div');
  header.className = 'octa-item-header';
  const title = doc.createElement('span');
  title.className = 'octa-item-title';
  title.textContent = template.title;
  header.append(title);
  for (const tag of getTemplateTags(template, tags)) {
    const badge = doc.createElement('span');
    badge.className = 'octa-item-category';
    const vars = computeTagBadgeVars(tag.color);
    if (vars) {
      badge.classList.add('octa-item-category-colored');
      for (const [name, value] of Object.entries(vars)) {
        badge.style.setProperty(name, value);
      }
    }
    badge.textContent = tag.name;
    header.append(badge);
  }
  const preview = doc.createElement('div');
  preview.className = 'octa-item-preview';
  preview.textContent = template.content.replace(/\n/g, ' ');
  button.append(header, preview);
  return button;
}
