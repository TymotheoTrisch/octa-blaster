<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-vue-next';
import {
  loadShortcutTrigger,
  saveShortcutTrigger,
} from '@/utils/templateVariables';
import { loadMentionTargets, saveMentionTargets } from '@/utils/mentionHelper';
import type { MentionTarget } from '@/types/template';
import './management.css';
const emit = defineEmits<{ back: []; changed: [] }>();
const trigger = ref<'\\' | '/' | ''>('\\');
const targets = ref<MentionTarget[]>([]);
const showForm = ref(false);
const editingId = ref<string | null>(null);
const name = ref('');
const query = ref('');
const enabled = ref(true);
const status = ref('');
const busy = ref(false);
onMounted(async () => {
  try {
    trigger.value = await loadShortcutTrigger();
    targets.value = await loadMentionTargets();
  } catch (error) {
    status.value =
      error instanceof Error ? error.message : 'Falha ao carregar atalhos.';
  }
});
function goBack() {
  if (showForm.value) {
    showForm.value = false;
    status.value = '';
    return;
  }
  emit('back');
}
function startEdit(target?: MentionTarget) {
  editingId.value = target?.id || null;
  name.value = target?.name || '';
  query.value = target?.query || '';
  enabled.value = target?.enabled ?? true;
  status.value = '';
  showForm.value = true;
}
async function saveTrigger() {
  try {
    await saveShortcutTrigger(trigger.value);
    status.value = 'Atalho salvo.';
    emit('changed');
  } catch (error) {
    status.value =
      error instanceof Error ? error.message : 'Falha ao salvar atalho.';
  }
}
async function saveTarget() {
  if (busy.value) return;
  busy.value = true;
  try {
    const original = targets.value.find(
      (target) => target.id === editingId.value,
    );
    const pattern =
      original && original.name.trim() === name.value.trim()
        ? original.pattern
        : '';
    const updated = {
      id: editingId.value || crypto.randomUUID(),
      name: name.value,
      query: query.value,
      enabled: enabled.value,
      pattern,
    };
    const next = editingId.value
      ? targets.value.map((target) =>
          target.id === editingId.value ? updated : target,
        )
      : [...targets.value, updated];
    await saveMentionTargets(next);
    targets.value = await loadMentionTargets();
    showForm.value = false;
    status.value = 'Técnico salvo.';
    emit('changed');
  } catch (error) {
    status.value =
      error instanceof Error ? error.message : 'Falha ao salvar técnico.';
  } finally {
    busy.value = false;
  }
}
async function removeTarget(target: MentionTarget) {
  if (busy.value) return;
  busy.value = true;
  try {
    await saveMentionTargets(
      targets.value.filter((item) => item.id !== target.id),
    );
    targets.value = await loadMentionTargets();
    status.value = 'Técnico removido.';
    emit('changed');
  } catch (error) {
    status.value =
      error instanceof Error ? error.message : 'Falha ao remover técnico.';
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
        :aria-label="showForm ? 'Voltar para a lista de técnicos' : 'Voltar para a tela anterior'"
        @click="goBack"
      >
        <ArrowLeft :size="16" />
      </button>
      <h2>
        {{
          showForm ? (editingId ? 'Editar técnico' : 'Novo técnico') : 'Atalhos'
        }}
      </h2>
      <button
        v-if="!showForm"
        type="button"
        class="management-primary"
        aria-label="Novo técnico"
        @click="startEdit()"
      >
        <Plus :size="14" />
      </button>
    </div>
    <form v-if="showForm" class="management-form" @submit.prevent="saveTarget">
      <label
        >Nome do técnico<input
          v-model="name"
          type="text"
          required
          placeholder="Nome completo na lista de menções"
      /></label>
      <label
        >Texto para buscar a menção<input
          v-model="query"
          type="text"
          required
          placeholder="@nome"
      /></label>
      <label class="management-checkbox"
        ><input v-model="enabled" type="checkbox" />Marcar nas licenças</label
      >
      <div class="management-actions">
        <button
          type="button"
          class="management-secondary"
          @click="showForm = false"
        >
          Cancelar</button
        ><button type="submit" class="management-primary" :disabled="busy">
          Salvar técnico
        </button>
      </div>
    </form>
    <template v-else>
      <form
        class="management-form management-card"
        @submit.prevent="saveTrigger"
      >
        <label
          >Abrir respostas no editor<select v-model="trigger">
            <option value="\">Barra invertida (\)</option>
            <option value="/">Barra (/)</option>
            <option value="">Desativado</option>
          </select></label
        >
        <div class="management-actions">
          <button type="submit" class="management-primary">
            Salvar atalho
          </button>
        </div>
      </form>
      <h3 class="management-section-title">Técnicos das licenças</h3>
      <article
        v-for="target in targets"
        :key="target.id"
        class="management-card"
      >
        <div class="management-card-header">
          <h3>{{ target.name }}</h3>
          <button
            type="button"
            class="management-icon"
            :aria-label="'Editar ' + target.name"
            @click="startEdit(target)"
          >
            <Pencil :size="14" /></button
          ><button
            type="button"
            class="management-icon"
            :aria-label="'Excluir ' + target.name"
            :disabled="busy"
            @click="removeTarget(target)"
          >
            <Trash2 :size="14" />
          </button>
        </div>
        <p>
          {{ target.query }}
          <span class="management-badge">{{
            target.enabled ? 'Ativo' : 'Desativado'
          }}</span>
        </p>
      </article>
      <p v-if="!targets.length" class="management-empty">
        Cadastre os técnicos que serão mencionados ao marcar licenças.
      </p>
    </template>
    <p v-if="status" class="management-status" role="status">{{ status }}</p>
  </section>
</template>
<style scoped>
.management-section-title {
  font-size: 12px;
  font-weight: 600;
  margin: 14px 0 8px;
  color: var(--text-secondary);
}
</style>
