import type { InsertMessageRequest } from '@/types/template';

interface RegisteredEditor {
  frameId: number;
  editorToken: string;
}

const TICKET_ACTIONS = new Set(['INSERT_REPLY', 'CHECK_LICENSE_TICKET', 'AUTOMATE_LICENSE_MENTIONS']);

/**
 * Gerencia o registro de editores por aba/frame e encaminha comandos
 * apenas para o frame e token ativos no momento.
 */
export function createTicketRouter() {
  const registrations = new Map<number, RegisteredEditor>();
  const keyForTab = (tabId: number) => `octablaster_editor_${tabId}`;

  function handleMessage(
    message: Record<string, any>,
    sender: { tab?: { id?: number }; frameId?: number },
    respond: (response: unknown) => void,
  ): boolean | undefined {
    if (
      message.action === 'REGISTER_EDITOR' &&
      sender.tab?.id !== undefined &&
      typeof message.editorToken === 'string'
    ) {
      const key = keyForTab(sender.tab.id);
      const target: RegisteredEditor = {
        frameId: sender.frameId ?? 0,
        editorToken: message.editorToken,
      };
      registrations.set(sender.tab.id, target);
      void browser.storage.local.set({ [key]: target });
      return undefined;
    }

    if (
      !['ROUTE_TICKET_ACTION', 'CAPTURE_EDITOR'].includes(message.action) ||
      sender.tab ||
      !Number.isInteger(message.tabId)
    ) {
      return undefined;
    }

    void (async () => {
      try {
        const key = keyForTab(message.tabId);
        const data = await browser.storage.local.get(key);
        const target = registrations.get(message.tabId) || (data[key] as RegisteredEditor | undefined);
        if (!target) {
          return { success: false, error: 'Clique primeiro no campo de resposta do ticket.' };
        }
        if (message.action === 'CAPTURE_EDITOR') {
          return { success: true, editorToken: target.editorToken };
        }
        if (message.expectedToken && message.expectedToken !== target.editorToken) {
          return { success: false, error: 'O ticket mudou. Escolha a resposta novamente.' };
        }
        const request = message.request as InsertMessageRequest;
        if (!TICKET_ACTIONS.has(request?.action)) {
          return { success: false, error: 'Ação inválida.' };
        }
        return await browser.tabs.sendMessage(
          message.tabId,
          { ...request, editorToken: target.editorToken },
          { frameId: target.frameId },
        );
      } catch {
        return { success: false, error: 'Clique novamente no campo de resposta do ticket e tente outra vez.' };
      }
    })().then(respond);

    return true;
  }

  function clearTab(tabId: number) {
    registrations.delete(tabId);
    void browser.storage.local.remove(keyForTab(tabId));
  }

  return { handleMessage, clearTab };
}
