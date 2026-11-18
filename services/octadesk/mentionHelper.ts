import { mentionNamePattern } from '../storage/settingsSchema';
import {
  getScopedTicketContainer,
  getTicketIdentity,
  isInTicketScope,
  isTicketElementVisible,
} from './licenseDetector';
import { insertTextIntoElement } from './insertText';
import { loadSettings, saveSettings } from '../storage/settingsStorage';
import { readTicketLicenseRequest, formatLicenseRequest } from './licenseRequest';
import type { MentionTarget } from '@/types/template';

const MENTION_WAIT_MS = 15_000;

export async function loadMentionTargets(): Promise<MentionTarget[]> {
  return (await loadSettings()).targets;
}

export async function saveMentionTargets(targets: MentionTarget[], base?: MentionTarget[]): Promise<void> {
  await saveSettings({ targets }, base ? { targets: base } : undefined);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDOMElement(val: unknown): val is HTMLElement {
  return !!(
    val &&
    typeof val === 'object' &&
    'nodeType' in val &&
    (val as Node).nodeType === 1
  );
}

function getTicketSearchRoots(scope: Document | HTMLElement): HTMLElement[] {
  const initial = isDOMElement(scope)
    ? scope
    : getScopedTicketContainer(
        (scope.activeElement as HTMLElement) || scope.body,
      );
  if (!initial) return [];
  const ticket = getScopedTicketContainer(initial);
  if (!ticket) return [];
  const roots: HTMLElement[] = [initial];
  for (let index = 0; index < roots.length; index++) {
    for (const frame of roots[index]!.querySelectorAll<HTMLIFrameElement>(
      'iframe',
    )) {
      try {
        const body = frame.contentDocument?.body;
        if (
          body &&
          getScopedTicketContainer(frame) === ticket &&
          getScopedTicketContainer(body) === ticket &&
          !roots.includes(body)
        )
          roots.push(body);
      } catch {
        /* Frames sem acesso nesta origem ficam fora da busca. */
      }
    }
  }
  return roots;
}

function isInternalNoteLabel(el: HTMLElement): boolean {
  const label = (el.getAttribute('aria-label') || el.textContent || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return /^(anotacao(?:\s+interna)?|nota\s+interna)$/.test(label);
}

const NOTE_CONTROLS =
  '[role="tab"], .nav-comments li, .subarea-tabs li, .nav-tabs li, .nav-comments a, .subarea-tabs a, .nav-tabs a, nav a, button, a[ng-click*="commentTypeSelected"]';

function getInternalNoteControls(scope: Document | HTMLElement): HTMLElement[] {
  const controls: HTMLElement[] = [];
  for (const root of getTicketSearchRoots(scope)) {
    const ticket = getScopedTicketContainer(root);
    for (const el of root.querySelectorAll<HTMLElement>(NOTE_CONTROLS)) {
      if (getScopedTicketContainer(el) !== ticket || !isElementVisible(el))
        continue;
      const angularAction = /commentTypeSelected\s*=\s*3\b/.test(
        el.getAttribute('ng-click') || '',
      );
      const angularCondition = /commentTypeSelected\s*===?\s*3\b/.test(
        el.getAttribute('ng-class') || '',
      );
      if (isInternalNoteLabel(el) || angularAction || angularCondition)
        controls.push(el);
    }
  }
  return controls;
}

/** Confirma a aba selecionada dentro do ticket e de seus frames acessíveis. */
export function isInternalNoteTabActive(
  scope: Document | HTMLElement = document,
): boolean {
  for (const control of getInternalNoteControls(scope)) {
    const tab = control.closest<HTMLElement>('[role="tab"], li') || control;
    if (
      control.getAttribute('aria-selected') === 'true' ||
      tab.getAttribute('aria-selected') === 'true' ||
      control.classList.contains('active') ||
      tab.classList.contains('active')
    )
      return true;
  }
  for (const root of getTicketSearchRoots(scope)) {
    const ticket = getScopedTicketContainer(root);
    for (const panel of root.querySelectorAll<HTMLElement>(
      '[ng-if*="typeInteractionSelected"], [ng-include*="comments/internal.html"]',
    )) {
      const internalCondition = /typeInteractionSelected\s*==+\s*3\b/.test(
        panel.getAttribute('ng-if') || '',
      );
      if (
        (internalCondition ||
          panel
            .getAttribute('ng-include')
            ?.includes('comments/internal.html')) &&
        getScopedTicketContainer(panel) === ticket &&
        isElementVisible(panel)
      )
        return true;
    }
  }
  return false;
}

/**
 * Procura e ativa a aba "Anotação interna" no Octadesk.
 * Baseado na estrutura:
 * <li ng-class="{'active yellow': vm.commentTypeSelected === 3}" ...>
 *   <a ng-click="vm.commentTypeSelected = 3; vm.showReply = true"><i class="icon-edit"></i> Anotação interna</a>
 * </li>
 */
function isElementVisible(
  el: HTMLElement | null | undefined,
  minWidth = 1,
  minHeight = 1,
): boolean {
  if (!el || !isTicketElementVisible(el)) return false;
  const win = el.ownerDocument.defaultView || window;
  const style = win.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.opacity === '0'
  ) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width >= minWidth && rect.height >= minHeight;
}

function findVisibleInternalEditor(
  scope: Document | HTMLElement,
): HTMLElement | null {
  const roots = getTicketSearchRoots(scope);
  const ticket = roots[0] ? getScopedTicketContainer(roots[0]) : null;
  if (!ticket) return null;
  const linkedPanels: HTMLElement[] = [];
  let hasLinkedPanel = false;
  for (const control of getInternalNoteControls(scope)) {
    const tab = control.closest<HTMLElement>('[role="tab"], li') || control;
    if (
      control.getAttribute('aria-selected') !== 'true' &&
      tab.getAttribute('aria-selected') !== 'true' &&
      !control.classList.contains('active') &&
      !tab.classList.contains('active')
    )
      continue;
    const controls =
      control.getAttribute('aria-controls') ||
      tab.getAttribute('aria-controls');
    if (!controls) continue;
    hasLinkedPanel = true;
    for (const id of controls.split(/\s+/)) {
      const panel = control.ownerDocument.getElementById(id);
      if (panel && isInTicketScope(panel, ticket)) linkedPanels.push(panel);
    }
  }
  const candidates: HTMLElement[] = [];
  for (const root of hasLinkedPanel ? linkedPanels : roots) {
    for (const editor of root.querySelectorAll<HTMLElement>(
      '.note-editable, [contenteditable="true"], textarea:not([disabled]):not([readonly])',
    )) {
      if (
        getScopedTicketContainer(editor) === ticket &&
        isElementVisible(editor, 30, 20) &&
        !candidates.includes(editor)
      )
        candidates.push(editor);
    }
  }
  const explicitInternal = candidates.filter((editor) => {
    const panel = editor.closest<HTMLElement>(
      '[ng-if*="typeInteractionSelected"], [ng-include*="comments/internal.html"]',
    );
    return (
      !!panel &&
      (/typeInteractionSelected\s*==+\s*3\b/.test(
        panel.getAttribute('ng-if') || '',
      ) ||
        !!panel.getAttribute('ng-include')?.includes('comments/internal.html'))
    );
  });
  if (explicitInternal.length === 1) return explicitInternal[0]!;
  return candidates.length === 1 ? candidates[0]! : null;
}

export async function switchToInternalNote(
  scope: Document | HTMLElement = document,
  isCurrent: () => boolean = () => true,
  maxWaitMs = 3200,
): Promise<boolean> {
  if (!isCurrent()) return false;
  if (isInternalNoteTabActive(scope)) return true;
  const controls = getInternalNoteControls(scope);
  const control =
    controls.find((el) => el.matches('a, button, [role="tab"]')) || controls[0];
  if (!control) return false;
  const EventConstructor =
    control.ownerDocument.defaultView?.MouseEvent || MouseEvent;
  control.dispatchEvent(
    new EventConstructor('mousedown', { bubbles: true, cancelable: true }),
  );
  control.dispatchEvent(
    new EventConstructor('mouseup', { bubbles: true, cancelable: true }),
  );
  control.click();
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    if (!isCurrent() || (isDOMElement(scope) && !scope.isConnected))
      return false;
    if (isInternalNoteTabActive(scope)) return true;
    await sleep(80);
  }
  return false;
}

/** Aguarda a aba interna confirmada e o editor correspondente renderizarem. */
export async function waitForInternalNoteEditor(
  scope: Document | HTMLElement = document,
  maxWaitMs = 3200,
  isCurrent: () => boolean = () => true,
): Promise<HTMLElement | null> {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    if (!isCurrent() || (isDOMElement(scope) && !scope.isConnected))
      return null;
    if (isInternalNoteTabActive(scope)) {
      const editor = findVisibleInternalEditor(scope);
      if (editor) return editor;
    }
    await sleep(80);
  }
  return null;
}

/**
 * Aguarda e seleciona uma pessoa no popover de menção do Octadesk
 * (<div class="popover-content note-children-container">...<span class="ng-binding">Nome</span>...)
 */
function matchesMentionName(text: string, pattern: RegExp, accentInsensitivePattern?: RegExp): boolean {
  return pattern.test(text) || !!accentInsensitivePattern?.test(text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
}

const SUGGESTION_SELECTOR = '.note-hint-popover, .note-children-container, .person-item, .note-hint-item, .popover-content, [role="listbox"], .octablaster-floating-widget';
const MARKER_SELECTOR = '[contenteditable="false"], [data-mention], [data-mention-id], [data-user-id], [data-person-id], .mention, .atwho-inserted, .note-hint-token, .label, .badge';

function getMentionArea(editor: HTMLElement): HTMLElement {
  const area = editor.closest<HTMLElement>('.note-editing-area, .note-editor');
  return area && getScopedTicketContainer(area) === getScopedTicketContainer(editor) ? area : editor;
}

function countNamedMentions(editor: HTMLElement, name: string): number {
  const area = getMentionArea(editor);
  const input = editor.matches('input, textarea') ? editor as HTMLInputElement | HTMLTextAreaElement : null;
  let text = input?.value;
  if (text === undefined) {
    const clone = area.cloneNode(true) as HTMLElement;
    const elements = area.querySelectorAll<HTMLElement>('*');
    const clonedElements = clone.querySelectorAll<HTMLElement>('*');
    elements.forEach((element, index) => {
      const style = element.ownerDocument.defaultView?.getComputedStyle(element);
      if (element.hidden || element.getAttribute('aria-hidden') === 'true' || style?.display === 'none' || style?.visibility === 'hidden' || style?.opacity === '0') {
        clonedElements[index]?.remove();
      }
    });
    clone.querySelectorAll(SUGGESTION_SELECTOR).forEach(element => element.remove());
    clone.querySelectorAll('*').forEach(element => element.append(' '));
    text = clone.textContent || '';
  }
  const normalizedName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const normalizedText = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const expression = new RegExp(`@\\s*${mentionNamePattern(normalizedName)}(?=$|[^\\p{L}\\p{N}_])`, 'gu');
  return [...normalizedText.matchAll(expression)].length;
}

function hasMentionMarker(editor: HTMLElement, pattern: RegExp, query: string, accentInsensitivePattern?: RegExp): boolean {
  const area = getMentionArea(editor);
  const people = area.querySelectorAll<HTMLElement>('person');
  // O personid é a confirmação nativa do Octadesk, inclusive em tokens sem caixa própria.
  if (people.length) {
    return Array.from(people).some(person => {
      if (!person.getAttribute('personid')?.trim() || person.closest(SUGGESTION_SELECTOR)) return false;
      for (let element: HTMLElement | null = person; element; element = element.parentElement) {
        const style = element.ownerDocument.defaultView?.getComputedStyle(element);
        if (element.hidden || element.getAttribute('aria-hidden') === 'true' || style?.display === 'none' || style?.visibility === 'hidden' || style?.opacity === '0') return false;
        if (element === area) break;
      }
      const text = (person.innerText || person.textContent || '').trim();
      const name = text.replace(/^@\s*/, '');
      return matchesMentionName(name, pattern, accentInsensitivePattern) || text.toLocaleLowerCase('pt-BR') === query.toLocaleLowerCase('pt-BR');
    });
  }
  const markers = area.querySelectorAll<HTMLElement>('*');
  return Array.from(markers).some(marker => {
    if (marker === editor || marker.contains(editor) || marker.closest(SUGGESTION_SELECTOR) || !isElementVisible(marker)) return false;
    const text = (marker.innerText || marker.textContent || marker.getAttribute('aria-label') || '').trim();
    const queryMatches = text.toLocaleLowerCase('pt-BR') === query.toLocaleLowerCase('pt-BR');
    if (marker.matches(MARKER_SELECTOR)) return matchesMentionName(text, pattern, accentInsensitivePattern) || queryMatches;
    if (!text.startsWith('@')) return false;
    const name = text.slice(1).replace(/[×✕]\s*$/, '').trim();
    const match = pattern.exec(name) || accentInsensitivePattern?.exec(name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    if (!queryMatches && (!match || match.index !== 0 || match[0].length !== name.length)) return false;
    const background = marker.ownerDocument.defaultView?.getComputedStyle(marker).backgroundColor;
    return !!background && background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)';
  });
}

async function waitForMentionConfirmation(
  editor: HTMLElement,
  pattern: RegExp,
  query: string,
  deadline: number,
  isCurrent: () => boolean,
  accentInsensitivePattern?: RegExp,
  name = '',
  previousCount = 0,
): Promise<boolean> {
  const input = editor.matches('input, textarea') ? editor as HTMLInputElement | HTMLTextAreaElement : null;
  const before = input?.value;
  while (Date.now() < deadline) {
    if (!isCurrent() || !isElementVisible(editor)) return false;
    if (hasMentionMarker(editor, pattern, query, accentInsensitivePattern)) return true;
    const nativeMention = !!getMentionArea(editor).querySelector('person');
    if (!nativeMention && name && countNamedMentions(editor, name) > previousCount) return true;
    // Editores simples confirmam a escolha substituindo a busca pelo nome.
    if (!nativeMention && input && input.value !== before && matchesMentionName(input.value, pattern, accentInsensitivePattern)) return true;
    await sleep(75);
  }
  return false;
}

async function selectPersonFromPopover(
  namePattern: RegExp,
  doc: Document = document,
  maxWaitMs: number = MENTION_WAIT_MS,
  editor?: HTMLElement,
  isCurrent: () => boolean = () => true,
  accentInsensitivePattern?: RegExp,
  query = '',
  name = '',
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    if (
      !isCurrent() ||
      (editor && (!isElementVisible(editor) || doc.activeElement !== editor))
    )
      return false;
    const roots: ParentNode[] = [];
    const ticketRoot = editor ? getScopedTicketContainer(editor) : null;
    if (ticketRoot) roots.push(ticketRoot);
    if (
      ticketRoot &&
      doc.body &&
      getScopedTicketContainer(doc.body) === ticketRoot &&
      !roots.includes(doc.body)
    )
      roots.push(doc.body);
    if (editor) {
      const ids = [
        editor.getAttribute('aria-controls'),
        editor.getAttribute('aria-owns'),
        editor.getAttribute('aria-describedby'),
      ]
        .filter(Boolean)
        .join(' ')
        .split(/\s+/);
      for (const id of ids) {
        const associated = doc.getElementById(id);
        if (associated && !roots.includes(associated)) roots.push(associated);
      }
    }
    for (const root of roots) {
      // Busca apenas em popovers/menus de menção VISÍVEIS (evita clicar em dropdowns fechados do ticket)
      const items = root.querySelectorAll<HTMLElement>(
        '.note-hint-popover .note-hint-item, .popover-content .note-hint-item, .note-children-container .person-item, .note-hint-item, .person-item, .popover-content li, .dropdown-menu.open li, .open > .dropdown-menu li',
      );

      for (const item of Array.from(items || [])) {
        const targetItem =
          (item.closest('.note-hint-item') as HTMLElement) || item;
        if (!isElementVisible(targetItem, 10, 10)) continue;

        const text = (targetItem.innerText || targetItem.textContent || '').trim();
        if (matchesMentionName(text, namePattern, accentInsensitivePattern)) {
          if (!editor) return false;
          const beforeCount = countNamedMentions(editor, name);
          const confirmed = () => hasMentionMarker(editor, namePattern, query, accentInsensitivePattern) ||
            (!getMentionArea(editor).querySelector('person') && countNamedMentions(editor, name) > beforeCount);
          const confirmation = waitForMentionConfirmation(editor, namePattern, query, startTime + maxWaitMs, isCurrent, accentInsensitivePattern, name, beforeCount);
          targetItem.dispatchEvent(
            new MouseEvent('mouseenter', { bubbles: true }),
          );
          targetItem.dispatchEvent(
            new MouseEvent('mouseover', { bubbles: true }),
          );
          targetItem.dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
          );
          if (!targetItem.isConnected || !isElementVisible(targetItem) || confirmed()) return confirmation;
          targetItem.dispatchEvent(
            new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
          );
          if (!targetItem.isConnected || !isElementVisible(targetItem) || confirmed()) return confirmation;
          targetItem.click();
          return confirmation;
        }
      }
    }

    await sleep(75);
  }

  return false;
}

/**
 * Insere a menção de um alvo específico no editor do Summernote e aguarda seleção no popover
 */
export async function insertMentionForTarget(
  targetEditor: HTMLElement,
  targetDoc: Document,
  target: MentionTarget,
  isFirst: boolean = false,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  if (
    !isCurrent() ||
    !isElementVisible(targetEditor) ||
    !getScopedTicketContainer(targetEditor)
  )
    return false;
  if (targetDoc.activeElement !== targetEditor) {
    targetEditor.focus();
  }

  let pattern: RegExp;
  try {
    pattern = new RegExp(target.pattern, 'i');
  } catch {
    pattern = new RegExp(
      target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i',
    );
  }

  const accentPattern = pattern.source.toLowerCase() === mentionNamePattern(target.name).toLowerCase()
    ? new RegExp(mentionNamePattern(target.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')), 'i')
    : undefined;
  const query = target.query.startsWith('@') ? target.query : `@${target.query}`;
  if (hasMentionMarker(targetEditor, pattern, query, accentPattern)) return true;

  const prefix = isFirst ? '' : ' ';
  if (prefix && !insertTextIntoElement(targetEditor, prefix, undefined, true)) return false;
  const KeyEvent = targetDoc.defaultView?.KeyboardEvent || KeyboardEvent;
  targetEditor.dispatchEvent(new KeyEvent('keydown', { key: '@', keyCode: 50, which: 50, shiftKey: true, bubbles: true }));
  if (!insertTextIntoElement(targetEditor, query, undefined, true)) return false;
  const lastCharacter = query.slice(-1);
  const keyCode = lastCharacter.toUpperCase().charCodeAt(0);
  const options = { key: lastCharacter, keyCode, which: keyCode, bubbles: true };
  targetEditor.dispatchEvent(new KeyEvent('keydown', options));
  targetEditor.dispatchEvent(new Event('input', { bubbles: true }));
  targetEditor.dispatchEvent(new KeyEvent('keyup', options));

  const selected = await selectPersonFromPopover(
    pattern,
    targetDoc,
    MENTION_WAIT_MS,
    targetEditor,
    isCurrent,
    accentPattern,
    query,
    target.name,
  );

  if (selected && isCurrent() && !targetEditor.matches('input, textarea')) {
    // Mantém a próxima busca fora do marcador, dentro do mesmo parágrafo.
    const space = targetDoc.createTextNode('\u00a0');
    const marker = Array.from(targetEditor.querySelectorAll<HTMLElement>('person[personid]')).reverse().find(person => {
      const text = (person.innerText || person.textContent || '').trim();
      return !!person.getAttribute('personid')?.trim() &&
        (matchesMentionName(text.replace(/^@\s*/, ''), pattern, accentPattern) || text.toLocaleLowerCase('pt-BR') === query.toLocaleLowerCase('pt-BR'));
    });
    if (marker) marker.after(space);
    else targetEditor.append(space);
    targetEditor.focus();
    const range = targetDoc.createRange();
    range.setStart(space, 1);
    range.collapse(true);
    const selection = targetDoc.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const Input = targetDoc.defaultView?.InputEvent || InputEvent;
    targetEditor.dispatchEvent(new Input('input', { bubbles: true, inputType: 'insertText', data: '\u00a0' }));
  }
  return selected;
}

/**
 * Executa o fluxo automatizado de marcação de responsáveis:
 * 1. Verifica se está em Anotação Interna; se não estiver, muda automaticamente para Anotação interna
 * 2. Aguarda o editor de anotação interna renderizar
 * 3. Itera de forma modular sobre os responsáveis configurados (padrão: Jorge Tigre e Roberto Renck)
 */
export async function automateLicenseMentions(
  editor?: HTMLElement | null,
  doc: Document = document,
  scope?: HTMLElement | null,
  customTargets?: MentionTarget[],
): Promise<{ success: boolean; message: string }> {
  try {
    const targetDoc = editor?.ownerDocument || scope?.ownerDocument || doc;
    const targetScope = scope
      ? getScopedTicketContainer(scope)
      : editor
        ? getScopedTicketContainer(editor)
        : null;
    if (!targetScope)
      return { success: false, message: 'Contêiner do ticket não encontrado.' };
    const licenseRequest = readTicketLicenseRequest(targetScope);
    if (licenseRequest.status === 'invalid') return { success: false, message: licenseRequest.message };
    const summary = licenseRequest.status === 'ready' ? formatLicenseRequest(licenseRequest.request) : '';
    const ticketIdentity = getTicketIdentity(targetScope);
    const isCurrentTicket = () =>
      targetScope.isConnected &&
      ticketIdentity === getTicketIdentity(targetScope) &&
      !targetScope.closest('[hidden], [aria-hidden="true"]') &&
      targetScope.getBoundingClientRect().width > 0 &&
      [targetScope.ownerDocument, targetDoc].every((activeDocument) => {
        const active = activeDocument.activeElement;
        const activeTicket =
          active?.nodeType === 1
            ? getScopedTicketContainer(active as HTMLElement)
            : null;
        return !activeTicket || activeTicket === targetScope;
      });
    let targetEditor = editor;

    // Passo 1: Garantir que está na aba de Anotação Interna
    const isAlreadyInternal = isInternalNoteTabActive(targetScope);
    if (!isAlreadyInternal) {
      console.log(
        '[OctaBlaster] Resposta pública detectada. Alternando para Anotação interna...',
      );
      const switched = await switchToInternalNote(targetScope, isCurrentTicket);
      if (!switched || !isCurrentTicket()) {
        return {
          success: false,
          message: 'Não foi possível abrir a Anotação Interna deste ticket.',
        };
      }
    }
    targetEditor = await waitForInternalNoteEditor(
      targetScope,
      isAlreadyInternal ? 1600 : 3200,
      isCurrentTicket,
    );

    if (
      !targetEditor ||
      !isCurrentTicket() ||
      !isInternalNoteTabActive(targetScope) ||
      !isInTicketScope(targetEditor, targetScope)
    ) {
      return {
        success: false,
        message: 'Editor de Anotação Interna não encontrado.',
      };
    }

    const editorDoc = targetEditor.ownerDocument || targetDoc;

    // Foca no editor de Anotação Interna
    targetEditor.focus();
    await sleep(160);

    // Passo 2: Carrega os alvos de menção configurados
    const targetsToMark = (
      customTargets || (await loadMentionTargets())
    ).filter((t) => t.enabled);

    if (targetsToMark.length === 0) {
      return {
        success: false,
        message: 'Nenhum responsável configurado para marcação.',
      };
    }

    // Passo 3: Marca cada responsável sequencialmente
    const markedNames: string[] = [];
    for (let i = 0; i < targetsToMark.length; i++) {
      const target = targetsToMark[i];
      if (target) {
        if (
          !isCurrentTicket() ||
          !isInternalNoteTabActive(targetScope) ||
          !isElementVisible(targetEditor) ||
          !isInTicketScope(targetEditor, targetScope)
        ) {
          return {
            success: false,
            message: 'O ticket mudou durante a marcação.',
          };
        }
        const selected = await insertMentionForTarget(
          targetEditor,
          editorDoc,
          target,
          i === 0,
          () => isCurrentTicket() && isInternalNoteTabActive(targetScope),
        );
        if (selected) {
          markedNames.push(`@${target.name}`);
        } else {
          return {
            success: false,
            message: `Não foi possível confirmar a menção de "${target.name}" na busca "${target.query}". Confira o marcador na anotação e as sugestões do Octadesk antes de tentar novamente.`,
          };
        }
      }
    }

    if (!isCurrentTicket() || markedNames.length !== targetsToMark.length) {
      return {
        success: false,
        message:
          'Não foi possível concluir todas as menções neste ticket. Confira a anotação antes de tentar novamente.',
      };
    }

    if (summary) {
      const clone = targetEditor.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('br').forEach(element => element.replaceWith('\n'));
      clone.querySelectorAll('div, p').forEach(element => element.append('\n'));
      const draft = targetEditor.matches('input, textarea') ? (targetEditor as HTMLInputElement).value : clone.textContent || '';
      const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
      if (!normalize(draft).includes(normalize(summary))) {
        // Acrescenta o resumo sem substituir os tokens nativos nem o rascunho.
        targetEditor.focus();
        if (targetEditor.matches('input, textarea')) {
          const input = targetEditor as HTMLTextAreaElement;
          input.setSelectionRange(input.value.length, input.value.length);
        } else {
          const range = editorDoc.createRange();
          range.selectNodeContents(targetEditor);
          range.collapse(false);
          editorDoc.getSelection()?.removeAllRanges();
          editorDoc.getSelection()?.addRange(range);
        }
        if (!insertTextIntoElement(targetEditor, `\n\n${summary}`, undefined, true)) {
          return { success: false, message: 'Os técnicos foram marcados, mas não foi possível inserir o resumo da solicitação.' };
        }
      }
    } else if (isCurrentTicket() && isElementVisible(targetEditor)) {
      insertTextIntoElement(targetEditor, ' ', undefined, true);
    }

    return {
      success: true,
      message: summary ? 'Responsáveis marcados e resumo da solicitação preparado em Anotação Interna.' : `Responsáveis de Licenças (${markedNames.join(' e ')}) marcados com sucesso em Anotação Interna!`,
    };
  } catch (error) {
    console.error(
      '[OctaBlaster] Erro ao automatizar menções de licenças:',
      error,
    );
    return {
      success: false,
      message: 'Falha durante a marcação automática de licenças.',
    };
  }
}
