import { loadStoredTemplates } from './templateStorage';
import { applyCustomVariables, loadReplySettings, prepareTemplate } from './templateVariables';
import { resolveVariables } from './templateResolver';
import { insertTextIntoElement } from './insertText';
import { getScopedTicketContainer, getTicketIdentity } from './licenseDetector';
import type { QuickReplyTemplate } from '@/types/template';

interface EditorQuery {
  query: string;
  start: number;
  end: number;
  range?: Range;
}
export function matchShortcut(
  text: string,
  trigger: string,
): { query: string; start: number; end: number } | null {
  if (!trigger) return null;
  const start = text.lastIndexOf(trigger);
  if (start < 0 || (start > 0 && !/\s/.test(text[start - 1]!))) return null;
  const query = text.slice(start + 1);
  if (/[\r\n\\/]/.test(query)) return null;
  return { query, start, end: text.length };
}
function isTextInput(
  editor: HTMLElement,
): editor is HTMLTextAreaElement | HTMLInputElement {
  return editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT';
}
function readQuery(editor: HTMLElement, trigger: string): EditorQuery | null {
  if (isTextInput(editor)) {
    if (editor.selectionStart !== editor.selectionEnd) return null;
    return matchShortcut(
      editor.value.slice(0, editor.selectionStart ?? 0),
      trigger,
    );
  }
  const selection = editor.ownerDocument.getSelection();
  if (
    !selection?.isCollapsed ||
    !selection.rangeCount ||
    !editor.contains(selection.anchorNode)
  )
    return null;
  const caret = selection.getRangeAt(0);
  const prefix = caret.cloneRange();
  let endNode = caret.endContainer;
  if (endNode.nodeType === 1 && caret.endOffset > 0) {
    endNode = endNode.childNodes[caret.endOffset - 1] || endNode;
    while (endNode.lastChild) endNode = endNode.lastChild;
  }
  const anchor =
    endNode.nodeType === 1 ? (endNode as HTMLElement) : endNode.parentElement;
  const block = anchor?.closest<HTMLElement>('p, div, li');
  const lineRoot = block && editor.contains(block) ? block : editor;
  prefix.selectNodeContents(lineRoot);
  prefix.setEnd(caret.endContainer, caret.endOffset);
  for (const br of lineRoot.querySelectorAll('br')) {
    if (prefix.intersectsNode(br)) prefix.setStartAfter(br);
  }
  const match = matchShortcut(prefix.toString(), trigger);
  if (!match) return null;
  const range = caret.cloneRange();
  const walker = editor.ownerDocument.createTreeWalker(lineRoot, 4);
  const nodes: Node[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (prefix.intersectsNode(node)) nodes.push(node);
  }
  let remaining = match.end - match.start;
  for (const textNode of nodes.reverse()) {
    const end =
      textNode === caret.endContainer
        ? caret.endOffset
        : textNode.textContent?.length || 0;
    if (remaining <= end) {
      range.setStart(textNode, end - remaining);
      return { ...match, range };
    }
    remaining -= end;
  }
  return null;
}
export function installReplyShortcut(
  doc: Document,
  isEditor: (el: HTMLElement) => boolean,
  isCurrent: (el: HTMLElement) => boolean,
): void {
  let menu: HTMLDivElement | null = null;
  let editor: HTMLElement | null = null;
  let currentQuery: EditorQuery | null = null;
  let choices: QuickReplyTemplate[] = [];
  let previews = new Map<string, string>();
  let selected = 0;
  let generation = 0;
  let choosing = false;
  const close = () => {
    generation++;
    menu?.remove();
    menu = null;
    currentQuery = null;
  };
  async function choose(index: number) {
    const template = choices[index];
    const target = editor;
    const query = currentQuery;
    if (!template || !target || !query || choosing) return;
    choosing = true;
    const scope = getScopedTicketContainer(target);
    const identity = scope ? getTicketIdentity(scope) : '';
    const snapshot = isTextInput(target) ? target.value : target.innerHTML;
    close();
    try {
      const content = await prepareTemplate(template.content, doc);
      if (
        content === null ||
        !scope ||
        getScopedTicketContainer(target) !== scope ||
        getTicketIdentity(scope) !== identity ||
        !isCurrent(target) ||
        snapshot !== (isTextInput(target) ? target.value : target.innerHTML)
      )
        return;
      if (isTextInput(target)) target.setSelectionRange(query.start, query.end);
      else if (
        query.range &&
        target.contains(query.range.startContainer) &&
        target.contains(query.range.endContainer)
      ) {
        const selection = doc.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(query.range);
      } else return;
      insertTextIntoElement(target, content, crypto.randomUUID(), true);
    } catch (error) {
      console.warn('[OctaBlaster] Falha ao usar resposta:', error);
    } finally {
      choosing = false;
    }
  }
  function updateSelection() {
    if (!menu) return;
    menu.querySelectorAll<HTMLElement>('[role="option"]').forEach((button, index) => {
      button.setAttribute('aria-selected', String(index === selected));
      button.style.background = index === selected ? '#fff0b3' : 'white';
    });
    const preview = menu.querySelector<HTMLElement>('.octablaster-shortcut-preview');
    const template = choices[selected];
    if (preview && template) preview.textContent = previews.get(template.id) || template.content;
  }
  function render() {
    if (!menu) return;
    menu.replaceChildren();
    if (!choices.length) {
      menu.textContent = 'Nenhuma resposta encontrada';
      return;
    }
    const list = doc.createElement('div');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Respostas rápidas');
    list.style.cssText = 'max-height:180px;overflow:auto';
    choices.forEach((template, index) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = template.title;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(selected === index));
      button.style.cssText = `display:block;width:100%;text-align:left;padding:9px;border:0;border-radius:4px;color:#222;background:${selected === index ? '#fff0b3' : 'white'};cursor:pointer`;
      button.addEventListener('mouseenter', () => {
        selected = index;
        updateSelection();
      });
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void choose(index);
      });
      list.append(button);
    });
    const preview = doc.createElement('div');
    preview.className = 'octablaster-shortcut-preview';
    preview.setAttribute('aria-label', 'Prévia da mensagem');
    preview.setAttribute('aria-live', 'polite');
    preview.style.cssText = 'border-top:1px solid #ddd;margin-top:6px;padding:10px 5px;max-height:150px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.5;color:#444';
    menu.append(list, preview);
    updateSelection();
  }
  doc.addEventListener(
    'input',
    async (event) => {
      if (choosing || (event as InputEvent).isComposing) return;
      const target = event.target as HTMLElement;
      if (!target || !isEditor(target)) {
        close();
        return;
      }
      const version = ++generation;
      try {
        const settings = await loadReplySettings();
        if (version !== generation) return;
        const query = readQuery(target, settings.trigger);
        if (!query) {
          close();
          return;
        }
        const templates = await loadStoredTemplates();
        if (version !== generation || !isCurrent(target)) return;
        editor = target;
        currentQuery = query;
        selected = 0;
        choices = templates
          .filter((template) =>
            template.title
              .toLocaleLowerCase('pt-BR')
              .includes(query.query.toLocaleLowerCase('pt-BR')),
          )
          .slice(0, 12);
        const savedValues = Object.fromEntries(settings.variables
          .filter(variable => variable.mode === 'saved' && variable.value.trim())
          .map(variable => [variable.name.toLocaleLowerCase('pt-BR'), variable.value]));
        previews = new Map(choices.map(template => [template.id, applyCustomVariables(resolveVariables(template.content), savedValues)]));
        menu?.remove();
        menu = doc.createElement('div');
        menu.className = 'octablaster-shortcut-menu';
        menu.setAttribute('role', 'region');
        menu.setAttribute('aria-label', 'Respostas rápidas');
        const rect =
          query.range?.getBoundingClientRect() ||
          target.getBoundingClientRect();
        const width = doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 380;
        const height = doc.documentElement.clientHeight || doc.defaultView?.innerHeight || 600;
        const menuWidth = Math.min(360, width - 16);
        const menuHeight = Math.min(380, height - 16);
        menu.style.cssText = `position:fixed;left:${Math.max(8, Math.min(rect.left, width - menuWidth - 8))}px;top:${Math.max(8, Math.min(rect.bottom + 4, height - menuHeight - 8))}px;z-index:2147483646;width:${menuWidth}px;max-height:${menuHeight}px;overflow:auto;border:1px solid #aaa;border-radius:8px;background:white;color:#222;padding:6px;box-shadow:0 4px 16px #0003;font:14px system-ui`;
        doc.body.append(menu);
        render();
      } catch {
        close();
      }
    },
    true,
  );
  doc.addEventListener(
    'keydown',
    (event) => {
      if (!menu || event.isComposing) return;
      if (
        !editor ||
        (event.target !== editor && !editor.contains(event.target as Node)) ||
        !isCurrent(editor)
      ) {
        close();
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
        if (
          ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'].includes(event.key)
        )
          close();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key === 'Enter') {
        void choose(selected);
        return;
      }
      if (choices.length)
        selected =
          (selected + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) %
          choices.length;
      updateSelection();
      menu
        .querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest' });
    },
    true,
  );
  doc.addEventListener(
    'mousedown',
    (event) => {
      if (menu && !menu.contains(event.target as Node)) close();
    },
    true,
  );
  doc.addEventListener(
    'focusin',
    (event) => {
      if (
        menu &&
        event.target !== editor &&
        !menu.contains(event.target as Node)
      )
        close();
    },
    true,
  );
}
