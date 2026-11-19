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
  <section class="management-shell" aria-label="Atalhos">
    <div class="management-subbar">
      <button
        type="button"
        class="management-back-btn"
        aria-label="Voltar para a tela anterior"
        @click="emit('back')"
      >
        <ArrowLeft :size="15" />
      </button>
      <h2>Atalhos no Editor</h2>
      <span
        class="card-badge"
        :class="{ 'card-badge-accent': Boolean(trigger) }"
      >
        {{ trigger ? `Ativo (${trigger})` : 'Desativado' }}
      </span>
    </div>

    <div class="management-scroll">
      <form class="template-card is-expanded" @submit.prevent="saveTrigger">
        <div class="management-form-group">
          <label>Gatilho para abrir respostas rápidas</label>
          <select v-model="trigger">
            <option value="\">Barra invertida (\)</option>
            <option value="/">Barra (/)</option>
            <option value="">Desativado</option>
          </select>
        </div>

        <p class="management-help" style="margin-top: 8px">
          <template v-if="trigger">
            Digite <strong>{{ trigger }}</strong> no início da linha ou após um espaço no editor do Octadesk para buscar respostas com o teclado. Para digitar <strong>{{ trigger }}</strong> como texto normal, pressione espaço logo após o gatilho, dois espaços seguidos ou <strong>Esc</strong>.
          </template>
          <template v-else>
            O menu rápido por teclado está desativado. Você ainda pode inserir respostas pelo botão <strong>Respostas</strong> do widget ou pelo painel.
          </template>
        </p>

        <div class="management-form-actions">
          <button type="submit" class="btn-primary" :disabled="busy">
            Salvar atalho
          </button>
        </div>
      </form>
    </div>

    <p v-if="status" class="management-status-inline" role="status">{{ status }}</p>
  </section>
</template>
