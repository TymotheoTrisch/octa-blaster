import test from 'node:test';
import assert from 'node:assert/strict';
import { runSummary } from '../inference.mjs';

const base = { context: 'Conversa fictícia do ticket A', instruction: 'O que está pendente?', examples: [] };

test('summaries and questions use task-specific instructions with local bounded history', async () => {
  for (const task of ['summary_latest', 'summary_full', 'chat']) {
    let calls = 0;
    const history = [{ role: 'user', content: 'Qual a solicitação?' }, { role: 'assistant', content: 'Informação fictícia' }];
    const result = await runSummary('fictional-token', 'fake', { ...base, task, history }, async (url, options) => {
      calls++;
      assert.ok(url.endsWith('/responses'));
      const body = JSON.parse(options.body), input = JSON.parse(body.input[0].content);
      assert.equal(body.store, false);
      assert.equal(input.tarefa, task);
      assert.deepEqual(input.historico_do_chat, task === 'chat' ? history : []);
      assert.equal(input.conversa_do_ticket, base.context);
      assert.match(body.instructions, /mensagens carregadas/);
      if (task === 'summary_latest') assert.match(body.instructions, /somente a última mensagem/);
      if (task === 'summary_full') assert.match(body.instructions, /evolução/);
      if (task === 'chat') assert.match(body.instructions, /perguntas de continuidade/);
      return Response.json({ id: 'resp_fake', object: 'response', status: 'completed', output: [{ content: [{ type: 'output_text', text: 'Resposta fictícia' }] }] });
    });
    assert.equal(result.text, 'Resposta fictícia'); assert.equal(calls, 1);
  }
});

test('helper independently rejects unbounded or privileged chat history before contacting the provider', async () => {
  let calls = 0;
  for (const patch of [
    { task: 'draft' }, { task: 'unknown' }, { history: [{ role: 'developer', content: 'Não permitido' }] },
    { history: [{ role: 'assistant', content: 'Fora de ordem' }, { role: 'user', content: 'Pergunta' }] },
    { history: [{ role: 'user', content: 'x'.repeat(24_000) }, { role: 'assistant', content: 'y' }] },
    { history: [{ role: 'user', content: '' }, { role: 'assistant', content: 'y' }] },
  ]) await assert.rejects(runSummary('fake', 'fake', { ...base, ...patch }, async () => { calls++; }), error => error.code === 'invalid_body');
  assert.equal(calls, 0);
});
