import {
  getScopedTicketContainer,
  getTicketIdentity,
  isInTicketScope,
  isTicketElementVisible,
} from './licenseDetector';
import { insertTextIntoElement } from './insertText';
import { rawStorageGet, rawStorageSet } from './templateStorage';
import type { MentionTarget } from '@/types/template';

export const MENTION_TARGETS_STORAGE_KEY = 'octablaster_mention_targets';

export const DEFAULT_MENTION_TARGETS: MentionTarget[] = [
  {
    id: 'jorge_tigre',
    name: 'Jorge Tigre',
    query: '@Jorge',
    pattern: 'jorge\\s+tigre',
    enabled: true,
  },
  {
    id: 'roberto_renck',
    name: 'Roberto Renck',
    query: '@roberto',
    pattern: 'roberto\\s+renck',
    enabled: true,
  },
];

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
    const derivedPattern = name.split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    const pattern = typeof item.pattern === 'string' && item.pattern.trim() ? item.pattern : derivedPattern;
    try {
      new RegExp(pattern, 'i');
    } catch {
      throw new Error(`Padrão de identificação inválido para ${name}.`);
    }
    return { id, name, query, pattern, enabled: item.enabled !== false };
  });
}

export async function loadMentionTargets(): Promise<MentionTarget[]> {
  const data = await rawStorageGet([MENTION_TARGETS_STORAGE_KEY]);
  return validateMentionTargets(data[MENTION_TARGETS_STORAGE_KEY] ?? DEFAULT_MENTION_TARGETS);
}

export async function saveMentionTargets(targets: MentionTarget[]): Promise<void> {
  await rawStorageSet({ [MENTION_TARGETS_STORAGE_KEY]: validateMentionTargets(targets) });
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
async function selectPersonFromPopover(
  namePattern: RegExp,
  doc: Document = document,
  maxWaitMs: number = 2800,
  editor?: HTMLElement,
  isCurrent: () => boolean = () => true,
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

        const text = (targetItem.textContent || '').trim();
        if (namePattern.test(text)) {
          targetItem.dispatchEvent(
            new MouseEvent('mouseenter', { bubbles: true }),
          );
          targetItem.dispatchEvent(
            new MouseEvent('mouseover', { bubbles: true }),
          );
          targetItem.dispatchEvent(
            new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
          );
          targetItem.dispatchEvent(
            new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
          );
          targetItem.click();
          return true;
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

  const prefix = isFirst ? '' : ' ';
  const mentionQuery = target.query.startsWith('@')
    ? target.query
    : `@${target.query}`;
  insertTextIntoElement(
    targetEditor,
    `${prefix}${mentionQuery}`,
    undefined,
    true,
  );

  // Dispara eventos de tecla e input para acionar o popover do Summernote
  const triggerChar = mentionQuery.slice(-1) || 'a';
  const charCode = triggerChar.charCodeAt(0);
  targetEditor.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: triggerChar,
      keyCode: charCode,
      which: charCode,
      bubbles: true,
    }),
  );
  targetEditor.dispatchEvent(new Event('input', { bubbles: true }));
  targetEditor.dispatchEvent(
    new KeyboardEvent('keyup', {
      key: triggerChar,
      keyCode: charCode,
      which: charCode,
      bubbles: true,
    }),
  );

  let pattern: RegExp;
  try {
    pattern = new RegExp(target.pattern, 'i');
  } catch {
    pattern = new RegExp(
      target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i',
    );
  }

  const selected = await selectPersonFromPopover(
    pattern,
    targetDoc,
    2800,
    targetEditor,
    isCurrent,
  );

  await sleep(160);
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

    // Adiciona espaço final para continuação da escrita
    if (isCurrentTicket() && isElementVisible(targetEditor))
      insertTextIntoElement(targetEditor, ' ', undefined, true);

    return {
      success: true,
      message: `Responsáveis de Licenças (${markedNames.join(' e ')}) marcados com sucesso em Anotação Interna!`,
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
