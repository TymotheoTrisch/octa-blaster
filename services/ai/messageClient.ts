export async function aiMessage(action: string, data: Record<string, unknown> = {}): Promise<any> {
  const result = await browser.runtime.sendMessage({ action, ...data });
  if (!result?.success) throw new Error(result?.error || 'Não foi possível comunicar com a integração de IA.');
  return result.data;
}
