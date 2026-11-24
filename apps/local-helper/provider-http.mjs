const BASES = { openai: 'https://api.openai.com/v1', gemini: 'https://generativelanguage.googleapis.com/v1', claude: 'https://api.anthropic.com/v1', nvidia: 'https://integrate.api.nvidia.com/v1' };

export class ProviderError extends Error {
  constructor(status) { super(status === 401 || status === 403 ? 'Credencial ou acesso recusado pelo provedor.' : status === 429 ? 'Limite do provedor atingido. Nenhuma alternativa foi acionada.' : status === 404 ? 'O modelo ou o contexto remoto não está mais disponível. Confira o modelo ou tente novamente para reconstruir o contexto.' : 'O provedor não concluiu a solicitação. Nenhuma nova tentativa automática foi feita.'); this.status = status; }
}
export async function providerFetch(provider, config, path, body, { fetcher = fetch, signal, method = 'POST' } = {}) {
  const headers = provider === 'gemini' ? { 'x-goog-api-key': config.apiKey } : provider === 'claude' ? { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' } : { Authorization: `Bearer ${config.apiKey}` };
  const base = provider === 'gateway' ? config.baseUrl : BASES[provider];
  if (!base || !config.apiKey) throw new Error('Configure a chave ou credencial do provedor selecionado.');
  let response;
  try { response = await fetcher(`${base}/${path}`, { method, redirect: 'error', headers: { ...headers, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000) }); }
  catch { throw new Error(signal?.aborted ? 'Solicitação cancelada.' : 'Não foi possível concluir a conexão com o provedor.'); }
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new ProviderError(response.status); }
  if (method === 'DELETE') { await response.body?.cancel().catch(() => {}); return {}; }
  const declared = Number(response.headers?.get('content-length') || 0); if (declared > 1_000_000) throw new Error('Resposta acima do limite.');
  let raw = '', size = 0; const decoder = new TextDecoder();
  for await (const chunk of response.body) { size += chunk.byteLength; if (size > 1_000_000) throw new Error('Resposta acima do limite.'); raw += decoder.decode(chunk, { stream: true }); }
  try { return JSON.parse(raw); } catch { throw new Error('O provedor retornou um formato inválido.'); }
}

const textResult = (text, id, usage) => { if (typeof text !== 'string' || !text.trim() || text.length > 100_000) throw new Error('O provedor não retornou texto válido.'); return { text, id, usage }; };
export async function generateProvider(provider, config, payload, options) {
  const { instructions, prompt, history, previousId, remoteStore, maxOutputTokens = 2048 } = payload;
  if (provider === 'gateway') return providerFetch(provider, config, 'v1/generate', payload.input, options);
  if (provider === 'openai') {
    const result = await providerFetch(provider, config, 'responses', { model: config.model, instructions, store: remoteStore, ...(previousId ? { previous_response_id: previousId } : {}), input: previousId ? [{ role: 'user', content: prompt }] : [...history, { role: 'user', content: prompt }], max_output_tokens: maxOutputTokens }, options);
    if (result.status !== 'completed' || result.error) throw new Error('A resposta foi interrompida ou não foi concluída.');
    return textResult(result.output?.flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join(''), result.id, result.usage);
  }
  if (provider === 'gemini') {
    const result = await providerFetch(provider, config, 'interactions', { model: config.model, system_instruction: instructions, store: remoteStore, ...(previousId ? { previous_interaction_id: previousId } : {}), input: previousId ? prompt : JSON.stringify({ historico: history, pergunta_contexto: prompt }), generation_config: { max_output_tokens: maxOutputTokens } }, options);
    if (result.status !== 'completed' || result.error) throw new Error('A interação não foi concluída.');
    const content = result.steps ? result.steps.filter(step => step.type === 'model_output').flatMap(step => step.content || []) : result.outputs || [];
    return textResult(content.filter(item => item.type === 'text').map(item => item.text).join(''), result.id, result.usage);
  }
  if (provider === 'claude') {
    const result = await providerFetch(provider, config, 'messages', { model: config.model, max_tokens: maxOutputTokens, system: [{ type: 'text', text: instructions, cache_control: { type: 'ephemeral' } }], messages: [...history, { role: 'user', content: [{ type: 'text', text: prompt, cache_control: { type: 'ephemeral' } }] }] }, options);
    if (!['end_turn', 'stop_sequence'].includes(result.stop_reason) || result.error) throw new Error('A resposta foi interrompida ou não foi concluída.');
    return textResult(result.content?.filter(item => item.type === 'text').map(item => item.text).join(''), null, result.usage);
  }
  const result = await providerFetch(provider, config, 'chat/completions', { model: config.model, messages: [{ role: 'system', content: instructions }, ...history, { role: 'user', content: prompt }], max_tokens: maxOutputTokens, stream: false }, options);
  if (result.choices?.[0]?.finish_reason !== 'stop' || result.error) throw new Error('A resposta foi interrompida ou não foi concluída.');
  return textResult(result.choices[0].message?.content, null, result.usage);
}

export async function deleteProviderState(provider, config, id, options) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/.test(id)) throw new Error('Identificador remoto inválido.');
  const path = provider === 'openai' ? `responses/${id}` : provider === 'gemini' ? `interactions/${id}` : null;
  if (!path) return;
  try { await providerFetch(provider, config, path, undefined, { ...options, method: 'DELETE' }); } catch (error) { if (error.status !== 404) throw error; }
}
