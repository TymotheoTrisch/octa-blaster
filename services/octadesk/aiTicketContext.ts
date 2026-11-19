import { getScopedTicketContainer, isTicketElementVisible, TICKET_SELECTOR } from './licenseDetector';

export function collectAiTicketContext(editor: HTMLElement) {
  const scope = getScopedTicketContainer(editor);
  if (!scope) throw new Error('Ticket não encontrado.');
  const title = scope.querySelector('h1, h2, [data-cy="ticket_subject"]')?.textContent?.trim() || '';
  const messages = Array.from(scope.querySelectorAll<HTMLElement>('.content-comment-interaction'))
    .filter(body => getScopedTicketContainer(body) === scope && !body.closest('[contenteditable], .note-editor') && isTicketElementVisible(body))
    .map(body => {
      const clone = body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(TICKET_SELECTOR).forEach(node => node.remove());
      clone.querySelectorAll('script, style, blockquote, .gmail_quote, .yahoo_quoted, [hidden], [aria-hidden="true"], .ng-hide, [style*="display: none"], [style*="display:none"], .octablaster-floating-widget').forEach(node => node.remove());
      clone.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
      clone.querySelectorAll('div, p, li, tr').forEach(node => node.append('\n'));
      return clone.textContent?.trim() || '';
    }).filter(Boolean);
  const header = `Assunto: ${title.slice(0, 1000)}\n\n`;
  const body = messages.map((text, index) => `Mensagem ${index + 1}:\n${text}`).join('\n\n');
  const budget = 50_000 - header.length;
  const truncated = body.length > budget;
  return {
    context: header + body.slice(-budget),
    latestContext: messages.length ? header + messages.at(-1)!.slice(-budget) : '',
    messageCount: messages.length,
    truncated,
    coverage: `${messages.length} mensagem(ns) visível(is) carregada(s) neste ticket. ${truncated ? 'O limite de 50.000 caracteres foi atingido; apenas o trecho mais recente está incluído.' : 'Todas essas mensagens estão incluídas.'} Mensagens antigas não carregadas e históricos citados nos e-mails não estão incluídos.`,
  };
}
