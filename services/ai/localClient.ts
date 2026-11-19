export async function aiLocalMessage(action: string, data: Record<string, unknown> = {}): Promise<any> {
  const result = await browser.runtime.sendMessage({ action, ...data });
  if (!result?.success) throw new Error(result?.error || 'Não foi possível conectar ao auxiliar local.');
  return result.data;
}
