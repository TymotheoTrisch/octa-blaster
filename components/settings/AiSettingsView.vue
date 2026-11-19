<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { ArrowLeft, LogIn, LogOut, RefreshCw, Cpu } from 'lucide-vue-next';
import { aiLocalMessage } from '@/services/ai/localClient';
import type { AiPublicConnection } from '@/types/ai';
import './management.css';
const emit = defineEmits<{ back: [] }>();
const state = ref<AiPublicConnection | null>(null), busy = ref(false), message = ref('');
const models = ref<{ slug: string; name: string }[]>([]), model = ref('');
const accounts = ref<{ clientId: string; label: string; active: boolean }[]>([]);
let timer: ReturnType<typeof setInterval> | undefined;
async function refresh() {
  try {
    state.value = await aiLocalMessage('AI_STATUS'); model.value = state.value?.model || '';
    accounts.value = (await aiLocalMessage('AI_ACCOUNTS')).accounts || [];
    message.value = !state.value?.connected ? 'Entre uma vez com sua conta ChatGPT para habilitar os resumos.' : !state.value.planAuthorized ? 'A conta não autorizou o uso do plano. Reconecte para conferir as permissões.' : !state.value.enabled ? 'Conta conectada. Clique em Reconectar conta para ativar os resumos.' : 'Login salvo neste computador. A renovação é automática enquanto a autorização permitir.';
    if (state.value?.connected && state.value.enabled) { clearInterval(timer); models.value = (await aiLocalMessage('AI_MODELS')).models; }
  } catch (error) { state.value = null; message.value = error instanceof Error ? error.message : 'Auxiliar indisponível.'; }
}
async function connect(newAccount = false, clientId?: string) {
  busy.value = true;
  try {
    const result = clientId ? await aiLocalMessage('AI_SELECT_ACCOUNT', { clientId }) : await aiLocalMessage('AI_CONNECT', { newAccount });
    if (result.connecting) { message.value = 'Conclua o login na aba oficial. Esta tela reconhecerá a conexão automaticamente.'; clearInterval(timer); timer = setInterval(() => void refresh(), 4000); }
    else await refresh();
  } catch (error) { message.value = error instanceof Error ? error.message : 'Não foi possível entrar.'; }
  finally { busy.value = false; }
}
async function disconnect() {
  busy.value = true;
  try { const result = await aiLocalMessage('AI_DISCONNECT'); models.value = []; await refresh(); if (!result.revocationConfirmed) message.value = 'Sessão local encerrada. A revogação remota não foi confirmada; desconecte também o aplicativo nas configurações do ChatGPT.'; }
  catch (error) { message.value = error instanceof Error ? error.message : 'Não foi possível sair.'; }
  finally { busy.value = false; }
}
async function saveModel() {
  busy.value = true;
  try { await aiLocalMessage('AI_PREFERENCES', { model: model.value }); message.value = 'Modelo salvo.'; }
  catch (error) { message.value = error instanceof Error ? error.message : 'Não foi possível salvar o modelo.'; }
  finally { busy.value = false; }
}
onMounted(() => void refresh()); onUnmounted(() => clearInterval(timer));
</script>
<template>
  <section class="management-shell" aria-label="Inteligência artificial">
    <div class="management-subbar"><button type="button" class="management-back-btn" aria-label="Voltar para a tela anterior" @click="emit('back')"><ArrowLeft :size="15" /></button><h2>Inteligência artificial</h2></div>
    <div class="management-scroll ai-connection">
      <article class="ai-connection-card">
        <Cpu :size="24" /><h3>Resumos no Octadesk</h3>
        <p>Uma instalação, um login. O Firefox inicia o auxiliar quando você usa os resumos.</p>
        <p v-if="state?.account" class="ai-account"><strong>Conta conectada</strong><br>{{ state.account }}</p>
        <label v-if="accounts.length > 1" class="ai-model-label">Contas salvas<select :disabled="busy" :value="accounts.find(account => account.active)?.clientId" @change="connect(false, ($event.target as HTMLSelectElement).value)"><option v-for="account in accounts" :key="account.clientId" :value="account.clientId">{{ account.label }}</option></select></label>
        <button type="button" class="ai-connect" :disabled="busy" @click="connect()"><LogIn :size="16" />{{ state?.connected ? 'Reconectar conta' : 'Entrar com ChatGPT' }}</button>
        <div v-if="state?.connected" class="ai-connection-actions"><button type="button" :disabled="busy" @click="connect(true)">Usar outra conta</button><button type="button" :disabled="busy" @click="disconnect"><LogOut :size="14" /> Sair</button></div>
        <label v-if="models.length" class="ai-model-label">Modelo<select v-model="model" :disabled="busy" @change="saveModel"><option v-for="item in models" :key="item.slug" :value="item.slug">{{ item.name }}</option></select></label>
      </article>
      <p class="ai-connection-status" role="status">{{ message }}</p>
      <button type="button" class="ai-refresh" :disabled="busy" @click="refresh"><RefreshCw :size="14" /> Verificar conexão</button>
      <details class="ai-setup"><summary>Primeiro uso neste computador</summary><p>Execute <strong>Instalar-IA-Firefox.cmd</strong> uma vez. Depois volte aqui e entre com ChatGPT. Não é necessário abrir o site local, testar uma mensagem ou copiar códigos.</p><p>Os tokens são protegidos pelo Windows. A validade é definida pelo provedor e renovada automaticamente; não é uma chave com duração configurável. Sair do site ChatGPT não revoga automaticamente esta autorização.</p><p>Confira os limites e créditos nas configurações do ChatGPT. Os resumos usam o contexto carregado; nenhuma resposta é enviada ao cliente.</p></details>
    </div>
  </section>
</template>
<style scoped>
.ai-connection{padding:16px!important}.ai-connection-card{padding:20px;border:1px solid var(--border);border-radius:12px;background:var(--bg-surface)}.ai-connection-card h3{margin:10px 0 6px;font-size:17px}.ai-connection p{font-size:13px;line-height:1.6;color:var(--text-secondary)}.ai-connect{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:11px;border:0;border-radius:8px;background:var(--accent);color:var(--accent-text);font:600 13px system-ui;cursor:pointer}.ai-connection-actions{display:flex;justify-content:space-between;gap:8px;margin-top:12px}.ai-connection-actions button,.ai-refresh{display:inline-flex;align-items:center;gap:5px;background:transparent;border:0;color:var(--text-secondary);font:12px system-ui;cursor:pointer}.ai-model-label{display:block;margin-top:20px;font-size:12px}.ai-model-label select{display:block;box-sizing:border-box;width:100%;padding:9px;margin-top:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg-input);color:var(--text-primary)}.ai-account{padding:10px;border-radius:6px;background:var(--bg-secondary)}.ai-setup{margin-top:24px;font-size:12px;color:var(--text-secondary)}.ai-connection-status{white-space:pre-wrap}.ai-connection button:disabled{opacity:.5}
</style>
