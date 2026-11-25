import type { AiProvider, AiProviderConfig } from '@/types/ai';
import { providerFetch, type HttpOptions } from '../transport';
import type { ProviderPayload } from './contracts';
import { completedChatText } from './completionResult';
export async function generateCompatible(provider: AiProvider, config: AiProviderConfig, payload: ProviderPayload, options: HttpOptions) {
  const result = await providerFetch(provider, config, 'chat/completions', {
    model: config.model,
    messages: [{ role: 'system', content: payload.instructions }, ...payload.history, { role: 'user', content: payload.prompt }],
    max_tokens: payload.maxOutputTokens, stream: false,
  }, options);
  return completedChatText(result);
}
