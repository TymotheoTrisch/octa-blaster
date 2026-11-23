import type { AiChatTurn } from '@/types/ai';
import { copyAiText } from '@/services/ai/clipboard';
import { aiIcons } from './aiIcons';

export interface ChatRenderOptions { busy?: boolean; editing?: { index: number; text: string } }
export function createChatMessages(log: HTMLElement, onEdit: (index: number, question: string) => void, copy = copyAiText) {
  const doc = log.ownerDocument;
  function render(messages: AiChatTurn[], options: ChatRenderOptions = {}) {
    log.replaceChildren();
    for (const [index, message] of messages.entries()) {
      const row = doc.createElement('div'); row.className = 'octa-ticket-chat-turn'; row.dataset.role = message.role;
      const label = doc.createElement('strong'); label.textContent = message.role === 'user' ? 'Você' : 'OctaBlaster';
      const text = doc.createElement('div'); text.className = 'octa-chat-message-text'; text.textContent = message.content;
      row.append(label, text);
      if (options.editing?.index === index) {
        const editor = doc.createElement('textarea'); editor.className = 'octa-chat-edit-input'; editor.value = options.editing.text; editor.maxLength = 4000; editor.setAttribute('aria-label', 'Editar pergunta');
        const actions = doc.createElement('div'); actions.className = 'octa-chat-edit-actions';
        const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancelar'; cancel.addEventListener('click', () => render(messages));
        const save = doc.createElement('button'); save.type = 'button'; save.className = 'octa-chat-save-edit'; save.textContent = 'Salvar e reenviar';
        const submit = () => { const question = editor.value.trim(); if (question) onEdit(index, question); };
        save.addEventListener('click', submit);
        editor.addEventListener('keydown', event => {
          if (event.key === 'Escape') { event.preventDefault(); render(messages); }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(); }
        });
        actions.append(cancel, save); text.replaceWith(editor); row.append(actions); log.append(row); editor.focus();
      } else {
        const actions = doc.createElement('div'); actions.className = 'octa-chat-message-actions';
        const action = doc.createElement('button'); action.type = 'button'; action.className = 'octa-chat-message-action';
        if (message.role === 'assistant') {
          action.innerHTML = aiIcons.copy; action.setAttribute('aria-label', 'Copiar resposta inteira'); action.title = 'Copiar resposta inteira';
          const feedback = doc.createElement('span'); feedback.setAttribute('role', 'status');
          action.addEventListener('click', async () => { try { await copy(message.content, doc); feedback.textContent = 'Copiado'; } catch { feedback.textContent = 'Não foi possível copiar'; } });
          actions.append(action, feedback);
        } else {
          action.innerHTML = aiIcons.edit; action.setAttribute('aria-label', 'Editar pergunta'); action.title = 'Editar pergunta'; action.disabled = !!options.busy;
          action.addEventListener('click', () => render(messages, { editing: { index, text: message.content } })); actions.append(action);
        }
        row.append(actions); log.append(row);
      }
    }
    log.scrollTop = log.scrollHeight;
  }
  return { render };
}
