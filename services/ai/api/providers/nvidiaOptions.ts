import type { AiProvider, AiProviderConfig } from '@/types/ai';

/** Opções documentadas por modelo; não são enviadas a modelos/contratos desconhecidos.
 * https://docs.nvidia.com/nim/large-language-models/2.0.10/get-started/advanced/get-started-nemotron-3.5-lightning
 */
export function nvidiaTextOptions(provider: AiProvider, config: AiProviderConfig) {
  if (provider === 'nvidia' && config.model === 'nvidia/nemotron-3.5-lightning-30b-a3b') {
    return { chat_template_kwargs: { enable_thinking: false } };
  }
  return {};
}
