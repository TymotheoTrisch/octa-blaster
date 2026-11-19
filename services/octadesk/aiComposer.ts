import { getScopedTicketContainer, getTicketIdentity, isTicketElementVisible } from './licenseDetector';
import { collectAiTicketContext } from './aiTicketContext';
import { mountAiChat } from './aiTicketChat';
import { insertTextIntoElement } from './insertText';
import { aiLocalMessage } from '@/services/ai/localClient';
import { loadStoredTemplates } from '@/services/storage/templateStorage';

function draftValue(editor: HTMLElement): string {
  return editor.matches('input, textarea') ? (editor as HTMLTextAreaElement).value : editor.innerHTML;
}

export function readAiTicketContext(editor: HTMLElement): string {
  return collectAiTicketContext(editor).context;
}

export function captureAiEditor(editor: HTMLElement, current: () => boolean) {
  const scope = getScopedTicketContainer(editor);
  if (!scope) throw new Error('Selecione o campo de resposta do ticket.');
  const identity = getTicketIdentity(scope), before = draftValue(editor);
  const input = editor.matches('input, textarea') ? editor as HTMLTextAreaElement : null;
  const start = input?.selectionStart ?? before.length, end = input?.selectionEnd ?? start;
  const selection = editor.ownerDocument.getSelection();
  const range = selection?.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer) ? selection.getRangeAt(0).cloneRange() : null;
  const valid = () => editor.isConnected && scope.isConnected && getScopedTicketContainer(editor) === scope && getTicketIdentity(scope) === identity && isTicketElementVisible(scope) && isTicketElementVisible(editor) && draftValue(editor) === before && current();
  return {
    valid,
    insert(text: string) {
      if (!valid()) throw new Error('O ticket ou o rascunho mudou. Abra a geração novamente para este atendimento.');
      editor.focus();
      if (input) input.setSelectionRange(start, end);
      else if (range) {
        if (!editor.contains(range.commonAncestorContainer)) throw new Error('O editor foi recriado. Abra a geração novamente.');
        selection?.removeAllRanges(); selection?.addRange(range);
      } else {
        const last = editor.ownerDocument.createRange(); last.selectNodeContents(editor); last.collapse(false);
        selection?.removeAllRanges(); selection?.addRange(last);
      }
      if (!insertTextIntoElement(editor, text, crypto.randomUUID(), true)) throw new Error('Não foi possível inserir o rascunho.');
    },
  };
}

function composerStyles(doc: Document) {
  if (doc.getElementById('octa-ai-styles')) return;
  const style = doc.createElement('style'); style.id = 'octa-ai-styles';
  style.textContent = `.octa-ai-dialog{box-sizing:border-box;border:1px solid #ddd;border-radius:14px;padding:24px;width:min(680px,94vw);max-height:90vh;overflow:auto;color:#1c1b1c;background:#fff;font:14px/1.5 system-ui;z-index:2147483647}.octa-ai-dialog::backdrop{background:#0006}.octa-ai-dialog h2{font-size:20px;margin:0 0 12px}.octa-ai-dialog label{display:block;margin:12px 0}.octa-ai-dialog textarea,.octa-ai-dialog select{display:block;width:100%;box-sizing:border-box;border:1px solid #ccc;border-radius:7px;padding:9px;margin-top:5px;background:white;color:#1c1b1c;font:inherit}.octa-ai-dialog textarea{min-height:80px;resize:vertical}.octa-ai-dialog .ai-context{height:140px}.octa-ai-dialog .ai-preview{height:170px}.octa-ai-dialog button{font:inherit;border:1px solid #ccc;border-radius:20px;padding:8px 14px;background:#fff;color:#1c1b1c;cursor:pointer}.octa-ai-dialog button.ai-primary{background:#ffc600;border-color:#d9aa00}.octa-ai-dialog button:disabled{opacity:.45;cursor:default}.octa-ai-dialog .ai-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}.octa-ai-dialog .ai-status{color:#a32626;white-space:pre-wrap}.octa-ai-dialog .ai-examples{max-height:120px;overflow:auto;border:1px solid #eee;padding:8px;border-radius:8px}.octa-ai-dialog .ai-help{font-size:12px;color:#626262}`;
  (doc.head || doc.documentElement).append(style);
}

export async function openAiComposer(editor: HTMLElement, current: () => boolean, send = aiLocalMessage, loadExamples = loadStoredTemplates): Promise<void> {
  const doc = editor.ownerDocument;
  if (doc.querySelector('.octa-ai-dialog')) return;
  const snapshot = captureAiEditor(editor, current);
  const ticketContext = collectAiTicketContext(editor);
  const context = ticketContext.context;
  composerStyles(doc);
  const dialog = doc.createElement('dialog'); dialog.className = 'octa-ai-dialog'; dialog.setAttribute('aria-label', 'Gerar resposta com IA');
  // Marcação estática; todo conteúdo do ticket, títulos e resposta usa value/textContent.
  dialog.innerHTML = `<h2>Gerar resposta com IA</h2><p class="ai-help">Revise o contexto antes de gerar. A resposta será apresentada para revisão e o envio continuará manual.</p><label>Orientação para a resposta<textarea class="ai-instruction" maxlength="4000" placeholder="Ex.: explique o procedimento e solicite uma nova tentativa, de forma cordial."></textarea></label><label>Contexto do ticket<textarea class="ai-context" maxlength="50000"></textarea></label><label>Modelo<select class="ai-model" disabled></select></label><details><summary>Exemplos das minhas respostas cadastradas (opcional)</summary><p class="ai-help">Escolha até três mensagens para orientar o estilo. São usados trechos de até 4.000 caracteres de cada uma.</p><div class="ai-examples">Carregando…</div></details><label>Resposta sugerida<textarea class="ai-preview" maxlength="100000" placeholder="A sugestão aparecerá aqui para revisão."></textarea></label><p class="ai-status" role="status"></p><div class="ai-actions"><button type="button" class="ai-cancel">Cancelar</button><button type="button" class="ai-generate" disabled>Gerar resposta</button><button type="button" class="ai-insert ai-primary" disabled>Inserir no rascunho</button></div>`;
  const instruction = dialog.querySelector<HTMLTextAreaElement>('.ai-instruction')!;
  const contextField = dialog.querySelector<HTMLTextAreaElement>('.ai-context')!; contextField.value = context;
  const model = dialog.querySelector<HTMLSelectElement>('.ai-model')!;
  const preview = dialog.querySelector<HTMLTextAreaElement>('.ai-preview')!;
  const status = dialog.querySelector<HTMLElement>('.ai-status')!;
  const generate = dialog.querySelector<HTMLButtonElement>('.ai-generate')!;
  const insert = dialog.querySelector<HTMLButtonElement>('.ai-insert')!;
  const examples = dialog.querySelector<HTMLElement>('.ai-examples')!;
  const selected = new Set<string>();
  let requestId: string | null = null, closed = false, dirty = false;
  const chat = mountAiChat({ dialog, ticketContext, contextField, model, snapshot, send,
    refreshContext: () => collectAiTicketContext(editor),
    draftBusy: () => !!requestId,
    useAnswer: text => { preview.value = text; dirty = false; insert.disabled = !snapshot.valid(); status.textContent = 'Revise o texto antes de inserir no rascunho.'; },
  });
  const invalidate = () => { dirty = true; insert.disabled = true; preview.value = ''; };
  [instruction, contextField, model].forEach(field => field.addEventListener('input', invalidate));
  const finish = () => {
    closed = true;
    chat.close();
    if (requestId) void send('AI_CANCEL', { requestId }).catch(() => {});
    dialog.remove();
  };
  dialog.querySelector('.ai-cancel')!.addEventListener('click', finish);
  dialog.addEventListener('cancel', event => { event.preventDefault(); finish(); });
  generate.addEventListener('click', async () => {
    if (requestId || chat.busy()) return;
    try {
      if (!snapshot.valid()) throw new Error('O ticket ou o rascunho mudou. Abra a geração novamente.');
      if (!instruction.value.trim() || !contextField.value.trim()) throw new Error('Preencha a orientação e revise o contexto do ticket.');
      requestId = crypto.randomUUID(); dirty = false; insert.disabled = true; generate.disabled = true; preview.value = ''; status.textContent = 'Gerando a sugestão…';
      [instruction, contextField, model].forEach(field => { field.disabled = true; });
      examples.querySelectorAll<HTMLInputElement>('input').forEach(field => { field.disabled = true; });
      const result = await send('AI_GENERATE', { requestId, input: { model: model.value, instruction: instruction.value.trim(), context: contextField.value.trim(), examples: [...selected] } });
      if (closed) return;
      if (!snapshot.valid()) throw new Error('O ticket ou o rascunho mudou durante a geração. Nenhum texto foi inserido.');
      preview.value = result.text; insert.disabled = false; status.textContent = 'Revise e ajuste a sugestão antes de inserir.';
    } catch (error) { if (!closed) status.textContent = error instanceof Error ? error.message : 'A geração falhou.'; }
    finally {
      requestId = null;
      if (!closed) { generate.disabled = !model.value; [instruction, contextField, model].forEach(field => { field.disabled = false; }); examples.querySelectorAll<HTMLInputElement>('input').forEach(field => { field.disabled = false; }); }
    }
  });
  insert.addEventListener('click', () => {
    try { if (dirty || !preview.value.trim() || requestId) return; insert.disabled = true; snapshot.insert(preview.value); finish(); }
    catch (error) { status.textContent = error instanceof Error ? error.message : 'Não foi possível inserir.'; }
  });
  doc.body.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  instruction.focus();
  await Promise.allSettled([
    (async () => {
      try {
        const result = await send('AI_MODELS');
        if (closed) return;
        model.replaceChildren(...result.models.map((item: { slug: string; name: string }) => { const option = doc.createElement('option'); option.value = item.slug; option.textContent = item.name; option.selected = item.slug === result.preferredModel; return option; }));
        model.disabled = false; generate.disabled = !model.value;
        if (!model.value) status.textContent = 'Nenhum modelo disponível para a conta conectada.';
      } catch (error) { if (!closed) status.textContent = error instanceof Error ? error.message : 'Conecte o auxiliar pelo menu Inteligência artificial.'; }
    })(),
    (async () => {
      try {
        const templates = await loadExamples();
        if (closed) return;
        examples.replaceChildren();
        for (const template of templates) {
          const label = doc.createElement('label'), box = doc.createElement('input'); box.type = 'checkbox';
          box.disabled = !!requestId;
          label.append(box, doc.createTextNode(` ${template.title}`));
          box.addEventListener('change', () => {
            const text = template.content.slice(0, 4000);
            if (box.checked && selected.size >= 3) { box.checked = false; status.textContent = 'Selecione no máximo três exemplos.'; return; }
            if (box.checked) selected.add(text); else selected.delete(text);
            invalidate();
          });
          examples.append(label);
        }
        if (!templates.length) examples.textContent = 'Nenhuma mensagem cadastrada.';
      } catch { if (!closed) examples.textContent = 'Exemplos indisponíveis. Você pode gerar sem eles.'; }
    })(),
  ]);
}
