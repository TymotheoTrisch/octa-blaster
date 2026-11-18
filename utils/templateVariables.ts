import { RESERVED_VARIABLE_NAME as reserved, type TemplateVariable, type ReplySettings } from './settingsSchema';
import { loadSettings, saveSettings } from './settingsStorage';
import { resolveVariables } from './templateResolver';

export async function loadVariables(): Promise<TemplateVariable[]> {
  return (await loadSettings()).variables;
}

export async function saveVariables(variables: TemplateVariable[], base?: TemplateVariable[]): Promise<TemplateVariable[]> {
  return (await saveSettings({ variables }, base ? { variables: base } : undefined)).variables;
}

export async function loadShortcutTrigger(): Promise<ReplySettings['trigger']> {
  return (await loadSettings()).trigger;
}

export async function saveShortcutTrigger(trigger: ReplySettings['trigger'], base?: ReplySettings['trigger']): Promise<void> {
  await saveSettings({ trigger }, base === undefined ? undefined : { trigger: base });
}
export async function loadReplySettings(): Promise<ReplySettings> {
  const { variables, trigger } = await loadSettings();
  return { variables, trigger };
}
export async function saveReplySettings(
  settings: ReplySettings,
  base?: ReplySettings,
): Promise<void> {
  await saveSettings(settings, base);
}
export function findVariableNames(text: string): string[] {
  const names = new Map<string, string>();
  for (const match of text.matchAll(
    /\{\{\s*([^{}]+?)\s*\}\}|\{\s*([^{}]+?)\s*\}/g,
  )) {
    const name = (match[1] || match[2] || '').trim();
    if (!reserved.test(name)) names.set(name.toLocaleLowerCase('pt-BR'), name);
  }
  return [...names.values()];
}
export function applyCustomVariables(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(
    /\{\{\s*([^{}]+?)\s*\}\}|\{\s*([^{}]+?)\s*\}/g,
    (tag, doubleName, singleName) => {
      const name = (doubleName || singleName).trim().toLocaleLowerCase('pt-BR');
      return Object.hasOwn(values, name) ? values[name]! : tag;
    },
  );
}

function askValues(
  doc: Document,
  names: string[],
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const dialog = doc.createElement('dialog');
    dialog.className = 'octablaster-variable-dialog';
    dialog.setAttribute('aria-label', 'Preencher variáveis da resposta');
    dialog.style.cssText =
      'border:1px solid #ccc;border-radius:12px;padding:24px;max-width:420px;width:90%;background:white;color:#222;z-index:2147483647;font:14px system-ui';
    const form = doc.createElement('form');
    const title = doc.createElement('h3');
    title.textContent = 'Preencher variáveis';
    form.append(title);
    const fields = names.map((name) => {
      const label = doc.createElement('label');
      label.textContent = name;
      label.style.cssText = 'display:block;margin:12px 0';
      const input = doc.createElement('input');
      input.required = true;
      input.name = name;
      input.style.cssText =
        'display:block;width:100%;box-sizing:border-box;padding:8px;border:1px solid #aaa;border-radius:4px;color:#222;background:white';
      label.append(input);
      form.append(label);
      return { name, input };
    });
    const cancel = doc.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancelar';
    const submit = doc.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Usar resposta';
    submit.style.marginLeft = '12px';
    form.append(cancel, submit);
    dialog.append(form);
    doc.body.append(dialog);
    const finish = (value: Record<string, string> | null) => {
      dialog.remove();
      resolve(value);
    };
    cancel.addEventListener('click', () => finish(null));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(null);
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (
        !form.reportValidity() ||
        fields.some((field) => !field.input.value.trim())
      )
        return;
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
  });
}

export async function prepareTemplate(
  text: string,
  doc: Document = document,
): Promise<string | null> {
  const { variables } = await loadReplySettings();
  const values: Record<string, string> = Object.create(null);
  const pending: string[] = [];
  for (const name of findVariableNames(text)) {
    const normalized = name.toLocaleLowerCase('pt-BR');
    const variable = variables.find(
      (item) => item.name.toLocaleLowerCase('pt-BR') === normalized,
    );
    if (variable?.mode === 'saved' && variable.value.trim())
      values[normalized] = variable.value;
    else pending.push(name);
  }
  if (pending.length) {
    const entered = await askValues(doc, pending);
    if (!entered) return null;
    Object.assign(values, entered);
  }
  return applyCustomVariables(resolveVariables(text), values);
}
