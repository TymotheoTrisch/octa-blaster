import {
  createTemplateBackupLocal,
  loadStoredTemplatesLocal,
  loadTagsLocal,
  mergeImportedTemplatesLocal,
  saveStoredTemplatesLocal,
} from '@/services/storage/templateStorage';
import { saveTagsLocal } from '@/services/storage/templateTags';
import { loadSettingsLocal, saveSettingsLocal } from '@/services/storage/settingsStorage';

const STORAGE_ACTIONS = new Set(['TEMPLATE_STORAGE', 'TAG_CATALOG', 'SETTINGS_STORAGE']);

/**
 * Cria fila serializada no background para evitar condições de corrida entre
 * popup, painel lateral e scripts de conteúdo.
 */
export function createStorageQueue() {
  let queue: Promise<unknown> = Promise.resolve();

  function canHandle(action: unknown): boolean {
    return typeof action === 'string' && STORAGE_ACTIONS.has(action);
  }

  function handleMessage(
    message: Record<string, any>,
    respond: (response: unknown) => void,
  ): true {
    const task = queue.then(async () => {
      if (message.action === 'SETTINGS_STORAGE') {
        if (message.operation !== 'load' && message.operation !== 'save') {
          throw new Error('Operação de configurações inválida.');
        }
        const settings = message.operation === 'load'
          ? await loadSettingsLocal()
          : await saveSettingsLocal(message.settings, message.base);
        return { success: true, settings };
      }

      if (message.action === 'TAG_CATALOG') {
        if (message.operation !== 'load' && message.operation !== 'save') {
          throw new Error('Operação de tags inválida.');
        }
        const tags = message.operation === 'load'
          ? await loadTagsLocal()
          : await saveTagsLocal(message.tags, message.base);
        return { success: true, tags };
      }

      if (message.operation === 'import') {
        const result = await mergeImportedTemplatesLocal(
          message.current,
          message.incoming,
          message.base,
          message.tags ?? [],
          message.settings,
          message.settingsBase,
        );
        return { success: true, ...result };
      }

      if (message.operation === 'export') {
        return { success: true, backup: await createTemplateBackupLocal() };
      }

      if (message.operation !== 'load' && message.operation !== 'save') {
        throw new Error('Operação de modelos inválida.');
      }

      const templates = message.operation === 'load'
        ? await loadStoredTemplatesLocal(true)
        : await saveStoredTemplatesLocal(message.templates, message.base);
      return { success: true, templates };
    });

    queue = task.catch(() => {});
    void task.then(
      respond,
      error => respond({
        success: false,
        error: error instanceof Error ? error.message : 'Falha ao acessar modelos.',
      }),
    );
    return true;
  }

  return { canHandle, handleMessage };
}
