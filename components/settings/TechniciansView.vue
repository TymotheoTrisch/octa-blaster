<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ArrowLeft, ArrowUp, ArrowDown, Plus, Pencil, Trash2, RotateCcw } from 'lucide-vue-next';
import {
  loadMentionTargets,
  resetMentionTargets,
  saveMentionTargets,
} from '@/services/octadesk/mentionHelper';
import type { MentionTarget } from '@/types/template';
import './management.css';

const emit = defineEmits<{ back: []; changed: [] }>();

const targets = ref<MentionTarget[]>([]);
let targetsBase: MentionTarget[] = [];
function rememberBase() {
  targetsBase = structuredClone(targets.value.map((target) => ({ ...target })));
}

const showForm = ref(false);
const editingId = ref<string | null>(null);
const name = ref('');
const query = ref('');
const queryEditedManually = ref(false);
const enabled = ref(true);
const status = ref('');
const busy = ref(false);

onMounted(async () => {
  try {
    targets.value = await loadMentionTargets();
    rememberBase();
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao carregar técnicos.';
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
  queryEditedManually.value = Boolean(target);
  enabled.value = target?.enabled ?? true;
  status.value = '';
  showForm.value = true;
}

function onNameInput() {
  if (editingId.value || queryEditedManually.value) return;
  const firstWord = name.value.trim().split(/\s+/)[0] || '';
  query.value = firstWord ? `@${firstWord}` : '';
}

function onQueryInput() {
  queryEditedManually.value = query.value.trim().length > 0;
}

async function persistTargets(next: MentionTarget[], successMessage: string) {
  targets.value = await saveMentionTargets(next, targetsBase);
  rememberBase();
  status.value = successMessage;
  emit('changed');
}

async function saveTarget() {
  if (busy.value) return;
  busy.value = true;
  try {
    const original = targets.value.find((target) => target.id === editingId.value);
    const pattern = original && original.name.trim() === name.value.trim()
      ? original.pattern
      : '';
    const updated: MentionTarget = {
      id: editingId.value || crypto.randomUUID(),
      name: name.value,
      query: query.value,
      enabled: enabled.value,
      pattern,
    };
    const next = editingId.value
      ? targets.value.map((target) => (target.id === editingId.value ? updated : target))
      : [...targets.value, updated];

    await persistTargets(next, 'Técnico salvo.');
    showForm.value = false;
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao salvar técnico.';
  } finally {
    busy.value = false;
  }
}

async function toggleEnabled(target: MentionTarget) {
  if (busy.value) return;
  busy.value = true;
  try {
    const next = targets.value.map((item) =>
      item.id === target.id ? { ...item, enabled: !item.enabled } : item,
    );
    await persistTargets(
      next,
      target.enabled ? `${target.name} desativado.` : `${target.name} ativado.`,
    );
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao atualizar técnico.';
  } finally {
    busy.value = false;
  }
}

async function moveTarget(index: number, delta: -1 | 1) {
  const nextIndex = index + delta;
  if (busy.value || nextIndex < 0 || nextIndex >= targets.value.length) return;
  busy.value = true;
  try {
    const next = [...targets.value];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(nextIndex, 0, moved);
    await persistTargets(next, 'Ordem dos técnicos atualizada.');
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao reordenar técnicos.';
  } finally {
    busy.value = false;
  }
}

async function removeTarget(target: MentionTarget) {
  if (busy.value) return;
  busy.value = true;
  try {
    await persistTargets(
      targets.value.filter((item) => item.id !== target.id),
      'Técnico removido.',
    );
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao remover técnico.';
  } finally {
    busy.value = false;
  }
}

async function restoreDefaults() {
  if (busy.value) return;
  busy.value = true;
  try {
    targets.value = await resetMentionTargets(targetsBase);
    rememberBase();
    status.value = 'Técnicos padrão restaurados.';
    emit('changed');
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Falha ao restaurar técnicos padrão.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="management-page" aria-label="Técnicos das licenças">
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
        {{ showForm ? (editingId ? 'Editar técnico' : 'Novo técnico') : 'Técnicos (Licenças)' }}
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
      <label>
        Nome completo exibido no Octadesk
        <input
          v-model="name"
          type="text"
          required
          placeholder="Ex: Jorge Tigre"
          @input="onNameInput"
        />
      </label>
      <label>
        Texto para buscar a menção
        <input
          v-model="query"
          type="text"
          required
          placeholder="Ex: @Jorge"
          @input="onQueryInput"
        />
      </label>
      <p class="management-help">
        O nome completo identifica o item certo na lista de menções do Octadesk; a busca é o texto digitado após o @.
      </p>
      <label class="management-checkbox">
        <input v-model="enabled" type="checkbox" />
        Marcar automaticamente nas licenças
      </label>
      <div class="management-actions">
        <button type="button" class="management-secondary" @click="showForm = false">
          Cancelar
        </button>
        <button type="submit" class="management-primary" :disabled="busy">
          Salvar técnico
        </button>
      </div>
    </form>

    <template v-else>
      <p class="management-help">
        Os técnicos ativos são marcados nesta ordem em <strong>Anotação Interna</strong> ao clicar em <strong>Marcar Licenças</strong>.
      </p>

      <article
        v-for="(target, index) in targets"
        :key="target.id"
        class="management-card"
        :class="{ 'management-card-inactive': !target.enabled }"
      >
        <div class="management-card-header">
          <h3>{{ target.name }}</h3>
          <button
            type="button"
            class="management-icon"
            :aria-label="'Mover ' + target.name + ' para cima'"
            :disabled="busy || index === 0"
            title="Mover para cima"
            @click="moveTarget(index, -1)"
          >
            <ArrowUp :size="13" />
          </button>
          <button
            type="button"
            class="management-icon"
            :aria-label="'Mover ' + target.name + ' para baixo'"
            :disabled="busy || index === targets.length - 1"
            title="Mover para baixo"
            @click="moveTarget(index, 1)"
          >
            <ArrowDown :size="13" />
          </button>
          <button
            type="button"
            class="management-icon"
            :aria-label="'Editar ' + target.name"
            @click="startEdit(target)"
          >
            <Pencil :size="14" />
          </button>
          <button
            type="button"
            class="management-icon"
            :aria-label="'Excluir ' + target.name"
            :disabled="busy"
            @click="removeTarget(target)"
          >
            <Trash2 :size="14" />
          </button>
        </div>
        <div class="management-card-meta">
          <span>Busca: <code>{{ target.query }}</code></span>
          <button
            type="button"
            class="management-toggle"
            :class="{ 'is-active': target.enabled }"
            :aria-pressed="target.enabled"
            :disabled="busy"
            @click="toggleEnabled(target)"
          >
            {{ target.enabled ? 'Ativo' : 'Desativado' }}
          </button>
        </div>
      </article>

      <p v-if="!targets.length" class="management-empty">
        Nenhum técnico cadastrado para marcação automática.
      </p>

      <div class="management-footer-actions">
        <button
          type="button"
          class="management-secondary"
          :disabled="busy"
          @click="restoreDefaults"
        >
          <RotateCcw :size="12" />
          Restaurar técnicos padrão
        </button>
      </div>
    </template>

    <p v-if="status" class="management-status" role="status">{{ status }}</p>
  </section>
</template>
