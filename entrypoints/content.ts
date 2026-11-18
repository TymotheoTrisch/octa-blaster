import { initEditorContext } from '@/services/octadesk/editorContext';
import { startTicketWidgetLifecycle } from '@/services/octadesk/ticketWidget';

export default defineContentScript({
  matches: ['*://app.octadesk.com/*', '*://*.octadesk.com/*'],
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_idle',
  main() {
    console.log('[OctaBlaster] Content script inicializado no frame:', window.location.href);
    const editorContext = initEditorContext(document);
    startTicketWidgetLifecycle(editorContext, document);
  },
});
