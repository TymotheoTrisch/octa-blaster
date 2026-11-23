// Um único canal por background; o Firefox inicia o programa nativo sob demanda.
export function createNativeAiClient() {
  let port: ReturnType<typeof browser.runtime.connectNative> | null = null;
  const pending = new Map<string, { resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  function connect() {
    if (port) return port;
    const next = browser.runtime.connectNative('com.octablaster.ai'); port = next;
    next.onMessage.addListener((message: any) => {
      const task = pending.get(message?.id); if (!task) return;
      clearTimeout(task.timer); pending.delete(message.id);
      if (message.success) task.resolve(message.data); else task.reject(new Error(message.error || 'A solicitação de IA falhou.'));
    });
    next.onDisconnect.addListener(() => {
      // Consumir lastError evita logs desnecessários; nunca registra conteúdo da solicitação.
      void browser.runtime.lastError;
      if (port === next) port = null;
      for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error('Instale ou atualize o auxiliar com Instalar-IA-Firefox.exe. Depois clique em Entrar com ChatGPT no menu Inteligência artificial.')); }
      pending.clear();
    });
    return next;
  }
  return {
    call(action: string, data: Record<string, unknown> = {}, id = crypto.randomUUID()): Promise<any> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('O tempo de espera da IA terminou. Tente novamente quando desejar.')); }, 125_000);
        pending.set(id, { resolve, reject, timer });
        try { connect().postMessage({ ...data, id, action }); }
        catch { clearTimeout(timer); pending.delete(id); reject(new Error('Auxiliar não instalado. Execute Instalar-IA-Firefox.exe uma vez.')); }
      });
    },
  };
}
