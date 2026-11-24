<script setup lang="ts">
import {onMounted,ref} from 'vue';
import {aiLocalMessage} from '@/services/ai/localClient';
import {defaultWritingPreferences,type WritingProfileView} from '@/services/ai/writingMemory';
const state=ref<WritingProfileView|null>(null),preferences=ref(defaultWritingPreferences()),learn=ref(true),busy=ref(false),message=ref('');
const labels={opening:'Início da resposta',closing:'Encerramento da resposta'};
async function refresh(){busy.value=true;message.value='';try{state.value=await aiLocalMessage('AI_WRITING_STATE');preferences.value=JSON.parse(JSON.stringify(state.value!.preferences));learn.value=state.value!.enabled;}catch(error){state.value=null;message.value=error instanceof Error?error.message:'Não foi possível ler o aprendizado.';}finally{busy.value=false;}}
async function save(){if(!state.value)return;busy.value=true;message.value='';try{state.value=await aiLocalMessage('AI_WRITING_SAVE',{identity:state.value.identity,preferences:JSON.parse(JSON.stringify(preferences.value)),learnWriting:learn.value});preferences.value=JSON.parse(JSON.stringify(state.value!.preferences));message.value='Preferências salvas para este atendente. Serão usadas na próxima resposta gerada.';}catch(error){message.value=error instanceof Error?error.message:'Não foi possível salvar.';}finally{busy.value=false;}}
async function clear(){if(!state.value)return;busy.value=true;try{state.value=await aiLocalMessage('AI_WRITING_CLEAR',{identity:state.value.identity});message.value='Aprendizado deste atendente apagado. Os textos personalizados foram mantidos.';}catch(error){message.value=error instanceof Error?error.message:'Não foi possível apagar.';}finally{busy.value=false;}}
onMounted(refresh);
</script>
<template>
 <article class="writing-card" aria-label="Meu aprendizado e escrita">
  <h3>Meu aprendizado e escrita</h3>
  <p>Digite sua orientação no editor do e-mail e clique no ícone de IA. A resposta é gerada naquele campo, sem abrir o chat.</p>
  <button type="button" class="writing-link" :disabled="busy" @click="refresh">Atualizar dados do atendente</button>
  <template v-if="state">
   <p><strong>Atendente identificado: {{state.label}}</strong><br>Dados do atendente identificado neste ambiente do Octadesk.</p>
   <h4>O que foi aprendido</h4>
   <dl v-if="state.pattern" class="writing-facts">
    <dt>Publicações observadas</dt><dd>{{state.pattern.count===20?'20 ou mais':state.pattern.count}}</dd>
    <dt>Tamanho médio</dt><dd>{{state.pattern.words}} palavras</dd>
    <dt>Parágrafos</dt><dd>{{state.pattern.paragraphs}} em média</dd>
    <dt>Saudação reconhecida</dt><dd>{{state.pattern.greeting}}% na média observada</dd>
    <dt>Encerramento reconhecido</dt><dd>{{state.pattern.closing}}% na média observada</dd>
    <dt>Último aprendizado</dt><dd>{{new Date(state.pattern.updated).toLocaleString('pt-BR')}}</dd>
   </dl>
   <p v-else>Ainda não há padrões salvos para este atendente.</p>
   <p v-if="state.pattern && state.pattern.count<3">O estilo aprendido começa a ser usado após três publicações confirmadas.</p>
   <p v-if="!state.enabled">O aprendizado está pausado. Os padrões salvos não são aplicados; seus textos personalizados continuam válidos.</p>
   <p>A extensão observa uma nova publicação igual ao rascunho enviado pelo editor. Gerar, editar ou salvar rascunho não conta. E-mails antigos ou enviados fora do Octadesk não são aprendidos.</p>
   <p>Esta memória guarda médias aproximadas de tamanho, parágrafos e frequência de saudações e fechos comuns, dando mais peso às publicações recentes. Não arquiva textos dos e-mails, nomes de clientes ou empresas, nem treina o modelo. O ticket atual e o histórico do chat são usados separadamente.</p>
   <label class="writing-check"><input v-model="learn" type="checkbox" :disabled="busy">Aprender com as respostas enviadas neste navegador</label>
   <p>Essa opção pausa o aprendizado e o uso das estatísticas, sem apagá-las. Os padrões expiram após 90 dias sem novas publicações.</p>
   <button type="button" class="writing-link" :disabled="busy||!state.pattern" @click="clear">Apagar aprendizado deste atendente</button>
   <h4>Como começar e terminar</h4>
   <div v-for="field in (['opening','closing'] as const)" :key="field">
    <label>{{labels[field]}}<select :aria-label="labels[field]" v-model="preferences[field].mode" :disabled="busy"><option value="auto">Automático</option><option value="custom">Texto personalizado</option><option value="none">{{field==='opening'?'Sem saudação':'Sem despedida'}}</option></select></label>
    <label v-if="preferences[field].mode==='custom'">Texto de {{field==='opening'?'início':'encerramento'}}<textarea :aria-label="field==='opening'?'Texto de início':'Texto de encerramento'" v-model="preferences[field].text" :maxlength="field==='opening'?160:240" rows="3" :disabled="busy"></textarea><span class="writing-limit">Até {{field==='opening'?160:240}} caracteres e quatro linhas.</span></label>
   </div>
   <p>No modo automático, a IA considera os padrões disponíveis. Seus textos personalizados têm prioridade e são aplicados localmente ao resultado, sem uma consulta extra à IA. A assinatura configurada no Octadesk permanece separada.</p>
   <button type="button" class="writing-save" :disabled="busy" @click="save">Salvar preferências de escrita</button>
  </template>
  <p role="status">{{message}}</p>
  <p v-if="!state">Abra um ticket, clique no campo de resposta e volte aqui para consultar ou configurar seu estilo. Nenhuma consulta à IA é feita nesta tela.</p>
 </article>
</template>
<style scoped>
.writing-card{padding:14px;margin-bottom:16px;border:1px solid var(--border);border-radius:8px;background:var(--bg-surface);color:var(--text-primary)}h3{font-size:13px;margin:0 0 12px}h4{font-size:12px;margin:18px 0 10px}p{font-size:11px;line-height:1.6;color:var(--text-secondary);white-space:pre-wrap}label{display:block;font-size:12px;margin-top:12px}select,textarea{display:block;box-sizing:border-box;width:100%;margin-top:6px;padding:8px 10px;border:1px solid var(--border);border-radius:7px;background:var(--bg-input);color:var(--text-primary);font:12px/1.5 system-ui}select:focus,textarea:focus{outline:2px solid var(--accent-ring);border-color:var(--accent-border)}.writing-limit{display:block;margin-top:5px;color:var(--text-secondary);font-size:11px}.writing-check{display:flex;align-items:flex-start;gap:8px;line-height:1.5}.writing-check input{accent-color:var(--accent);margin:2px 0 0}.writing-facts{display:grid;grid-template-columns:1fr 1fr;gap:7px 12px;font-size:11px;line-height:1.5}.writing-facts dt{color:var(--text-secondary)}.writing-facts dd{margin:0;overflow-wrap:anywhere}.writing-link{border:0;background:transparent;color:var(--text-secondary);text-decoration:underline;font:12px system-ui;cursor:pointer}.writing-save{width:100%;margin-top:16px;padding:10px;border:0;border-radius:8px;background:var(--accent);color:var(--accent-text);font:600 12px system-ui;cursor:pointer}button:disabled{opacity:.5;cursor:default}
</style>
