import { getScopedTicketContainer, getTicketIdentity, isTicketElementVisible, TICKET_SELECTOR } from './licenseDetector';

export function getAiTicketIdentity(scope: HTMLElement): string {
  const number = Array.from(scope.querySelectorAll(':scope > header.header-info .label.label-default.ng-binding'))
    .map(label => label.textContent?.trim().match(/^\d+\b/)?.[0]).find(Boolean) || '';
  return `${getTicketIdentity(scope)}|${number}`;
}

export function readAiMessage(body: HTMLElement): string {
  const clone = body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(`${TICKET_SELECTOR}, [data-octa-ai], script, style, blockquote, .gmail_quote, .yahoo_quoted, [hidden], [aria-hidden="true"], .ng-hide, [style*="display: none"], [style*="display:none"]`).forEach(node => node.remove());
  clone.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  clone.querySelectorAll('div, p, li, tr').forEach(node => node.append('\n'));
  return clone.textContent?.trim() || '';
}

export function ticketMessages(scope: HTMLElement): HTMLElement[] {
  return Array.from(scope.querySelectorAll<HTMLElement>('.content-comment-interaction'))
    .filter(body => getScopedTicketContainer(body) === scope && !body.closest('[contenteditable], .note-editor, [data-octa-ai]') && isTicketElementVisible(body));
}

export function collectAiTicketContext(anchor: HTMLElement) {
  const scope = getScopedTicketContainer(anchor);
  if (!scope) throw new Error('Ticket não encontrado.');
  const title = scope.querySelector('h1, h2, h3, [data-cy="ticket_subject"]')?.textContent?.trim() || '';
  const messages = ticketMessages(scope).map(readAiMessage).filter(Boolean);
  const header = `Assunto: ${title.slice(0, 1000)}\n\n`;
  const body = messages.map((text, index) => `Mensagem ${index + 1}:\n${text}`).join('\n\n');
  const budget = 50_000 - header.length;
  return {
    context: header + body.slice(-budget),
    latestContext: messages.length ? header + messages.at(-1)!.slice(-budget) : '',
    messageCount: messages.length,
    truncated: body.length > budget,
    coverage: `${messages.length} mensagem(ns) carregada(s). ${body.length > budget ? 'Histórico acima do limite: resumo baseado no trecho mais recente (50.000 caracteres).' : 'Resumo baseado nas mensagens disponíveis neste ticket.'} Mensagens antigas não carregadas, anexos e citações de e-mail não foram analisados.`,
  };
}
