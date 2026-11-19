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
