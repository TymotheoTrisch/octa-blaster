export interface LicenseTicketInfo {
  isLicenseTicket: boolean;
  type: 'Contratação' | 'Troca' | 'Cancelamento' | 'Renovação' | 'Outro';
  licenseType: string;
  databaseNumber?: string;
  clientName?: string;
  resellerName?: string;
  rawTitle?: string;
}

function isDOMElement(val: unknown): val is HTMLElement {
  return !!(val && typeof val === 'object' && 'nodeType' in val && (val as Node).nodeType === 1);
}

/**
 * Extrai texto do elemento excluindo os próprios widgets do OctaBlaster
 * para evitar qualquer falso positivo induzido pela própria extensão.
 */
function extractCleanText(root: HTMLElement | null | undefined): string {
  if (!root) return '';
  if (root.classList && root.classList.contains('octablaster-floating-widget')) return '';

  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.octablaster-floating-widget, .octablaster-shortcut-menu, .octablaster-variable-dialog, script, style').forEach(element => element.remove());
  clone.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
  clone.querySelectorAll('div, p, li, section, header, h1, h2, h3, tr').forEach(el => el.append('\n'));
  const subjectValues = Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input[name="subject"], input[name="title"], input[ng-model*=".subject"], input[ng-model*=".title"], textarea[name="subject"]',
  )).map(input => input.value);
  return [...subjectValues, clone.textContent || ''].join('\n');
}

/**
 * Obtém o contêiner isolado do ticket específico a partir de qualquer elemento interno.
 * Garante que a busca fique restrita a este ticket, sem vazar dados de outros tickets.
 */
const TICKET_ROOT_SELECTOR = '[ticket-id], [data-ticket-id], [data-cy="ticket_content"], .ticket-container, .ticket-view, .ticket-page';
const TICKET_PANEL_SELECTOR = '[ticket], [role="tabpanel"], .tab-pane';
export const TICKET_SELECTOR = `${TICKET_ROOT_SELECTOR}, ${TICKET_PANEL_SELECTOR}`;

export function getScopedTicketContainer(el: HTMLElement): HTMLElement | null {
  // A barra de comentários também recebe [ticket] e pode conter uma .tab-pane.
  // O cabeçalho e a navegação pertencem ao contêiner externo do chamado.
  let local: HTMLElement | null = null;
  for (let ancestor: HTMLElement | null = el; ancestor; ancestor = ancestor.parentElement) {
    if (ancestor.matches('body, html')) break;
    if (ancestor.matches(TICKET_ROOT_SELECTOR)) return ancestor;
    const isCommentBar = ancestor.matches('.space-x-md, [comment-type-selected]');
    if (ancestor.hasAttribute('ticket') && !isCommentBar) return ancestor;
    if (!local && ancestor.matches(TICKET_PANEL_SELECTOR)) local = ancestor;
  }
  try {
    const frame = el.ownerDocument.defaultView?.frameElement;
    if (frame && frame.nodeType === 1) {
      const parentScope = getScopedTicketContainer(frame as HTMLElement);
      if (parentScope) return parentScope;
    }
  } catch { /* Frames de outra origem exigem um contêiner próprio. */ }
  return local;
}

export function isInTicketScope(el: HTMLElement, scope: HTMLElement): boolean {
  if (scope.contains(el)) return true;
  try {
    const frame = el.ownerDocument.defaultView?.frameElement;
    return !!frame && isInTicketScope(frame as HTMLElement, scope);
  } catch { return false; }
}

export function isTicketElementVisible(el: HTMLElement): boolean {
  let current: HTMLElement | null = el;
  while (current) {
    if (!current.isConnected || current.getBoundingClientRect().width <= 0 || current.getBoundingClientRect().height <= 0) return false;
    const win = current.ownerDocument.defaultView;
    for (let ancestor: HTMLElement | null = current; ancestor; ancestor = ancestor.parentElement) {
      const style = win?.getComputedStyle(ancestor);
      if (ancestor.hidden || ancestor.getAttribute('aria-hidden') === 'true' ||
        style?.display === 'none' || style?.visibility === 'hidden' || style?.opacity === '0') return false;
    }
    try {
      current = win?.frameElement as HTMLElement | null;
    } catch { return false; }
  }
  return true;
}

export function getTicketIdentity(scope: HTMLElement): string {
  return `${scope.ownerDocument.URL}|${scope.getAttribute('ticket-id')}|${scope.getAttribute('ticket')}|${scope.getAttribute('data-ticket-id')}|${scope.id}`;
}

/**
 * Detecta se o ticket do Octadesk exibe um chamado de licença
 * (Contratação, Troca, Cancelamento ou Renovação).
 * Se um HTMLElement for fornecido, a verificação é estritamente isolada àquele ticket!
 */
export function detectLicenseTicket(scope: Document | HTMLElement | unknown = document): LicenseTicketInfo | null {
  try {
    if (!scope) return null;

    let targetRoot: HTMLElement | null = null;
    if (isDOMElement(scope)) {
      targetRoot = getScopedTicketContainer(scope);
    } else if (scope && typeof scope === 'object' && 'nodeType' in scope && (scope as Node).nodeType === 9) {
      const roots = (scope as Document).querySelectorAll<HTMLElement>(TICKET_SELECTOR);
      if (roots.length === 1) targetRoot = roots[0] || null;
    }
    if (!targetRoot) return null;
    const fullText = extractCleanText(targetRoot);

    // 1. Validação essencial:
    // Precisa conter termo de licença E operação de licença
    const hasLicenca = /licen[cç]a/i.test(fullText);
    const hasOperation = /(contrata[cç][aã]o|troca|cancelamento|renova[cç][aã]o)/i.test(fullText);

    if (!hasLicenca || !hasOperation) {
      return null;
    }

    // 2. Determina o tipo de operação
    let type: LicenseTicketInfo['type'] = 'Outro';
    if (/contrata[cç][aã]o/i.test(fullText)) {
      type = 'Contratação';
    } else if (/troca/i.test(fullText)) {
      type = 'Troca';
    } else if (/cancelamento/i.test(fullText)) {
      type = 'Cancelamento';
    } else if (/renova[cç][aã]o/i.test(fullText)) {
      type = 'Renovação';
    }

    // 3. Extrai número do banco de dados (ex: "(169614)", "Banco de dados: 169614", "BD: 169614")
    const dbMatch =
      fullText.match(/(?:banco(?:\s+de\s+dados)?|bd)[:\s]*([0-9]{4,8})/i) ||
      fullText.match(/\(([0-9]{4,8})\)/);
    const databaseNumber = dbMatch && dbMatch[1] ? dbMatch[1] : undefined;

    // 4. Extrai tipo da licença (ex: "Licença Facial", "Licença Secullum")
    let licenseType = 'Licença Facial';
    if (/facial/i.test(fullText)) {
      licenseType = 'Licença Facial';
    } else if (/secullum/i.test(fullText)) {
      licenseType = 'Licença Secullum';
    } else {
      const licTypeMatch = fullText.match(/licen[cç]a\s+([a-zA-Z0-9\s]+?)(?:\s*\(|\.|\n|$)/i);
      if (licTypeMatch && licTypeMatch[1]) {
        licenseType = `Licença ${licTypeMatch[1].trim()}`;
      }
    }

    // 5. Extrai Razão Social do Cliente
    const clientMatch = fullText.match(/(?:Raz[aã]o\s+Social(?:\s+do\s+Cliente)?|Cliente)[:\s]*([^\n\r]+)/i);

    // 6. Extrai Nome da Revenda
    const resellerMatch = fullText.match(/(?:Nome\s+da\s+Revenda|Revenda)[:\s]*([^\n\r]+)/i);

    // 7. Extrai título bruto se presente nas linhas do ticket
    const lines = fullText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const titleLine = lines.find(
      (l) => /licen[cç]a/i.test(l) && /(contrata[cç][aã]o|troca|cancelamento|renova[cç][aã]o)/i.test(l),
    );

    return {
      isLicenseTicket: true,
      type,
      licenseType,
      databaseNumber,
      clientName: clientMatch && clientMatch[1] ? clientMatch[1].trim() : undefined,
      resellerName: resellerMatch && resellerMatch[1] ? resellerMatch[1].trim() : undefined,
      rawTitle: titleLine,
    };
  } catch (error) {
    console.warn('[OctaBlaster] Erro na detecção de ticket de licença:', error);
    return null;
  }
}
