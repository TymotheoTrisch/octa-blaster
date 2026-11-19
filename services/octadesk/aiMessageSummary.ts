import { bindInpageAppearance } from '@/services/appearance/inpageTheme';
import { createSummaryRequest, type SummarySend } from '@/services/ai/summaryRequest';
import { readAiMessage, getAiTicketIdentity } from './aiTicketContext';
import { getScopedTicketContainer, isTicketElementVisible } from './licenseDetector';

export function attachMessageSummary(body: HTMLElement, host: HTMLElement, send?: SummarySend) {
  const doc = body.ownerDocument, scope = getScopedTicketContainer(body)!;
  const contentRoot = body.closest<HTMLElement>('.comment') || body;
  const identity = getAiTicketIdentity(scope), request = createSummaryRequest(send);
  const button = doc.createElement('button'); button.type = 'button'; button.className = 'octa-summary-button octa-message-summary-button'; button.textContent = 'Resumir'; button.dataset.octaAi = 'true';
  const stopButtonTheme = bindInpageAppearance(button);
  let wrapper: HTMLElement | null = null, panel: HTMLElement | null = null, resize: ResizeObserver | null = null, stopPanelTheme = () => {};
  const valid = () => button.isConnected && body.isConnected && scope.isConnected && getScopedTicketContainer(body) === scope && getAiTicketIdentity(scope) === identity && isTicketElementVisible(body);
  function close() {
    request.cancel(); resize?.disconnect(); resize = null; stopPanelTheme(); panel?.remove(); panel = null;
    if (wrapper?.isConnected && contentRoot.parentElement === wrapper) wrapper.replaceWith(contentRoot);
    wrapper = null; button.disabled = false; button.setAttribute('aria-expanded', 'false');
  }
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', async event => {
    event.preventDefault(); event.stopPropagation();
    if (panel) { close(); return; }
    if (!valid()) return;
    const source = readAiMessage(body); if (!source) return;
    const height = Math.max(180, Math.min(440, contentRoot.getBoundingClientRect().height));
    wrapper = doc.createElement('div'); wrapper.className = 'octa-summary-layout';
    contentRoot.before(wrapper); wrapper.append(contentRoot);
    panel = doc.createElement('aside'); panel.className = 'octa-message-summary'; panel.dataset.octaAi = 'true'; panel.setAttribute('aria-label', 'Resumo desta mensagem'); panel.style.height = `${height}px`;
    panel.innerHTML = '<header><strong>Resumo da mensagem</strong><button type="button" class="octa-summary-close" aria-label="Fechar resumo">×</button></header><div class="octa-summary-text" role="status">Resumindo…</div>';
    wrapper.append(panel); stopPanelTheme = bindInpageAppearance(panel);
    const content = panel.querySelector<HTMLElement>('.octa-summary-text')!;
    panel.querySelector('button')!.addEventListener('click', close);
    const fit = () => { if (wrapper) wrapper.dataset.narrow = String(wrapper.getBoundingClientRect().width < 760); };
    fit();
    const Observer = doc.defaultView?.ResizeObserver;
    if (Observer) { resize = new Observer(fit); resize.observe(wrapper); }
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
  return { valid, dispose() { close(); stopButtonTheme(); button.remove(); } };
}
