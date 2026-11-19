import { createStorageQueue } from '@/services/background/storageQueue';
import { createTicketRouter } from '@/services/background/ticketRouter';
import { applyBrowserBrandIcon, syncBrowserBrandIconFromStorage } from '@/services/appearance/browserIcon';
import { APPEARANCE_KEY, DEFAULT_BRAND_COLOR, validateAppearance } from '@/services/storage/settingsSchema';

export default defineBackground(() => {
  const storageQueue = createStorageQueue();
  const ticketRouter = createTicketRouter();

  void syncBrowserBrandIconFromStorage();

  browser.runtime?.onStartup?.addListener?.(() => {
    void syncBrowserBrandIconFromStorage();
  });

  browser.storage?.onChanged?.addListener?.((changes, areaName) => {
    if (areaName !== 'local' || !Object.hasOwn(changes, APPEARANCE_KEY)) return;
    try {
      const next = changes[APPEARANCE_KEY]?.newValue
        ? validateAppearance(changes[APPEARANCE_KEY].newValue)
        : null;
      void applyBrowserBrandIcon(
        next?.brandColor ?? DEFAULT_BRAND_COLOR,
        next?.logoInnerColor,
      );
    } catch {
      void applyBrowserBrandIcon(DEFAULT_BRAND_COLOR);
    }
  });

  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== browser.runtime.id || !message || typeof message !== 'object') return;
    if (storageQueue.canHandle(message.action)) {
      return storageQueue.handleMessage(message, respond);
    }
    return ticketRouter.handleMessage(message, sender, respond);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    ticketRouter.clearTab(tabId);
  });
});
