import { createStorageQueue } from '@/services/background/storageQueue';
import { createTicketRouter } from '@/services/background/ticketRouter';

export default defineBackground(() => {
  const storageQueue = createStorageQueue();
  const ticketRouter = createTicketRouter();

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
