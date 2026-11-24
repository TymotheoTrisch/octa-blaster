<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { ArrowLeft, LogIn, LogOut, RefreshCw, Cpu, ChevronRight, WandSparkles, History, SlidersHorizontal, MessagesSquare } from 'lucide-vue-next';
import { aiLocalMessage } from '@/services/ai/localClient';
import type { AiPublicConnection } from '@/types/ai';
import './management.css';
import './ai-settings.css';
import AiPromptSettings from './AiPromptSettings.vue';
import AiHistorySettings from './AiHistorySettings.vue';
import AiWritingSettings from './AiWritingSettings.vue';
import AiProviderSettings from './AiProviderSettings.vue';
const emit = defineEmits<{ back: []; chats: [] }>();
type Section='home'|'connection'|'writing'|'prompts'|'history';
const section=ref<Section>('home'),selectedProvider=ref('');
const sections=[{id:'connection' as const,title:'Conta e conexões',description:'ChatGPT, modelos e chaves de API',icon:Cpu},{id:'writing' as const,title:'Aprendizado e escrita',description:'Seu estilo, início e encerramento',icon:WandSparkles},{id:'prompts' as const,title:'Prompts e instruções',description:'Resumos e sugestões do seu jeito',icon:SlidersHorizontal},{id:'history' as const,title:'Histórico e retenção',description:'Prazo de armazenamento e limpeza',icon:History}];
function back(){if(section.value==='home')emit('back');else section.value='home';}
const state = ref<AiPublicConnection | null>(null), busy = ref(false), message = ref('');
const models = ref<{ slug: string; name: string }[]>([]), model = ref('');
const accounts = ref<{ clientId: string; label: string; active: boolean }[]>([]);
let timer: ReturnType<typeof setInterval> | undefined;
async function refresh() {
  try {
    state.value = await aiLocalMessage('AI_STATUS'); model.value = state.value?.model || '';
    if (state.value?.provider && state.value.provider !== 'chatgpt') { clearInterval(timer); accounts.value = []; models.value = []; message.value = state.value.connected ? `Credencial ${state.value.provider} salva. ${state.value.contextMode === 'gateway' ? 'Contexto gerenciado pelo servidor da equipe.' : state.value.contextMode === 'remote' ? 'Contexto remoto habilitado; o histórico anterior ainda pode consumir tokens.' : 'Contexto compacto por ticket.'}` : 'Configure a credencial da conexão selecionada.'; return; }
    accounts.value = (await aiLocalMessage('AI_ACCOUNTS')).accounts || [];
    message.value = !state.value?.connected ? 'Entre com sua conta ChatGPT.' : !state.value.planAuthorized ? 'A conta não autorizou o uso do plano. Reconecte para conferir as permissões.' : !state.value.enabled ? 'Reconecte a conta para ativar a IA.' : 'Conta conectada.';
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
watch(section,value=>{clearInterval(timer);if(value==='connection')void refresh();}); onUnmounted(() => clearInterval(timer));
</script>
<template>
 <section class="management-shell ai-settings" aria-label="Inteligência artificial">
  <div class="management-subbar"><button type="button" class="management-back-btn" aria-label="Voltar para a tela anterior" @click="back"><ArrowLeft :size="15"/></button><h2>{{section==='home'?'Inteligência artificial':sections.find(item=>item.id===section)?.title}}</h2></div>
  <div class="management-scroll">
   <div v-if="section==='home'" class="ai-settings-menu">
    <button type="button" class="ai-settings-entry" @click="emit('chats')"><span class="ai-settings-icon"><MessagesSquare :size="18"/></span><span class="ai-settings-label"><strong>Conversas com a IA</strong><span>Novo chat e histórico de conversas e tickets</span></span><ChevronRight :size="15" class="ai-settings-chevron"/></button>
    <button v-for="item in sections" :key="item.id" type="button" class="ai-settings-entry" @click="section=item.id"><span class="ai-settings-icon"><component :is="item.icon" :size="18"/></span><span class="ai-settings-label"><strong>{{item.title}}</strong><span>{{item.description}}</span></span><ChevronRight :size="15" class="ai-settings-chevron"/></button>
   </div>
   <template v-else-if="section==='connection'">
    <AiProviderSettings @configured="refresh" @selected="selectedProvider=$event"/>
    <div v-if="selectedProvider==='chatgpt'" class="ai-page ai-account-settings">
     <section class="ai-section">
      <h3>Conta ChatGPT</h3>
      <p v-if="state?.account" class="ai-notice">{{state.account}}</p>
      <p v-if="state?.provider!=='chatgpt'" class="ai-help">Salve a conexão ChatGPT acima para entrar.</p>
      <div v-if="accounts.length>1" class="ai-field"><label for="ai-saved-account">Conta</label><select id="ai-saved-account" :disabled="busy" :value="accounts.find(account=>account.active)?.clientId" @change="connect(false,($event.target as HTMLSelectElement).value)"><option v-for="account in accounts" :key="account.clientId" :value="account.clientId">{{account.label}}</option></select></div>
      <div class="ai-actions start"><button type="button" class="btn-primary" :disabled="busy||state?.provider!=='chatgpt'" @click="connect()"><LogIn :size="14"/>{{state?.connected?'Reconectar':'Entrar com ChatGPT'}}</button><button v-if="state?.connected" type="button" class="btn-secondary" :disabled="busy" @click="connect(true)">Trocar conta</button><button v-if="state?.connected" type="button" class="btn-secondary" :disabled="busy" @click="disconnect"><LogOut :size="13"/>Sair</button></div>
      <div v-if="models.length" class="ai-field"><label for="ai-chatgpt-model">Modelo</label><select id="ai-chatgpt-model" v-model="model" :disabled="busy" @change="saveModel"><option v-for="item in models" :key="item.slug" :value="item.slug">{{item.name}}</option></select></div>
     </section>
    </div>
    <div class="ai-page ai-connection-feedback"><p class="ai-status" role="status">{{selectedProvider && state?.provider && selectedProvider!==state.provider?'Salve a conexão selecionada para aplicar.':message}}</p><button type="button" class="ai-inline-button" :disabled="busy" @click="refresh"><RefreshCw :size="13"/>Verificar conexão</button></div>
   </template>
   <AiWritingSettings v-else-if="section==='writing'"/>
   <AiPromptSettings v-else-if="section==='prompts'"/>
   <AiHistorySettings v-else-if="section==='history'"/>
  </div>
 </section>
</template>
<style scoped>
.ai-settings-menu{padding:10px 14px;display:flex;flex-direction:column;gap:8px}.ai-settings-entry{display:flex;align-items:center;gap:12px;width:100%;padding:14px 12px;border:1px solid var(--border);border-radius:7px;background:var(--bg-surface);color:var(--text-primary);cursor:pointer;text-align:left;transition:background .15s,border-color .15s}.ai-settings-entry:hover{background:var(--bg-hover);border-color:var(--border-hover)}.ai-settings-entry:focus-visible{outline:2px solid var(--accent-ring);border-color:var(--accent)}.ai-settings-icon{display:flex;align-items:center;justify-content:center;width:32px;height:32px;flex-shrink:0;border-radius:7px;background:var(--accent-soft);color:var(--accent-soft-text)}.ai-settings-label{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}.ai-settings-label strong{font-size:12px;font-weight:600}.ai-settings-label>span{font-size:11px;line-height:1.4;color:var(--text-secondary)}.ai-settings-chevron{color:var(--text-muted);flex-shrink:0}.ai-connection-feedback{padding-top:0}.ai-account-settings{padding-top:0}
</style>
