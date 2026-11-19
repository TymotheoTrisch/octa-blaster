import { bindInpageAppearance } from '@/services/appearance/inpageTheme';

const LICENSE_ALERT_STYLE_ID = 'octablaster-license-alert-styles';

const ALERT_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;
const CLOSE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

function ensureLicenseAlertStyles(doc: Document): void {
  if (doc.getElementById(LICENSE_ALERT_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = LICENSE_ALERT_STYLE_ID;
  style.textContent = `
    dialog.octablaster-license-alert-dialog {
      margin: auto !important;
      padding: 0 !important;
      width: min(410px, calc(100vw - 32px)) !important;
      max-width: 410px !important;
      border: 1px solid var(--octa-border-strong, #3c3f43) !important;
      border-radius: 10px !important;
      background: var(--octa-bg, #ffffff) !important;
      color: var(--octa-text, #1c1b1c) !important;
      box-shadow: var(--octa-shadow-modal, 0 12px 32px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.08)) !important;
      overflow: hidden !important;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
      font-size: 13px !important;
      line-height: 1.45 !important;
      z-index: 2147483647 !important;
    }
    dialog.octablaster-license-alert-dialog::backdrop {
      background: var(--octa-backdrop, rgba(15, 15, 15, 0.45)) !important;
      backdrop-filter: blur(2px) !important;
    }
    .octa-alert-header {
      display: flex !important;
      align-items: center !important;
      gap: 9px !important;
      padding: 12px 16px !important;
      background: var(--octa-bg-secondary, #f7f8f9) !important;
      border-bottom: 1px solid var(--octa-border, #dee0e4) !important;
    }
    .octa-alert-icon-badge {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 26px !important;
      height: 26px !important;
      border-radius: 6px !important;
      background: var(--accent-soft, rgba(255, 198, 0, 0.22)) !important;
      color: var(--accent-soft-text, #6f5600) !important;
      flex-shrink: 0 !important;
    }
    .octa-alert-title {
      flex: 1 !important;
      margin: 0 !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      color: var(--octa-text, #1c1b1c) !important;
    }
    .octa-alert-close {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 26px !important;
      height: 26px !important;
      padding: 0 !important;
      border: none !important;
      border-radius: 5px !important;
      background: transparent !important;
      color: var(--octa-text-muted, #5b5f63) !important;
      cursor: pointer !important;
      transition: background 0.15s ease, color 0.15s ease !important;
    }
    .octa-alert-close:hover {
      background: var(--octa-bg-hover-strong, #eceef0) !important;
      color: var(--octa-text, #1c1b1c) !important;
    }
    .octa-alert-body {
      display: flex !important;
      flex-direction: column !important;
      gap: 10px !important;
      padding: 16px !important;
      background: var(--octa-bg, #ffffff) !important;
    }
    .octa-alert-text {
      margin: 0 !important;
      font-size: 12.5px !important;
      color: var(--octa-text-secondary, #3c3f43) !important;
    }
    .octa-alert-list {
      margin: 0 !important;
      padding: 10px 12px 10px 28px !important;
      border-radius: 6px !important;
      background: var(--octa-bg-secondary, #f7f8f9) !important;
      border: 1px solid var(--octa-border, #dee0e4) !important;
      color: var(--octa-text, #1c1b1c) !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 4px !important;
    }
    .octa-alert-actions {
      display: flex !important;
      justify-content: flex-end !important;
      margin-top: 4px !important;
    }
    .octa-alert-btn-primary {
      padding: 7px 14px !important;
      border: 1px solid var(--accent-border, #e0af00) !important;
      border-radius: 5px !important;
      background: var(--accent, #ffc600) !important;
      color: var(--accent-text, #1c1b1c) !important;
      font: inherit !important;
      font-size: 12px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      transition: background 0.15s ease, box-shadow 0.15s ease !important;
    }
    .octa-alert-btn-primary:hover {
      background: var(--accent-hover, #f0ba00) !important;
      box-shadow: 0 2px 6px var(--accent-glow, rgba(255, 198, 0, 0.35)) !important;
    }
    .octa-alert-btn-primary:focus-visible,
    .octa-alert-close:focus-visible {
      outline: 2px solid var(--accent, #ffc600) !important;
      outline-offset: 2px !important;
    }
  `;
  (doc.head || doc.documentElement).append(style);
}

/**
 * Exibe aviso estilizado na tela do Octadesk informando quais campos precisam
 * ser preenchidos manualmente no rascunho marcado com [Falta Informar].
 */
export function showMissingLicenseFieldsModal(
  doc: Document,
  missingFields: string[],
  onCloseFocus?: HTMLElement | null,
): HTMLDialogElement | null {
  if (!missingFields.length || !doc.body) return null;

  doc.querySelectorAll('.octablaster-license-alert-dialog').forEach((existing) => existing.remove());
  ensureLicenseAlertStyles(doc);

  const dialog = doc.createElement('dialog');
  dialog.className = 'octablaster-license-alert-dialog';
  dialog.setAttribute('aria-label', 'Campos pendentes na solicitação de licença');

  const header = doc.createElement('div');
  header.className = 'octa-alert-header';

  const badge = doc.createElement('span');
  badge.className = 'octa-alert-icon-badge';
  badge.innerHTML = ALERT_ICON;

  const title = doc.createElement('h3');
  title.className = 'octa-alert-title';
  title.textContent = 'Campos pendentes na solicitação';

  const closeBtn = doc.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'octa-alert-close';
  closeBtn.setAttribute('aria-label', 'Fechar');
  closeBtn.innerHTML = CLOSE_ICON;

  header.append(badge, title, closeBtn);

  const body = doc.createElement('div');
  body.className = 'octa-alert-body';

  const description = doc.createElement('p');
  description.className = 'octa-alert-text';
  description.textContent =
    'A anotação foi preparada com [Falta Informar] nos campos abaixo. Preencha manualmente antes de enviar:';

  const list = doc.createElement('ul');
  list.className = 'octa-alert-list';
  for (const fieldName of missingFields) {
    const item = doc.createElement('li');
    item.textContent = fieldName;
    list.append(item);
  }

  const actions = doc.createElement('div');
  actions.className = 'octa-alert-actions';

  const confirmBtn = doc.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'octa-alert-btn-primary';
  confirmBtn.textContent = 'Entendi, vou preencher';

  actions.append(confirmBtn);
  body.append(description, list, actions);
  dialog.append(header, body);
  doc.body.append(dialog);

  const stopAppearance = bindInpageAppearance(dialog);

  const dismiss = () => {
    stopAppearance();
    if (typeof dialog.close === 'function' && dialog.open) {
      dialog.close();
    }
    dialog.remove();
    onCloseFocus?.focus?.();
  };

  closeBtn.addEventListener('click', dismiss);
  confirmBtn.addEventListener('click', dismiss);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dismiss();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dismiss();
  });

  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
  confirmBtn.focus();
  return dialog;
}
