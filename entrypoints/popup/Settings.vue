<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  loadReplySettings,
  saveReplySettings,
  type ReplySettings,
} from '@/utils/templateVariables';
const settings = ref<ReplySettings>({ variables: [], trigger: '\\' });
const status = ref('');
onMounted(async () => {
  try {
    settings.value = await loadReplySettings();
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao carregar configurações.';
  }
});
async function save() {
  try {
    await saveReplySettings(settings.value);
    status.value = 'Configurações salvas.';
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao salvar.';
  }
}
</script>
<template>
  <details class="reply-settings">
    <summary>Variáveis e atalhos</summary>
    <form @submit.prevent="save">
      <label
        >Atalho no editor
        <select v-model="settings.trigger">
          <option value="\">Barra invertida (\)</option>
          <option value="/">Barra (/)</option>
          <option value="">Desativado</option>
        </select>
      </label>
      <p>
        Use <span v-pre>{{ Nome }}</span> nas respostas. Saudacao, Data e Hora
        são automáticas.
      </p>
      <fieldset v-for="(variable, index) in settings.variables" :key="index">
        <label
          >Nome<input v-model="variable.name" required placeholder="Assinatura"
        /></label>
        <label
          >Preenchimento<select v-model="variable.mode">
            <option value="saved">Valor salvo</option>
            <option value="prompt">Preencher ao usar</option>
          </select></label
        >
        <label v-if="variable.mode === 'saved'"
          >Valor<input v-model="variable.value" required
        /></label>
        <button type="button" @click="settings.variables.splice(index, 1)">
          Remover variável
        </button>
      </fieldset>
      <div class="settings-actions">
        <button
          type="button"
          @click="
            settings.variables.push({ name: '', value: '', mode: 'saved' })
          "
        >
          Adicionar variável</button
        ><button type="submit">Salvar configurações</button>
      </div>
      <p role="status">{{ status }}</p>
    </form>
  </details>
</template>
<style scoped>
.reply-settings {
  flex-shrink: 0;
  max-height: min(45vh, 260px);
  overflow-y: auto;
  margin: 12px 16px;
  border: 1px solid #626262;
  border-radius: 8px;
  padding: 10px;
}
summary {
  cursor: pointer;
  font-weight: 600;
}
label {
  display: block;
  margin: 10px 0;
}
input,
select {
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: 7px;
  margin-top: 5px;
  border-radius: 4px;
  border: 1px solid #888;
}
fieldset {
  margin: 12px 0;
  border: 1px solid #777;
  border-radius: 5px;
  padding: 10px;
}
button {
  border: 1px solid #777;
  border-radius: 5px;
  padding: 7px;
  cursor: pointer;
}
.settings-actions {
  display: flex;
  gap: 8px;
}
p {
  font-size: 12px;
  margin-top: 8px;
}
</style>
