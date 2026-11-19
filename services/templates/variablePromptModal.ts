const VARIABLE_DIALOG_STYLE_ID = 'octablaster-variable-dialog-styles';

const BRACES_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></svg>`;
const CLOSE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;

function ensureVariableDialogStyles(doc: Document): void {
  if (doc.getElementById(VARIABLE_DIALOG_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = VARIABLE_DIALOG_STYLE_ID;
  style.textContent = `
    dialog.octablaster-variable-dialog {
      margin: auto !important;
      padding: 0 !important;
      width: min(400px, calc(100vw - 32px)) !important;
      max-width: 400px !important;
      border: 1px solid #3c3f43 !important;
      border-radius: 10px !important;
      background: #ffffff !important;
      color: #1c1b1c !important;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.08) !important;
      overflow: hidden !important;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
      font-size: 13px !important;
      line-height: 1.45 !important;
      z-index: 2147483647 !important;
    }
    dialog.octablaster-variable-dialog::backdrop {
      background: rgba(15, 15, 15, 0.45) !important;
      backdrop-filter: blur(2px) !important;
    }
    .octa-var-header {
      display: flex !important;
      align-items: center !important;
      gap: 9px !important;
      padding: 12px 16px !important;
      background: #f7f8f9 !important;
      border-bottom: 1px solid #dee0e4 !important;
    }
    .octa-var-icon-badge {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 26px !important;
      height: 26px !important;
      border-radius: 6px !important;
      background: rgba(255, 198, 0, 0.22) !important;
      color: #6f5600 !important;
      flex-shrink: 0 !important;
    }
    .octa-var-title {
      flex: 1 !important;
      margin: 0 !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      color: #1c1b1c !important;
    }
    .octa-var-close {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 26px !important;
      height: 26px !important;
      padding: 0 !important;
      border: none !important;
      border-radius: 5px !important;
      background: transparent !important;
      color: #5b5f63 !important;
      cursor: pointer !important;
      transition: background 0.15s ease, color 0.15s ease !important;
    }
    .octa-var-close:hover {
      background: #eceef0 !important;
      color: #1c1b1c !important;
    }
    .octa-var-form {
      display: flex !important;
      flex-direction: column !important;
      gap: 12px !important;
      padding: 16px !important;
      margin: 0 !important;
      background: #ffffff !important;
    }
    .octa-var-subtitle {
      margin: 0 !important;
      font-size: 12px !important;
      color: #5b5f63 !important;
    }
    .octa-var-field {
      display: flex !important;
      flex-direction: column !important;
      gap: 5px !important;
      margin: 0 !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      color: #3c3f43 !important;
    }
    .octa-var-field-token {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
    }
    .octa-var-input {
      display: block !important;
      width: 100% !important;
      box-sizing: border-box !important;
      padding: 8px 10px !important;
      border: 1px solid #dee0e4 !important;
      border-radius: 6px !important;
      background: #ffffff !important;
      color: #1c1b1c !important;
      font: inherit !important;
      font-size: 13px !important;
      outline: none !important;
      transition: border-color 0.15s ease, box-shadow 0.15s ease !important;
    }
    .octa-var-input:focus {
      border-color: #ffc600 !important;
      box-shadow: 0 0 0 2px rgba(255, 198, 0, 0.28) !important;
    }
    .octa-var-actions {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      gap: 8px !important;
      margin-top: 4px !important;
    }
    .octa-var-btn-secondary {
      padding: 7px 14px !important;
      border: 1px solid #dee0e4 !important;
      border-radius: 5px !important;
      background: #f7f8f9 !important;
      color: #3c3f43 !important;
      font: inherit !important;
      font-size: 12px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
      transition: background 0.15s ease !important;
    }
    .octa-var-btn-secondary:hover {
      background: #eceef0 !important;
    }
    .octa-var-btn-primary {
      padding: 7px 14px !important;
      border: 1px solid #e0af00 !important;
      border-radius: 5px !important;
      background: #ffc600 !important;
      color: #1c1b1c !important;
      font: inherit !important;
      font-size: 12px !important;
      font-weight: 700 !important;
      cursor: pointer !important;
      transition: background 0.15s ease, box-shadow 0.15s ease !important;
    }
    .octa-var-btn-primary:hover {
      background: #f0ba00 !important;
      box-shadow: 0 2px 6px rgba(255, 198, 0, 0.35) !important;
    }
    .octa-var-btn-secondary:focus-visible,
    .octa-var-btn-primary:focus-visible,
    .octa-var-close:focus-visible {
      outline: 2px solid #ffc600 !important;
      outline-offset: 2px !important;
    }
  `;
  (doc.head || doc.documentElement).append(style);
}

/**
 * Abre o diálogo modal estilizado para preenchimento de variáveis pendentes antes da inserção.
 */
export function promptForVariableValues(
  doc: Document,
  names: string[],
): Promise<Record<string, string> | null> {
  ensureVariableDialogStyles(doc);

  return new Promise((resolve) => {
    const dialog = doc.createElement('dialog');
    dialog.className = 'octablaster-variable-dialog';
    dialog.setAttribute('aria-label', 'Preencher variáveis da resposta');

    const header = doc.createElement('div');
    header.className = 'octa-var-header';

    const badge = doc.createElement('span');
    badge.className = 'octa-var-icon-badge';
    badge.innerHTML = BRACES_ICON;

    const title = doc.createElement('h3');
    title.className = 'octa-var-title';
    title.textContent = 'Preencher variáveis';

    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'octa-var-close';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.innerHTML = CLOSE_ICON;

    header.append(badge, title, closeBtn);

    const form = doc.createElement('form');
    form.className = 'octa-var-form';

    const subtitle = doc.createElement('p');
    subtitle.className = 'octa-var-subtitle';
    subtitle.textContent = 'Informe os valores que serão aplicados nesta resposta.';
    form.append(subtitle);

    const fields = names.map((name) => {
      const label = doc.createElement('label');
      label.className = 'octa-var-field';

      const labelText = doc.createElement('span');
      labelText.className = 'octa-var-field-token';
      labelText.textContent = name;

      const input = doc.createElement('input');
      input.className = 'octa-var-input';
      input.required = true;
      input.name = name;
      input.placeholder = `Digite ${name}...`;

      label.append(labelText, input);
      form.append(label);
      return { name, input };
    });

    const actions = doc.createElement('div');
    actions.className = 'octa-var-actions';

    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.className = 'octa-var-btn-secondary';
    cancel.textContent = 'Cancelar';

    const submit = doc.createElement('button');
    submit.type = 'submit';
    submit.className = 'octa-var-btn-primary';
    submit.textContent = 'Usar resposta';

    actions.append(cancel, submit);
    form.append(actions);
    dialog.append(header, form);
    doc.body.append(dialog);

    const finish = (value: Record<string, string> | null) => {
      dialog.remove();
      resolve(value);
    };

    closeBtn.addEventListener('click', () => finish(null));
    cancel.addEventListener('click', () => finish(null));
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) finish(null);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(null);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity() || fields.some((field) => !field.input.value.trim())) {
        return;
      }
      finish(
        Object.fromEntries(
          fields.map((field) => [
            field.name.toLocaleLowerCase('pt-BR'),
            field.input.value,
          ]),
        ),
      );
    });

    dialog.showModal();
    fields[0]?.input.focus();
  });
}
