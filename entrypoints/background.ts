import type { InsertMessageRequest } from '@/types/template';
import { loadStoredTemplatesLocal, saveStoredTemplatesLocal, mergeImportedTemplatesLocal, createTemplateBackupLocal } from '@/utils/templateStorage';
import { loadTagsLocal } from '@/utils/templateStorage';
import { saveTagsLocal } from '@/utils/templateTags';
import { loadSettingsLocal, saveSettingsLocal } from '@/utils/settingsStorage';

export default defineBackground(() => {
  let templateQueue: Promise<unknown> = Promise.resolve();
  const registrations = new Map<number, { frameId: number; editorToken: string }>();
  const keyForTab = (tabId: number) => `octablaster_editor_${tabId}`;
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== browser.runtime.id || !message || typeof message !== 'object') return;
    if (['TEMPLATE_STORAGE', 'TAG_CATALOG', 'SETTINGS_STORAGE'].includes(message.action)) {
      const task = templateQueue.then(async () => {
        if (message.action === 'SETTINGS_STORAGE') {
          if (!['load', 'save'].includes(message.operation)) throw new Error('Operação de configurações inválida.');
          const settings = message.operation === 'load' ? await loadSettingsLocal() : await saveSettingsLocal(message.settings, message.base);
          return { success: true, settings };
        }
        if (message.action === 'TAG_CATALOG') {
          if (!['load', 'save'].includes(message.operation)) throw new Error('Operação de tags inválida.');
          const tags = message.operation === 'load' ? await loadTagsLocal() : await saveTagsLocal(message.tags, message.base);
          return { success: true, tags };
        }
        if (message.operation === 'import') {
          const result = await mergeImportedTemplatesLocal(message.current, message.incoming, message.base, message.tags ?? [], message.settings, message.settingsBase);
          return { success: true, ...result };
        }
        if (message.operation === 'export') return { success: true, backup: await createTemplateBackupLocal() };
        if (!['load', 'save'].includes(message.operation)) throw new Error('Operação de modelos inválida.');
        const templates = message.operation === 'load'
          ? await loadStoredTemplatesLocal(true)
          : await saveStoredTemplatesLocal(message.templates, message.base);
        return { success: true, templates };
      });
      templateQueue = task.catch(() => {});
      void task.then(respond, error => respond({ success: false, error: error instanceof Error ? error.message : 'Falha ao acessar modelos.' }));
      return true;
    }
    if (message.action === 'REGISTER_EDITOR'  && sender.tab?.id !== undefined && typeof message.editorToken === 'string') {
      const key = keyForTab(sender.tab.id);
      const target = { frameId: sender.frameId ?? 0, editorToken: message.editorToken };
      registrations.set(sender.tab.id, target);
      void browser.storage.local.set({ [key]: target });
      return;
    }
    if (!['ROUTE_TICKET_ACTION', 'CAPTURE_EDITOR'].includes(message.action) || sender.tab || !Number.isInteger(message.tabId)) return;
    void (async () => {
      try {
        const key = keyForTab(message.tabId);
        const data = await browser.storage.local.get(key);
        const target = registrations.get(message.tabId) || data[key] as { frameId: number; editorToken: string } | undefined;
        if (!target) return { success: false, error: 'Clique primeiro no campo de resposta do ticket.' };
        if (message.action === 'CAPTURE_EDITOR') return { success: true, editorToken: target.editorToken };
        if (message.expectedToken && message.expectedToken !== target.editorToken) return { success: false, error: 'O ticket mudou. Escolha a resposta novamente.' };
        const request = message.request as InsertMessageRequest;
        if (!['INSERT_REPLY', 'CHECK_LICENSE_TICKET', 'AUTOMATE_LICENSE_MENTIONS'].includes(request?.action)) {
          return { success: false, error: 'Ação inválida.' };
        }
        return await browser.tabs.sendMessage(message.tabId, { ...request, editorToken: target.editorToken }, { frameId: target.frameId });
      } catch {
        return { success: false, error: 'Clique novamente no campo de resposta do ticket e tente outra vez.' };
      }
    })().then(respond);
    return true;
  });
  browser.tabs.onRemoved.addListener(tabId => { registrations.delete(tabId); void browser.storage.local.remove(keyForTab(tabId)); });
});
