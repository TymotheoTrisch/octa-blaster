<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ArrowLeft } from 'lucide-vue-next';
import { loadShortcutTrigger, saveShortcutTrigger } from '@/services/templates/templateVariables';
import './management.css';

const emit = defineEmits<{ back: []; changed: [] }>();

const trigger = ref<'\\' | '/' | ''>('\\');
let triggerBase: '\\' | '/' | '' = '\\';
const status = ref('');
const busy = ref(false);

onMounted(async () => {
  try {
    trigger.value = await loadShortcutTrigger();
    triggerBase = trigger.value;
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao carregar atalho.';
  }
});

async function saveTrigger() {
  if (busy.value) return;
  busy.value = true;
  try {
    await saveShortcutTrigger(trigger.value, triggerBase);
    trigger.value = await loadShortcutTrigger();
    triggerBase = trigger.value;
    status.value = 'Atalho salvo.';
    emit('changed');
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao salvar atalho.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="management-page" aria-label="Atalhos">
    <div class="management-heading">
      <button
        type="button"
        class="management-icon"
        aria-label="Voltar para a tela anterior"
        @click="emit('back')"
      >
        <ArrowLeft :size="16" />
      </button>
      <h2>Atalhos no Editor</h2>
    </div>

    <form class="management-form management-card" @submit.prevent="saveTrigger">
      <label>
        Gatilho para abrir respostas rápidas
        <select v-model="trigger">
          <option value="\">Barra invertida (\)</option>
          <option value="/">Barra (/)</option>
          <option value="">Desativado</option>
        </select>
      </label>

      <p class="management-help">
        <template v-if="trigger">
          Digite <strong>{{ trigger }}</strong> no início da linha ou após um espaço no editor do Octadesk para buscar e inserir respostas com o teclado.
        </template>
        <template v-else>
          O menu rápido por teclado está desativado. Você ainda pode inserir respostas pelo botão <strong>Respostas</strong> do widget ou pelo painel.
        </template>
      </p>

      <div class="management-actions">
        <button type="submit" class="management-primary" :disabled="busy">
          Salvar atalho
        </button>
      </div>
    </form>

    <p v-if="status" class="management-status" role="status">{{ status }}</p>
  </section>
</template>
