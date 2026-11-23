<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { AI_BEHAVIOR_KEY, AI_WRITING_KEY, readAiBehavior } from '@/services/ai/writingMemory';
import { aiLocalMessage } from '@/services/ai/localClient';
import type { AiConfig, AiProvider } from '@/types/ai';
const emit = defineEmits<{ configured: [] }>();
const config = ref<AiConfig | null>(null), key = ref(''), busy = ref(false), feedback = ref('');
const behavior = ref({ automaticReplies: false, learnWriting: true });
async function resetWriting() { await browser.storage.local.remove(AI_WRITING_KEY); feedback.value = 'Padrões de escrita apagados.'; }
const selected = computed(() => config.value?.providers[config.value.provider]);
const choices: { id: AiProvider; name: string }[] = [{ id: 'chatgpt', name: 'Login ChatGPT' }, { id: 'openai', name: 'OpenAI — chave de API' }, { id: 'gemini', name: 'Google Gemini — chave de API' }, { id: 'claude', name: 'Anthropic Claude — chave de API' }, { id: 'nvidia', name: 'NVIDIA Nemotron — chave de API' }, { id: 'gateway', name: 'Servidor da equipe' }];
async function refresh() { try { const result = await aiLocalMessage('AI_CONFIG'); if (!result?.providers || !Array.isArray(result.profiles) || !result.retention) throw new Error('Configuração indisponível.'); config.value = result; behavior.value = await readAiBehavior(); } catch { feedback.value = 'Não foi possível ler as configurações. Confira a conexão e atualize o auxiliar para configurar a conexão e a retenção.'; } }
async function save(removeKey = false) {
  if (!config.value) return;
  busy.value = true; feedback.value = '';
  try {
    const payload = JSON.parse(JSON.stringify(config.value));
    payload.profiles = [{ id: 'default', name: '', role: '', products: '', tone: '', preferences: '', aliases: [], examples: [] }]; payload.profileId = 'default';
    if (payload.provider !== 'chatgpt') { if (key.value) payload.providers[payload.provider].apiKey = key.value.trim(); if (removeKey) payload.providers[payload.provider].removeKey = true; }
    config.value = await aiLocalMessage('AI_CONFIG_SAVE', { config: payload }); key.value = '';
    await browser.storage.local.set({ [AI_BEHAVIOR_KEY]: { ...behavior.value } });
    if (!behavior.value.learnWriting) await browser.storage.local.remove(AI_WRITING_KEY);
    feedback.value = 'Configurações salvas. As próximas solicitações usarão estas configurações.'; emit('configured');
  } catch (error) { feedback.value = error instanceof Error ? error.message : 'Não foi possível salvar.'; }
  finally { busy.value = false; }
}
async function cleanup() { busy.value = true; try { const result = await aiLocalMessage('AI_CLEANUP'); feedback.value = `${result.deleted || 0} conversa(s) local(is) expirada(s) removida(s). ${result.pendingDeletes || 0} exclusão(ões) remota(s) pendente(s).`; await refresh(); } catch (error) { feedback.value = error instanceof Error ? error.message : 'Não foi possível limpar.'; } finally { busy.value = false; } }
onMounted(refresh);
</script>

<template>
  <article class="ai-provider-card" aria-label="Conexão e comportamento">
    <h3>Conexão da IA</h3>
    <template v-if="config">
      <label>Conexão<select v-model="config.provider" :disabled="busy" @change="key = ''"><option v-for="choice in choices" :key="choice.id" :value="choice.id">{{ choice.name }}</option></select></label>
      <template v-if="config.provider !== 'chatgpt' && selected">
        <label v-if="config.provider === 'gateway'">Endereço do servidor HTTPS<input v-model="selected.baseUrl" type="url" placeholder="https://ia.suaempresa.com.br" maxlength="500"></label>
        <label v-else>Modelo<input v-model="selected.model" maxlength="160" placeholder="Identificador do modelo disponível na sua conta"></label>
        <label>{{ config.provider === 'gateway' ? 'Credencial pessoal do servidor' : 'Chave de API' }}<input v-model="key" type="password" autocomplete="off" :placeholder="selected.hasKey ? 'Credencial salva — deixe vazio para manter' : 'Informe a credencial'" maxlength="4096"></label>
        <p>A credencial é protegida no auxiliar local e não entra nos backups da extensão. Salvar não executa uma geração.</p>
        <p v-if="config.provider === 'gateway'">Os limites e a retenção no servidor seguem a política do administrador da equipe. As opções abaixo controlam os dados locais. Trocar o endereço do servidor exige informar sua credencial novamente.</p>
        <button v-if="selected.hasKey" type="button" class="ai-text-action" :disabled="busy" @click="save(true)">Remover credencial desta conexão</button>
        <label v-if="['openai', 'gemini'].includes(config.provider)" class="ai-check"><input v-model="selected.remoteStore" type="checkbox">Guardar contexto no provedor e continuar por identificador</label>
        <p v-if="['openai', 'gemini'].includes(config.provider)">O contexto anterior ainda pode ser cobrado. A cadeia é renovada periodicamente para limitar o crescimento. Exclusões remotas são tentadas pela política de retenção.</p>
        <p v-if="config.provider === 'claude' || config.provider === 'nvidia'">Esta conexão usa contexto compacto do ticket. Cache não equivale a uma conversa permanente no provedor.</p>
        <template v-if="config.provider === 'nvidia'"><p>O endpoint NVIDIA Build é de prototipagem e restringe dados pessoais/confidenciais. Para produção, use um serviço aprovado ou o servidor da equipe.</p><label class="ai-check"><input v-model="selected.approvedData" type="checkbox">Meu acordo com este endpoint permite os dados de atendimento que vou enviar</label></template>
      </template>
      <p v-else>O login ChatGPT exige contexto enviado a cada chamada. A conversa continua salva no OctaBlaster; um recorte do ticket ajuda a reduzir a entrada.</p>
      <div class="ai-behavior-section"><h4>Respostas no editor</h4>
        <label class="ai-check"><input v-model="behavior.automaticReplies" type="checkbox">Sugerir automaticamente ao entrar no campo de resposta</label>
        <p>A sugestão aparece para revisão quando o campo está vazio. Você também pode solicitar pelo botão junto de Marcar Licenças e Respostas. Nada é enviado ao cliente.</p>
        <label class="ai-check"><input v-model="behavior.learnWriting" type="checkbox">Adaptar o estilo com minhas respostas enviadas</label>
        <p>Após confirmar a publicação, guarda apenas médias de tamanho, parágrafos e uso de saudação/encerramento. Não aprende assinaturas, nomes ou empresas e não treina o modelo. Usado após três respostas confirmadas; apagado após 90 dias sem novas respostas.</p>
        <button type="button" class="ai-text-action" :disabled="busy" @click="resetWriting">Apagar aprendizado de escrita</button>
      </div>
      <details><summary>Retenção do histórico</summary>
        <label>Apagar após quantos dias sem uso?<input v-model.number="config.retention.idleDays" type="number" min="1" max="365"></label>
        <label>Idade máxima dos dados, em dias<input v-model.number="config.retention.maxDays" type="number" :min="config.retention.idleDays" max="365"></label>
        <p>A limpeza ocorre ao iniciar e periodicamente enquanto o aplicativo estiver ativo. Dados do provedor seguem também as regras dele. Exclusões sem confirmação permanecem pendentes.</p>
        <button type="button" class="ai-text-action" :disabled="busy" @click="cleanup">Limpar dados expirados agora</button>
        <p v-if="config.pendingDeletes">{{ config.pendingDeletes }} exclusão(ões) remota(s) aguardando confirmação.</p>
      </details>
      <button type="button" class="ai-save-config" :disabled="busy" @click="save(false)">Salvar configurações</button>
    </template>
    <p role="status">{{ feedback }}</p>
  </article>
</template>

<style scoped>
.ai-provider-card{padding:14px;border:1px solid var(--border);border-radius:8px;background:var(--bg-surface);margin-bottom:16px}.ai-provider-card h3{font-size:13px;margin:0 0 12px}.ai-provider-card label{display:block;font-size:12px;margin-top:12px}.ai-provider-card input:not([type=checkbox]),.ai-provider-card select,.ai-provider-card textarea{display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:8px 10px;border:1px solid var(--border);border-radius:7px;background:var(--bg-input);color:var(--text-primary);font:12px/1.5 system-ui}.ai-provider-card p{font-size:11px;line-height:1.6;color:var(--text-secondary);white-space:pre-wrap}.ai-provider-card .ai-check{display:flex;gap:8px;align-items:flex-start;line-height:1.5}.ai-provider-card details{margin-top:18px;font-size:12px}.ai-provider-card summary{cursor:pointer;font-weight:600}.ai-save-config{width:100%;padding:10px;margin-top:18px;border:0;border-radius:8px;background:var(--accent);color:var(--accent-text);font:600 12px system-ui;cursor:pointer}.ai-text-action{border:0;background:transparent;color:var(--text-secondary);text-decoration:underline;font:12px system-ui;cursor:pointer}.ai-provider-card button:disabled{opacity:.5}
.ai-behavior-section{margin-top:18px;padding-top:14px;border-top:1px solid var(--border)}.ai-behavior-section h4{margin:0;font-size:12px;font-weight:600}.ai-provider-card input:focus,.ai-provider-card select:focus{outline:2px solid var(--accent-ring);border-color:var(--accent-border)}.ai-provider-card input[type=checkbox]{accent-color:var(--accent);margin:2px 0 0}.ai-provider-card details{padding-top:14px;border-top:1px solid var(--border)}
</style>
