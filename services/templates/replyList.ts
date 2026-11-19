import type { QuickReplyTemplate } from '@/types/template';
import { loadStoredTemplates } from '../storage/templateStorage';
import { getTemplateTagNames, type TemplateTag } from '../storage/templateTagSchema';
import { loadTags } from '../storage/templateTags';

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
      background: #fff !important;
      border: none !important;
      border-bottom: 1px solid #eee !important;
      padding: 10px 12px !important;
      cursor: pointer !important;
      font: inherit !important;
    }
    .octa-dropdown-item:last-child { border-bottom: none !important; }
    .octa-dropdown-item:hover { background: #f1f2f4 !important; }
    .octa-dropdown-item[aria-selected="true"] { background: #fff0b3 !important; }
    .octa-item-header {
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 6px !important;
    }
    .octa-item-title {
      min-width: 0 !important;
      font-weight: 600 !important;
      color: #1c1b1c !important;
      display: block !important;
      font-size: 12px !important;
    }
    .octa-item-category {
      font-size: 10px !important;
      background: #f1f2f4 !important;
      color: #5b5f63 !important;
      padding: 1px 6px !important;
      border-radius: 4px !important;
      font-weight: 500 !important;
      white-space: nowrap !important;
      flex-shrink: 0 !important;
    }
    .octa-item-preview {
      display: block !important;
      font-size: 11px !important;
      color: #5b5f63 !important;
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
  for (const name of getTemplateTagNames(template, tags)) {
    const badge = doc.createElement('span');
    badge.className = 'octa-item-category';
    badge.textContent = name;
    header.append(badge);
  }
  const preview = doc.createElement('div');
  preview.className = 'octa-item-preview';
  preview.textContent = template.content.replace(/\n/g, ' ');
  button.append(header, preview);
  return button;
}
