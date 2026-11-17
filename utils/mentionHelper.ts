import { getScopedTicketContainer, getTicketIdentity, isInTicketScope, isTicketElementVisible } from './licenseDetector';
import { insertTextIntoElement } from './insertText';
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

function getBrowserStorageArea(): any {
  if (typeof browser !== 'undefined' && browser?.storage?.local) {
    return browser.storage.local;
  }
  const gChrome = (globalThis as any).chrome;
  if (gChrome?.storage?.local) {
    return gChrome.storage.local;
  }
  const gBrowser = (globalThis as any).browser;
  if (gBrowser?.storage?.local) {
    return gBrowser.storage.local;
  }
  return null;
}

export async function loadMentionTargets(): Promise<MentionTarget[]> {
  const storage = getBrowserStorageArea();
  if (storage) {
    try {
      const getRes = storage.get([MENTION_TARGETS_STORAGE_KEY]);
      const res =
        getRes && typeof getRes.then === 'function'
          ? await getRes
          : await new Promise<any>((resolve) => storage.get([MENTION_TARGETS_STORAGE_KEY], resolve));
      if (
        res &&
        Array.isArray(res[MENTION_TARGETS_STORAGE_KEY]) &&
        res[MENTION_TARGETS_STORAGE_KEY].length > 0
      ) {
        return res[MENTION_TARGETS_STORAGE_KEY];
      }
    } catch (err) {
      console.warn('[OctaBlaster] Erro ao carregar mention targets do storage:', err);
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(MENTION_TARGETS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
  }

  return JSON.parse(JSON.stringify(DEFAULT_MENTION_TARGETS));
}

export async function saveMentionTargets(targets: MentionTarget[]): Promise<void> {
  const cleanTargets = JSON.parse(JSON.stringify(targets));
  const storage = getBrowserStorageArea();
  if (storage) {
    try {
      const setRes = storage.set({ [MENTION_TARGETS_STORAGE_KEY]: cleanTargets });
      if (setRes && typeof setRes.then === 'function') {
        await setRes;
      } else {
        await new Promise<void>((resolve) =>
          storage.set({ [MENTION_TARGETS_STORAGE_KEY]: cleanTargets }, resolve),
        );
      }
    } catch (err) {
      console.warn('[OctaBlaster] Erro ao salvar mention targets no storage:', err);
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(MENTION_TARGETS_STORAGE_KEY, JSON.stringify(cleanTargets));
    } catch {}
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDOMElement(val: unknown): val is HTMLElement {
  return !!(val && typeof val === 'object' && 'nodeType' in val && (val as Node).nodeType === 1);
}

function getAllDocuments(rootDoc: Document = document): Document[] {
  const allDocs: Document[] = [];
  function add(d: Document | null | undefined) {
    if (d && !allDocs.includes(d)) {
      allDocs.push(d);
      try {
        const iframes = d.querySelectorAll<HTMLIFrameElement>('iframe');
        for (const ifr of Array.from(iframes)) {
          try {
            const childDoc = ifr.contentDocument || ifr.contentWindow?.document;
            if (childDoc) add(childDoc);
          } catch {}
        }
      } catch {}
    }
  }

  try {
    if (window.top?.document) {
      add(window.top.document);
    }
  } catch {}
  add(rootDoc);
  return allDocs;
}

/**
 * Verifica se a aba "Anotação interna" já está ativa no Octadesk.
 */
export function isInternalNoteTabActive(scope: Document | HTMLElement = document): boolean {
  if (isDOMElement(scope)) {
    const activeInternalLi = scope.querySelector<HTMLElement>(
      'li.active[ng-class*="commentTypeSelected === 3"], li.active.yellow[comment-type-selected="vm.commentTypeSelected"]',
    );
    if (activeInternalLi) return true;

    const activeTabs = scope.querySelectorAll<HTMLElement>(
      '.nav-comments li.active, .subarea-tabs li.active',
    );
    for (const tab of Array.from(activeTabs)) {
      const text = (tab.textContent || '').toLowerCase();
      if (text.includes('anotação') || text.includes('anotacao')) {
        return true;
      }
    }

    const internalCommentScope = scope.querySelector<HTMLElement>(
      'div[ng-if*="typeInteractionSelected == 3"], div[ng-include*="comments/internal.html"]',
    );
    if (internalCommentScope && internalCommentScope.offsetParent !== null) {
      return true;
    }


    return false;
  }

  const allDocs = getAllDocuments(scope);

  for (const d of allDocs) {
    const activeInternalLi = d.querySelector<HTMLElement>(
      'li.active[ng-class*="commentTypeSelected === 3"], li.active.yellow[comment-type-selected="vm.commentTypeSelected"]',
    );
    if (activeInternalLi) return true;

    const activeTabs = d.querySelectorAll<HTMLElement>(
      '.nav-comments li.active, .subarea-tabs li.active',
    );
    for (const tab of Array.from(activeTabs)) {
      const text = (tab.textContent || '').toLowerCase();
      if (text.includes('anotação') || text.includes('anotacao')) {
        return true;
      }
    }

    const internalCommentScope = d.querySelector<HTMLElement>(
      'div[ng-if*="typeInteractionSelected == 3"], div[ng-include*="comments/internal.html"]',
    );
    if (internalCommentScope && internalCommentScope.offsetParent !== null) {
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
function isElementVisible(el: HTMLElement | null | undefined, minWidth = 1, minHeight = 1): boolean {
  if (!el || !isTicketElementVisible(el)) return false;
  const win = el.ownerDocument.defaultView || window;
  const style = win.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width >= minWidth && rect.height >= minHeight;
}

function findVisibleEditorInContainer(container: ParentNode | null | undefined): HTMLElement | null {
  if (!container) return null;
  const node = container as Node;
  const rootElement = node.nodeType === 1 ? container as HTMLElement : (node as Document).body;
  const expectedScope = rootElement ? getScopedTicketContainer(rootElement) : null;

  const internalSelectors =
    'div[ng-if*="typeInteractionSelected == 3"] .note-editable, div[ng-include*="comments/internal.html"] .note-editable';
  const internalEditables = container.querySelectorAll<HTMLElement>(internalSelectors);
  for (const el of Array.from(internalEditables)) {
    if (isElementVisible(el, 30, 20) && (!expectedScope || getScopedTicketContainer(el) === expectedScope)) {
      return el;
    }
  }

  const editables = container.querySelectorAll<HTMLElement>('.note-editable');
  for (const el of Array.from(editables)) {
    if (isElementVisible(el, 30, 20) && (!expectedScope || getScopedTicketContainer(el) === expectedScope)) {
      return el;
    }
  }

  for (const frame of container.querySelectorAll<HTMLIFrameElement>('iframe')) {
    try {
      const found = frame.contentDocument ? findVisibleEditorInContainer(frame.contentDocument) : null;
      if (found && (!expectedScope || getScopedTicketContainer(found) === expectedScope)) return found;
    } catch { /* Não acessível nesta origem. */ }
  }
  return null;
}

export async function switchToInternalNote(scope: Document | HTMLElement = document): Promise<boolean> {
  if (isInternalNoteTabActive(scope)) {
    return true;
  }

  if (isDOMElement(scope)) {
    const searchTarget: HTMLElement =
      scope;

    const specificLink = searchTarget.querySelector<HTMLElement>(
      'a[ng-click*="commentTypeSelected = 3"], li[ng-class*="commentTypeSelected === 3"] > a',
    );

    if (specificLink) {
      specificLink.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      specificLink.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      specificLink.click();
      await sleep(125);
      return true;
    }

    const navItems = searchTarget.querySelectorAll<HTMLElement>(
      '.nav-comments a, .subarea-tabs a, .nav-tabs a, nav a',
    );
    for (const item of Array.from(navItems)) {
      const text = (item.textContent || '').trim().toLowerCase();
      if (
        (text.includes('anotação interna') || text.includes('anotacao interna')) &&
        !item.classList.contains('favorite')
      ) {
        item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        item.click();
        await sleep(125);
        return true;
      }
    }

    return false;
  }

  const allDocs = getAllDocuments(scope);

  for (const d of allDocs) {
    if (isInternalNoteTabActive(d)) {
      return true;
    }

    // 1. Seletor exato do Angular no Octadesk
    const specificLink = d.querySelector<HTMLElement>(
      'a[ng-click*="commentTypeSelected = 3"], li[ng-class*="commentTypeSelected === 3"] > a',
    );

    if (specificLink) {
      specificLink.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      specificLink.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      specificLink.click();
      await sleep(125);
      return true;
    }

    // 2. Fallback: procura por qualquer link/item de navegação com o texto "Anotação interna"
    const navItems = d.querySelectorAll<HTMLElement>(
      '.nav-comments a, .subarea-tabs a, .nav-tabs a, nav a',
    );
    for (const item of Array.from(navItems)) {
      const text = (item.textContent || '').trim().toLowerCase();
      if (
        (text.includes('anotação interna') || text.includes('anotacao interna')) &&
        !item.classList.contains('favorite')
      ) {
        item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        item.click();
        await sleep(125);
        return true;
      }
    }
  }

  return false;
}

/**
 * Aguarda o AngularJS renderizar e exibir o editor de Anotação Interna no DOM
 */
export async function waitForInternalNoteEditor(
  scope: Document | HTMLElement = document,
  maxWaitMs: number = 3200,
): Promise<HTMLElement | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    if (isDOMElement(scope)) {
      if (!scope.isConnected) return null;
      const found = findVisibleEditorInContainer(scope);
      if (found) return found;
    } else {
      const allDocs = getAllDocuments(scope);
      for (const d of allDocs) {
        if (isInternalNoteTabActive(d)) {
          const found = findVisibleEditorInContainer(d);
          if (found) return found;
        }
      }
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
    if (!isCurrent() || (editor && (!isElementVisible(editor) || doc.activeElement !== editor))) return false;
    const roots: ParentNode[] = [];
    const ticketRoot = editor ? getScopedTicketContainer(editor) : null;
    if (ticketRoot) roots.push(ticketRoot);
    if (ticketRoot && doc.body && getScopedTicketContainer(doc.body) === ticketRoot && !roots.includes(doc.body)) roots.push(doc.body);
    if (editor) {
      const ids = [editor.getAttribute('aria-controls'), editor.getAttribute('aria-owns'), editor.getAttribute('aria-describedby')]
        .filter(Boolean).join(' ').split(/\s+/);
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
        const targetItem = (item.closest('.note-hint-item') as HTMLElement) || item;
        if (!isElementVisible(targetItem, 10, 10)) continue;

        const text = (targetItem.textContent || '').trim();
        if (namePattern.test(text)) {
          targetItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          targetItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
          targetItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          targetItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
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
  if (!isCurrent() || !isElementVisible(targetEditor) || !getScopedTicketContainer(targetEditor)) return false;
  if (targetDoc.activeElement !== targetEditor) {
    targetEditor.focus();
  }

  const prefix = isFirst ? '' : ' ';
  const mentionQuery = target.query.startsWith('@') ? target.query : `@${target.query}`;
  insertTextIntoElement(targetEditor, `${prefix}${mentionQuery}`, undefined, true);

  // Dispara eventos de tecla e input para acionar o popover do Summernote
  const triggerChar = mentionQuery.slice(-1) || 'a';
  const charCode = triggerChar.charCodeAt(0);
  targetEditor.dispatchEvent(
    new KeyboardEvent('keydown', { key: triggerChar, keyCode: charCode, which: charCode, bubbles: true }),
  );
  targetEditor.dispatchEvent(new Event('input', { bubbles: true }));
  targetEditor.dispatchEvent(
    new KeyboardEvent('keyup', { key: triggerChar, keyCode: charCode, which: charCode, bubbles: true }),
  );

  let pattern: RegExp;
  try {
    pattern = new RegExp(target.pattern, 'i');
  } catch {
    pattern = new RegExp(target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const selected = await selectPersonFromPopover(pattern, targetDoc, 2800, targetEditor, isCurrent);

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
    const targetScope = scope ? getScopedTicketContainer(scope) : editor ? getScopedTicketContainer(editor) : null;
    if (!targetScope) return { success: false, message: 'Contêiner do ticket não encontrado.' };
    const ticketIdentity = getTicketIdentity(targetScope);
    const isCurrentTicket = () => targetScope.isConnected &&
      ticketIdentity === getTicketIdentity(targetScope) &&
      !targetScope.closest('[hidden], [aria-hidden="true"]') && targetScope.getBoundingClientRect().width > 0 &&
      !(targetDoc.activeElement instanceof HTMLElement && getScopedTicketContainer(targetDoc.activeElement) &&
        getScopedTicketContainer(targetDoc.activeElement) !== targetScope);
    let targetEditor = editor;

    // Passo 1: Garantir que está na aba de Anotação Interna
    const isAlreadyInternal = isInternalNoteTabActive(targetScope);
    if (!isAlreadyInternal) {
      console.log('[OctaBlaster] Resposta pública detectada. Alternando para Anotação interna...');
      const switched = await switchToInternalNote(targetScope);
      if (!switched || !isCurrentTicket()) {
        return { success: false, message: 'Não foi possível abrir a Anotação Interna deste ticket.' };
      }
      // Aguarda o Angular renderizar o novo editor Summernote da Anotação interna
      targetEditor = await waitForInternalNoteEditor(targetScope, 3200);
    } else if (!targetEditor || !isElementVisible(targetEditor, 30, 20)) {
      targetEditor = await waitForInternalNoteEditor(targetScope, 1600);
    }

    if (!targetEditor || !isCurrentTicket() || !isInternalNoteTabActive(targetScope) || !isInTicketScope(targetEditor, targetScope)) {
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
    const targetsToMark = (customTargets || (await loadMentionTargets())).filter((t) => t.enabled);

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
        if (!isCurrentTicket() || !isInternalNoteTabActive(targetScope) || !isElementVisible(targetEditor) || !isInTicketScope(targetEditor, targetScope)) {
          return { success: false, message: 'O ticket mudou durante a marcação.' };
        }
        const selected = await insertMentionForTarget(targetEditor, editorDoc, target, i === 0, () => isCurrentTicket() && isInternalNoteTabActive(targetScope));
        if (selected) {
          markedNames.push(`@${target.name}`);
        }
      }
    }

    if (!isCurrentTicket() || markedNames.length !== targetsToMark.length) {
      return {
        success: false,
        message: 'Não foi possível concluir todas as menções neste ticket. Confira a anotação antes de tentar novamente.',
      };
    }

    // Adiciona espaço final para continuação da escrita
    if (isCurrentTicket() && isElementVisible(targetEditor)) insertTextIntoElement(targetEditor, ' ', undefined, true);

    return {
      success: true,
      message: `Responsáveis de Licenças (${markedNames.join(' e ')}) marcados com sucesso em Anotação Interna!`,
    };
  } catch (error) {
    console.error('[OctaBlaster] Erro ao automatizar menções de licenças:', error);
    return {
      success: false,
      message: 'Falha durante a marcação automática de licenças.',
    };
  }
}
