import { aiLocalMessage } from '@/services/ai/localClient';
import { bindInpageAppearance } from '@/services/appearance/inpageTheme';
import { readAiMessage } from './aiTicketContext';
import { aiIcons } from './aiIcons';

export function redactStyleExample(text: string) {
  return text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[e-mail]')
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/\b\d[\d.\/() +\-]{5,}\d\b/g, '[número]')
    .slice(0, 2000);
}

export function attachStyleExample(body: HTMLElement, host: HTMLElement) {
  const doc = body.ownerDocument, button = doc.createElement('button');
  button.type = 'button'; button.className = 'octa-style-button'; button.dataset.octaAi = 'true'; button.innerHTML = aiIcons.edit; button.title = 'Usar minha resposta como exemplo de escrita'; button.setAttribute('aria-label', button.title);
  const stopTheme = bindInpageAppearance(button); let closeEditor = () => {};
  button.addEventListener('click', async event => {
    event.preventDefault(); event.stopPropagation(); if (doc.querySelector('.octa-style-editor')) return;
    const author = host.querySelector('.comment-title')?.textContent?.split('|')[0]?.replace(/\s*\([^)]*\)/g, '').trim() || '';
    const dialog = doc.createElement('dialog'); dialog.className = 'octa-ticket-chat octa-style-editor'; dialog.dataset.octaAi = 'true'; dialog.setAttribute('aria-label', 'Revisar exemplo de escrita');
    dialog.innerHTML = `<header><h2>Exemplo do meu estilo</h2><button type="button" class="octa-summary-close" aria-label="Fechar exemplo">${aiIcons.close}</button></header><div class="octa-style-fields"><p>Confira se esta resposta é sua e remova nomes, dados de clientes e fatos específicos. A ocultação automática cobre apenas alguns formatos.</p><label>Autor identificado<input readonly aria-label="Autor identificado"></label><label>Texto revisado<textarea maxlength="2000" aria-label="Texto revisado do exemplo"></textarea></label><p role="status">Conferindo seu perfil…</p><button type="button" class="octa-chat-save-edit" disabled>Salvar exemplo no meu perfil</button></div>`;
    const authorField = dialog.querySelector<HTMLInputElement>('input')!, field = dialog.querySelector<HTMLTextAreaElement>('textarea')!, status = dialog.querySelector<HTMLElement>('[role="status"]')!, save = dialog.querySelector<HTMLButtonElement>('.octa-chat-save-edit')!;
    authorField.value = author; field.value = redactStyleExample(readAiMessage(body));
    const stopDialogTheme = bindInpageAppearance(dialog);
    closeEditor = () => { stopDialogTheme(); dialog.remove(); };
    dialog.querySelector('header button')!.addEventListener('click', closeEditor); dialog.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
    save.addEventListener('click', async () => { save.disabled = true; try { await aiLocalMessage('AI_STYLE_SAVE', { author, text: field.value.trim() }); status.textContent = 'Exemplo salvo no seu perfil. Nenhuma solicitação à IA foi feita.'; } catch (error) { status.textContent = error instanceof Error ? error.message : 'Não foi possível salvar.'; save.disabled = false; } });
    doc.body.append(dialog); if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    try { const profile = await aiLocalMessage('AI_PROFILE'); if (!dialog.isConnected) return; const normal = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('pt-BR'); const own = !!author && [profile.name, ...profile.aliases].filter(Boolean).some(name => normal(name) === normal(author)); status.textContent = own ? 'Revise o texto antes de salvar. Serão guardados até 3 exemplos recentes.' : 'O autor não corresponde ao seu perfil. Configure seu nome e as abreviações em Inteligência artificial → Meu perfil e estilo.'; save.disabled = !own; } catch (error) { if (dialog.isConnected) status.textContent = error instanceof Error ? error.message : 'Não foi possível conferir a autoria.'; }
  });
  host.append(button);
  return () => { closeEditor(); stopTheme(); button.remove(); };
}
