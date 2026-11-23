import { bindInpageAppearance } from '@/services/appearance/inpageTheme';
import { boundedChat, createSummaryRequest, type SummarySend } from '@/services/ai/summaryRequest';
import type { AiChatTurn } from '@/types/ai';
import { collectAiTicketContext, getAiTicketIdentity } from './aiTicketContext';
import { isTicketElementVisible } from './licenseDetector';
import { expandAiHistory } from './aiHistory';
import { createChatMessages } from './aiChatMessages';
import { aiIcons } from './aiIcons';
import { createTicketChatPersistence, textDigest } from '@/services/ai/ticketChatPersistence';

const SUMMARY_INSTRUCTION = 'Resuma a conversa disponível deste ticket: solicitação, evolução, procedimentos realizados, situação atual e pendências. Aponte informações ausentes.';

export function openTicketSummary(scope: HTMLElement, send?: SummarySend) {
  const doc = scope.ownerDocument;
  if (doc.querySelector('.octa-ticket-chat')) return () => {};
  let captured = collectAiTicketContext(scope);
  const identity = getAiTicketIdentity(scope), request = createSummaryRequest(send);
  const persistence = createTicketChatPersistence(scope);
  const dialog = doc.createElement('dialog'); dialog.className = 'octa-ticket-chat'; dialog.dataset.octaAi = 'true'; dialog.setAttribute('aria-label', 'Resumo do ticket');
  dialog.innerHTML = `<header><h2>${aiIcons.sparkle}<span>Resumo do ticket</span></h2><button type="button" class="octa-summary-close" aria-label="Fechar conversa">${aiIcons.close}</button></header><div class="octa-ticket-chat-log" role="log" aria-label="Conversa sobre o ticket"></div><div class="octa-ticket-chat-status" role="status"></div><footer><textarea maxlength="4000" aria-label="Pergunte sobre o ticket" placeholder="Pergunte sobre o ticket… Enter envia; Shift+Enter quebra a linha."></textarea></footer>`;
  const log = dialog.querySelector<HTMLElement>('.octa-ticket-chat-log')!, status = dialog.querySelector<HTMLElement>('.octa-ticket-chat-status')!, input = dialog.querySelector<HTMLTextAreaElement>('footer textarea')!;
  const stopTheme = bindInpageAppearance(dialog);
  let closed = false, busy = false, messages: AiChatTurn[] = [];
  let ready = false, digest = '', pendingQuestion = '', saveError = '', restoredNotice = '';
  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  const coverage = () => [restoredNotice, captured.coverage, saveError].filter(Boolean).join('\n');
  async function save() {
    if (!ready) return;
    try {
      await persistence.save({ messages, draft: dialog.querySelector<HTMLTextAreaElement>('.octa-chat-edit-input')?.value || input.value || pendingQuestion, contextDigest: digest });
      saveError = '';
    } catch (error) {
      saveError = `O chat continua nesta janela, mas não foi salvo: ${error instanceof Error ? error.message : 'falha no armazenamento local.'}`;
      if (!closed) status.textContent = coverage();
    }
  }
  const renderer = createChatMessages(log, (index, question) => { if (!busy && messages[index]?.role === 'user') void run(question, index); });
  const valid = () => scope.isConnected && isTicketElementVisible(scope) && getAiTicketIdentity(scope) === identity && collectAiTicketContext(scope).context === captured.context;
  function close() { if (closed) return; clearTimeout(draftTimer); void save(); closed = true; doc.defaultView?.removeEventListener('pagehide', close); request.cancel(); stopTheme(); dialog.remove(); }
  async function run(question?: string, editIndex?: number) {
    if (busy || closed || !ready) return;
    if (!valid()) { status.textContent = 'O ticket ou as mensagens mudaram. Feche e abra o resumo novamente.'; input.disabled = true; return; }
    const original = messages;
    const before = editIndex === undefined ? messages : messages.slice(0, editIndex);
    busy = true; input.disabled = true; status.textContent = 'Analisando as mensagens…';
    pendingQuestion = question || '';
    renderer.render(question ? [...before, { role: 'user', content: question }] : before, { busy: true });
    try {
      const history = question ? boundedChat(before[0]?.role === 'assistant' ? [{ role: 'user', content: SUMMARY_INSTRUCTION }, ...before] : before) : [];
      const text = await request.run(question ? 'chat' : 'summary_full', captured.context, question || SUMMARY_INSTRUCTION, history);
      if (closed || text === null) return;
      if (!valid()) { status.textContent = 'O ticket ou as mensagens mudaram durante a análise. Reabra o resumo.'; renderer.render(original, { busy: true }); return; }
      messages = question ? [...before, { role: 'user', content: question }, { role: 'assistant', content: text }] : [{ role: 'assistant', content: text }];
      pendingQuestion = ''; renderer.render(messages); await save();
      if (!closed) status.textContent = coverage();
    } catch (error) {
      if (!closed) {
        renderer.render(original, editIndex === undefined ? {} : { editing: { index: editIndex, text: question! } });
        if (question && editIndex === undefined) input.value = question;
        status.textContent = error instanceof Error ? error.message : 'Não foi possível consultar a IA.';
      }
    } finally { pendingQuestion = ''; busy = false; if (!closed) { input.disabled = !valid(); if (!input.disabled && editIndex === undefined) input.focus(); } }
  }
  dialog.querySelector('header button')!.addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault(); const text = input.value.trim(); if (!text || busy) return;
    input.value = ''; void run(text);
  });
  input.addEventListener('input', () => { clearTimeout(draftTimer); draftTimer = setTimeout(() => void save(), 350); });
  doc.body.append(dialog);
  doc.defaultView?.addEventListener('pagehide', close, { once: true });
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  input.disabled = true; status.textContent = 'Carregando as interações do ticket…';
  void (async () => {
    const loaded = await expandAiHistory(scope, () => !closed && scope.isConnected && getAiTicketIdentity(scope) === identity);
    if (closed) return;
    captured = collectAiTicketContext(scope);
    if (!loaded) captured.coverage += ' Não foi possível confirmar o carregamento de todas as interações.';
    try {
      const saved = await persistence.load();
      digest = await textDigest(captured.context);
      if (closed) return;
      ready = true;
      if (saved) {
        messages = saved.messages; input.value = saved.draft;
        restoredNotice = saved.contextDigest !== digest ? 'Conversa recuperada. As mensagens do ticket mudaram; as próximas perguntas usarão o conteúdo atualizado.' : 'Conversa recuperada do armazenamento local.';
        renderer.render(messages); status.textContent = coverage(); input.disabled = !valid(); if (!input.disabled) input.focus();
      } else if (captured.messageCount) await run(); else { status.textContent = 'Nenhuma mensagem carregada neste ticket.'; input.disabled = false; }
    } catch (error) { if (!closed) status.textContent = `Não foi possível recuperar o histórico: ${error instanceof Error ? error.message : 'falha no armazenamento local.'} Feche e reabra o resumo para tentar novamente.`; }
  })();
  return close;
}
