import { bindInpageAppearance } from '@/services/appearance/inpageTheme';
import { createSummaryRequest, type SummarySend } from '@/services/ai/summaryRequest';
import { readAiMessage, getAiTicketIdentity } from './aiTicketContext';
import { getScopedTicketContainer, isTicketElementVisible } from './licenseDetector';
import { anchorSummaryPanel } from './aiSummaryPosition';
import { aiIcons } from './aiIcons';
import { attachStyleExample } from './aiStyleExample';

export function attachMessageSummary(body: HTMLElement, host: HTMLElement, send?: SummarySend) {
  const doc = body.ownerDocument, scope = getScopedTicketContainer(body)!;
  const contentRoot = body.closest<HTMLElement>('.comment') || body;
  const identity = getAiTicketIdentity(scope), request = createSummaryRequest(send);
  const button = doc.createElement('button'); button.type = 'button'; button.className = 'octa-summary-button octa-message-summary-button'; button.innerHTML = `${aiIcons.sparkle}<span>Resumir</span>`; button.dataset.octaAi = 'true';
  const stopButtonTheme = bindInpageAppearance(button);
  let panel: HTMLElement | null = null, disposePanel = () => {}, stopPanelTheme = () => {};
  const valid = () => button.isConnected && body.isConnected && scope.isConnected && getScopedTicketContainer(body) === scope && getAiTicketIdentity(scope) === identity && isTicketElementVisible(body);
  function close() {
    request.cancel(); stopPanelTheme(); disposePanel(); panel = null;
    button.disabled = false; button.setAttribute('aria-expanded', 'false');
  }
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', async event => {
    event.preventDefault(); event.stopPropagation();
    if (panel) { close(); return; }
    if (!valid()) return;
    const source = readAiMessage(body); if (!source) return;
    panel = doc.createElement('aside'); panel.className = 'octa-message-summary'; panel.dataset.octaAi = 'true'; panel.setAttribute('aria-label', 'Resumo desta mensagem');
    panel.innerHTML = `<header><strong>${aiIcons.sparkle}<span>Resumo da mensagem</span></strong><button type="button" class="octa-summary-close" aria-label="Fechar resumo">${aiIcons.close}</button></header><div class="octa-summary-text" role="status">Resumindo…</div>`;
    stopPanelTheme = bindInpageAppearance(panel); disposePanel = anchorSummaryPanel(panel, button, contentRoot);
    const content = panel.querySelector<HTMLElement>('.octa-summary-text')!;
    panel.querySelector('button')!.addEventListener('click', close);
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); button.focus(); } });
    button.disabled = true; button.setAttribute('aria-expanded', 'true');
    try {
      const text = await request.run('summary_latest', source.slice(-50_000), 'Resuma esta mensagem de e-mail em português, destacando o pedido, informações novas e pendências.');
      if (text === null || !panel) return;
      if (!valid() || readAiMessage(body) !== source) { close(); return; }
      content.textContent = (source.length > 50_000 ? 'Mensagem acima do limite: apenas o trecho final foi analisado.\n\n' : '') + text;
    } catch (error) { if (panel) content.textContent = error instanceof Error ? error.message : 'Não foi possível resumir.'; }
    finally { button.disabled = false; }
  });
  const actions = host.querySelector(':scope > .comment-actions');
  if (actions) actions.before(button); else host.append(button);
  const stopStyleExample = attachStyleExample(body, host);
  return { valid, dispose() { close(); stopStyleExample(); stopButtonTheme(); button.remove(); } };
}
