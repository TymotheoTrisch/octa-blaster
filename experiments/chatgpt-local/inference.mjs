import { PrototypeError, RESOURCE } from './auth.mjs';

export const FICTIONAL_INPUT = 'Atendimento fictício para teste do OctaBlaster. Escreva uma única frase curta confirmando o recebimento de uma solicitação fictícia. Não inclua nomes, dados pessoais ou informações de clientes reais.';

async function request(path, accessToken, options, fetcher) {
  const response = await fetcher(`${RESOURCE}/${path}`, {
    ...options, redirect: 'error', signal: AbortSignal.timeout(60_000),
    headers: { Authorization: `Bearer ${accessToken}`, ...options.headers },
  });
  if (!response.ok) {
    // Não imprime corpo de erro, cabeçalhos ou credenciais.
    if (response.status === 401) throw new PrototypeError('login_required');
    if (response.status === 403) throw new PrototypeError('plan_unavailable');
    if (response.status === 429) throw new PrototypeError('usage_unavailable');
    throw new PrototypeError('provider_request_failed');
  }
  return response;
}

export async function listModels(accessToken, fetcher = fetch) {
  const response = await request('models', accessToken, {}, fetcher);
  const result = await response.json();
  if (!Array.isArray(result.models)) throw new PrototypeError('invalid_model_catalog');
  return result.models.filter(model => model.visibility === 'list' && typeof model.slug === 'string' && typeof model.display_name === 'string').map(model => ({ slug: model.slug, name: model.display_name }));
}

export async function collectResponse(body) {
  if (!body) throw new PrototypeError('stream_missing');
  let buffer = '', text = '', bytes = 0;
  const decoder = new TextDecoder();
  for await (const chunk of body) {
    bytes += chunk.byteLength;
    if (bytes > 512_000) throw new PrototypeError('stream_too_large');
    buffer += decoder.decode(chunk, { stream: true });
    let match;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') continue;
      let event;
      try { event = JSON.parse(data); } catch { throw new PrototypeError('invalid_stream'); }
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') text += event.delta;
      if (['error', 'response.failed', 'response.incomplete'].includes(event.type)) {
        const code = event.response?.error?.code || event.error?.code || event.code;
        if (['subscription_sharing_usage_limit_exceeded', 'subscription_sharing_usage_unavailable'].includes(code)) throw new PrototypeError('usage_unavailable');
        throw new PrototypeError('inference_failed');
      }
      if (event.type === 'response.completed') {
        if (event.response?.status && event.response.status !== 'completed') throw new PrototypeError('inference_failed');
        const finalText = event.response?.output?.flatMap(item => item.content ?? []).filter(item => item.type === 'output_text').map(item => item.text).join('');
        const output = finalText || text;
        if (!output) throw new PrototypeError('empty_response');
        const usage = event.response?.usage ?? {};
        return { text: output, usage: Object.fromEntries(['input_tokens', 'output_tokens', 'total_tokens'].filter(key => Number.isFinite(usage[key])).map(key => [key, usage[key]])) };
      }
    }
  }
  throw new PrototypeError('stream_interrupted');
}

export async function runFictionalTest(accessToken, model, fetcher = fetch) {
  if (typeof model !== 'string' || !model || model.length > 160) throw new PrototypeError('invalid_model');
  const response = await request('responses', accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ model, input: [{ role: 'user', content: FICTIONAL_INPUT }], store: false, stream: true }),
  }, fetcher);
  if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new PrototypeError('invalid_stream');
  return collectResponse(response.body);
}
