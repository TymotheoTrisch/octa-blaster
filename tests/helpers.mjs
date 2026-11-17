import { JSDOM } from 'jsdom';

export function installDom(html = '') {
  const dom = new JSDOM(html, { url: 'https://app.octadesk.com/tickets' });
  const descriptors = new Map();
  const names = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLIFrameElement',
    'Node', 'Element', 'Event', 'InputEvent', 'KeyboardEvent', 'MouseEvent', 'MutationObserver', 'localStorage'];
  for (const name of names) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
  }
  return {
    window: dom.window,
    document: dom.window.document,
    restore() {
      dom.window.close();
      for (const [name, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

export function installStorage(initial = {}) {
  const data = structuredClone(initial);
  const previous = globalThis.browser;
  globalThis.browser = {
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, structuredClone(data[key])]));
        },
        async set(items) { Object.assign(data, structuredClone(items)); },
      },
    },
  };
  return {
    data,
    restore() {
      if (previous === undefined) delete globalThis.browser;
      else globalThis.browser = previous;
    },
  };
}
