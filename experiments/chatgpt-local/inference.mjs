import { PrototypeError, RESOURCE } from './auth.mjs';

export const FICTIONAL_INPUT = 'Atendimento fictício para teste do OctaBlaster. Escreva uma única frase curta confirmando o recebimento de uma solicitação fictícia. Não inclua nomes, dados pessoais ou informações de clientes reais.';

// Apenas diagnóstico local sanitizado: nunca conserva o corpo bruto ou cabeçalhos de autenticação.
export function safeDiagnostic(value, secrets = []) {
  if (typeof value !== 'string') return undefined;
  for (const secret of secrets) if (secret) value = value.split(secret).join('[credencial removida]');
  return value.replace(/Bearer\s+\S+/gi, 'Bearer [removido]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[JWT removido]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g, '[chave removida]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[e-mail removido]')
    .replace(/[\u0000-\u001f]/g, ' ').slice(0, 500);
}

function providerDiagnostic(payload, stage, secrets, extra = {}) {
  const error = payload?.error || payload?.response?.error;
  const detail = typeof payload?.detail === 'string' ? payload.detail : undefined;
  return Object.fromEntries(Object.entries({
    stage, ...extra, bodyShape: error ? 'error' : detail ? 'detail' : 'other',
    providerCode: safeDiagnostic(error?.code || payload?.code, secrets),
    providerType: safeDiagnostic(error?.type, secrets),
    param: safeDiagnostic(error?.param || payload?.param, secrets),
    detail: safeDiagnostic(error?.message || detail || payload?.message, secrets),
  }).filter(([, value]) => value !== undefined));
}

async function request(path, accessToken, options, fetcher) {
  let response;
  try {
    response = await fetcher(`${RESOURCE}/${path}`, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${accessToken}`, ...options.headers },
    });
  } catch (error) {
    throw new PrototypeError(error.name === 'TimeoutError' ? 'request_timeout' : 'network_error', { stage: path });
  }
  if (!response.ok) {
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    const diagnostic = providerDiagnostic(payload, path, [accessToken], {
      httpStatus: response.status, requestId: safeDiagnostic(response.headers.get('x-request-id'), [accessToken]),
    });
    if (!payload) diagnostic.bodyShape = 'non_json';
    const code = response.status === 401 ? 'login_required' : response.status === 403 ? 'plan_unavailable'
      : response.status === 429 ? 'usage_unavailable' : 'provider_request_failed';
    throw new PrototypeError(code, diagnostic);
  }
  return response;
}

export async function listModels(accessToken, fetcher = fetch) {
  const response = await request('models', accessToken, {}, fetcher);
  const result = await response.json();
  if (!Array.isArray(result.models)) throw new PrototypeError('invalid_model_catalog');
  return result.models.filter(model => model.visibility === 'list' && typeof model.slug === 'string' && typeof model.display_name === 'string').map(model => ({ slug: model.slug, name: model.display_name }));
}

export async function collectResponse(body, secrets = []) {
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
        const diagnostic = providerDiagnostic(event, 'stream', secrets, { event: event.type });
        if (['subscription_sharing_usage_limit_exceeded', 'subscription_sharing_usage_unavailable'].includes(code)) throw new PrototypeError('usage_unavailable', diagnostic);
        throw new PrototypeError('inference_failed', diagnostic);
      }
      if (event.type === 'response.completed') {
        if (event.response?.status && event.response.status !== 'completed') throw new PrototypeError('inference_failed');
        const finalText = (Array.isArray(event.response?.output) ? event.response.output : []).flatMap(item => Array.isArray(item.content) ? item.content : []).filter(item => item.type === 'output_text').map(item => item.text).join('');
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
  if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new PrototypeError('invalid_stream', { stage: 'responses', httpStatus: response.status });
  try { return await collectResponse(response.body, [accessToken]); }
  catch (error) {
    if (error instanceof PrototypeError) throw error;
    throw new PrototypeError('stream_interrupted', { stage: 'stream' });
  }
}
