import { createStorageQueue } from '@/services/background/storageQueue';
import { createTicketRouter } from '@/services/background/ticketRouter';
import { syncBrowserBrandIconFromStorage } from '@/services/appearance/browserIcon';
import { APPEARANCE_KEY } from '@/services/storage/settingsSchema';

export default defineBackground(() => {
  const storageQueue = createStorageQueue();
  const ticketRouter = createTicketRouter();

  void syncBrowserBrandIconFromStorage();

  browser.runtime?.onStartup?.addListener?.(() => {
    void syncBrowserBrandIconFromStorage();
  });

  try {
    globalThis.window?.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', (event) => {
      void syncBrowserBrandIconFromStorage(event.matches);
    });
  } catch {}

  browser.storage?.onChanged?.addListener?.((changes, areaName) => {
    if (areaName !== 'local' || !Object.hasOwn(changes, APPEARANCE_KEY)) return;
    void syncBrowserBrandIconFromStorage();
  });

  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== browser.runtime.id || !message || typeof message !== 'object') return;
    if (message.action === 'SYNC_BROWSER_ICON') {
      void syncBrowserBrandIconFromStorage(
        typeof message.prefersDark === 'boolean' ? message.prefersDark : undefined,
      );
      respond({ success: true });
      return;
    }
    if (storageQueue.canHandle(message.action)) {
      return storageQueue.handleMessage(message, respond);
    }
    return ticketRouter.handleMessage(message, sender, respond);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    ticketRouter.clearTab(tabId);
  });
});
