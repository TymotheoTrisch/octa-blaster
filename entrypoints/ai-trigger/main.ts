import { bindInpageAppearance } from '@/services/appearance/inpageTheme';
import { aiIcons } from '@/services/octadesk/aiIcons';
const params = new URLSearchParams(location.search), label = params.get('label') || 'Resumir', id = params.get('id');
const style = document.createElement('style'); style.textContent = `html,body{margin:0;padding:0;background:transparent!important;overflow:hidden}button{box-sizing:border-box;width:100%;height:20px;display:flex;align-items:center;justify-content:center;gap:4px;border:1px solid var(--accent-border);border-radius:6px;background:var(--accent-soft);color:var(--accent-soft-text);font:500 11px system-ui;cursor:pointer;padding:1px 5px}button svg{width:11px;height:11px;flex-shrink:0}@keyframes octa-ai-spin{to{transform:rotate(360deg)}}button:disabled{cursor:wait;opacity:.8}button.icon{height:26px;padding:5px}button.icon svg{width:14px;height:14px}`; document.head.append(style);
const button = document.createElement('button'); button.type = 'button'; button.innerHTML = aiIcons.sparkle;
if (label !== 'Gerar resposta') { const text = document.createElement('span'); text.textContent = label; button.append(text); } else button.className = 'icon';
button.title = label; button.setAttribute('aria-label', label); document.body.append(button); bindInpageAppearance(document.documentElement);
let busy=false;
const original=button.innerHTML;
function display(state:{busy:boolean;status:string;error?:string}) {
  busy=state.busy;button.disabled=busy;button.setAttribute('aria-busy',String(busy));button.title=state.error || (busy ? state.status : label);
  button.innerHTML=busy ? '<svg viewBox="0 0 24 24" style="animation:octa-ai-spin 1s linear infinite"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" opacity=".25"/><path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" stroke-width="3"/></svg>'+(label==='Gerar resposta' ? '' : '<span>Processando…</span>') : original;
}
window.addEventListener('message',event=>{
  if(!event.isTrusted || event.source!==parent || event.data?.type!=='OCTA_AI_TRIGGER_STATE' || event.data.id!==id)return;
  const state=event.data.state;if(state && typeof state.busy==='boolean' && typeof state.status==='string')display(state);
});
button.addEventListener('click', event => {
  if (!event.isTrusted || busy) return;
  display({busy:true,status:'Abrindo o painel lateral…'});
  parent.postMessage({type:'OCTA_AI_TRIGGER',id,phase:'opening'},'*');
  // A chamada continua na pilha do gesto da página da extensão.
  const opened = browser.runtime.sendMessage({ action: 'AI_TRIGGER_OPEN_SIDEBAR' });
  Promise.resolve(opened).then(result => {
    if (!result?.success) throw new Error(result?.error || 'Abra o painel lateral pelo botão da extensão.');
    parent.postMessage({ type: 'OCTA_AI_TRIGGER', id }, '*');
  }).catch(error => {
    display({busy:false,status:'',error:error.message});
    parent.postMessage({ type: 'OCTA_AI_TRIGGER', id, error: error.message }, '*');
  });
});
