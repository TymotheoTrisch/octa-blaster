/**
 * Obtém a área local de armazenamento disponível no ambiente (WXT browser, chrome ou browser global).
 */
function getBrowserStorageArea(): any {
  if (typeof browser !== 'undefined' && browser?.storage?.local) {
    return browser.storage.local;
  }
  const gChrome = (globalThis as any).chrome;
  if (gChrome?.storage?.local) {
    return gChrome.storage.local;
  }
  const gBrowser = (globalThis as any).browser;
  if (gBrowser?.storage?.local) {
    return gBrowser.storage.local;
  }
  return null;
}

/**
 * Leitura de chaves com compatibilidade entre Promise (MV3) e Callback (MV2 / Chromium legado).
 */
export async function rawStorageGet(keys: string[]): Promise<Record<string, any>> {
  const st = getBrowserStorageArea();

  if (st) {
    try {
      const res = st.get(keys);
      if (res && typeof res.then === 'function') {
        const data = await res;
        if (data && typeof data === 'object') return data;
      } else {
        const callbackData = await new Promise<Record<string, any>>((resolve, reject) => {
          st.get(keys, (items: any) => {
            const err = (globalThis as any).chrome?.runtime?.lastError;
            if (err) reject(new Error(err.message || String(err)));
            else resolve(items || {});
          });
        });
        if (callbackData && typeof callbackData === 'object') return callbackData;
      }
    } catch (err) {
      console.warn('[OctaBlaster] Erro ao ler browser.storage.local, tentando fallback:', err);
    }
  }

  // Fallback redundante para localStorage
  const fallback: Record<string, any> = {};
  if (typeof localStorage !== 'undefined') {
    for (const key of keys) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          fallback[key] = JSON.parse(stored);
        }
      } catch {}
    }
  }

  return fallback;
}

/**
 * Escrita segura de chaves com sanitização e sincronização redundante com localStorage.
 */
export async function rawStorageSet(items: Record<string, any>): Promise<void> {
  const st = getBrowserStorageArea();
  let storageSaved = false;
  let backupSaved = false;

  // Sanitiza tudo que vai pro storage para garantir POJO puro sem undefined
  const pojoItems = JSON.parse(JSON.stringify(items));

  if (st) {
    try {
      if (st === (globalThis as any).chrome?.storage?.local) {
        await new Promise<void>((resolve, reject) => {
          const result = st.set(pojoItems, () => {
            const err = (globalThis as any).chrome?.runtime?.lastError;
            if (err) reject(new Error(err.message || String(err)));
            else resolve();
          });
          if (result && typeof result.then === 'function') result.then(resolve, reject);
        });
      } else {
        await st.set(pojoItems);
      }
      storageSaved = true;
    } catch (err) {
      console.warn('[OctaBlaster] Erro ao salvar em browser.storage.local:', err);
    }
  }

  // Backup em localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      for (const [key, value] of Object.entries(pojoItems)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
      backupSaved = true;
    }
  } catch {}

  if (!storageSaved && !backupSaved) {
    throw new Error('Não foi possível salvar os dados no armazenamento do navegador nem no backup local. Tente novamente.');
  }
}

