import { bindInpageAppearance } from '@/services/appearance/inpageTheme';
import { aiIcons } from '@/services/octadesk/aiIcons';
const params = new URLSearchParams(location.search), label = params.get('label') || 'Resumir', id = params.get('id');
const style = document.createElement('style'); style.textContent = `html,body{margin:0;padding:0;background:transparent!important;overflow:hidden}button{box-sizing:border-box;width:100%;height:20px;display:flex;align-items:center;justify-content:center;gap:4px;border:1px solid var(--accent-border);border-radius:6px;background:var(--accent-soft);color:var(--accent-soft-text);font:500 11px system-ui;cursor:pointer;padding:1px 5px}button svg{width:11px;height:11px;flex-shrink:0}button.icon{height:26px;padding:5px}button.icon svg{width:14px;height:14px}`; document.head.append(style);
const button = document.createElement('button'); button.type = 'button'; button.innerHTML = aiIcons.sparkle;
if (label !== 'Gerar resposta') { const text = document.createElement('span'); text.textContent = label; button.append(text); } else button.className = 'icon';
button.title = label; button.setAttribute('aria-label', label); document.body.append(button); bindInpageAppearance(document.documentElement);
button.addEventListener('click', event => {
  if (!event.isTrusted) return;
  // Iframes acessíveis à página têm APIs limitadas; o gesto vem desta página da extensão.
  const opened = browser.runtime.sendMessage({ action: 'AI_TRIGGER_OPEN_SIDEBAR' });
  Promise.resolve(opened).then(result => {
    if (!result?.success) throw new Error(result?.error || 'Abra o painel lateral pelo botão da extensão.');
    parent.postMessage({ type: 'OCTA_AI_TRIGGER', id }, '*');
  }).catch(error => parent.postMessage({ type: 'OCTA_AI_TRIGGER', id, error: error.message }, '*'));
});
