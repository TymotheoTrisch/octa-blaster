import { aiLocalMessage } from '@/services/ai/localClient';
import type { AiChatTurn, AiTask } from '@/types/ai';
import type { collectAiTicketContext } from './aiTicketContext';

interface ChatOptions {
  dialog: HTMLDialogElement;
  ticketContext: ReturnType<typeof collectAiTicketContext>;
  contextField: HTMLTextAreaElement;
  model: HTMLSelectElement;
  snapshot: { valid(): boolean };
  send: typeof aiLocalMessage;
  draftBusy(): boolean;
  refreshContext(): ReturnType<typeof collectAiTicketContext>;
  useAnswer(text: string): void;
}

export function mountAiChat(options: ChatOptions) {
  const { dialog, ticketContext, contextField, model, snapshot, send } = options;
  const doc = dialog.ownerDocument;
  const section = doc.createElement('section'); section.className = 'ai-chat';
  section.setAttribute('aria-label', 'Chat sobre o ticket');
  section.innerHTML = `<h2>Converse sobre este ticket</h2><p class="ai-help ai-coverage"></p><div class="ai-actions"><button type="button" class="ai-summary-latest">Resumir última mensagem</button><button type="button" class="ai-summary-full">Resumo completo</button><button type="button" class="ai-chat-clear">Limpar conversa</button></div><details><summary>Contexto da última mensagem</summary><textarea class="ai-latest-context" maxlength="50000" aria-label="Contexto da última mensagem"></textarea></details><div class="ai-chat-history" role="log" aria-label="Conversa com a IA"></div><label>Pergunte sobre o atendimento<textarea class="ai-question" maxlength="4000" placeholder="Ex.: o que o cliente está aguardando? O que já foi tentado?"></textarea></label><div class="ai-actions"><button type="button" class="ai-chat-stop" disabled>Interromper</button><button type="button" class="ai-chat-ask">Perguntar</button></div><p class="ai-chat-status ai-status" role="status"></p>`;
  const style = doc.createElement('style');
  style.textContent = '.octa-ai-dialog .ai-chat{border-top:1px solid #ddd;margin-top:24px;padding-top:20px}.octa-ai-dialog .ai-chat-status{color:#3c3f43}.octa-ai-dialog .ai-chat-history{max-height:320px;overflow:auto;display:flex;flex-direction:column;gap:10px;margin-top:14px}.octa-ai-dialog .ai-chat-turn{padding:12px;border-radius:10px;background:#f7f8f9;white-space:pre-wrap;overflow-wrap:anywhere}.octa-ai-dialog .ai-chat-turn[data-role="user"]{background:#fff7d6;margin-left:24px}.octa-ai-dialog .ai-chat-turn strong{display:block}.octa-ai-dialog .ai-chat-turn button{display:block;margin-top:8px;font-size:12px}';
  section.prepend(style); dialog.append(section);
  const shortcut = doc.createElement('button'); shortcut.type = 'button'; shortcut.className = 'ai-chat-open'; shortcut.textContent = 'Resumos e perguntas sobre o ticket';
  shortcut.addEventListener('click', () => section.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  dialog.querySelector('h2')?.after(shortcut);
  const coverage = section.querySelector<HTMLElement>('.ai-coverage')!;
  const showCoverage = (text: string) => { coverage.textContent = text + ' Contexto capturado ao abrir ou atualizar esta janela. O chat fica somente nesta janela. Cada pergunta ou resumo consome o uso do plano.'; };
  showCoverage(ticketContext.coverage);
  const refresh = doc.createElement('button'); refresh.type = 'button'; refresh.className = 'ai-context-refresh'; refresh.textContent = 'Atualizar contexto';
  section.querySelector('.ai-actions')!.append(refresh);
  const latest = section.querySelector<HTMLTextAreaElement>('.ai-latest-context')!; latest.value = ticketContext.latestContext;
  const question = section.querySelector<HTMLTextAreaElement>('.ai-question')!;
  const log = section.querySelector<HTMLElement>('.ai-chat-history')!;
  const status = section.querySelector<HTMLElement>('.ai-chat-status')!;
  const stop = section.querySelector<HTMLButtonElement>('.ai-chat-stop')!;
  let history: AiChatTurn[] = [], requestId: string | null = null, closed = false, revision = 0;
  const valid = () => snapshot.valid() && contextField.value.trim();
  function addTurn(role: 'user' | 'assistant', text: string) {
    const row = doc.createElement('div'); row.className = 'ai-chat-turn'; row.dataset.role = role;
    const label = doc.createElement('strong'); label.textContent = role === 'user' ? 'Você' : 'IA';
    row.append(label, doc.createTextNode(text));
    if (role === 'assistant') {
      const use = doc.createElement('button'); use.type = 'button'; use.textContent = 'Usar como rascunho';
      use.addEventListener('click', () => {
        if (requestId || options.draftBusy()) return;
        if (!valid()) { status.textContent = 'O ticket ou o rascunho mudou. Abra a IA novamente.'; return; }
        options.useAnswer(text);
        dialog.querySelector<HTMLTextAreaElement>('.ai-preview')?.focus();
      }); row.append(use);
    }
    log.append(row); log.scrollTop = log.scrollHeight;
    return row;
  }
  function cancel() {
    revision++;
    if (requestId) void send('AI_CANCEL', { requestId }).catch(() => {});
    requestId = null; stop.disabled = true; question.disabled = false;
  }
  function clear() { cancel(); history = []; log.replaceChildren(); status.textContent = ''; }
  // Alterações de contexto/modelo invalidam o histórico para não misturar fontes.
  [contextField, latest, model].forEach(field => field.addEventListener('input', clear));
  section.querySelector('.ai-chat-clear')!.addEventListener('click', clear);
  refresh.addEventListener('click', () => {
    if (requestId || options.draftBusy()) return;
    if (!snapshot.valid()) { status.textContent = 'O ticket ou o rascunho mudou. Abra a IA novamente.'; return; }
    try {
      const updated = options.refreshContext();
      clear(); contextField.value = updated.context; latest.value = updated.latestContext; showCoverage(updated.coverage);
      contextField.dispatchEvent(new doc.defaultView!.Event('input', { bubbles: true }));
      status.textContent = 'Contexto atualizado. O histórico do chat foi limpo; revise as mensagens antes de consultar.';
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Não foi possível atualizar o contexto.'; }
  });
  stop.addEventListener('click', () => { cancel(); status.textContent = 'Solicitação interrompida. Nenhum texto foi inserido.'; });
  async function run(task: AiTask) {
    if (requestId || options.draftBusy() || closed) return;
    if (!valid()) { status.textContent = 'O ticket ou o rascunho mudou. Abra a IA novamente.'; return; }
    if (!model.value) { status.textContent = 'Conecte o auxiliar e escolha um modelo.'; return; }
    const instruction = task === 'summary_latest' ? 'Resuma a última mensagem do e-mail: pedido, informações novas e pendências.'
      : task === 'summary_full' ? 'Resuma o atendimento completo disponível: solicitação, evolução, procedimentos, situação atual e pendências. Informe lacunas no histórico.' : question.value.trim();
    if (!instruction) { status.textContent = 'Digite uma pergunta sobre o ticket.'; return; }
    const context = task === 'summary_latest' ? latest.value.trim() : contextField.value.trim();
    if (!context) { status.textContent = 'Não há mensagem carregada para resumir.'; return; }
    const id = crypto.randomUUID(), currentRevision = ++revision;
    requestId = id; stop.disabled = false; question.disabled = true; status.textContent = 'Consultando a IA…';
    const row = addTurn('user', task === 'chat' ? instruction : task === 'summary_latest' ? 'Resumir última mensagem' : 'Resumo completo');
    // Resumos são independentes; perguntas recebem apenas pares completos do chat atual.
    const turns = task === 'chat' ? history.slice(-12) : [];
    try {
      const result = await send('AI_GENERATE', { requestId: id, input: { model: model.value, instruction, context, examples: [], task, history: turns } });
      if (closed || revision !== currentRevision) return;
      if (!valid()) throw new Error('O ticket ou o rascunho mudou durante a consulta. Abra a IA novamente.');
      addTurn('assistant', result.text);
      history = [...history, { role: 'user' as const, content: instruction }, { role: 'assistant' as const, content: result.text }];
      // Guarda somente os pares recentes que cabem no limite de transporte.
      while (history.length > 12 || history.reduce((sum, turn) => sum + turn.content.length, 0) > 24_000) history.splice(0, 2);
      if (task === 'chat') question.value = '';
      status.textContent = 'Resposta baseada no contexto disponível. Confira as informações no ticket.';
    } catch (error) {
      if (!closed && revision === currentRevision) { row.remove(); status.textContent = error instanceof Error ? error.message : 'A consulta falhou.'; }
    } finally {
      if (revision === currentRevision) { requestId = null; stop.disabled = true; question.disabled = false; }
    }
  }
  section.querySelector('.ai-summary-latest')!.addEventListener('click', () => void run('summary_latest'));
  section.querySelector('.ai-summary-full')!.addEventListener('click', () => void run('summary_full'));
  section.querySelector('.ai-chat-ask')!.addEventListener('click', () => void run('chat'));
  question.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void run('chat'); } });
  return { busy: () => !!requestId, close() { closed = true; cancel(); } };
}
