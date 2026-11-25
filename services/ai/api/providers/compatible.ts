import type { AiProvider, AiProviderConfig } from '@/types/ai';
import { providerFetch, type HttpOptions } from '../transport';
import { textResult, type ProviderPayload } from './contracts';
export async function generateCompatible(provider: AiProvider, config: AiProviderConfig, payload: ProviderPayload, options: HttpOptions) {
  const result = await providerFetch(provider, config, 'chat/completions', {
    model: config.model,
    messages: [{ role: 'system', content: payload.instructions }, ...payload.history, { role: 'user', content: payload.prompt }],
    max_tokens: payload.maxOutputTokens, stream: false,
  }, options);
  if (result.choices?.[0]?.finish_reason !== 'stop' || result.error) throw new Error('A resposta foi interrompida ou não foi concluída.');
  return textResult(result.choices[0].message?.content);
}
