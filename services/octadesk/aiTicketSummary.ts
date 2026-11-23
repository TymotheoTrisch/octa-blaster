import { bindInpageAppearance } from '@/services/appearance/inpageTheme';
import { boundedChat, createSummaryRequest, type SummarySend } from '@/services/ai/summaryRequest';
import type { AiChatTurn } from '@/types/ai';
import { aiMessageAttribution, collectAiTicketContext, getAiTicketIdentity, readAiMessage } from './aiTicketContext';
import { getScopedTicketContainer, isTicketElementVisible } from './licenseDetector';
import { expandAiHistory } from './aiHistory';
import { createChatMessages } from './aiChatMessages';
import { aiIcons } from './aiIcons';
import { createTicketChatPersistence, textDigest } from '@/services/ai/ticketChatPersistence';

const SUMMARY_INSTRUCTION = 'Resuma a conversa disponível deste ticket: solicitação, evolução, procedimentos realizados, situação atual e pendências. Aponte informações ausentes.';
export interface EmailSummaryForChat { message: HTMLElement; source: string; summary: string }
const chats = new WeakMap<Document, { scope: HTMLElement; identity: string; dialog: HTMLElement; close(): void; addEmail(email: EmailSummaryForChat): void }>();

export function openTicketSummary(scope: HTMLElement, send?: SummarySend, email?: EmailSummaryForChat) {
  const doc = scope.ownerDocument;
  const current = chats.get(doc);
  if (current?.dialog.isConnected && current.scope === scope && current.identity === getAiTicketIdentity(scope)) {
    if (email) current.addEmail(email);
    else current.dialog.querySelector<HTMLTextAreaElement>('footer textarea')?.focus();
    return current.close;
  }
  current?.close();
  let captured = collectAiTicketContext(scope);
  const identity = getAiTicketIdentity(scope), request = createSummaryRequest(send);
  const persistence = createTicketChatPersistence(scope);
  const dialog = doc.createElement('dialog'); dialog.className = 'octa-ticket-chat'; dialog.dataset.octaAi = 'true'; dialog.setAttribute('aria-label', 'Resumo do ticket');
  dialog.innerHTML = `<header><h2>${aiIcons.sparkle}<span>Resumo do ticket</span></h2><button type="button" class="octa-summary-close" aria-label="Fechar conversa">${aiIcons.close}</button></header><div class="octa-ticket-chat-log" role="log" aria-label="Conversa sobre o ticket"></div><div class="octa-ticket-chat-status" role="status"></div><footer><textarea maxlength="4000" aria-label="Pergunte sobre o ticket" placeholder="Pergunte sobre o ticket… Enter envia; Shift+Enter quebra a linha."></textarea></footer>`;
  const log = dialog.querySelector<HTMLElement>('.octa-ticket-chat-log')!, status = dialog.querySelector<HTMLElement>('.octa-ticket-chat-status')!, input = dialog.querySelector<HTMLTextAreaElement>('footer textarea')!;
  const stopTheme = bindInpageAppearance(dialog);
  let closed = false, busy = false, messages: AiChatTurn[] = [];
  let persistent = true;
  let ready = false, digest = '', conversationKey = '', memoryNamespace = 'local', pendingQuestion = '', saveError = '', restoredNotice = '';
  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  const contextTimer = doc.defaultView?.setInterval(() => { if (!scope.isConnected || !isTicketElementVisible(scope) || getAiTicketIdentity(scope) !== identity) close(); }, 500);
  const emailQueue = email ? [email] : [];
  const coverage = () => [restoredNotice, captured.coverage, request.contextNotice(), saveError].filter(Boolean).join('\n');
  async function save() {
    if (!ready || !persistent) return;
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
  function close() { if (closed) return; clearTimeout(draftTimer); if (contextTimer !== undefined) doc.defaultView?.clearInterval(contextTimer); void save(); closed = true; emailQueue.length = 0; if (chats.get(doc)?.dialog === dialog) chats.delete(doc); doc.defaultView?.removeEventListener('pagehide', close); request.cancel(); stopTheme(); dialog.remove(); }
  async function importEmails() {
    if (!ready || busy || closed || !emailQueue.length) return;
    busy = true; input.disabled = true;
    try {
      captured = collectAiTicketContext(scope); digest = await textDigest(captured.context);
      while (emailQueue.length && !closed) {
        const selected = emailQueue.shift()!;
        if (!valid() || getScopedTicketContainer(selected.message) !== scope || readAiMessage(selected.message) !== selected.source || !selected.summary.trim()) throw new Error('O e-mail selecionado mudou ou pertence a outro ticket. Abra o resumo da mensagem novamente.');
        if (closed) return;
        if (!valid() || readAiMessage(selected.message) !== selected.source) throw new Error('O e-mail selecionado mudou durante a importação. Abra o resumo da mensagem novamente.');
        const metadata = aiMessageAttribution(selected.message);
        const question = `Quero conversar sobre este e-mail.\nRemetente: ${metadata.autor}${metadata.data ? `\nData: ${metadata.data}` : ''}.\nTrecho inicial: ${selected.source.slice(0, 400)}\nO resumo a seguir se refere somente a esse e-mail. Confirme os fatos no contexto atual do ticket.`;
        const answer = `Resumo do e-mail selecionado:\n\n${selected.summary.slice(0, 16000)}${selected.summary.length > 16000 ? '\n[Resumo importado parcialmente por limite de tamanho.]' : ''}`;
        if (!messages.some((turn, index) => turn.role === 'user' && turn.content === question && messages[index + 1]?.role === 'assistant' && messages[index + 1]?.content === answer)) {
          messages = [...messages, { role: 'user', content: question }, { role: 'assistant', content: answer }];
        }
        restoredNotice = 'Resumo do e-mail disponível nesta conversa. Faça sua pergunta abaixo.';
      }
      if (closed) return;
      renderer.render(messages); await save(); if (!closed) status.textContent = coverage();
    } catch (error) { if (!closed) status.textContent = error instanceof Error ? error.message : 'Não foi possível levar o e-mail para esta conversa.'; }
    finally { busy = false; if (!closed) { input.disabled = !valid(); if (emailQueue.length) void importEmails(); else if (!input.disabled) input.focus(); } }
  }
  chats.set(doc, { scope, identity, dialog, close, addEmail(selected) { emailQueue.push(selected); void importEmails(); } });
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
      const text = await request.run(question ? 'chat' : 'summary_full', captured.context, question || SUMMARY_INSTRUCTION, history, conversationKey, memoryNamespace);
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
    } finally { pendingQuestion = ''; busy = false; if (!closed) { input.disabled = !valid(); if (emailQueue.length) void importEmails(); else if (!input.disabled && editIndex === undefined) input.focus(); } }
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
    const loaded = await expandAiHistory(scope, () => !closed && scope.isConnected && getAiTicketIdentity(scope) === identity).catch(() => false);
    if (closed) return;
    captured = collectAiTicketContext(scope);
    if (!loaded) captured.coverage += ' Não foi possível confirmar o carregamento de todas as interações.';
    try {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const saved = await Promise.race([persistence.load(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Histórico indisponível.')), 6000); })]).finally(() => clearTimeout(timeout));
      conversationKey = await persistence.identity();
      memoryNamespace = await persistence.namespace();
      digest = await textDigest(captured.context);
      if (closed) return;
      ready = true; input.value = saved?.draft || '';
      if (saved?.messages.length) messages = saved.messages;
      if (emailQueue.length) { await importEmails(); return; }
      if (saved?.messages.length) {
        messages = saved.messages; input.value = saved.draft;
        restoredNotice = saved.contextDigest !== digest ? 'Conversa recuperada. As mensagens do ticket mudaram; as próximas perguntas usarão o conteúdo atualizado.' : 'Conversa recuperada do armazenamento local.';
        renderer.render(messages); status.textContent = coverage(); input.disabled = !valid(); if (!input.disabled) input.focus();
      } else if (captured.messageCount) await run(); else { status.textContent = 'Nenhuma mensagem carregada neste ticket.'; input.disabled = false; }
    } catch {
      if (closed) return;
      persistent = false; ready = true; conversationKey = '';
      saveError = 'O histórico local não pôde ser recuperado. Esta conversa não será salva nesta janela.';
      if (emailQueue.length) { await importEmails(); return; }
      if (captured.messageCount) await run(); else { status.textContent = 'Nenhuma mensagem carregada neste ticket.'; input.disabled = false; }
    }
  })().catch(error => { if (!closed) status.textContent = error instanceof Error ? error.message : 'Não foi possível abrir o resumo.'; });
  return close;
}
