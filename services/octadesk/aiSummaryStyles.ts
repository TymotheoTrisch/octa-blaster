import { ensureInpageThemeTokens } from '@/services/appearance/inpageTheme';

export function ensureSummaryStyles(doc: Document) {
  ensureInpageThemeTokens(doc);
  if (doc.getElementById('octa-summary-styles')) return;
  const style = doc.createElement('style'); style.id = 'octa-summary-styles';
  style.textContent = `
  .octa-summary-button{font:500 12px/1.4 system-ui!important;border:1px solid var(--octa-border)!important;border-radius:6px!important;padding:4px 10px!important;background:var(--octa-bg)!important;color:var(--octa-text-secondary)!important;cursor:pointer!important;white-space:nowrap!important;margin-inline-start:8px!important;vertical-align:middle!important}
  .octa-summary-button:hover{border-color:var(--accent-border)!important;background:var(--accent-soft)!important}.octa-summary-button:disabled{opacity:.55!important;cursor:wait!important}
  .octa-message-tools{display:flex;justify-content:flex-end;align-items:center;padding:4px 10px;min-height:30px;box-sizing:border-box}
  .octa-message-summary-button{margin-inline-start:auto!important;float:right!important}
  .octa-summary-layout{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(280px,35%)!important;gap:16px!important;align-items:start!important;width:100%!important;min-width:0!important;box-sizing:border-box!important}
  .octa-summary-layout>.content-comment-interaction,.octa-summary-layout>.comment{min-width:0!important;overflow-x:auto!important}.octa-summary-layout[data-narrow="true"]{grid-template-columns:minmax(0,1fr)!important}
  .octa-message-summary{box-sizing:border-box!important;position:sticky!important;top:8px!important;width:100%!important;min-width:0!important;border:1px solid var(--octa-border)!important;border-radius:8px!important;background:var(--octa-bg)!important;color:var(--octa-text)!important;box-shadow:var(--octa-shadow-popover)!important;font:13px/1.6 system-ui!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}
  .octa-message-summary header{display:flex!important;justify-content:space-between!important;align-items:center!important;padding:8px 12px!important;border-bottom:1px solid var(--octa-border)!important;background:var(--octa-bg-secondary)!important;flex-shrink:0!important}
  .octa-message-summary .octa-summary-text{padding:12px!important;overflow:auto!important;overscroll-behavior:contain!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;flex:1!important;min-height:0!important}
  .octa-summary-close{font:18px/1 system-ui!important;color:var(--octa-text-secondary)!important;background:transparent!important;border:0!important;cursor:pointer!important;padding:4px!important}
  .octa-ticket-chat{box-sizing:border-box!important;width:min(660px,94vw)!important;height:min(650px,88vh)!important;border:1px solid var(--octa-border)!important;border-radius:14px!important;background:var(--octa-bg)!important;color:var(--octa-text)!important;padding:0!important;font:14px/1.6 system-ui!important;box-shadow:var(--octa-shadow-modal)!important;overflow:hidden!important;z-index:2147483647!important}
  .octa-ticket-chat[open]{display:flex!important;flex-direction:column!important}.octa-ticket-chat::backdrop{background:var(--octa-backdrop)!important}
  .octa-ticket-chat header{display:flex!important;justify-content:space-between!important;align-items:center!important;padding:14px 20px!important;border-bottom:1px solid var(--octa-border)!important}.octa-ticket-chat h2{margin:0!important;font:600 16px system-ui!important}
  .octa-ticket-chat-log{flex:1!important;min-height:0!important;overflow:auto!important;padding:20px!important;display:flex!important;flex-direction:column!important;gap:14px!important;overscroll-behavior:contain!important}
  .octa-ticket-chat-turn{white-space:pre-wrap!important;overflow-wrap:anywhere!important;padding:12px 14px!important;border-radius:10px!important;background:var(--octa-bg-secondary)!important}.octa-ticket-chat-turn[data-role="user"]{align-self:flex-end!important;max-width:90%!important;background:var(--accent-soft)!important}.octa-ticket-chat-turn strong{display:block!important;font-size:12px!important;color:var(--octa-text-muted)!important;margin-bottom:4px!important}
  .octa-ticket-chat-status{font:12px/1.4 system-ui!important;color:var(--octa-text-muted)!important;padding:0 20px 8px!important;white-space:pre-wrap!important}.octa-ticket-chat footer{padding:12px 20px!important;border-top:1px solid var(--octa-border)!important}.octa-ticket-chat textarea{box-sizing:border-box!important;width:100%!important;height:70px!important;resize:none!important;border:1px solid var(--octa-border)!important;border-radius:8px!important;background:var(--octa-bg-input)!important;color:var(--octa-text)!important;padding:10px!important;font:14px/1.5 system-ui!important}.octa-ticket-chat textarea:focus{outline:2px solid var(--accent-ring)!important;border-color:var(--accent-border)!important}
  `;
  doc.head.append(style);
}
