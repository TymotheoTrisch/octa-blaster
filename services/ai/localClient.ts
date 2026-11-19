export const AI_LOCAL_KEY = 'octablaster_ai_local_connection';
export const DEFAULT_AI_HELPER_URL = 'http://127.0.0.1:53894';

export function validateHelperUrl(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('Informe o endereço do auxiliar local.');
  const url = new URL(raw);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('Use apenas http://127.0.0.1:PORTA para o auxiliar local.');
  return url.origin;
}

export async function aiLocalMessage(action: string, data: Record<string, unknown> = {}): Promise<any> {
  const result = await browser.runtime.sendMessage({ action, ...data });
  if (!result?.success) throw new Error(result?.error || 'Não foi possível conectar ao auxiliar local.');
  return result.data;
}
