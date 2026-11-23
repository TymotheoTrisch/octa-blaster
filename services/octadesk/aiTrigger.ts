/** No Firefox o gesto deve ocorrer numa página da extensão, não no content script. */
export function createAiTrigger(doc: Document, label: string, click: (opened: boolean) => void) {
  const firefox = browser.runtime?.getManifest?.().manifest_version === 2;
  if (!firefox) {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); if (event.isTrusted) click(false); });
    return { element: button as HTMLElement, dispose() {} };
  }
  const id = crypto.randomUUID(), frame = doc.createElement('iframe');
  frame.title = label; frame.setAttribute('aria-label', label); frame.dataset.octaAi = 'true';
  frame.src = browser.runtime.getURL(`/ai-trigger.html?id=${encodeURIComponent(id)}&label=${encodeURIComponent(label)}`);
  frame.style.cssText = `border:0;width:${label === 'Gerar resposta' ? '28' : label === 'Resumir' ? '69' : '116'}px;height:${label === 'Gerar resposta' ? '28' : '22'}px;vertical-align:middle;flex-shrink:0;`;
  const origin = browser.runtime.getURL('/').replace(/\/$/, '');
  const listener = (event: MessageEvent) => {
    if (!event.isTrusted || event.source !== frame.contentWindow || event.origin !== origin || event.data?.type !== 'OCTA_AI_TRIGGER' || event.data.id !== id) return;
    if (event.data.error) frame.title = event.data.error; else click(true);
  };
  doc.defaultView?.addEventListener('message', listener);
  return { element: frame as HTMLElement, dispose() { doc.defaultView?.removeEventListener('message', listener); } };
}
