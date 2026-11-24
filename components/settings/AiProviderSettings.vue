<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { aiLocalMessage } from '@/services/ai/localClient';
import type { AiConfig, AiProvider } from '@/types/ai';
const emit = defineEmits<{ configured: []; selected:[provider:AiProvider] }>();
const config = ref<AiConfig | null>(null), key = ref(''), busy = ref(false), feedback = ref('');
const selected = computed(() => config.value?.providers[config.value.provider]);
const choices: { id: AiProvider; name: string }[] = [{ id: 'chatgpt', name: 'Login ChatGPT' }, { id: 'openai', name: 'OpenAI — chave de API' }, { id: 'gemini', name: 'Google Gemini — chave de API' }, { id: 'claude', name: 'Anthropic Claude — chave de API' }, { id: 'nvidia', name: 'NVIDIA Nemotron — chave de API' }, { id: 'gateway', name: 'Servidor da equipe' }];
async function refresh() { try { const result = await aiLocalMessage('AI_CONFIG'); if (!result?.providers || !Array.isArray(result.profiles) || !result.retention) throw new Error('Configuração indisponível.'); config.value = result; emit('selected',result.provider); } catch { feedback.value = 'Não foi possível ler as configurações. Confira a conexão e atualize o auxiliar para configurar a conexão e a retenção.'; } }
async function save(removeKey = false) {
  if (!config.value) return;
  busy.value = true; feedback.value = '';
  try {
    const payload = JSON.parse(JSON.stringify(config.value));
    payload.profiles = [{ id: 'default', name: '', role: '', products: '', tone: '', preferences: '', aliases: [], examples: [] }]; payload.profileId = 'default';
    if (payload.provider !== 'chatgpt') { if (key.value) payload.providers[payload.provider].apiKey = key.value.trim(); if (removeKey) payload.providers[payload.provider].removeKey = true; }
    payload.retention = (await aiLocalMessage('AI_CONFIG')).retention;
    config.value = await aiLocalMessage('AI_CONFIG_SAVE', { config: payload }); key.value = '';
    feedback.value = 'Configurações salvas. As próximas solicitações usarão estas configurações.'; emit('configured');
  } catch (error) { feedback.value = error instanceof Error ? error.message : 'Não foi possível salvar.'; }
  finally { busy.value = false; }
}
onMounted(refresh);
</script>

<template>
  <article class="ai-page ai-provider-card" aria-label="Conexão com a IA">
    <template v-if="config">
      <div class="ai-field"><label for="ai-provider">Usar</label><select id="ai-provider" v-model="config.provider" :disabled="busy" @change="key='';emit('selected',config.provider)"><option v-for="choice in choices" :key="choice.id" :value="choice.id">{{choice.name}}</option></select></div>
      <template v-if="config.provider !== 'chatgpt' && selected">
        <div v-if="config.provider==='gateway'" class="ai-field"><label for="ai-server-url">Endereço do servidor</label><input id="ai-server-url" v-model="selected.baseUrl" type="url" placeholder="https://ia.suaempresa.com.br" maxlength="500"></div>
        <div v-else class="ai-field"><label for="ai-provider-model">Modelo</label><input id="ai-provider-model" v-model="selected.model" type="text" maxlength="160"></div>
        <div class="ai-field"><label for="ai-provider-key">{{config.provider==='gateway'?'Credencial pessoal':'Chave de API'}}</label><input id="ai-provider-key" v-model="key" type="password" autocomplete="off" :placeholder="selected.hasKey?'Salva — deixe vazio para manter':'Informe a credencial'" maxlength="4096"></div>
        <p class="ai-help">Credencial protegida no auxiliar local e excluída dos backups.</p>
        <button v-if="selected.hasKey" type="button" class="ai-inline-button" :disabled="busy" @click="save(true)">Remover credencial</button>
        <label v-if="['openai','gemini'].includes(config.provider)" class="ai-check"><input v-model="selected.remoteStore" type="checkbox">Continuar usando contexto guardado no provedor</label>
        <p v-if="['openai','gemini'].includes(config.provider)" class="ai-help">O histórico anterior ainda pode consumir tokens.</p>
        <template v-if="config.provider==='nvidia'"><p class="ai-help">NVIDIA Build restringe dados pessoais e confidenciais no endpoint de prototipagem.</p><label class="ai-check"><input v-model="selected.approvedData" type="checkbox">Meu acordo permite os dados de atendimento enviados</label></template>
      </template>
      <p v-else class="ai-help">Salve esta opção para usar o login ChatGPT.</p>
      <div class="ai-actions"><button type="button" class="btn-primary" :disabled="busy" @click="save(false)">Salvar conexão</button></div>
    </template>
    <p class="ai-status" role="status">{{feedback}}</p>
  </article>
</template>
