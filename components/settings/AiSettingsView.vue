<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ArrowLeft, ExternalLink, Link2, Unlink } from 'lucide-vue-next';
import { aiLocalMessage, DEFAULT_AI_HELPER_URL, validateHelperUrl } from '@/services/ai/localClient';
import type { AiPublicConnection } from '@/types/ai';
import './management.css';

const emit = defineEmits<{ back: [] }>();
const url = ref(DEFAULT_AI_HELPER_URL), code = ref(''), message = ref(''), busy = ref(false);
const state = ref<AiPublicConnection>({ paired: false, url: DEFAULT_AI_HELPER_URL });
async function refresh() {
  try { state.value = await aiLocalMessage('AI_STATUS'); message.value = !state.value.paired ? 'Pareie o auxiliar para habilitar a geração.' : !state.value.connected ? 'Entre com ChatGPT no auxiliar local.' : !state.value.planAuthorized ? 'A conta não autorizou o uso da franquia.' : state.value.enabled ? 'Auxiliar conectado e geração autorizada.' : 'Conexão pareada. Autorize a geração no auxiliar local.'; }
  catch (error) { message.value = error instanceof Error ? error.message : 'Auxiliar indisponível.'; }
}
onMounted(async () => {
  try { state.value = await aiLocalMessage('AI_CONFIG'); url.value = state.value.url; if (state.value.paired) await refresh(); }
  catch (error) { message.value = error instanceof Error ? error.message : 'Falha ao carregar a conexão.'; }
});
async function pair() {
  if (busy.value) return;
  busy.value = true;
  try { state.value = await aiLocalMessage('AI_PAIR', { url: validateHelperUrl(url.value), code: code.value.trim() }); code.value = ''; await refresh(); }
  catch (error) { message.value = error instanceof Error ? error.message : 'Não foi possível parear.'; }
  finally { busy.value = false; }
}
async function unpair() {
  if (busy.value) return;
  busy.value = true;
  try { await aiLocalMessage('AI_UNPAIR'); state.value = { paired: false, url: url.value }; message.value = 'Pareamento removido desta extensão.'; }
  catch (error) { message.value = error instanceof Error ? error.message : 'Não foi possível remover.'; }
  finally { busy.value = false; }
}
async function openHelper() {
  try { await browser.tabs.create({ url: validateHelperUrl(url.value) }); }
  catch (error) { message.value = error instanceof Error ? error.message : 'Endereço local inválido.'; }
}
</script>

<template>
  <section class="management-shell" aria-label="Inteligência artificial">
    <div class="management-subbar"><button type="button" class="management-back-btn" aria-label="Voltar para a tela anterior" @click="emit('back')"><ArrowLeft :size="15" /></button><h2>Inteligência artificial</h2></div>
    <div class="management-scroll">
      <form class="template-card is-expanded" @submit.prevent="pair">
        <p class="management-help">Inicie o auxiliar no computador. Entre com ChatGPT, confira sua conta, escolha o modelo e autorize a geração pela extensão. Depois gere o código de pareamento.</p>
        <div class="management-form-group"><label for="ai-helper-url">Endereço do auxiliar local</label><input id="ai-helper-url" v-model="url" type="url" required :disabled="busy" /></div>
        <button type="button" class="btn-secondary" @click="openHelper"><ExternalLink :size="14" /> Abrir auxiliar</button>
        <div class="management-form-group"><label for="ai-pair-code">Código de seis dígitos</label><input id="ai-pair-code" v-model="code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" :disabled="busy" :required="!state.paired" autocomplete="off" /></div>
        <button type="submit" class="btn-primary" :disabled="busy || code.length !== 6"><Link2 :size="14" /> Parear extensão</button>
      </form>
      <article class="template-card is-expanded" style="margin-top:12px">
        <p><strong>Estado:</strong> {{ state.paired ? 'Pareado' : 'Não pareado' }}</p>
        <p v-if="state.account"><strong>Conta:</strong> {{ state.account }}</p>
        <p class="management-help">No ticket, clique em <strong>Gerar resposta com IA</strong>. Revise o contexto, escreva sua orientação e escolha exemplos de estilo. A resposta será exibida para revisão antes da inserção. O envio continua manual.</p>
        <p class="management-help">Os tokens do ChatGPT ficam protegidos no Windows, no auxiliar. O pareamento é local e não entra nos backups da extensão. O limite e o uso de créditos são controlados nas configurações do ChatGPT.</p>
        <button type="button" class="btn-secondary" :disabled="busy || !state.paired" @click="refresh">Verificar conexão</button>
        <button type="button" class="btn-secondary" :disabled="busy || !state.paired" @click="unpair"><Unlink :size="14" /> Remover pareamento</button>
      </article>
      <p class="management-help" role="status">{{ message }}</p>
    </div>
  </section>
</template>
