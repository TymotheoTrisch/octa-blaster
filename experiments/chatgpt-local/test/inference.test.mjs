import test from 'node:test';
import assert from 'node:assert/strict';
import { collectResponse, FICTIONAL_INPUT, runFictionalTest } from '../inference.mjs';

const frame = event => `data: ${JSON.stringify(event)}\n\n`;
function stream(events, fragmented = false) {
  const data = Buffer.from(events.map(frame).join(''));
  return new ReadableStream({ start(controller) { for (let at = 0; at < data.length; at += fragmented ? 3 : data.length) controller.enqueue(data.subarray(at, at + (fragmented ? 3 : data.length))); controller.close(); } });
}

test('a fictional request uses only the public Responses route and supported subscription parameters', async () => {
  let calls = 0;
  const result = await runFictionalTest('fictional-oauth-token', 'model-from-catalog', async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer fictional-oauth-token');
    assert.deepEqual(JSON.parse(options.body), { model: 'model-from-catalog', input: [{ role: 'user', content: FICTIONAL_INPUT }], store: false, stream: true });
    return new Response(stream([{ type: 'response.output_text.delta', delta: 'Solicitação recebida.' }, { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 } } }], true), { headers: { 'Content-Type': 'text/event-stream' } });
  });
  assert.equal(result.text, 'Solicitação recebida.');
  assert.equal(result.usage.total_tokens, 25);
  assert.equal(calls, 1);
});

test('partial output is rejected on usage limits, failure, incomplete response or missing completion', async () => {
  for (const terminal of [
    { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } },
    { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_unavailable' } } },
    { type: 'response.incomplete' }, { type: 'error' }, null,
  ]) {
    const events = [{ type: 'response.output_text.delta', delta: 'Texto que não será aprovado' }, ...(terminal ? [terminal] : [])];
    await assert.rejects(collectResponse(stream(events, true)));
  }
});

test('a failed request has no retry, paid fallback or output from the error body', async () => {
  for (const status of [401, 403, 429, 500]) {
    let calls = 0;
    await assert.rejects(runFictionalTest('fake', 'fake-model', async () => { calls++; return new Response('Do not expose credentials', { status }); }), error => !error.message.includes('credentials'));
    assert.equal(calls, 1);
  }
});

test('structured HTTP errors preserve actionable diagnostics while removing credentials', async () => {
  const secret = 'sensitive-oauth-value';
  await assert.rejects(runFictionalTest(secret, 'fake-model', async () => Response.json({ error: {
    code: 'unsupported_parameter', type: 'invalid_request_error', param: 'temperature',
    message: `Rejected parameter. Bearer ${secret}, account test@example.invalid and sk-secret-key`,
  } }, { status: 400, headers: { 'x-request-id': 'req_fictional' } })), error => {
    assert.equal(error.code, 'provider_request_failed');
    assert.equal(error.diagnostic.stage, 'responses');
    assert.equal(error.diagnostic.httpStatus, 400);
    assert.equal(error.diagnostic.providerCode, 'unsupported_parameter');
    assert.equal(error.diagnostic.param, 'temperature');
    assert.equal(error.diagnostic.requestId, 'req_fictional');
    const serialized = JSON.stringify(error.diagnostic);
    for (const sensitive of [secret, 'test@example.invalid', 'sk-secret-key']) assert.ok(!serialized.includes(sensitive));
    return true;
  });
});

test('admission detail, non-JSON responses and stream errors retain distinct shapes', async () => {
  await assert.rejects(runFictionalTest('fake', 'fake-model', async () => Response.json({ detail: 'Route is unavailable' }, { status: 503 })), error => {
    assert.equal(error.diagnostic.bodyShape, 'detail');
    assert.equal(error.diagnostic.detail, 'Route is unavailable');
    assert.equal(error.diagnostic.httpStatus, 503);
    return true;
  });
  await assert.rejects(runFictionalTest('fake', 'fake-model', async () => new Response('<html>Do not expose this body</html>', { status: 502 })), error => error.diagnostic.bodyShape === 'non_json' && !JSON.stringify(error).includes('<html>'));
  await assert.rejects(collectResponse(stream([{ type: 'response.failed', response: { error: { code: 'subscription_sharing_user_not_eligible', message: 'Not eligible' } } }])), error => error.diagnostic.stage === 'stream' && error.diagnostic.providerCode === 'subscription_sharing_user_not_eligible');
});

test('network and timeout errors are classified without retaining raw exception messages', async () => {
  for (const [name, expected] of [['TypeError', 'network_error'], ['TimeoutError', 'request_timeout']]) {
    await assert.rejects(runFictionalTest('secret', 'fake-model', async () => { const error = new Error('secret and private network data'); error.name = name; throw error; }), error => error.code === expected && error.diagnostic.stage === 'responses' && !JSON.stringify(error).includes('private network'));
  }
});
