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

function completedResult(response, fallback = '', transport = 'sse') {
  if (response?.error || (response?.status && response.status !== 'completed')) throw new PrototypeError('inference_failed', { stage: transport });
  const finalText = (Array.isArray(response?.output) ? response.output : []).flatMap(item => Array.isArray(item.content) ? item.content : []).filter(item => item.type === 'output_text' && typeof item.text === 'string').map(item => item.text).join('');
  const text = finalText || fallback;
  if (!text) throw new PrototypeError('empty_response', { stage: transport });
  const usage = response?.usage ?? {};
  return { text, transport, usage: Object.fromEntries(['input_tokens', 'output_tokens', 'total_tokens'].filter(key => Number.isFinite(usage[key])).map(key => [key, usage[key]])) };
}

function responseFailure(payload, secrets, extra) {
  const code = payload?.response?.error?.code || payload?.error?.code || payload?.code;
  return new PrototypeError(['subscription_sharing_usage_limit_exceeded', 'subscription_sharing_usage_unavailable'].includes(code) ? 'usage_unavailable' : 'inference_failed', providerDiagnostic(payload, extra.stage, secrets, extra));
}

export async function collectResponse(body, secrets = []) {
  if (!body) throw new PrototypeError('stream_missing');
  let buffer = '', text = '', bytes = 0, raw = '', sawData = false;
  const decoder = new TextDecoder();
  for await (const chunk of body) {
    bytes += chunk.byteLength;
    if (bytes > 512_000) throw new PrototypeError('stream_too_large');
    const decoded = decoder.decode(chunk, { stream: true });
    buffer += decoded;
    if (!sawData) raw += decoded;
    let match;
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') continue;
      sawData = true;
      raw = '';
      let event;
      try { event = JSON.parse(data); } catch { throw new PrototypeError('invalid_stream'); }
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') text += event.delta;
      if (['error', 'response.failed', 'response.incomplete'].includes(event.type)) {
        throw responseFailure(event, secrets, { stage: 'stream', event: event.type });
      }
      if (event.type === 'response.completed') {
        return completedResult(event.response, text);
      }
    }
  }
  // Alguns intermediários alteram o Content-Type ou entregam o objeto final em JSON.
  // HTTP 200 sozinho nunca confirma sucesso: exige o objeto Responses concluído.
  if (!sawData) {
    let payload;
    try { payload = JSON.parse(raw); } catch { throw new PrototypeError('invalid_stream', { stage: 'responses', bodyShape: /^\s*</.test(raw) ? 'html_or_xml' : 'non_json' }); }
    const diagnostic = { stage: 'responses', bodyShape: payload?.object === 'response' ? 'response' : 'json_other', responseStatus: safeDiagnostic(payload?.status, secrets) };
    if (payload?.error || payload?.detail) throw responseFailure(payload, secrets, diagnostic);
    if (payload?.object === 'response' && typeof payload.id === 'string' && payload.id.trim() && payload.status === 'completed' && Array.isArray(payload.output)) return completedResult(payload, '', 'json');
    throw new PrototypeError('invalid_stream', diagnostic);
  }
  throw new PrototypeError('stream_interrupted');
}

export async function runFictionalTest(accessToken, model, fetcher = fetch) {
  if (typeof model !== 'string' || !model || model.length > 160) throw new PrototypeError('invalid_model');
  const response = await request('responses', accessToken, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ model, input: [{ role: 'user', content: FICTIONAL_INPUT }], store: false, stream: true }),
  }, fetcher);
  // A validação usa o corpo e o estado terminal, sem depender apenas do cabeçalho.
  try { return { ...await collectResponse(response.body, [accessToken]), contentType: safeDiagnostic(response.headers.get('content-type'), [accessToken]) || 'não informado' }; }
  catch (error) {
    if (error instanceof PrototypeError) {
      error.diagnostic = { httpStatus: response.status, contentType: safeDiagnostic(response.headers.get('content-type'), [accessToken]) || 'não informado', ...error.diagnostic };
      throw error;
    }
    throw new PrototypeError('stream_interrupted', { stage: 'stream' });
  }
}
