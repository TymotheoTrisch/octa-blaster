import { rawStorageGet, rawStorageSet } from './templateStorage';
import { resolveVariables } from './templateResolver';

export const VARIABLES_KEY = 'octablaster_variables';
export const SHORTCUT_KEY = 'octablaster_shortcut';
export interface TemplateVariable {
  name: string;
  value: string;
  mode: 'saved' | 'prompt';
}
export interface ReplySettings {
  variables: TemplateVariable[];
  trigger: '\\' | '/' | '';
}
const reserved = /^(sauda[cç][aã]o|data|hora)$/i;
export function validateVariables(
  variables: TemplateVariable[],
): TemplateVariable[] {
  const names = new Set<string>();
  return variables.map((variable) => {
    const name = variable.name.trim();
    const normalized = name.toLocaleLowerCase('pt-BR');
    if (!/^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*$/.test(name) || reserved.test(name))
      throw new Error(`Nome de variável inválido ou reservado: ${name}`);
    if (names.has(normalized)) throw new Error(`Variável repetida: ${name}`);
    if (!['saved', 'prompt'].includes(variable.mode))
      throw new Error('Modo de variável inválido.');
    names.add(normalized);
    return { name, value: String(variable.value || ''), mode: variable.mode };
  });
}
export async function loadReplySettings(): Promise<ReplySettings> {
  const data = await rawStorageGet([VARIABLES_KEY, SHORTCUT_KEY]);
  const variables = validateVariables(
    Array.isArray(data[VARIABLES_KEY]) ? data[VARIABLES_KEY] : [],
  );
  const trigger = data[SHORTCUT_KEY];
  return {
    variables,
    trigger: trigger === '/' || trigger === '' ? trigger : '\\',
  };
}
export async function saveReplySettings(
  settings: ReplySettings,
): Promise<void> {
  const variables = validateVariables(settings.variables);
  await rawStorageSet({
    [VARIABLES_KEY]: variables,
    [SHORTCUT_KEY]: settings.trigger,
  });
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
