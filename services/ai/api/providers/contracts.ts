import type { AiChatTurn, AiProviderConfig } from '@/types/ai';
import type { HttpOptions } from '../transport';
export interface ProviderPayload {
  instructions: string; prompt: string; history: AiChatTurn[];
  previousId?: string; remoteStore: boolean; maxOutputTokens: number;
}
export interface ProviderResult { text: string; id?: string }
export type ProviderAdapter = (config: AiProviderConfig, payload: ProviderPayload, options: HttpOptions) => Promise<ProviderResult>;
export function textResult(text: unknown, id?: string): ProviderResult {
  if (typeof text !== 'string' || !text.trim() || text.length > 100_000) throw new Error('A API não retornou texto válido.');
  return { text, ...(id ? { id } : {}) };
}
