import { bindInpageAppearance } from '@/services/appearance/inpageTheme';
import type { AiTriggerProgress } from '@/types/aiPanel';
const spinner = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" style="animation:octa-ai-spin 1s linear infinite"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="3" opacity=".25"/><path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
/** No Firefox o gesto deve ocorrer numa página da extensão, não no content script. */
export function createAiTrigger(doc: Document, label: string, click: (opened: boolean, report: (state: AiTriggerProgress) => void) => unknown) {
  const firefox = browser.runtime?.getManifest?.().manifest_version === 2;
  const id = crypto.randomUUID(), origin = firefox ? browser.runtime.getURL('/').replace(/\/$/, '') : '';
  const element = doc.createElement(firefox ? 'iframe' : 'button');
  let busy = false, original = '', notice: HTMLElement | undefined, stopTheme: (() => void) | undefined, dismiss: ReturnType<typeof setTimeout> | undefined, disposed = false;
  if (!doc.getElementById('octa-ai-feedback-styles')) { const style=doc.createElement('style');style.id='octa-ai-feedback-styles';style.textContent='@keyframes octa-ai-spin{to{transform:rotate(360deg)}}';doc.head.append(style); }
  function position() {
    if (!notice || notice.hidden) return;
    const rect=element.getBoundingClientRect(), width=Math.min(300,(doc.defaultView?.innerWidth || 600)-24);
    notice.style.width=`${width}px`;notice.style.left=`${Math.max(12,Math.min(rect.right-width,(doc.defaultView?.innerWidth || 600)-width-12))}px`;
    const height=notice.offsetHeight || 60;notice.style.top=`${rect.bottom+height+8 > (doc.defaultView?.innerHeight || 900) ? Math.max(8,rect.top-height-6) : rect.bottom+6}px`;
  }
  function report(state: AiTriggerProgress) {
    if (disposed) return;
    if (!element.isConnected) { notice?.remove(); return; }
    clearTimeout(dismiss); busy=state.busy;
    element.setAttribute('aria-busy',String(busy));element.title=state.error || (busy ? state.status : label);
    if (firefox) (element as HTMLIFrameElement).contentWindow?.postMessage({type:'OCTA_AI_TRIGGER_STATE',id,state},origin);
    else {
      const button=element as HTMLButtonElement;
      if (busy && !original) original=button.innerHTML;
      button.disabled=busy;
      if (busy) button.innerHTML=spinner+(label==='Gerar resposta' ? '' : '<span>Processando…</span>');
      else if (original) { button.innerHTML=original;original=''; }
    }
    if (!notice) {
      notice=doc.createElement('div');notice.dataset.octaAi='true';notice.className='octa-ai-feedback';
      notice.style.cssText='position:fixed;z-index:2147483646;box-sizing:border-box;padding:9px 10px;border:1px solid var(--accent-border);border-radius:8px;box-shadow:0 4px 16px #0002;background:var(--bg-primary,#fff);color:var(--text-primary,#222);font:12px/1.5 system-ui;display:flex;gap:8px;align-items:start;';
      const text=doc.createElement('span');text.style.cssText='flex:1;min-width:0;overflow-wrap:anywhere';
      const close=doc.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Fechar aviso da IA');close.style.cssText='background:transparent;color:inherit;border:0;cursor:pointer;font:16px system-ui;padding:0 2px;';close.onclick=()=>{if(notice){notice.hidden=true;notice.style.display='none';}};
      notice.append(text,close);doc.body.append(notice);stopTheme=bindInpageAppearance(notice);
    }
    notice.hidden=false;notice.style.display='flex';notice.setAttribute('role',state.error ? 'alert' : 'status');notice.dataset.state=state.error ? 'error' : busy ? 'busy' : 'done';
    const text=state.error ? `Não foi possível concluir: ${state.error}` : busy ? `Processando… ${state.status}` : state.status || 'Resposta pronta no painel lateral.';
    if (notice.firstElementChild!.textContent!==text) notice.firstElementChild!.textContent=text;
    position();
    if (!busy && !state.error) dismiss=setTimeout(()=>{if(notice){notice.hidden=true;notice.style.display='none';}},5000);
  }
  function invoke(opened:boolean) {
    try { Promise.resolve(click(opened,report)).catch(error=>report({busy:false,status:'',error:error instanceof Error ? error.message : 'Não foi possível iniciar a consulta.'})); }
    catch(error) {report({busy:false,status:'',error:error instanceof Error ? error.message : 'Não foi possível iniciar a consulta.'});}
  }
  const start=()=>report({busy:true,status:'Abrindo o painel lateral…'});
  if (!firefox) {
    const button=element as HTMLButtonElement;button.type='button';button.textContent=label;
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(!event.isTrusted || busy)return;start();invoke(false);});
  } else {
    const frame=element as HTMLIFrameElement;frame.title=label;frame.setAttribute('aria-label',label);frame.dataset.octaAi='true';
    frame.src=browser.runtime.getURL(`/ai-trigger.html?id=${encodeURIComponent(id)}&label=${encodeURIComponent(label)}`);
    frame.style.cssText=`border:0;width:${label==='Gerar resposta' ? '28' : label==='Resumir' ? '69' : '116'}px;height:${label==='Gerar resposta' ? '28' : '22'}px;vertical-align:middle;flex-shrink:0;`;
  }
  const listener=(event:MessageEvent)=>{
    if(!firefox || !event.isTrusted || event.source!==(element as HTMLIFrameElement).contentWindow || event.origin!==origin || event.data?.type!=='OCTA_AI_TRIGGER' || event.data.id!==id)return;
    if(event.data.error) report({busy:false,status:'',error:String(event.data.error).slice(0,500)});
    else if(event.data.phase==='opening')start();
    else invoke(true);
  };
  doc.defaultView?.addEventListener('message',listener);doc.defaultView?.addEventListener('resize',position);doc.addEventListener('scroll',position,true);
  return {element:element as HTMLElement, report, dispose(){disposed=true;clearTimeout(dismiss);notice?.remove();stopTheme?.();doc.defaultView?.removeEventListener('message',listener);doc.defaultView?.removeEventListener('resize',position);doc.removeEventListener('scroll',position,true);}};
}
