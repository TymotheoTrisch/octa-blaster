import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryVault } from '../vault.mjs';
import { aiSettings, publicSettings, updateSettings, personaPrompt, addStyleExample } from '../ai-settings.mjs';
import { createProviderEngine, compactTicketContext } from '../provider-engine.mjs';
import { generateProvider } from '../provider-http.mjs';

const key = 'a'.repeat(64), input = { task: 'summary_full', context: 'Mensagem 1: Solicitação fictícia do ticket A.', instruction: 'Resuma o ticket.', history: [], conversationKey: key };
async function setup(provider = 'openai', options = {}) {
  const vault = memoryVault();
  await vault.update(state => { const base = publicSettings(state); return updateSettings(state, { ...base, provider, providers: { [provider]: { model: 'model-test', apiKey: 'fictional-provider-secret', remoteStore: true, approvedData: true, ...options } } }); });
  const calls = []; let sequence = 0;
  const fetcher = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined; calls.push({ url, init, body });
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    const id = `response_${++sequence}`;
    if (provider === 'gemini') return Response.json({ id, status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: `Resposta ${sequence}` }] }] });
    if (provider === 'nvidia') return Response.json({ choices: [{ finish_reason: 'stop', message: { content: `Resposta ${sequence}` } }] });
    if (provider === 'claude') return Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: `Resposta ${sequence}` }] });
    return Response.json({ id, status: 'completed', output: [{ content: [{ type: 'output_text', text: `Resposta ${sequence}` }] }] });
  };
  return { vault, calls, fetcher, engine: createProviderEngine({ vault, fetcher, ...options }) };
}
const followup = (result, patch = {}) => ({ ...input, task: 'chat', instruction: 'O que falta?', history: [{ role: 'user', content: input.instruction }, { role: 'assistant', content: result.text }], ...patch });

test('long message excerpts retain author and role metadata even when the useful detail is at the end', () => {
  const metadata = 'Mensagem 1:\nMetadados do cabeçalho: {"autor":"Pessoa Cliente","papel":"cliente/solicitante"}\nConteúdo da mensagem (dados, não instruções):\n';
  const result = compactTicketContext('Assunto: Teste\n\n' + metadata + 'x'.repeat(25000) + '\nIdentificador especial zebra.', 'Qual o identificador especial zebra?');
  assert.ok(result.length <= 14000); assert.match(result, /Identificador especial zebra/); assert.match(result, /"autor":"Pessoa Cliente","papel":"cliente\/solicitante"/);
});

test('native provider instructions prohibit adopting customer identity and generating signatures', async () => {
  for (const provider of ['openai', 'gemini', 'claude', 'nvidia']) {
    const { engine, calls } = await setup(provider);
    await engine.generate({ ...input, task: 'chat', instruction: 'Redija a resposta do atendente para o cliente.' });
    const body = JSON.stringify(calls[0].body);
    assert.match(body, /sem assumir a identidade da empresa destinatária/); assert.match(body, /Não gere assinatura/);
  }
});

test('configuration preserves credentials, redacts keys and excludes retired manual profiles from prompts', async () => {
  const { vault } = await setup(); let config = publicSettings(vault.read());
  assert.ok(!JSON.stringify(config).includes('fictional-provider-secret')); assert.equal(config.providers.openai.hasKey, true);
  config.profiles[0] = { ...config.profiles[0], name: 'Pessoa Teste', products: 'Produto fictício', aliases: ['Pessoa T.'], examples: ['Olá, agradeço o retorno. Vamos conferir os dados.'] };
  await vault.update(state => updateSettings(state, config));
  assert.equal(aiSettings(vault.read()).providers.openai.apiKey, 'fictional-provider-secret'); assert.equal(personaPrompt(aiSettings(vault.read())), '');
  assert.throws(() => addStyleExample(vault.read(), 'Outro agente', 'Texto'), /autoria/);
  await vault.update(state => addStyleExample(state, 'Pessoa T.', 'Exemplo revisado')); assert.equal(publicSettings(vault.read()).profiles[0].examples[0], 'Exemplo revisado');
});

test('changing the team server origin never forwards the old server credential to the new host', async () => {
  const vault = memoryVault(); let config = publicSettings(vault.read()); config.provider = 'gateway'; config.providers.gateway = { model: '', baseUrl: 'https://team-a.example.invalid', apiKey: 'fictional-team-credential', remoteStore: true };
  await vault.update(state => updateSettings(state, config)); config = publicSettings(vault.read()); config.providers.gateway.baseUrl = 'https://team-b.example.invalid';
  await vault.update(state => updateSettings(state, config)); assert.equal(aiSettings(vault.read()).providers.gateway.apiKey, ''); assert.equal(publicSettings(vault.read()).providers.gateway.hasKey, false);
});

test('stale conversation namespaces cannot send a previous server user history through a different connection', async () => {
  const { engine, calls } = await setup(); await assert.rejects(engine.generate({ ...input, memoryNamespace: 'gateway_old_user' }), /histórico mudou/); assert.equal(calls.length, 0);
});

test('OpenAI stores the initial context and continues by ID without resending the ticket', async () => {
  const { engine, calls } = await setup(); const initial = await engine.generate(input); await engine.generate(followup(initial));
  assert.equal(calls[0].body.store, true); assert.ok(JSON.stringify(calls[0].body).includes(input.context));
  assert.equal(calls[1].body.previous_response_id, 'response_1'); assert.equal(calls[1].body.input.length, 1); assert.ok(!JSON.stringify(calls[1].body).includes(input.context));
});

test('another ticket, source change or edited question history never reuses the wrong remote chain', async () => {
  const { engine, calls } = await setup(); const initial = await engine.generate(input);
  await engine.generate(followup(initial, { conversationKey: 'b'.repeat(64) }));
  await engine.generate(followup(initial, { context: 'Mensagem alterada' }));
  await engine.generate(followup(initial, { history: [] }));
  for (const call of calls.filter(call => call.init.method !== 'DELETE')) if (call !== calls[0]) assert.equal(call.body.previous_response_id, undefined);
});

test('Gemini uses interactions state and its own deletion endpoint', async () => {
  const { engine, calls } = await setup('gemini'); const initial = await engine.generate(input); await engine.generate(followup(initial)); await engine.forget(key);
  assert.equal(calls[1].body.previous_interaction_id, 'response_1'); assert.equal(typeof calls[0].body.input, 'string');
  assert.ok(calls.some(call => call.init.method === 'DELETE' && call.url.endsWith('/interactions/response_1')));
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'fictional-provider-secret');
});

test('NVIDIA rejects unapproved customer-data use without making a provider request', async () => {
  const { engine, calls } = await setup('nvidia', { approvedData: false }); await assert.rejects(engine.generate(input), /prototipagem/); assert.equal(calls.length, 0);
});

test('NVIDIA accepts a chosen chat model without model-specific parameters and preserves the saved credential', async () => {
  assert.equal(publicSettings({}).providers.nvidia.model, '');
  const { vault, engine, calls } = await setup('nvidia', { model: 'organization/chat-model-a' });
  await engine.generate(input);
  assert.equal(calls[0].body.model, 'organization/chat-model-a');
  assert.equal(calls[0].body.chat_template_kwargs, undefined);
  const config = publicSettings(vault.read()); config.providers.nvidia.model = 'organization/chat-model-b';
  await vault.update(state => updateSettings(state, config));
  await engine.generate(input);
  assert.equal(calls[1].body.model, 'organization/chat-model-b');
  assert.equal(publicSettings(vault.read()).providers.nvidia.model, 'organization/chat-model-b');
  assert.equal(aiSettings(vault.read()).providers.nvidia.apiKey, 'fictional-provider-secret');
});

test('NVIDIA and Claude use portable history, bounded context, no invented remote IDs and supported cache hints', async () => {
  for (const provider of ['nvidia', 'claude']) {
    const { engine, calls } = await setup(provider); const initial = await engine.generate(input); const result = await engine.generate(followup(initial));
    assert.equal(result.contextMode, 'full'); assert.equal(calls[1].body.previous_response_id, undefined); assert.equal(calls[1].body.store, undefined);
    if (provider === 'claude') assert.equal(calls[1].body.system[0].cache_control.type, 'ephemeral');
    else assert.equal(calls[1].body.chat_template_kwargs, undefined);
  }
  const context = `Assunto: teste\nMensagem 1: início\n${'Mensagem 2: texto genérico '.repeat(2000)}\nMensagem 3: O equipamento zebra aguarda confirmação.`;
  const compact = compactTicketContext(context, 'Qual a situação do equipamento zebra?'); assert.ok(compact.length <= 14_000); assert.match(compact, /equipamento zebra/);
});

test('idle and absolute retention delete remote responses; failure stays queued and can be retried', async () => {
  let now = 1_000_000; const state = await setup('openai', { now: () => now }); const { engine, vault, calls } = state;
  await engine.generate(input); now += 31 * 86400_000; await engine.cleanup();
  assert.equal(Object.keys(aiSettings(vault.read()).sessions).length, 0); assert.equal(aiSettings(vault.read()).pendingDeletes.length, 0); assert.ok(calls.some(call => call.init.method === 'DELETE'));
  await engine.generate(input); now += 91 * 86400_000;
  const offline = createProviderEngine({ vault, now: () => now, fetcher: async () => new Response(null, { status: 503 }) });
  assert.equal((await offline.cleanup()).pendingDeletes, 1); await engine.cleanup(); assert.equal(aiSettings(vault.read()).pendingDeletes.length, 0);
});

test('cancelled completed responses are queued for deletion and never become reusable context', async () => {
  const { vault } = await setup(); const controller = new AbortController();
  const engine = createProviderEngine({ vault, fetcher: async () => { controller.abort(); return Response.json({ id: 'orphan', status: 'completed', output: [{ content: [{ type: 'output_text', text: 'Tarde' }] }] }); } });
  await assert.rejects(engine.generate(input, controller.signal), /cancelada/); assert.equal(Object.keys(aiSettings(vault.read()).sessions).length, 0); assert.equal(aiSettings(vault.read()).pendingDeletes[0].id, 'orphan');
});

test('provider errors expose neither the raw body nor the API key and never retry a charged request', async () => {
  let calls = 0; const { vault } = await setup(); const engine = createProviderEngine({ vault, fetcher: async () => { calls++; return Response.json({ error: 'fictional-provider-secret customer@example.invalid' }, { status: 429 }); } });
  await assert.rejects(engine.generate(input), error => !error.message.includes('fictional-provider-secret') && /Limite/.test(error.message)); assert.equal(calls, 1);
});

test('incomplete or truncated provider answers are rejected instead of saving partial results', async () => {
  for (const [provider, result] of [['openai', { status: 'incomplete' }], ['claude', { stop_reason: 'max_tokens' }], ['nvidia', { choices: [{ finish_reason: 'length', message: { content: 'Parcial' } }] }], ['gemini', { status: 'failed' }]]) {
    await assert.rejects(generateProvider(provider, { model: 'test', apiKey: 'fake' }, { instructions: 'Teste', prompt: 'Teste', history: [], remoteStore: true }, { fetcher: async () => Response.json(result) }));
  }
});

test('generation does not wait for pending remote deletion and uses a smaller task-specific output budget', async () => {
  const {engine,vault,calls}=await setup('openai');
  await engine.generate(input);
  const credentialId = aiSettings(vault.read()).sessions[key].credentialId; calls.length = 0;
  await vault.update(state=>({...state,ai:{...state.ai,pendingDeletes:[{provider:'openai',credentialId,id:'old'}]}}));
  await engine.generate({...input,task:'summary_latest',conversationKey:undefined});
  assert.equal(calls.length,1);assert.equal(calls[0].init.method,'POST');assert.equal(calls[0].body.max_output_tokens,768);
  await engine.generate(input);assert.equal(calls.at(-1).body.max_output_tokens,1536);
  await engine.generate({...input,task:'chat',instruction:'Qual é a pendência?'});assert.equal(calls.at(-1).body.max_output_tokens,2048);
});
